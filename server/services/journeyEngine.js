const STAGES = Object.freeze([
  'agency_verification', 'medical', 'police_clearance', 'training',
  'immigration_clearance', 'visa', 'flight',
]);

const validityDays = { medical: 90, police_clearance: 180 };
const dayMs = 24 * 60 * 60 * 1000;
const statuses = new Set(['pending', 'in_progress', 'passed', 'failed', 'expired', 'reopened']);
const patchFields = new Set(['status', 'notes', 'expiresAt']);

function isBlocker(step) {
  return step.status === 'failed' || step.status === 'expired';
}

function describeStep(step) {
  return { stepOrder: step.step_order, stepName: step.step_name, status: step.status };
}

function buildRecoveryPlan(steps, blockers) {
  const next = steps.find(step => step.status !== 'passed');
  const blockerNames = blockers.map(step => `step ${step.step_order} (${step.step_name}) is ${step.status}`);
  let instruction = null;
  if (next) {
    instruction = blockers.length
      ? `Pass step ${next.step_order} (${next.step_name}). Payments unfreeze once no step is expired or failed.`
      : `Pass step ${next.step_order} (${next.step_name}) to continue the journey.`;
  }
  return {
    blockedBySteps: blockers.map(describeStep),
    reopenedSteps: steps.filter(step => step.status === 'reopened').map(describeStep),
    paymentFrozenReason: blockers.length
      ? `Payments are frozen because ${blockerNames.join(' and ')}. Later steps stay reopened until ${blockers.length > 1 ? 'they are' : 'it is'} revalidated.`
      : null,
    nextRequiredAction: next ? {
      stepOrder: next.step_order,
      stepName: next.step_name,
      requiredStatus: 'passed',
      instruction,
    } : null,
  };
}

function evaluateJourneyState(journey, steps, now = new Date()) {
  const time = new Date(now).getTime();
  const ordered = steps.map(step => ({ ...step })).sort((a, b) => a.step_order - b.step_order);
  // Find every expired clearance before reopening dependants, so simultaneous
  // expirations are retained as independent blockers.
  for (const step of ordered) {
    if (step.status === 'passed' && step.expires_at != null && new Date(step.expires_at).getTime() < time) {
      step.status = 'expired';
    }
  }
  const blockers = ordered.filter(isBlocker);
  const firstBlocker = blockers[0];
  if (firstBlocker) {
    for (const step of ordered) {
      if (step.step_order > firstBlocker.step_order && (step.status === 'passed' || step.status === 'in_progress')) {
        step.status = 'reopened';
        step.completed_at = null;
        step.expires_at = null;
      }
    }
  }
  const passed = new Set(ordered.filter(step => step.status === 'passed').map(step => step.step_order));
  const flightReady = !firstBlocker && STAGES.slice(0, 6).every((_, index) => passed.has(index + 1));
  let overallStatus = 'in_progress';
  if (firstBlocker) overallStatus = 'blocked_recovery';
  else if (flightReady) overallStatus = passed.has(7) ? 'completed' : 'ready_for_flight';
  return {
    journey: { ...journey, overall_status: overallStatus, flight_ready: flightReady, payment_frozen: !!firstBlocker },
    steps: ordered,
    recoveryPlan: buildRecoveryPlan(ordered, blockers),
  };
}

function reject(status, message) {
  throw Object.assign(new Error(message), { status });
}

function parseExpiry(value) {
  if (value === null) return null;
  const iso = /^(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;
  const match = typeof value === 'string' && iso.exec(value);
  const date = match && new Date(value);
  const calendarDay = match && new Date(match[1]);
  if (!match || !Number.isFinite(date.getTime()) || !Number.isFinite(calendarDay.getTime())
      || calendarDay.toISOString().slice(0, 10) !== match[1]) {
    reject(400, 'expiresAt must be an ISO date or a timestamp with a timezone.');
  }
  return date.toISOString();
}

function applyStepPatch(journey, steps, stepOrder, patch, now = new Date()) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)
      || !Object.keys(patch).length || Object.keys(patch).some(key => !patchFields.has(key))) {
    reject(400, 'Supply status, notes, or expiresAt to update a step.');
  }
  if (Object.hasOwn(patch, 'status') && !statuses.has(patch.status)) reject(400, 'Invalid step status.');
  if (patch.notes != null && (typeof patch.notes !== 'string' || patch.notes.includes('\0'))) {
    reject(400, 'notes must be text or null.');
  }
  const expiry = Object.hasOwn(patch, 'expiresAt') ? parseExpiry(patch.expiresAt) : undefined;
  const state = evaluateJourneyState(journey, steps, now);
  const step = state.steps.find(row => row.step_order === stepOrder);
  if (!step) reject(400, 'stepOrder must be an integer from 1 to 7.');

  const previous = step.status;
  const status = patch.status ?? previous;
  const recovery = isBlocker(step) || previous === 'reopened';
  if (status !== previous) {
    if (status === 'reopened' || (status === 'expired' && previous !== 'passed')) {
      reject(409, 'Only a passed step can expire. Downstream steps reopen through rollback.');
    }
    if ((status === 'pending' || status === 'in_progress') && (recovery || previous === 'passed')) {
      reject(409, 'Revalidate this step by passing it, or record a failure.');
    }
    if (status === 'passed') {
      for (let order = 1; order < stepOrder; order += 1) {
        if (!state.steps.some(row => row.step_order === order && row.status === 'passed')) {
          reject(400, `Pass prerequisite step ${order} (${STAGES[order - 1]}) first.`);
        }
      }
      const completed = new Date(now);
      step.completed_at = completed.toISOString();
      const days = validityDays[step.step_name];
      const defaultExpiry = days ? new Date(completed.getTime() + days * dayMs).toISOString() : null;
      step.expires_at = recovery ? defaultExpiry : step.expires_at ?? defaultExpiry;
      if (recovery) step.retry_count = (step.retry_count ?? 0) + 1;
    } else if (status !== 'expired') {
      step.completed_at = null;
    }
    step.status = status;
  }
  if (expiry !== undefined) {
    // A null expiry requests the default on a fresh pass. An existing medical
    // or police clearance always keeps its validity deadline.
    if (expiry !== null || status !== 'passed' || !validityDays[step.step_name]) step.expires_at = expiry;
  }
  if (Object.hasOwn(patch, 'notes')) step.notes = patch.notes;
  return evaluateJourneyState(state.journey, state.steps, now);
}

module.exports = { STAGES, evaluateJourneyState, applyStepPatch };
