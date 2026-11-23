const { pool } = require('../db/pool');

async function logAudit({ actorId = null, targetUserId = null, action, entityType, entityId, details = null }) {
  await pool.query(
    `INSERT INTO probashi_shield.audit_logs (actor_id, target_user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [actorId, targetUserId, action, entityType, entityId, details === null ? null : JSON.stringify(details)],
  );
}

module.exports = { logAudit };
