const express = require('express');
const { pool } = require('../db/pool');
const { inTransaction } = require('../db/transaction');
const { authenticate, requireRole, isRecordId } = require('../middleware/auth');
const { logAudit } = require('../services/auditLogger');

const router = express.Router();
// requireRole logs every non-admin attempt as UNAUTHORIZED_ACCESS_ATTEMPT before the 403.
router.use(authenticate, requireRole('admin'));

const auditLogQueryKeys = new Set(['action', 'limit']);
const fraudProbability = `CASE WHEN jsonb_typeof(details->'fraudRisk'->'fraudProbability') = 'number'
  THEN (details->'fraudRisk'->>'fraudProbability')::numeric END`;
const overchargeMultiple = `CASE WHEN jsonb_typeof(details->'overchargeMultiple') = 'number'
  THEN (details->>'overchargeMultiple')::numeric END`;

function countsBy(rows, key) {
  return Object.fromEntries(rows.map(row => [row[key], row.count]));
}

function toNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

router.get('/overview', async (_req, res) => {
  const [users, agencies, audits, auditTotals, overcharge, journeys, alerts] = await Promise.all([
    pool.query('SELECT role, count(*)::int AS count FROM probashi_shield.users GROUP BY role ORDER BY role'),
    pool.query('SELECT status, count(*)::int AS count FROM probashi_shield.agencies GROUP BY status ORDER BY status'),
    pool.query(
      `SELECT COALESCE(details->>'feeVerdict', 'Unassessed') AS fee_verdict, count(*)::int AS count,
              round(avg(${fraudProbability}), 2) AS avg_ml_fraud_probability
       FROM probashi_shield.audit_checks WHERE check_type = 'document_forensics'
       GROUP BY 1 ORDER BY 1`,
    ),
    pool.query(
      `SELECT count(*)::int AS count, round(avg(${fraudProbability}), 2) AS avg_ml_fraud_probability
       FROM probashi_shield.audit_checks WHERE check_type = 'document_forensics'`,
    ),
    pool.query(
      `SELECT details->>'destinationCountry' AS country, count(*)::int AS audits,
              round(avg(${overchargeMultiple}), 2) AS avg_overcharge_multiple,
              round(max(${overchargeMultiple}), 2) AS max_overcharge_multiple
       FROM probashi_shield.audit_checks
       WHERE check_type = 'document_forensics' AND details->>'destinationCountry' IS NOT NULL
       GROUP BY 1 ORDER BY avg_overcharge_multiple DESC NULLS LAST, country`,
    ),
    pool.query(
      `SELECT overall_status, count(*)::int AS count,
              count(*) FILTER (WHERE payment_frozen)::int AS payment_frozen
       FROM probashi_shield.journeys GROUP BY overall_status ORDER BY overall_status`,
    ),
    pool.query(
      `SELECT count(*)::int AS count, max(created_at) AS latest
       FROM probashi_shield.audit_logs WHERE action = 'UNAUTHORIZED_ACCESS_ATTEMPT'`,
    ),
  ]);

  return res.json({
    users: countsBy(users.rows, 'role'),
    agencies: countsBy(agencies.rows, 'status'),
    audits: {
      total: auditTotals.rows[0].count,
      avgMlFraudProbability: toNumber(auditTotals.rows[0].avg_ml_fraud_probability),
      byFeeVerdict: audits.rows.map(row => ({
        feeVerdict: row.fee_verdict,
        count: row.count,
        avgMlFraudProbability: toNumber(row.avg_ml_fraud_probability),
      })),
      overchargeByCountry: overcharge.rows.map(row => ({
        country: row.country,
        audits: row.audits,
        avgOverchargeMultiple: toNumber(row.avg_overcharge_multiple),
        maxOverchargeMultiple: toNumber(row.max_overcharge_multiple),
      })),
    },
    journeys: {
      byOverallStatus: countsBy(journeys.rows, 'overall_status'),
      paymentFrozen: journeys.rows.reduce((total, row) => total + row.payment_frozen, 0),
    },
    security: {
      unauthorizedAccessAttempts: alerts.rows[0].count,
      latestAttemptAt: alerts.rows[0].latest,
    },
    generatedAt: new Date().toISOString(),
  });
});

