const path = require('node:path');
const dotenv = require('dotenv');
const { Pool, types } = require('pg');

dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

let databaseUrl;
try {
  databaseUrl = new URL(process.env.DATABASE_URL);
} catch {
  throw new Error('Set DATABASE_URL to the Supabase Postgres connection string in server/.env.');
}
if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol) || !databaseUrl.hostname || databaseUrl.hash) {
  throw new Error('DATABASE_URL must be a PostgreSQL URL with reserved password characters percent-encoded.');
}

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
if (!localHosts.has(databaseUrl.hostname)) {
  databaseUrl.searchParams.set('sslmode', 'verify-full');
  const supabaseHost = /(?:\.pooler\.supabase\.com$|^db\.[a-z0-9]+\.supabase\.co$)/i.test(databaseUrl.hostname);
  if (supabaseHost && !databaseUrl.searchParams.get('sslrootcert')) {
    databaseUrl.searchParams.set('sslrootcert', path.join(__dirname, 'supabase-ca.crt'));
  }
}

const pool = new Pool({
  connectionString: databaseUrl.toString(),
  max: 5,
  connectionTimeoutMillis: 5000,
  // pg closes idle connections after 10 s by default, and reconnecting to Supabase
  // over TLS costs about 2 s. Keep connections for 5 minutes instead.
  idleTimeoutMillis: 300_000,
  keepAlive: true,
  types: {
    getTypeParser(oid, format) {
      if (oid === types.builtins.INT8 && format === 'text') {
        return (value) => {
          const number = Number(value);
          return Number.isSafeInteger(number) ? number : value;
        };
      }
      return types.getTypeParser(oid, format);
    },
  },
});

pool.on('error', (error) => {
  console.error('Postgres connection error', error.code || error.name);
});

async function checkConnection() {
  await pool.query('SELECT 1');
  return true;
}

module.exports = { pool, checkConnection };
