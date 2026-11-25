const express = require('express');
const { pool } = require('../db/pool');
const { inTransaction } = require('../db/transaction');
const { authenticate, requireRole, verifyResourceAccess, isRecordId } = require('../middleware/auth');
const { logAudit } = require('../services/auditLogger');
const { STAGES, evaluateJourneyState, applyStepPatch } = require('../services/journeyEngine');

const router = express.Router();
router.use(authenticate);

const defaultNomineeEmail = 'fatema@demo.com';
const dayMs = 24 * 60 * 60 * 1000;
const simulatableSteps = new Set([2, 3]);
const listLimit = 200;
const alertActions = [
  'JOURNEY_CREATED', 'STEP_EXPIRED_ROLLBACK', 'STEP_FAILED_ROLLBACK', 'PAYMENT_FROZEN', 'PAYMENT_UNFROZEN',
  'FLIGHT_READINESS_REVOKED', 'FLIGHT_READY', 'NOMINEE_ALERT_DISPATCHED',
];
const stepKeys = ['status', 'completed_at', 'expires_at', 'retry_count', 'notes'];

function toIso(value) {
  return value == null ? null : new Date(value).toISOString();
}

function normalizeStep(step) {
  return {
    ...step,
    completed_at: toIso(step.completed_at),
    expires_at: toIso(step.expires_at),
    retry_count: step.retry_count ?? 0,
    notes: step.notes ?? null,
  };
}

const journeyColumns = `j.id, j.worker_id, j.corridor_id, j.agency_id, j.nominee_id, j.overall_status, j.flight_ready,
            j.payment_frozen, j.created_at, j.updated_at,
            c.country, c.job_category, a.name AS agency_name, a.license_no AS agency_license, a.status AS agency_status`;
const journeyFrom = `FROM probashi_shield.journeys j
     JOIN probashi_shield.corridors c ON c.id = j.corridor_id
     LEFT JOIN probashi_shield.agencies a ON a.id = j.agency_id`;
const stepColumns = 'id, journey_id, step_order, step_name, status, completed_at, expires_at, retry_count, notes, updated_at';

async function loadJourney(db, journeyId, lock = false) {
  const { rows } = await db.query(
    `SELECT ${journeyColumns} ${journeyFrom} WHERE j.id = $1 ${lock ? 'FOR UPDATE OF j' : ''}`,
    [journeyId],
  );
  if (!rows[0]) return null;
  const { rows: steps } = await db.query(
    `SELECT ${stepColumns} FROM probashi_shield.journey_steps WHERE journey_id = $1 ORDER BY step_order`,
    [journeyId],
  );
  return { journey: rows[0], steps: steps.map(normalizeStep) };
}

// Unlocked batch read: journeys with their steps in one round trip (Supabase latency dominates).
async function loadJourneys(where, params) {
  const { rows } = await pool.query(
    `SELECT ${journeyColumns},
            (SELECT json_agg(s ORDER BY s.step_order)
             FROM (SELECT ${stepColumns} FROM probashi_shield.journey_steps WHERE journey_id = j.id) s) AS steps
     ${journeyFrom} ${where} ORDER BY j.created_at DESC, j.id DESC LIMIT ${listLimit}`,
    params,
  );
  return rows.map(({ steps, ...journey }) => ({ journey, steps: (steps ?? []).map(normalizeStep) }));
}

function stateChanged(before, after) {
  const previous = new Map(before.steps.map(step => [step.step_order, step]));
  return after.steps.some(step => stepKeys.some(key => normalizeStep(step)[key] !== previous.get(step.step_order)?.[key]))
    || ['overall_status', 'flight_ready', 'payment_frozen'].some(key => before.journey[key] !== after.journey[key]);
}

// Reads are lock-free; only a journey whose evaluation changes (expiry, rollback) takes the locked write path.
async function currentState(before, actorId, now = new Date()) {
  const after = evaluateJourneyState(before.journey, before.steps, now);
  if (!stateChanged(before, after)) return { state: view(after), changed: false };
  return { state: await syncJourney(before.journey.id, actorId, 'auto_evaluation', now), changed: true };
}

function view({ journey, steps, recoveryPlan }) {
  return { journey, steps: steps.map(normalizeStep), recoveryPlan };
}