router.get('/audit-logs', async (req, res) => {
  const { action, limit = '50' } = req.query;
  if (Object.keys(req.query).some(key => !auditLogQueryKeys.has(key))) {
    return res.status(400).json({ error: 'Supported query parameters are action and limit.' });
  }
  if (action !== undefined && (typeof action !== 'string' || !/^[A-Z][A-Z_]{0,99}$/.test(action))) {
    return res.status(400).json({ error: 'action must be an uppercase action name such as UNAUTHORIZED_ACCESS_ATTEMPT.' });
  }
  if (typeof limit !== 'string' || !/^\d{1,3}$/.test(limit) || Number(limit) < 1 || Number(limit) > 200) {
    return res.status(400).json({ error: 'limit must be an integer from 1 to 200.' });
  }

  const { rows } = await pool.query(
    `SELECT l.id, l.action, l.entity_type, l.entity_id, l.target_user_id, l.details, l.created_at,
            u.id AS actor_id, u.name AS actor_name, u.email AS actor_email, u.role AS actor_role
     FROM probashi_shield.audit_logs l
     LEFT JOIN probashi_shield.users u ON u.id = l.actor_id
     WHERE $1::text IS NULL OR l.action = $1
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT $2`,
    [action ?? null, Number(limit)],
  );
  return res.json({
    logs: rows.map(({ actor_id: id, actor_name: name, actor_email: email, actor_role: role, ...log }) => ({
      ...log,
      actor: id === null ? null : { id, name, email, role },
    })),
  });
});

// Corridor fee rules: admins correct a cap, risk level, source or effective date. Every change is
// written to the audit log with before/after values, and later audits and pathways use it at once.
const corridorFields = {
  maxLegalFeeBdt: 'max_legal_fee_bdt',
  corridorRiskLevel: 'corridor_risk_level',
  ruleSource: 'rule_source',
  effectiveDate: 'effective_date',
};
const corridorReturning = `id, country, job_category, max_legal_fee_bdt, corridor_risk_level, rule_source,
  to_char(effective_date, 'YYYY-MM-DD') AS effective_date`;

function validateCorridorPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Send a JSON object.' };
  const keys = Object.keys(body);
  if (!keys.length || keys.some(key => !corridorFields[key])) {
    return { error: `Send at least one of: ${Object.keys(corridorFields).join(', ')}.` };
  }
  const values = {};
  if ('maxLegalFeeBdt' in body) {
    const fee = body.maxLegalFeeBdt;
    if (fee !== null && !(typeof fee === 'number' && Number.isFinite(fee) && fee >= 0 && fee <= 10_000_000
        && Math.round(fee * 100) === fee * 100)) {
      return { error: 'maxLegalFeeBdt must be null or a BDT amount from 0 to 10,000,000 with at most 2 decimals.' };
    }
    values.max_legal_fee_bdt = fee;
  }
  if ('corridorRiskLevel' in body) {
    if (!['low', 'medium', 'high'].includes(body.corridorRiskLevel)) return { error: 'corridorRiskLevel must be low, medium or high.' };
    values.corridor_risk_level = body.corridorRiskLevel;
  }
  if ('ruleSource' in body) {
    const source = typeof body.ruleSource === 'string' ? body.ruleSource.trim() : '';
    if (!source || source.length > 500 || /[\u0000-\u001f\u007f]/.test(source)) {
      return { error: 'ruleSource must be 1 to 500 characters of plain text.' };
    }
    values.rule_source = source;
  }
  if ('effectiveDate' in body) {
    const date = body.effectiveDate;
    const valid = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
    if (!valid) return { error: 'effectiveDate must be a real calendar date in YYYY-MM-DD format.' };
    values.effective_date = date;
  }
  return { values };
}

router.patch('/corridors/:id', async (req, res) => {
  if (!isRecordId(req.params.id)) return res.status(400).json({ error: 'Corridor ID must be a valid record ID.' });
  const { error, values } = validateCorridorPatch(req.body);
  if (error) return res.status(400).json({ error });

  const result = await inTransaction(async (client) => {
    const { rows: [before] } = await client.query(
      `SELECT ${corridorReturning} FROM probashi_shield.corridors WHERE id = $1 FOR UPDATE`,
      [req.params.id],
    );
    if (!before) return null;
    const columns = Object.keys(values);
    const { rows: [after] } = await client.query(
      `UPDATE probashi_shield.corridors SET ${columns.map((column, index) => `${column} = $${index + 2}`).join(', ')}
       WHERE id = $1 RETURNING ${corridorReturning}`,
      [req.params.id, ...columns.map(column => values[column])],
    );
    const changes = Object.fromEntries(columns
      .filter(column => String(before[column]) !== String(after[column]))
      .map(column => [column, { from: before[column], to: after[column] }]));
    if (Object.keys(changes).length) {
      await logAudit({
        actorId: req.user.id,
        targetUserId: null,
        action: 'CORRIDOR_RULE_UPDATED',
        entityType: 'corridor',
        entityId: after.id,
        details: { country: after.country, changes },
      }, client);
    }
    return { corridor: after, changed: Object.keys(changes) };
  });
  if (!result) return res.status(404).json({ error: 'Not Found' });
  return res.json(result);
});

module.exports = router;
