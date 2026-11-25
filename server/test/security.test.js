const assert = require('node:assert/strict');
const { after, before, describe, test } = require('node:test');

// Never reach a real database: force a dummy URL before anything loads db/pool (dotenv does not override it),
// then replace the pool with an in-memory fake. Requests still run through the real JWT check, the real
// role and ownership middleware, and the real route handlers.
process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:9/probashi_test';
process.env.JWT_SECRET = 'security-test-secret-that-is-long-enough-for-hs256-signing';

const jwt = require('jsonwebtoken');
const { pool } = require('../db/pool');

const users = {
  rahim: { id: 1, email: 'rahim@demo.com', role: 'worker' },
  karim: { id: 2, email: 'karim@demo.com', role: 'worker' },
  fatema: { id: 3, email: 'fatema@demo.com', role: 'nominee' },
  admin: { id: 4, email: 'admin@demo.com', role: 'admin' },
  otherNominee: { id: 5, email: 'nominee2@demo.com', role: 'nominee' },
};
const journeys = [{ id: 1, worker_id: users.rahim.id, nominee_id: users.fatema.id }];
const documents = [{ id: 10, worker_id: users.rahim.id }];
const stepNames = ['agency_verification', 'medical', 'police_clearance', 'training', 'immigration_clearance', 'visa', 'flight'];

let queries = [];
function fakeQuery(sql, params = []) {
  const text = typeof sql === 'string' ? sql : sql.text;
  queries.push({ sql: text.replace(/\s+/g, ' ').trim(), params });
  const rows = (list) => Promise.resolve({ rows: list, rowCount: list.length });

  if (/SELECT worker_id, nominee_id FROM probashi_shield\.journeys WHERE id = \$1/.test(text)) {
    return rows(journeys.filter(j => String(j.id) === String(params[0])));
  }
  if (/SELECT worker_id FROM probashi_shield\.documents WHERE id = \$1/.test(text)) {
    return rows(documents.filter(d => String(d.id) === String(params[0])));
  }
  if (/FROM probashi_shield\.users u WHERE u\.id = \$1 AND u\.role = 'worker'/.test(text)) {
    const worker = Object.values(users).find(u => String(u.id) === String(params[0]) && u.role === 'worker');
    if (!worker) return rows([]);
    const linked = journeys.some(j => j.worker_id === worker.id && String(j.nominee_id) === String(params[1]));
    return rows([{ id: worker.id, nominee_linked: linked }]);
  }
  if (/INSERT INTO probashi_shield\.users/.test(text)) return rows([{ id: 99 }]);
  if (/json_agg/.test(text)) {
    // Journey #1 with seven pending steps, for the "owner / nominee / admin may read" controls.
    return rows(journeys.filter(j => String(j.id) === String(params[0])).map(j => ({
      ...j, corridor_id: 1, agency_id: 1, overall_status: 'in_progress', flight_ready: false, payment_frozen: false,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
      country: 'Malaysia', job_category: null, agency_name: 'Demo Padma Recruitment', agency_license: 'DEMO-RL-001', agency_status: 'verified',
      steps: stepNames.map((step_name, index) => ({
        id: index + 1, journey_id: j.id, step_order: index + 1, step_name, status: 'pending',
        completed_at: null, expires_at: null, retry_count: 0, notes: null, updated_at: null,
      })),
    })));
  }
  return rows([]);
}
pool.query = fakeQuery;
pool.connect = async () => ({ query: fakeQuery, release() {} });

const app = require('../index');
const { tokenIssuer } = require('../middleware/auth');

const tokenFor = (user, secret = process.env.JWT_SECRET, overrides = {}) => jwt.sign(
  { id: user.id, email: user.email, role: user.role, ...overrides }, secret, { algorithm: 'HS256', issuer: tokenIssuer, expiresIn: '1h' },
);

let server;
let base;
before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => new Promise(resolve => server.close(resolve)));

async function call(method, path, { user, token, body } = {}) {
  queries = [];
  const headers = { 'Content-Type': 'application/json' };
  const bearer = token ?? (user && tokenFor(user));
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await response.json().catch(() => null);
  const deniedLogs = queries.filter(q => /INSERT INTO probashi_shield\.audit_logs/.test(q.sql) && q.params[2] === 'UNAUTHORIZED_ACCESS_ATTEMPT')
    .map(({ params: [actorId, targetUserId, action, entityType, entityId, details] }) => ({ actorId, targetUserId, action, entityType, entityId, details: JSON.parse(details) }));
  const dataWrites = queries.filter(q => /^(INSERT|UPDATE|DELETE)\b/i.test(q.sql) && !/probashi_shield\.audit_logs/.test(q.sql));
  return { status: response.status, json, deniedLogs, dataWrites };
}

// A denial is a 403, logged once as UNAUTHORIZED_ACCESS_ATTEMPT by the caller, with no data written.
function assertDenied(result, actor, label) {
  assert.equal(result.status, 403, `${label}: expected 403, got ${result.status}`);
  assert.deepEqual(result.json, { error: 'Forbidden' }, label);
  assert.equal(result.dataWrites.length, 0, `${label}: no data may be written (${result.dataWrites.map(q => q.sql.slice(0, 40)).join('; ')})`);
  assert.equal(result.deniedLogs.length, 1, `${label}: the attempt is logged once`);
  assert.equal(result.deniedLogs[0].actorId, actor.id, `${label}: logged against the caller`);
}

