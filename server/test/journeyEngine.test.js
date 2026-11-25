const assert = require('node:assert/strict');
const test = require('node:test');
const { STAGES, applyStepPatch, evaluateJourneyState } = require('../services/journeyEngine');

const now = new Date('2026-01-01T00:00:00Z');

function initialState() {
  const steps = STAGES.map((step_name, index) => ({
    step_order: index + 1, step_name, status: 'pending', notes: null,
    retry_count: 0, completed_at: null, expires_at: null,
  }));
  return evaluateJourneyState({ id: 1 }, steps, now);
}

function patch(state, stepOrder, changes, at = now) {
  return applyStepPatch(state.journey, state.steps, stepOrder, changes, at);
}

function passThrough(order) {
  let state = initialState();
  for (let index = 1; index <= order; index += 1) state = patch(state, index, { status: 'passed' });
  return state;
}

test('passing checks prerequisites and only unlocks flight after six current passes', () => {
  const initial = initialState();
  assert.throws(() => patch(initial, 2, { status: 'passed' }), { status: 400 });
  assert.equal(initial.steps[1].completed_at, null);
  let state = passThrough(5);
  assert.equal(state.journey.flight_ready, false);
  state = patch(state, 6, { status: 'passed' });
  assert.equal(state.journey.flight_ready, true);
  assert.equal(state.journey.overall_status, 'ready_for_flight');
  state = patch(state, 7, { status: 'passed' });
  assert.equal(state.journey.overall_status, 'completed');
  state = patch(state, 3, { status: 'failed' });
  assert.equal(state.journey.flight_ready, false);
  assert.equal(state.steps[6].status, 'reopened');
});

test('medical expiry reopens passed/in-progress steps only and is idempotent', () => {
  let state = passThrough(4);
  assert.equal(state.steps[1].expires_at, '2026-04-01T00:00:00.000Z');
  assert.equal(state.steps[2].expires_at, '2026-06-30T00:00:00.000Z');
  state = patch(state, 5, { status: 'in_progress' });
  const deadline = new Date(state.steps[1].expires_at);
  const atDeadline = evaluateJourneyState(state.journey, state.steps, deadline);
  assert.equal(atDeadline.steps[1].status, 'passed');
  const after = new Date(deadline.getTime() + 1);
  const expired = evaluateJourneyState(state.journey, state.steps, after);
  assert.deepEqual(expired.steps.map(step => step.status), [
    'passed', 'expired', 'reopened', 'reopened', 'reopened', 'pending', 'pending',
  ]);
  assert.ok(expired.steps.slice(2, 5).every(step => step.completed_at === null && step.expires_at === null));
  assert.equal(expired.journey.payment_frozen, true);
  assert.equal(expired.journey.overall_status, 'blocked_recovery');
  assert.equal(expired.recoveryPlan.nextRequiredAction.stepName, 'medical');
  assert.deepEqual(evaluateJourneyState(expired.journey, expired.steps, after), expired);
  assert.equal(state.steps[1].status, 'passed');
  assert.throws(() => patch(expired, 2, { status: 'in_progress' }, after), { status: 409 });

  const renewed = patch(expired, 2, { status: 'passed' }, after);
  assert.equal(renewed.steps[1].retry_count, 1);
  assert.equal(renewed.steps[1].expires_at, '2026-06-30T00:00:00.001Z');
  assert.equal(renewed.journey.payment_frozen, false);
  assert.equal(renewed.journey.flight_ready, false);
  assert.throws(() => patch(renewed, 4, { status: 'passed' }, after), { status: 400 });
  const police = patch(renewed, 3, { status: 'passed' }, after);
  assert.equal(police.steps[2].retry_count, 1);
  assert.deepEqual(patch(police, 3, { status: 'passed' }, after), police);
});

test('recovery plan lists every blocker, reopened steps, and the next action', () => {
  let state = passThrough(5);
  state = patch(state, 5, { status: 'failed' });
  state = patch(state, 2, { expiresAt: '2025-12-31' });
  assert.deepEqual(state.recoveryPlan.blockedBySteps.map(step => step.stepOrder), [2, 5]);
  assert.deepEqual(state.recoveryPlan.reopenedSteps.map(step => step.stepOrder), [3, 4]);
  assert.ok(state.recoveryPlan.paymentFrozenReason.includes('step 2 (medical) is expired'));
  state = patch(state, 2, { status: 'passed' });
  assert.equal(state.journey.payment_frozen, true);
  assert.equal(state.recoveryPlan.nextRequiredAction.stepOrder, 3);
  for (const order of [3, 4, 5]) state = patch(state, order, { status: 'passed' });
  assert.equal(state.journey.payment_frozen, false);
  assert.equal(state.steps[4].retry_count, 1);
  assert.deepEqual(state.recoveryPlan.blockedBySteps, []);
  assert.equal(state.recoveryPlan.paymentFrozenReason, null);
});

test('notes edits preserve deadlines; an explicit validity period overrides the default', () => {
  let state = passThrough(1);
  assert.throws(() => patch(state, 2, { expiresAt: '2026-02-30' }), { status: 400 });
  state = patch(state, 2, { expiresAt: '2026-02-11T01:00:00+01:00' });
  state = patch(state, 2, { status: 'passed' });
  assert.equal(state.steps[1].expires_at, '2026-02-11T00:00:00.000Z');
  state = patch(state, 2, { notes: 'Clearance verified' });
  assert.equal(state.steps[1].expires_at, '2026-02-11T00:00:00.000Z');
  assert.equal(state.steps[1].notes, 'Clearance verified');
  assert.throws(() => patch(state, 2, { status: 'pending' }), { status: 409 });
});

test('once the worker has flown, a clearance lapsing later does not roll the journey back', () => {
  const completed = passThrough(7);
  assert.equal(completed.journey.overall_status, 'completed');
  const later = new Date('2027-06-01T00:00:00Z');
  const after = evaluateJourneyState(completed.journey, completed.steps, later);
  assert.equal(after.journey.overall_status, 'completed');
  assert.equal(after.journey.payment_frozen, false);
  assert.ok(after.steps.every(step => step.status === 'passed'));

  // The same lapse on a journey that has not flown yet still rolls back and freezes payments.
  const ready = passThrough(6);
  const blocked = evaluateJourneyState(ready.journey, ready.steps, later);
  assert.equal(blocked.journey.overall_status, 'blocked_recovery');
  assert.equal(blocked.journey.payment_frozen, true);
});
