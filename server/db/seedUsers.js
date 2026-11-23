const bcrypt = require('bcryptjs');
const { pool } = require('./pool');

const accounts = [
  { name: 'Rahim Mia', email: 'rahim@demo.com', role: 'worker' },
  { name: 'Karim Uddin', email: 'karim@demo.com', role: 'worker' },
  { name: 'Fatema Begum', email: 'fatema@demo.com', role: 'nominee' },
  { name: 'Caseworker Admin', email: 'admin@demo.com', role: 'admin' },
];

// This public password is a fixture for the demo accounts.
const demoPassword = 'Password123!';

async function seedUsers() {
  try {
    const { rows: existing } = await pool.query(
      'SELECT email FROM probashi_shield.users WHERE lower(email) = ANY($1::text[])',
      [accounts.map(({ email }) => email)]
    );
    const existingEmails = new Set(existing.map(({ email }) => email.toLowerCase()));
    const missing = accounts.filter(({ email }) => !existingEmails.has(email));

    if (missing.length > 0) {
      const values = await Promise.all(missing.map(async ({ name, email, role }) => [
        name,
        email,
        await bcrypt.hash(demoPassword, 12),
        role,
      ]));
      const placeholders = values.map((row, index) => {
        const parameters = row.map((_value, column) => `$${index * row.length + column + 1}`);
        return `(${parameters.join(', ')})`;
      }).join(', ');
      await pool.query(
        `INSERT INTO probashi_shield.users (name, email, password_hash, role) VALUES ${placeholders}
         ON CONFLICT (lower(email)) DO NOTHING`,
        values.flat()
      );
    }
    console.log('Demo user seeding completed.');
  } finally {
    await pool.end();
  }
}

seedUsers().catch((error) => {
  console.error(`Demo user seeding failed: ${error.message}`);
  process.exitCode = 1;
});