describe('authentication', () => {
  test('missing, forged, tampered and unknown-role tokens are rejected with 401', async () => {
    assert.equal((await call('GET', '/journeys/1')).status, 401, 'no token');
    assert.equal((await call('GET', '/journeys/1', { token: tokenFor(users.admin, 'wrong-secret') })).status, 401, 'wrong signing secret');
    assert.equal((await call('GET', '/journeys/1', { token: tokenFor(users.rahim, undefined, { role: 'superadmin' }) })).status, 401, 'unknown role');
    const unsigned = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ ...users.admin, iss: tokenIssuer })).toString('base64url')}.`;
    assert.equal((await call('GET', '/admin/overview', { token: unsigned })).status, 401, 'alg=none admin token');
    const otherIssuer = jwt.sign({ ...users.admin }, process.env.JWT_SECRET, { algorithm: 'HS256', issuer: 'someone-else' });
    assert.equal((await call('GET', '/admin/overview', { token: otherIssuer })).status, 401, 'wrong issuer');
  });
});

describe('privilege escalation on register', () => {
  for (const injected of [{ role: 'admin' }, { role: 'nominee' }, { role: 'admin', isAdmin: true, user: { role: 'admin' } }]) {
    test(`register with ${JSON.stringify(injected)} still creates a worker`, async () => {
      const result = await call('POST', '/auth/register', {
        body: { name: 'Rimon Kundo', email: `rimon+${Math.random().toString(36).slice(2)}@example.com`, password: 'Password123!', ...injected },
      });
      assert.equal(result.status, 201);
      assert.equal(result.json.user.role, 'worker');
      const insert = queries.find(q => /INSERT INTO probashi_shield\.users/.test(q.sql));
      assert.match(insert.sql, /VALUES \(\$1, \$2, \$3, 'worker'\)/, 'the role is fixed in SQL, not taken from the request');
      assert.equal(insert.params.length, 3);
      assert.ok(!insert.params.includes('admin') && !insert.params.includes('nominee'));
    });
  }
});

describe('cross-user ownership isolation (Karim vs Rahim)', () => {
  const attempts = [
    ['GET', '/journeys/1'],
    ['PATCH', '/journeys/1/steps/1', { status: 'passed' }],
    ['POST', '/journeys/1/simulate-expiry', { stepOrder: 2 }],
    ['GET', '/documents/my?workerId=1'],
    ['PATCH', '/documents/10/confirm', {}],
    ['DELETE', '/documents/10'],
  ];
  for (const [method, path, body] of attempts) {
    test(`worker ${method} ${path} on another worker's record -> 403, logged against the owner`, async () => {
      const result = await call(method, path, { user: users.karim, body });
      assertDenied(result, users.karim, `${method} ${path}`);
      assert.equal(result.deniedLogs[0].targetUserId, users.rahim.id, 'the log names the record owner');
      assert.equal(result.deniedLogs[0].details.method, method);
    });
  }

  test('controls: the owner and an admin can read the same records', async () => {
    assert.equal((await call('GET', '/journeys/1', { user: users.rahim })).status, 200);
    assert.equal((await call('GET', '/documents/my', { user: users.rahim })).status, 200);
    assert.equal((await call('GET', '/journeys/1', { user: users.admin })).status, 200);
  });
});

describe('nominee read-only lock', () => {
  test('the linked nominee can read the journey', async () => {
    const result = await call('GET', '/journeys/1', { user: users.fatema });
    assert.equal(result.status, 200);
    assert.equal(result.dataWrites.length, 0);
  });

  const writes = [
    ['PATCH', '/journeys/1/steps/1', { status: 'passed' }],
    ['POST', '/journeys/1/simulate-expiry', { stepOrder: 2 }],
    ['POST', '/journeys', { corridorId: 1, agencyId: 1 }],
    ['PATCH', '/documents/10/confirm', {}],
    ['DELETE', '/documents/10'],
    ['POST', '/documents/audit', {}],
    ['POST', '/documents/seed-demo-case', {}],
  ];
  for (const [method, path, body] of writes) {
    test(`linked nominee ${method} ${path} -> 403`, async () => {
      assertDenied(await call(method, path, { user: users.fatema, body }), users.fatema, `${method} ${path}`);
    });
  }

  for (const [method, path, body] of [['GET', '/admin/overview'], ['GET', '/admin/audit-logs'], ['PATCH', '/admin/corridors/1', { maxLegalFeeBdt: 1 }]]) {
    test(`nominee ${method} ${path} (admin endpoint) -> 403`, async () => {
      assertDenied(await call(method, path, { user: users.fatema, body }), users.fatema, `${method} ${path}`);
    });
  }

  test("a nominee who is not linked to the journey cannot even read it", async () => {
    assertDenied(await call('GET', '/journeys/1', { user: users.otherNominee }), users.otherNominee, 'unlinked nominee read');
  });
});

describe('admin-only guard', () => {
  for (const [method, path, body] of [['GET', '/admin/overview'], ['GET', '/admin/audit-logs'], ['PATCH', '/admin/corridors/1', { maxLegalFeeBdt: 1 }]]) {
    test(`worker ${method} ${path} -> 403, logged as an endpoint denial`, async () => {
      const result = await call(method, path, { user: users.rahim, body });
      assertDenied(result, users.rahim, `${method} ${path}`);
      assert.equal(result.deniedLogs[0].entityType, 'endpoint');
      assert.deepEqual(result.deniedLogs[0].details.requiredRoles, ['admin']);
    });
  }

  test('control: an admin passes the guard', async () => {
    const result = await call('GET', '/admin/audit-logs', { user: users.admin });
    assert.equal(result.status, 200);
    assert.equal(result.deniedLogs.length, 0);
  });
});
