const express = require('express');
const { pool } = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { recommendPathways, validateConstraints } = require('../services/pathwayOptimizer');

const router = express.Router();

router.post('/recommend', authenticate, async (req, res) => {
  const { constraints, error } = validateConstraints(req.body);
  if (error) return res.status(400).json({ error });

  const [{ rows: corridors }, { rows: agencies }] = await Promise.all([
    pool.query(
      `SELECT id, country, job_category, max_legal_fee_bdt, min_expected_salary_bdt,
              max_expected_salary_bdt, corridor_risk_level, rule_source,
              to_char(effective_date, 'YYYY-MM-DD') AS effective_date
       FROM probashi_shield.corridors
       ORDER BY lower(country), lower(job_category) NULLS FIRST, id`,
    ),
    pool.query(
      `SELECT id, name, license_no, status, risk_score
       FROM probashi_shield.agencies
       WHERE status = $1
       ORDER BY lower(name), id`,
      ['verified'],
    ),
  ]);

  return res.json(recommendPathways({ constraints, corridors, agencies }));
});

module.exports = router;
