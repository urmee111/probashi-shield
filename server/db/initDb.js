const { readFile } = require('node:fs/promises');
const path = require('node:path');

async function initDb() {
  const args = process.argv.slice(2);
  const schemaOnly = args.length === 1 && args[0] === '--schema-only';
  if (args.length && !schemaOnly) throw new Error('Expected only the optional --schema-only flag.');

  const schema = await readFile(path.join(__dirname, 'schema.sql'), 'utf8');
  const seed = schemaOnly ? null : await readFile(path.join(__dirname, 'seed.sql'), 'utf8');
  const { pool } = require('./pool');
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('probashi_shield.db:init'))");
      await client.query(schema);
      if (seed) await client.query(seed);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }

  console.log(schemaOnly ? 'Initialized the Postgres schema.' : 'Initialized the Postgres schema and directory fixtures.');
}

initDb().catch((error) => {
  console.error('Database initialization failed:', error.message);
  process.exitCode = 1;
});
