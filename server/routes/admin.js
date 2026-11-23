const express = require('express');
const { pool } = require('../db/pool');
const { authenticate, requireRole } = require('../middleware/auth');

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

module.exports = router;