// Writes the evaluated state and logs each self-healing transition it caused.
async function persistState(client, before, after, actorId, trigger) {
  const journeyId = before.journey.id;
  const workerId = before.journey.worker_id;
  const previous = new Map(before.steps.map(step => [step.step_order, step]));
  const steps = after.steps.map(normalizeStep);

  for (const step of steps) {
    const prior = previous.get(step.step_order);
    if (stepKeys.some(key => step[key] !== prior[key])) {
      await client.query(
        `UPDATE probashi_shield.journey_steps
         SET status = $2, completed_at = $3, expires_at = $4, retry_count = $5, notes = $6
         WHERE id = $1`,
        [prior.id, step.status, step.completed_at, step.expires_at, step.retry_count, step.notes],
      );
    }
  }

  const old = before.journey;
  const next = after.journey;
  if (old.overall_status !== next.overall_status || old.flight_ready !== next.flight_ready
      || old.payment_frozen !== next.payment_frozen) {
    await client.query(
      `UPDATE probashi_shield.journeys SET overall_status = $2, flight_ready = $3, payment_frozen = $4 WHERE id = $1`,
      [journeyId, next.overall_status, next.flight_ready, next.payment_frozen],
    );
  }

  const log = (action, details, targetUserId = workerId) => logAudit({
    actorId, targetUserId, action, entityType: 'journey', entityId: journeyId, details: { trigger, ...details },
  }, client);
  const reopened = steps.filter(step => step.status === 'reopened' && previous.get(step.step_order).status !== 'reopened')
    .map(({ step_order: stepOrder, step_name: stepName }) => ({ stepOrder, stepName }));
  const expired = steps.filter(step => step.status === 'expired' && previous.get(step.step_order).status === 'passed');
  for (const step of expired) {
    await log('STEP_EXPIRED_ROLLBACK', {
      stepOrder: step.step_order,
      stepName: step.step_name,
      expiredAt: previous.get(step.step_order).expires_at,
      reopenedSteps: reopened,
    });
  }
  if (!expired.length && reopened.length) {
    const failed = steps.filter(step => step.status === 'failed').map(step => step.step_order);
    await log('STEP_FAILED_ROLLBACK', { failedSteps: failed, reopenedSteps: reopened });
  }
  if (old.flight_ready && !next.flight_ready) await log('FLIGHT_READINESS_REVOKED', {});
  if (!old.flight_ready && next.flight_ready) await log('FLIGHT_READY', {});

  const frozenChanged = old.payment_frozen !== next.payment_frozen;
  if (frozenChanged) {
    await log(next.payment_frozen ? 'PAYMENT_FROZEN' : 'PAYMENT_UNFROZEN', {
      reason: after.recoveryPlan.paymentFrozenReason,
    });
  }
  if (old.nominee_id && (frozenChanged || expired.length)) {
    const message = next.payment_frozen
      ? `Journey ${journeyId} is blocked. ${after.recoveryPlan.paymentFrozenReason}`
      : `Journey ${journeyId} recovered and payments are no longer frozen.`;
    await log('NOMINEE_ALERT_DISPATCHED', { workerId, message }, old.nominee_id);
  }
  return { ...after, steps };
}

// Loads, re-evaluates expiry, and persists any rollback in one locked transaction.
function syncJourney(journeyId, actorId, trigger = 'auto_evaluation', now = new Date()) {
  return inTransaction(async (client) => {
    const before = await loadJourney(client, journeyId, true);
    if (!before) return null;
    const after = evaluateJourneyState(before.journey, before.steps, now);
    return view(await persistState(client, before, after, actorId, trigger));
  });
}

function validateJourneyId(req, res, next) {
  if (!isRecordId(req.params.id)) return res.status(400).json({ error: 'Journey ID must be a valid record ID.' });
  return next();
}

async function getJourneyOwner(req) {
  const { rows } = await pool.query(
    'SELECT worker_id, nominee_id FROM probashi_shield.journeys WHERE id = $1',
    [req.params.id],
  );
  const [journey] = rows;
  return journey ? {
    workerId: journey.worker_id, nomineeId: journey.nominee_id, entityType: 'journey', entityId: req.params.id,
  } : null;
}

