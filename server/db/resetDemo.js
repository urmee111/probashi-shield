// Resets demo activity to a clean starting point for a demo run or video take.
//   npm run demo:reset            -> journey #1 with all 7 steps pending
//   npm run demo:reset -- --ready -> steps 1-4 already passed, ready for "Simulate medical expiry"
//   npm run demo:reset -- --expiring -> like --ready, but the Medical clearance lapses 2 minutes later, so the
//                                        server's scheduled sweep rolls the journey back with nobody using the app
// Keeps users, agencies and corridor rules. Deletes ALL documents, audits, journeys and audit logs.
const { pool } = require('./pool');
const { STAGES, applyStepPatch } = require('../services/journeyEngine');

const expiringInMs = 2 * 60 * 1000;
const activityTables = ['audit_logs', 'audit_checks', 'journey_steps', 'journeys', 'documents']
  .map(table => `probashi_shield.${table}`).join(', ');

async function one(client, sql, params, label) {
  const { rows } = await client.query(sql, params);
  if (!rows[0]) throw new Error(`${label} is missing. Run npm run db:init and npm run seed:users first.`);
  return rows[0].id;
}

async function resetDemo() {
  const args = process.argv.slice(2);
  const expiring = args.includes('--expiring');
  const ready = expiring || args.includes('--ready');
  if (args.some(arg => arg !== '--ready' && arg !== '--expiring')) throw new Error('Expected only the optional --ready or --expiring flag.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('probashi_shield.demo:reset'))");
    const rahim = await one(client, "SELECT id FROM probashi_shield.users WHERE lower(email) = 'rahim@demo.com'", [], 'rahim@demo.com');
    const fatema = await one(client, "SELECT id FROM probashi_shield.users WHERE lower(email) = 'fatema@demo.com'", [], 'fatema@demo.com');
    const corridor = await one(client, "SELECT id FROM probashi_shield.corridors WHERE country_code = 'MY' ORDER BY id LIMIT 1", [], 'The Malaysia corridor');
    const agency = await one(client, "SELECT id FROM probashi_shield.agencies WHERE license_no = 'DEMO-RL-001'", [], 'Agency DEMO-RL-001');

    // RESTART IDENTITY makes the new journey #1 again, which the cross-user 403 test targets.
    await client.query(`TRUNCATE ${activityTables} RESTART IDENTITY`);

    const { rows: [journey] } = await client.query(
      `INSERT INTO probashi_shield.journeys (worker_id, corridor_id, agency_id, nominee_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [rahim, corridor, agency, fatema],
    );
    const { rows: steps } = await client.query(
      `INSERT INTO probashi_shield.journey_steps (journey_id, step_name)
       SELECT $1, unnest($2::text[]) RETURNING *`,
      [journey.id, STAGES],
    );

    let state = { journey, steps };
    if (ready) {
      for (let order = 1; order <= 4; order += 1) {
        state = applyStepPatch(state.journey, state.steps, order, { status: 'passed' });
      }
      if (expiring) {
        const medical = state.steps.find(step => step.step_name === STAGES[1]);
        medical.expires_at = new Date(Date.now() + expiringInMs).toISOString();
      }
      for (const step of state.steps) {
        await client.query(
          'UPDATE probashi_shield.journey_steps SET status = $2, completed_at = $3, expires_at = $4 WHERE id = $1',
          [step.id, step.status, step.completed_at, step.expires_at],
        );
      }
      await client.query(
        'UPDATE probashi_shield.journeys SET overall_status = $2, flight_ready = $3, payment_frozen = $4 WHERE id = $1',
        [journey.id, state.journey.overall_status, state.journey.flight_ready, state.journey.payment_frozen],
      );
    }

    await client.query(
      `INSERT INTO probashi_shield.audit_logs (actor_id, target_user_id, action, entity_type, entity_id, details)
       VALUES ($1, $1, 'JOURNEY_CREATED', 'journey', $2, $3)`,
      [rahim, journey.id, { trigger: 'demo_reset', agencyId: agency, corridorId: corridor, nomineeId: fatema, stepsPassed: ready ? 4 : 0, medicalExpiresInMinutes: expiring ? 2 : undefined }],
    );
    await client.query('COMMIT');
    console.log(`Demo reset: journey #${journey.id} for rahim@demo.com, ${ready ? 'steps 1-4 passed' : 'all steps pending'}${expiring ? ', Medical clearance lapses in 2 minutes' : ''}. Documents, audits and logs cleared.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

resetDemo().catch((error) => {
  console.error('Demo reset failed:', error.message);
  process.exitCode = 1;
});
