const express = require('express');
const { pool } = require('../db/pool');

const router = express.Router();

const agencyQueryKeys = new Set(['search', 'status', 'sortBy', 'order']);
const corridorQueryKeys = new Set(['country', 'maxFee', 'minSalary']);
const agencyStatuses = new Set(['verified', 'flagged', 'revoked']);
const agencySortColumns = new Set(['risk_score', 'name']);
const sortOrders = new Set(['asc', 'desc']);

function hasUnknownKeys(query, allowedKeys) {
  return Object.keys(query).some((key) => !allowedKeys.has(key));
}

function parseText(value, maximumLength) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return null;

  const text = value.trim();
  return text.length > 0 && text.length <= maximumLength ? text : null;
}

function parseAmount(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) return null;
  return Number(value);
}

router.get('/agencies', async (req, res) => {
  const query = req.query;
  const { status, sortBy = 'name', order = 'asc' } = query;
  const search = parseText(query.search, 200);

  if (hasUnknownKeys(query, agencyQueryKeys)) {
    return res.status(400).json({ error: 'Unsupported agency query parameter.' });
  }
  if (search === null) {
    return res.status(400).json({ error: 'search must be a nonempty string with at most 200 characters.' });
  }
  if (status !== undefined && !agencyStatuses.has(status)) {
    return res.status(400).json({ error: 'status must be verified, flagged, or revoked.' });
  }
  if (!agencySortColumns.has(sortBy) || !sortOrders.has(order)) {
    return res.status(400).json({ error: 'sortBy must be risk_score or name, and order must be asc or desc.' });
  }

  const conditions = [];
  const params = [];
  if (search !== undefined) {
    const pattern = '%' + search.replace(/[!%_]/g, '!$&') + '%';
    params.push(pattern);
    conditions.push(`(name ILIKE $${params.length} ESCAPE '!' OR license_no ILIKE $${params.length} ESCAPE '!')`);
  }
  if (status !== undefined) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const sortColumn = sortBy === 'name' ? 'lower(name)' : 'risk_score';
  const nullOrder = order === 'asc' ? 'NULLS FIRST' : 'NULLS LAST';
  const { rows: agencies } = await pool.query(
    `SELECT id, name, license_no, status, risk_score, notes, created_at
     FROM probashi_shield.agencies
     ${where}
     ORDER BY ${sortColumn} ${order} ${nullOrder}, id`,
    params,
  );
  return res.json({ agencies });
});

router.get('/corridors', async (req, res) => {
  const query = req.query;
  const country = parseText(query.country, 100);
  const maxFee = parseAmount(query.maxFee);
  const minSalary = parseAmount(query.minSalary);

  if (hasUnknownKeys(query, corridorQueryKeys)) {
    return res.status(400).json({ error: 'Unsupported corridor query parameter.' });
  }
  if (country === null) {
    return res.status(400).json({ error: 'country must be a nonempty string with at most 100 characters.' });
  }
  if (maxFee === null || minSalary === null) {
    return res.status(400).json({ error: 'maxFee and minSalary must be nonnegative BDT amounts with up to 10 whole digits and 2 decimal places.' });
  }

  const conditions = [];
  const params = [];
  if (country !== undefined) {
    params.push(country);
    conditions.push(`lower(country) = lower($${params.length})`);
  }
  if (maxFee !== undefined) {
    params.push(maxFee);
    conditions.push(`max_legal_fee_bdt <= $${params.length}`);
  }
  if (minSalary !== undefined) {
    params.push(minSalary);
    conditions.push(`min_expected_salary_bdt >= $${params.length}`);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const { rows } = await pool.query(
    `SELECT id, country, job_category, max_legal_fee_bdt, min_expected_salary_bdt,
            max_expected_salary_bdt, corridor_risk_level, rule_source,
            to_char(effective_date, 'YYYY-MM-DD') AS effective_date,
            AVG(max_legal_fee_bdt) OVER () AS average_fee_cap
     FROM probashi_shield.corridors
     ${where}
     ORDER BY lower(country), lower(job_category) NULLS FIRST, id`,
    params,
  );
  const averageFee = rows[0]?.average_fee_cap ?? null;
  return res.json({
    corridors: rows.map(({ average_fee_cap, ...corridor }) => corridor),
    stats: {
      totalCorridors: rows.length,
      averageLegalFeeCapBdt: averageFee === null ? null : Number(averageFee),
    },
  });
});

module.exports = router;