const journeyAccess = [validateJourneyId, verifyResourceAccess(getJourneyOwner)];

function requestError(status, message) {
  return Object.assign(new Error(message), { status, expose: true });
}

function sendError(res, error) {
  if (error.expose || (error.status >= 400 && error.status < 500 && error.message)) {
    return res.status(error.status).json({ error: error.message });
  }
  throw error;
}

function bodyOf(req) {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
}

router.post('/', requireRole('worker', 'admin'), async (req, res) => {
  const { agencyId, corridorId, nomineeEmail, workerId: requestedWorker } = bodyOf(req);
  if (!isRecordId(agencyId) || !isRecordId(corridorId)) {
    return res.status(400).json({ error: 'agencyId and corridorId must be valid record IDs.' });
  }
  if (nomineeEmail !== undefined && nomineeEmail !== null
      && (typeof nomineeEmail !== 'string' || !nomineeEmail.trim() || nomineeEmail.length > 254)) {
    return res.status(400).json({ error: 'nomineeEmail must be an email address or null.' });
  }

  let workerId = req.user.id;
  if (req.user.role === 'admin') {
    if (!isRecordId(requestedWorker)) return res.status(400).json({ error: 'Admins must supply the workerId.' });
    workerId = requestedWorker;
  } else if (requestedWorker !== undefined && String(requestedWorker) !== String(req.user.id)) {
    await logAudit({
      actorId: req.user.id,
      targetUserId: isRecordId(requestedWorker) ? requestedWorker : null,
      action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
      entityType: 'endpoint',
      entityId: req.user.id,
      details: { method: req.method, path: '/api/journeys', role: req.user.role, reason: 'foreign workerId' },
    }).catch(() => {});
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const journeyId = await inTransaction(async (client) => {
      const [{ rows: workers }, { rows: agencies }, { rows: corridors }] = await Promise.all([
        client.query("SELECT id FROM probashi_shield.users WHERE id = $1 AND role = 'worker'", [workerId]),
        client.query('SELECT id, status FROM probashi_shield.agencies WHERE id = $1', [agencyId]),
        client.query('SELECT id FROM probashi_shield.corridors WHERE id = $1', [corridorId]),
      ]);
      if (!workers[0]) throw requestError(422, 'The journey owner must be an existing worker account.');
      if (!agencies[0]) throw requestError(422, 'The agency does not exist in the registry.');
      if (agencies[0].status === 'revoked') throw requestError(422, 'The agency licence is revoked. Choose a verified agency.');
      if (!corridors[0]) throw requestError(422, 'The corridor does not exist.');

      let nomineeId = null;
      if (nomineeEmail !== null) {
        const email = (nomineeEmail ?? defaultNomineeEmail).trim().toLowerCase();
        const { rows } = await client.query(
          "SELECT id FROM probashi_shield.users WHERE lower(email) = $1 AND role = 'nominee'",
          [email],
        );
        if (!rows[0] && nomineeEmail !== undefined) throw requestError(422, 'No nominee account uses that email.');
        nomineeId = rows[0]?.id ?? null;
      }

      const { rows } = await client.query(
        `INSERT INTO probashi_shield.journeys (worker_id, corridor_id, agency_id, nominee_id)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [workerId, corridorId, agencyId, nomineeId],
      );
      const id = rows[0].id;
      await client.query(
        `INSERT INTO probashi_shield.journey_steps (journey_id, step_name)
         SELECT $1, unnest($2::text[])`,
        [id, STAGES],
      );
      await logAudit({
        actorId: req.user.id,
        targetUserId: workerId,
        action: 'JOURNEY_CREATED',
        entityType: 'journey',
        entityId: id,
        details: { agencyId, corridorId, nomineeId, agencyStatus: agencies[0].status },
      }, client);
      return id;
    });
    return res.status(201).json(await syncJourney(journeyId, req.user.id, 'created'));
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/', async (req, res) => {
  const scope = {
    worker: ['WHERE j.worker_id = $1', [req.user.id]],
    nominee: ['WHERE j.nominee_id = $1', [req.user.id]],
    admin: ['', []],
  }[req.user.role];
  const journeys = [];
  for (const before of await loadJourneys(...scope)) {
    const { state } = await currentState(before, req.user.id);
    if (state) journeys.push(state);
  }
  return res.json({ journeys });
});

function loadAlerts(journeyId) {
  return pool.query(
    `SELECT id, action, details, created_at FROM probashi_shield.audit_logs
     WHERE entity_type = 'journey' AND entity_id = $1 AND action = ANY($2::text[])
     ORDER BY created_at DESC, id DESC LIMIT 20`,
    [journeyId, alertActions],
  ).then(({ rows }) => rows);
}

router.get('/:id', ...journeyAccess, async (req, res) => {
  // Read state and alerts together; re-read alerts only if evaluation just wrote new ones.
  const [[before], earlyAlerts] = await Promise.all([
    loadJourneys('WHERE j.id = $1', [req.params.id]),
    loadAlerts(req.params.id),
  ]);
  if (!before) return res.status(404).json({ error: 'Not Found' });
  const { state, changed } = await currentState(before, req.user.id);
  if (!state) return res.status(404).json({ error: 'Not Found' });
  const alerts = changed ? await loadAlerts(req.params.id) : earlyAlerts;
  return res.json({ ...state, alerts });
});

router.patch('/:id/steps/:stepOrder', ...journeyAccess, async (req, res) => {
  if (!/^[1-7]$/.test(req.params.stepOrder)) {
    return res.status(400).json({ error: 'stepOrder must be an integer from 1 to 7.' });
  }
  const stepOrder = Number(req.params.stepOrder);
  try {
    const state = await inTransaction(async (client) => {
      const before = await loadJourney(client, req.params.id, true);
      if (!before) throw requestError(404, 'Not Found');
      const after = applyStepPatch(before.journey, before.steps, stepOrder, req.body);
      const prior = before.steps.find(step => step.step_order === stepOrder);
      const updated = after.steps.find(step => step.step_order === stepOrder);
      await logAudit({
        actorId: req.user.id,
        targetUserId: before.journey.worker_id,
        action: 'STEP_UPDATED',
        entityType: 'journey',
        entityId: before.journey.id,
        details: {
          stepOrder, stepName: updated.step_name, from: prior.status, to: updated.status,
          retryCount: updated.retry_count, fields: Object.keys(bodyOf(req)),
        },
      }, client);
      return view(await persistState(client, before, after, req.user.id, 'step_update'));
    });
    return res.json(state);
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/:id/simulate-expiry', ...journeyAccess, async (req, res) => {
  const { stepOrder: rawOrder = 2 } = bodyOf(req);
  const stepOrder = Number(rawOrder);
  if (!(typeof rawOrder === 'number' || (typeof rawOrder === 'string' && /^\d$/.test(rawOrder)))
      || !simulatableSteps.has(stepOrder)) {
    return res.status(400).json({ error: 'stepOrder must be 2 (medical) or 3 (police_clearance).' });
  }

  try {
    const state = await inTransaction(async (client) => {
      const now = new Date();
      const before = await loadJourney(client, req.params.id, true);
      if (!before) throw requestError(404, 'Not Found');
      const current = evaluateJourneyState(before.journey, before.steps, now);
      const step = current.steps.find(row => row.step_order === stepOrder);
      if (step.status !== 'passed') {
        throw requestError(409, `Pass step ${stepOrder} (${step.step_name}) before simulating its expiry.`);
      }
      // Backdate the clearance to yesterday; the engine then expires it and rolls back.
      const backdated = new Date(now.getTime() - dayMs).toISOString();
      const simulated = current.steps.map(row => (row.step_order === stepOrder ? { ...row, expires_at: backdated } : row));
      const after = evaluateJourneyState(current.journey, simulated, now);
      // Record the backdated deadline as the step's expiry so the log shows when it lapsed.
      before.steps = before.steps.map(row => (row.step_order === stepOrder ? { ...row, expires_at: backdated } : row));
      const result = await persistState(client, before, after, req.user.id, 'simulated_expiry');
      return { ...view(result), simulation: { stepOrder, stepName: step.step_name, backdatedExpiresAt: backdated } };
    });
    return res.json(state);
  } catch (error) {
    return sendError(res, error);
  }
});

module.exports = router;
