const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/pool');
const { authenticate, tokenIssuer } = require('../middleware/auth');

const router = express.Router();
const passwordHashRounds = 12;
const localPartPattern = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;
const domainPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;

  const email = value.trim().toLowerCase();
  const [localPart, domain, extra] = email.split('@');
  if (!domain || extra !== undefined || email.length > 254 || localPart.length > 64) return null;
  if (!localPartPattern.test(localPart) || !domainPattern.test(domain)) return null;

  return email;
}

function validPassword(value) {
  return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= 72;
}

router.post('/register', async (req, res) => {
  const { name, email: emailInput, password } = req.body ?? {};
  const email = normalizeEmail(emailInput);
  const displayName = typeof name === 'string' ? name.trim() : '';
  if (!displayName || Array.from(displayName).length > 150 || /[\u0000-\u001f\u007f]/.test(displayName)) {
    return res.status(400).json({ error: 'Name must contain 1 to 150 characters.' });
  }
  if (!email) {
    return res.status(400).json({ error: 'A valid email is required.' });
  }
  if (!validPassword(password) || Array.from(password).length < 8) {
    return res.status(400).json({ error: 'Password must contain at least 8 characters and at most 72 UTF-8 bytes.' });
  }

  const passwordHash = await bcrypt.hash(password, passwordHashRounds);
  try {
    const { rows } = await pool.query(
      `INSERT INTO probashi_shield.users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'worker') RETURNING id`,
      [displayName, email, passwordHash]
    );
    return res.status(201).json({ user: { id: rows[0].id, name: displayName, email, role: 'worker' } });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    throw error;
  }
});

router.post('/login', async (req, res) => {
  const { email: emailInput, password } = req.body ?? {};
  const email = normalizeEmail(emailInput);
  if (!email || !validPassword(password)) {
    return res.status(400).json({ error: 'A valid email and password are required.' });
  }

  const { rows } = await pool.query(
    'SELECT id, name, email, password_hash, role FROM probashi_shield.users WHERE lower(email) = $1 LIMIT 1',
    [email]
  );
  const account = rows[0];
  if (!account || !(await bcrypt.compare(password, account.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const { id, name, role } = account;
  const user = { id, name, email: account.email, role };
  const token = jwt.sign({ id, email: user.email, role }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
    issuer: tokenIssuer,
  });
  return res.json({ token, user });
});

router.get('/me', authenticate, async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, email, role FROM probashi_shield.users WHERE id = $1', [req.user.id]);
  const user = rows[0];
  if (!user) {
    return res.status(401).json({ error: 'Account no longer exists.' });
  }
  return res.json({ user });
});

module.exports = router;
