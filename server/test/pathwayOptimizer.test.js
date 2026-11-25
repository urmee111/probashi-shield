const assert = require('node:assert/strict');
const test = require('node:test');
const { recommendPathways, validateConstraints } = require('../services/pathwayOptimizer');

// Fixed fixtures in the shape Postgres returns (NUMERIC columns arrive as strings). No database is used.
const corridor = (id, country, fee, salaryFloor, salaryCeiling, risk, extra = {}) => ({
  id, country, job_category: 'General', max_legal_fee_bdt: fee, min_expected_salary_bdt: salaryFloor,
  max_expected_salary_bdt: salaryCeiling, corridor_risk_level: risk, rule_source: 'Test fixture', effective_date: '2026-01-01', ...extra,
});
const corridors = [
  corridor(1, 'Malaysia', '78990.00', '35000.00', '52000.00', 'medium'),
  corridor(2, 'Singapore', '95000.00', '55000.00', '85000.00', 'medium'),
  corridor(3, 'Qatar', '110000.00', '43000.00', '68000.00', 'low'),
  // Best pay of all, but high risk: only recommended when the worker allows high-risk corridors.
  corridor(4, 'Libya', '60000.00', '60000.00', '90000.00', 'high'),
  // Incomplete record (no rule source): must never be recommended.
  corridor(5, 'Oman', '10000.00', '90000.00', '99000.00', 'low', { rule_source: '' }),
];
const agencies = [
  { id: 11, name: 'Zeta Overseas', license_no: 'RL-11', status: 'verified', risk_score: 30 },
  { id: 12, name: 'Alpha Manpower', license_no: 'RL-12', status: 'verified', risk_score: 10 },
  { id: 13, name: 'Flagged Agency', license_no: 'RL-13', status: 'flagged', risk_score: 5 },
  { id: 14, name: 'Revoked Agency', license_no: 'RL-14', status: 'revoked', risk_score: 1 },
];

function recommend(body, data = {}) {
  const { constraints, error } = validateConstraints(body);
  assert.equal(error, undefined, `fixture request should be valid: ${error}`);
  return recommendPathways({ constraints, corridors, agencies, ...data });
}

// Applies a relaxation suggestion to the original request, the same way the UI's "Apply Relaxation" does.
function applyChanges(body, changes) {
  const next = { ...body };
  for (const change of changes) {
    if (change.constraint === 'preferredCountry') next.preferredCountry = change.to;
    if (change.constraint === 'minSalaryBdt') next.minSalaryBdt = change.to;
    if (change.constraint === 'maxFeeBdt') next.maxFeeBdt = change.to;
    if (change.constraint === 'allowHighRisk') next.allowHighRisk = true;
  }
  return next;
}

function assertEverySuggestionUnlocks(body, report) {
  assert.ok(report.relaxationSuggestions.length > 0, 'an infeasible request gets at least one suggestion');
  for (const suggestion of report.relaxationSuggestions) {
    const relaxed = recommend(applyChanges(body, suggestion.changes));
    assert.equal(relaxed.feasible, true, `"${suggestion.suggestion}" must make the request feasible`);
    assert.ok(relaxed.pathways.some(({ corridor: c }) => c.country === suggestion.country),
      `"${suggestion.suggestion}" must unlock ${suggestion.country}`);
  }
}

test('input validation rejects malformed constraints and converts money to integer cents', () => {
  assert.deepEqual(validateConstraints({ minSalaryBdt: '45000.5', maxFeeBdt: 120000 }).constraints,
    { preferredCountry: null, salary: 4500050, budget: 12000000, allowHighRisk: false });
  for (const body of [
    { minSalaryBdt: -1, maxFeeBdt: 1000 },
    { minSalaryBdt: '1.234', maxFeeBdt: 1000 },
    { minSalaryBdt: 1000, maxFeeBdt: '1e5' },
    { minSalaryBdt: 1000, maxFeeBdt: 1000, allowHighRisk: 'yes' },
    { minSalaryBdt: 1000, maxFeeBdt: 1000, preferredCountry: '   ' },
    null,
  ]) {
    assert.ok(validateConstraints(body).error, `should reject ${JSON.stringify(body)}`);
  }
});

test('feasible constraints return legal pathways with verified agencies only, ranked by first-year net income', () => {
  const report = recommend({ minSalaryBdt: 45000, maxFeeBdt: 120000 });
  assert.equal(report.feasible, true);
  assert.deepEqual(report.conflicts, []);

  // Every pathway uses a verified agency; flagged and revoked agencies never appear.
  assert.ok(report.pathways.every(({ agency }) => agency.status === 'verified'));
  assert.ok(!report.pathways.some(({ agency }) => ['RL-13', 'RL-14'].includes(agency.license_no)));

  // First-year net = salary floor x 12 - legal fee cap, highest first.
  const order = [...new Map(report.pathways.map(p => [p.corridor.country, p.firstYearNetBdt])).entries()];
  assert.deepEqual(order, [['Singapore', 565000], ['Qatar', 406000], ['Malaysia', 341010]]);
  const nets = report.pathways.map(p => p.firstYearNetBdt);
  assert.deepEqual(nets, [...nets].sort((a, b) => b - a));

  // Within a corridor, the lower-risk agency comes first.
  assert.deepEqual(report.pathways.filter(p => p.corridor.country === 'Singapore').map(p => p.agency.name), ['Alpha Manpower', 'Zeta Overseas']);

  // Incomplete corridor records are never recommended.
  assert.ok(!report.pathways.some(p => p.corridor.country === 'Oman'));
});

