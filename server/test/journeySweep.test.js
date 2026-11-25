const assert = require('node:assert/strict');
const test = require('node:test');

// The sweep is tested with a fake database and a fake sync, so no real connection is opened.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
const { sweepExpiredJourneys } = require('../routes/journeys');

const now = new Date('2026-03-01T00:00:00Z');

function fakeDb(ids) {
  const queries = [];
  return {
    queries,
    query: async (sql, params) => {
      queries.push({ sql, params });
      return { rows: ids.map(journey_id => ({ journey_id })) };
    },
  };
}

test('sweep rolls back each journey with a lapsed clearance as the system, not a user', async () => {
  const db = fakeDb(['3', '7']);
  const calls = [];
  const result = await sweepExpiredJourneys({ now, db, sync: async (...args) => { calls.push(args); } });

  assert.deepEqual(result, { swept: ['3', '7'], failed: [] });
  assert.deepEqual(calls, [
    ['3', null, 'scheduled_sweep', now],
    ['7', null, 'scheduled_sweep', now],
  ]);
  const [{ sql, params }] = db.queries;
  assert.match(sql, /status = 'passed' AND s\.expires_at < \$1/);
  assert.match(sql, /overall_status <> 'completed'/, 'completed journeys are never swept');
  assert.equal(params[0], now);
});

test('one failing journey does not stop the sweep, and is reported for retry', async () => {
  const db = fakeDb(['1', '2', '3']);
  const synced = [];
  const errors = console.error;
  console.error = () => {};
  try {
    const result = await sweepExpiredJourneys({
      now, db,
      sync: async (id) => {
        if (id === '2') throw Object.assign(new Error('lock timeout'), { code: '55P03' });
        synced.push(id);
      },
    });
    assert.deepEqual(result, { swept: ['1', '3'], failed: ['2'] });
    assert.deepEqual(synced, ['1', '3']);
  } finally {
    console.error = errors;
  }
});

test('nothing lapsed means no writes', async () => {
  let syncs = 0;
  const result = await sweepExpiredJourneys({ now, db: fakeDb([]), sync: async () => { syncs += 1; } });
  assert.deepEqual(result, { swept: [], failed: [] });
  assert.equal(syncs, 0);
});
