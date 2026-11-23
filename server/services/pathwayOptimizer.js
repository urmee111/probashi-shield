const safetyRank = { low: 0, medium: 1, high: 2 };
const moneyFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

function toCents(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parts = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(String(value).trim());
  if (!parts) return null;
  return Number(parts[1]) * 100 + Number((parts[2] || '').padEnd(2, '0'));
}

function formatBdt(cents) {
  return `${moneyFormat.format(cents / 100)} BDT`;
}

function validateConstraints(body) {
  const { preferredCountry, minSalaryBdt, maxFeeBdt, allowHighRisk = false } = body ?? {};
  let country = null;
  if (preferredCountry !== undefined) {
    country = typeof preferredCountry === 'string' ? preferredCountry.trim() : '';
    if (!country || country.length > 100) {
      return { error: 'preferredCountry must be a nonempty string with at most 100 characters.' };
    }
  }

  const salary = toCents(minSalaryBdt);
  const budget = toCents(maxFeeBdt);
  if (salary === null || budget === null) {
    return { error: 'minSalaryBdt and maxFeeBdt must be nonnegative BDT amounts with at most 2 decimal places.' };
  }
  if (typeof allowHighRisk !== 'boolean') return { error: 'allowHighRisk must be a boolean.' };

  return { constraints: { preferredCountry: country, salary, budget, allowHighRisk } };
}

function readCorridor(corridor) {
  const fee = toCents(corridor.max_legal_fee_bdt);
  const salaryFloor = toCents(corridor.min_expected_salary_bdt);
  const salaryCeiling = toCents(corridor.max_expected_salary_bdt);
  const risk = corridor.corridor_risk_level;
  if (fee === null || salaryFloor === null || salaryCeiling === null || salaryFloor > salaryCeiling
      || !Object.hasOwn(safetyRank, risk) || !corridor.rule_source?.trim()) return null;

  return { corridor, fee, salaryFloor, salaryCeiling, risk, firstYearNet: salaryFloor * 12 - fee };
}

function compareCorridors(a, b) {
  return b.firstYearNet - a.firstYearNet || safetyRank[a.risk] - safetyRank[b.risk];
}

function rankAgencies(a, b) {
  return (a.risk_score ?? Infinity) - (b.risk_score ?? Infinity) || a.name.localeCompare(b.name);
}

const rules = [
  {
    field: 'preferredCountry',
    difference: (entry, constraints) => (
      constraints.preferredCountry !== null
      && entry.corridor.country.toLowerCase() !== constraints.preferredCountry.toLowerCase() ? 1 : 0
    ),
    change: (entry, constraints) => ({
      from: constraints.preferredCountry,
      to: entry.corridor.country,
      description: `change preferred country to ${entry.corridor.country}`,
    }),
    explain: (entries, constraints, allCorridors) => {
      const country = constraints.preferredCountry;
      if (allCorridors.some(entry => entry.country.toLowerCase() === country.toLowerCase())
          && !allCorridors.some(entry => entry.country.toLowerCase() === country.toLowerCase() && readCorridor(entry))) {
        return `${country} lacks a complete corridor rule record with a fee cap, salary range, risk level, and rule source.`;
      }
      const countries = [...new Set(entries.map(({ corridor }) => corridor.country))];
      return `Eligible destinations under the other constraints are ${countries.join(', ')}. The requested destination is ${country}.`;
    },
  },
  {
    field: 'minSalaryBdt',
    monetary: true,
    difference: (entry, constraints) => Math.max(0, constraints.salary - entry.salaryCeiling),
    change: (entry, constraints, difference) => ({
      from: constraints.salary / 100,
      to: entry.salaryCeiling / 100,
      deltaBdt: -difference / 100,
      description: `-${formatBdt(difference)} monthly salary target`,
    }),
    explain: (entries, constraints) => {
      const ceiling = entries.reduce((highest, entry) => Math.max(highest, entry.salaryCeiling), 0);
      return `The highest recorded monthly salary ceiling under the other constraints is ${formatBdt(ceiling)}. The target is ${formatBdt(constraints.salary)}.`;
    },
  },
  {
    field: 'maxFeeBdt',
    monetary: true,
    difference: (entry, constraints) => Math.max(0, entry.fee - constraints.budget),
    change: (entry, constraints, difference) => ({
      from: constraints.budget / 100,
      to: entry.fee / 100,
      deltaBdt: difference / 100,
      description: `+${formatBdt(difference)} budget`,
    }),
    explain: (entries, constraints) => {
      const lowestCap = entries.reduce((lowest, entry) => Math.min(lowest, entry.fee), Infinity);
      return `The lowest recorded legal fee cap under the other constraints is ${formatBdt(lowestCap)}. The budget is ${formatBdt(constraints.budget)}.`;
    },
  },
  {
    field: 'allowHighRisk',
    difference: (entry, constraints) => (!constraints.allowHighRisk && entry.risk === 'high' ? 1 : 0),
    change: () => ({ from: false, to: true, description: 'allow high-risk corridors' }),
    explain: () => 'Every corridor that meets the other constraints is marked high risk.',
  },
];