test('high-risk corridors are excluded unless allowHighRisk is true', () => {
  const body = { minSalaryBdt: 45000, maxFeeBdt: 120000 };
  const safe = recommend(body);
  assert.ok(safe.pathways.every(p => p.corridor.corridor_risk_level !== 'high'));
  assert.ok(!safe.pathways.some(p => p.corridor.country === 'Libya'));

  const risky = recommend({ ...body, allowHighRisk: true });
  assert.equal(risky.pathways[0].corridor.country, 'Libya', 'the highest-paying corridor ranks first once allowed');
  assert.equal(risky.pathways[0].firstYearNetBdt, 660000);
});

test('a high-risk-only destination reports each minimal conflicting set, and allowing high risk unlocks it', () => {
  // "No high risk" is satisfiable on its own (Malaysia), so it is never a conflict by itself. What conflicts is
  // the destination Libya with no high risk, and a 70,000 budget with no high risk (only Libya is that cheap).
  const body = { preferredCountry: 'Libya', minSalaryBdt: 60000, maxFeeBdt: 70000 };
  const report = recommend(body);
  assert.equal(report.feasible, false);
  assert.deepEqual(report.pathways, []);
  assert.deepEqual(report.conflicts.map(c => c.constraints), [['preferredCountry', 'allowHighRisk'], ['maxFeeBdt', 'allowHighRisk']]);
  const [best] = report.relaxationSuggestions;
  assert.equal(best.country, 'Libya');
  assert.deepEqual(best.changes.map(c => c.constraint), ['allowHighRisk'], 'one change, the risk opt-in, is the smallest fix');
  assertEverySuggestionUnlocks(body, report);
});

test('budget below every legal fee cap: names maxFeeBdt and suggests the smallest budget increase', () => {
  // The UI conflict demo: Malaysia, 40,000 salary, 50,000 budget.
  const body = { preferredCountry: 'Malaysia', minSalaryBdt: 40000, maxFeeBdt: 50000 };
  const report = recommend(body);
  assert.equal(report.feasible, false);
  // The budget conflicts on its own: no corridor anywhere has a cap at or below 50,000, so the reason quotes the
  // lowest cap overall (60,000 in these fixtures; 78,990 in the seeded data).
  assert.deepEqual(report.conflicts.map(c => c.constraints), [['maxFeeBdt']]);
  assert.match(report.conflicts[0].reason, /lowest recorded legal fee cap .* is 60,000 BDT\. The budget is 50,000 BDT\./);

  const [best] = report.relaxationSuggestions;
  assert.equal(best.country, 'Malaysia');
  assert.deepEqual(best.changes, [{ constraint: 'maxFeeBdt', from: 50000, to: 78990, deltaBdt: 28990, description: '+28,990 BDT budget' }]);
  assertEverySuggestionUnlocks(body, report);
});

test('conflicting pair (country + salary) is identified exactly, and each minimal relaxation works', () => {
  // Malaysia alone is fine and a 60,000 salary alone is fine, but Malaysia never pays 60,000.
  const body = { preferredCountry: 'Malaysia', minSalaryBdt: 60000, maxFeeBdt: 120000 };
  const report = recommend(body);
  assert.equal(report.feasible, false);
  assert.deepEqual(report.conflicts.map(c => c.constraints), [['preferredCountry', 'minSalaryBdt']]);
  assert.match(report.conflicts[0].reason, /highest recorded monthly salary ceiling .* is 52,000 BDT/);

  // Both ways out are offered, each with exactly one change: keep Malaysia at a lower salary, or keep the salary elsewhere.
  const offered = report.relaxationSuggestions.map(s => `${s.country}:${s.changes.map(c => c.constraint).join('+')}`);
  assert.ok(offered.includes('Malaysia:minSalaryBdt'), offered.join(', '));
  assert.ok(offered.includes('Singapore:preferredCountry'), offered.join(', '));
  const lowerSalary = report.relaxationSuggestions.find(s => s.country === 'Malaysia');
  assert.equal(lowerSalary.changes[0].to, 52000, 'salary is lowered only as far as the Malaysia ceiling');
  // Ranked: fewest changes first.
  const counts = report.relaxationSuggestions.map(s => s.changes.length);
  assert.equal(counts[0], Math.min(...counts));
  assertEverySuggestionUnlocks(body, report);
});

test('fully impossible request lists each independent conflict and still offers working relaxations', () => {
  // No corridor pays 100,000 and none has a cap at or below 50,000: two separate one-constraint conflicts.
  const body = { minSalaryBdt: 100000, maxFeeBdt: 50000 };
  const report = recommend(body);
  assert.equal(report.feasible, false);
  assert.deepEqual(report.conflicts.map(c => c.constraints), [['minSalaryBdt'], ['maxFeeBdt']]);
  assertEverySuggestionUnlocks(body, report);
});

test('fee cap boundary is exact to the paisa (integer cents, no float drift)', () => {
  const exact = recommend({ preferredCountry: 'Malaysia', minSalaryBdt: 40000, maxFeeBdt: '78990.00' });
  assert.equal(exact.feasible, true, 'a budget equal to the cap is legal');

  const short = recommend({ preferredCountry: 'Malaysia', minSalaryBdt: 40000, maxFeeBdt: '78989.99' });
  assert.equal(short.feasible, false);
  assert.equal(short.relaxationSuggestions[0].changes[0].deltaBdt, 0.01);
});

test('no verified agency means no pathway, reported as its own conflict', () => {
  const report = recommend({ minSalaryBdt: 45000, maxFeeBdt: 120000 }, {
    agencies: agencies.filter(agency => agency.status !== 'verified'),
  });
  assert.equal(report.feasible, false);
  assert.deepEqual(report.pathways, []);
  assert.ok(report.conflicts.some(c => c.constraints.includes('verifiedAgency')));
  assert.deepEqual(report.relaxationSuggestions, [], 'relaxing constraints cannot fix a missing verified agency');
});
