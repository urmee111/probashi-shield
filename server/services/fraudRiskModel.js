const binaryFactors = [
  ['agencyFlaggedOrRevoked', 'An agency named in the documents is flagged or revoked in the registry.'],
  ['agencyLicenseMismatch', 'The documents claim different agency licenses.'],
  ['missingSalaryClause', 'An employment document is missing a salary clause.'],
  ['highRiskCorridor', 'The recorded destination corridor has a high risk rating.'],
];

// Each profile contributes 50 cases. Overlapping ranges and probabilities represent
// legitimate paperwork errors and scams without all the usual warning signs.
const caseProfiles = {
  routinePlacement: { label: 0, feeRange: [0.65, 1.08], signals: [0.01, 0.02, 0.04, 0.04] },
  paperworkErrors: { label: 0, feeRange: [0.83, 1.38], signals: [0.06, 0.20, 0.18, 0.08] },
  legitimateHighRiskDestination: { label: 0, feeRange: [0.72, 1.32], signals: [0.10, 0.10, 0.14, 0.80] },
  variableCollectionFees: { label: 0, feeRange: [0.80, 1.62], signals: [0.04, 0.08, 0.15, 0.15] },
  inflatedAdvanceFeeScam: { label: 1, feeRange: [1.28, 6.30], signals: [0.46, 0.48, 0.57, 0.30] },
  unlicensedIntermediaryScam: { label: 1, feeRange: [0.90, 3.15], signals: [0.58, 0.82, 0.60, 0.26] },
  fabricatedJobOffer: { label: 1, feeRange: [0.68, 2.80], signals: [0.44, 0.71, 0.82, 0.21] },
  deceptiveHighRiskPlacement: { label: 1, feeRange: [0.86, 4.40], signals: [0.53, 0.64, 0.66, 0.86] },
};

function syntheticCases() {
  let seed = 19715001;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  return Object.values(caseProfiles).flatMap(({ label, feeRange: [min, max], signals }) => (
    Array.from({ length: 50 }, () => ({
      features: [1, min + next() * (max - min) - 1, ...signals.map(chance => Number(next() < chance))],
      label,
    }))
  ));
}

function sigmoid(logit) {
  return 1 / (1 + Math.exp(-logit));
}

function linearScore(features, weights) {
  let score = 0;
  for (let index = 0; index < features.length; index += 1) {
    score += features[index] * weights[index];
  }
  return score;
}

function train(cases) {
  const weights = new Float64Array(6);
  const gradient = new Float64Array(weights.length);
  const learningRate = 0.45;
  const regularization = 0.008;

  for (let epoch = 0; epoch < 200; epoch += 1) {
    gradient.fill(0);
    for (const { features, label } of cases) {
      const error = sigmoid(linearScore(features, weights)) - label;
      for (let index = 0; index < weights.length; index += 1) {
        gradient[index] += error * features[index];
      }
    }
    for (let index = 0; index < weights.length; index += 1) {
      const penalty = index === 0 ? 0 : regularization * weights[index];
      weights[index] -= learningRate * (gradient[index] / cases.length + penalty);
    }
  }
  return weights;
}

const weights = train(syntheticCases());

function predictFraudRisk(features = {}) {
  const feeMultiple = Number.isFinite(features.overchargeMultiple) && features.overchargeMultiple >= 0
    ? features.overchargeMultiple
    : 1;
  // Center on the legal fee cap and bound extrapolation beyond the training range.
  const vector = [1, Math.min(feeMultiple, 6.3) - 1, ...binaryFactors.map(([factor]) => (
    Number(features[factor] === 1 || features[factor] === true)
  ))];
  const fraudProbability = Number((sigmoid(linearScore(vector, weights)) * 100).toFixed(2));
  let riskTier = 'Low';
  if (fraudProbability >= 80) riskTier = 'Critical';
  else if (fraudProbability >= 50) riskTier = 'High';
  else if (fraudProbability >= 20) riskTier = 'Moderate';

  const factors = [
    ['overchargeMultiple', `The recorded fee is ${feeMultiple.toFixed(2)} times the corridor fee cap.`],
    ...binaryFactors,
  ];
  const topFactors = factors
    .map(([factor, description], index) => ({
      factor,
      weightContribution: Number((weights[index + 1] * vector[index + 1]).toFixed(4)),
      description,
    }))
    .filter(({ weightContribution }) => weightContribution !== 0)
    .sort((left, right) => Math.abs(right.weightContribution) - Math.abs(left.weightContribution));

  return { fraudProbability, riskTier, topFactors };
}

module.exports = { predictFraudRisk };