function evaluate(entry, constraints) {
  const differences = rules.map(rule => rule.difference(entry, constraints));
  const violations = differences.reduce((mask, amount, index) => (amount > 0 ? mask | (1 << index) : mask), 0);
  const monetaryDistance = differences.reduce((total, amount, index) => total + (rules[index].monetary ? amount : 0), 0);
  const changes = rules.flatMap((rule, index) => (differences[index] > 0
    ? [{ constraint: rule.field, ...rule.change(entry, constraints, differences[index]) }]
    : []));
  return { ...entry, differences, violations, monetaryDistance, changes };
}

function diagnoseConflicts(entries, constraints, corridors) {
  const cores = [];
  for (let mask = 1; mask < (1 << rules.length); mask += 1) {
    if (cores.some(core => (core & mask) === core) || entries.some(entry => (entry.violations & mask) === 0)) {
      continue;
    }
    cores.push(mask);
  }

  return cores.map((core) => {
    const causes = rules.flatMap((rule, index) => {
      const bit = 1 << index;
      if ((core & bit) === 0) return [];
      const matchesOthers = entries.filter(entry => (entry.violations & (core ^ bit)) === 0);
      return [{ constraint: rule.field, reason: rule.explain(matchesOthers, constraints, corridors) }];
    });
    return {
      constraints: causes.map(({ constraint }) => constraint),
      reason: causes.map(({ reason }) => reason).join(' '),
    };
  });
}

function pathway(entry, agency, salary) {
  return {
    corridor: entry.corridor,
    agency,
    agencyVerificationScope: 'directory_status',
    firstYearNetBdt: entry.firstYearNet / 100,
    salaryTargetAboveFloor: salary > entry.salaryFloor,
  };
}

function compareAlternatives(a, b) {
  return a.changes.length - b.changes.length
    || a.monetaryDistance - b.monetaryDistance
    || safetyRank[a.risk] - safetyRank[b.risk] || compareCorridors(a, b);
}

function dominates(a, b) {
  return a.differences.every((amount, index) => amount <= b.differences[index])
    && a.differences.some((amount, index) => amount < b.differences[index]);
}

function recommendPathways({ constraints, corridors, agencies }) {
  const verified = agencies.filter(({ status }) => status === 'verified').sort(rankAgencies);
  const entries = corridors.map(readCorridor).filter(Boolean).map(entry => evaluate(entry, constraints));
  const report = { feasible: false, pathways: [], conflicts: [], relaxationSuggestions: [], closestAlternatives: [] };

  if (verified.length === 0) {
    report.conflicts.push({ constraints: ['verifiedAgency'], reason: 'The directory currently has no verified agencies.' });
  }
  if (entries.length === 0) {
    report.conflicts.push({ constraints: ['corridorRules'], reason: 'A corridor needs a fee cap, salary range, risk level, and rule source before it can be recommended.' });
    return report;
  }

  const matches = entries.filter(({ violations }) => violations === 0).sort(compareCorridors);
  if (matches.length && verified.length) {
    report.feasible = true;
    report.pathways = matches.flatMap(entry => verified.map(agency => pathway(entry, agency, constraints.salary)));
    return report;
  }

  report.conflicts.push(...diagnoseConflicts(entries, constraints, corridors));
  if (verified.length === 0) return report;

  const alternatives = entries.sort(compareAlternatives);
  report.closestAlternatives = alternatives.map(entry => ({
    ...pathway(entry, verified[0], Math.min(constraints.salary, entry.salaryCeiling)),
    requiredChanges: entry.changes,
  }));
  report.relaxationSuggestions = alternatives
    .filter(entry => !alternatives.some(other => dominates(other, entry)))
    .map((entry) => {
      const { country, job_category: jobCategory } = entry.corridor;
      const destination = jobCategory ? `${country} ${jobCategory}` : country;
      const verb = entry.changes.length === 1 ? 'unlocks' : 'unlock';
      return {
        country,
        jobCategory,
        changes: entry.changes,
        suggestion: `${entry.changes.map(({ description }) => description).join(' and ')} ${verb} ${destination}.`,
      };
    });
  return report;
}

module.exports = { recommendPathways, validateConstraints };
