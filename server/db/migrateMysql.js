const mysql = require('mysql2/promise');
const { pool } = require('./pool');

// Copy parent tables before tables that reference them.
const tableColumns = {
  users: ['id', 'name', 'email', 'password_hash', 'role', 'created_at'],
  agencies: ['id', 'license_no', 'name', 'status', 'risk_score', 'notes', 'created_at'],
  corridors: [
    'id', 'country_code', 'country', 'job_category', 'max_legal_fee_bdt',
    'min_expected_salary_bdt', 'max_expected_salary_bdt', 'corridor_risk_level',
    'rule_source', 'effective_date',
  ],
  documents: [
    'id', 'worker_id', 'agency_id', 'corridor_id', 'document_type', 'file_path',
    'sha256', 'extracted_data', 'extraction_status', 'created_at',
  ],
  audit_checks: [
    'id', 'document_id', 'related_document_id', 'check_type', 'rule_version',
    'result', 'details', 'created_at',
  ],
  journeys: [
    'id', 'worker_id', 'corridor_id', 'nominee_id', 'nominee_consent_token_hash',
    'nominee_consent_expires_at', 'status', 'payments_frozen', 'created_at', 'updated_at',
  ],
  journey_steps: [
    'id', 'journey_id', 'stage', 'status', 'completed_at', 'expires_at', 'updated_at',
  ],
  audit_logs: [
    'id', 'actor_id', 'target_user_id', 'action', 'entity_type', 'entity_id', 'details', 'created_at',
  ],
};

const batchSize = 200;
const destinationSchema = 'probashi_shield';

async function copyTable(source, destination, table, columns, sourceNextId) {
  const target = `${destinationSchema}.${table}`;
  const fieldList = columns.join(', ');
  let lastId;
  let count = 0;

  while (true) {
    const [rows] = await source.execute(
      `SELECT ${fieldList} FROM ${table} ${lastId === undefined ? '' : 'WHERE id > CAST(? AS UNSIGNED)'} ORDER BY id LIMIT ${batchSize}`,
      lastId === undefined ? [] : [lastId],
    );
    if (rows.length === 0) break;

    const valueGroups = rows.map((_, rowIndex) => {
      const placeholders = columns.map((_, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`);
      return `(${placeholders.join(', ')})`;
    });
    const values = rows.flatMap((row) => columns.map((column) => (
      column === 'payments_frozen' ? Boolean(row[column]) : row[column]
    )));
    await destination.query(`INSERT INTO ${target} (${fieldList}) VALUES ${valueGroups.join(', ')}`, values);
    count += rows.length;
    lastId = rows.at(-1).id;
  }

  // Keep the MySQL sequence high-water mark so IDs of deleted rows stay retired.
  const nextSourceId = BigInt(sourceNextId);
  const nextCopiedId = BigInt(lastId ?? 0) + 1n;
  const nextId = nextSourceId > nextCopiedId ? nextSourceId : nextCopiedId;
  await destination.query(`ALTER TABLE ${target} ALTER COLUMN id RESTART WITH ${nextId}`);
  return count;
}

async function migrateMysql() {
  const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || DB_PASSWORD === undefined || !DB_NAME) {
    throw new Error('Set DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME for the MySQL source.');
  }

  const source = await mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    supportBigNumbers: true,
    bigNumberStrings: true,
    timezone: 'Z',
    dateStrings: true,
    jsonStrings: true,
  });

  try {
    await source.query("SET SESSION time_zone = '+00:00'");
    await source.query('SET SESSION information_schema_stats_expiry = 0');
    await source.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await source.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const [sourceTables] = await source.query(`
      SELECT TABLE_NAME AS name, AUTO_INCREMENT AS next_id
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND ENGINE = 'InnoDB'
    `);
    const sourceNextIds = new Map(sourceTables.map(({ name, next_id }) => [name, next_id]));
    const tables = Object.keys(tableColumns);
    for (const table of tables) {
      if (!sourceNextIds.get(table)) {
        throw new Error(`MySQL source is missing the expected InnoDB identity table ${table}.`);
      }
    }

    const destination = await pool.connect();
    try {
      await destination.query('BEGIN');
      await destination.query("SELECT pg_advisory_xact_lock(hashtext('probashi_shield.db:init'))");
      await destination.query("SET LOCAL TIME ZONE 'UTC'");
      const targetTables = tables.map((table) => `${destinationSchema}.${table}`).join(', ');
      await destination.query(`LOCK TABLE ${targetTables} IN ACCESS EXCLUSIVE MODE`);
      for (const table of tables) {
        const { rows } = await destination.query(`SELECT EXISTS (SELECT 1 FROM ${destinationSchema}.${table}) AS populated`);
        if (rows[0].populated) throw new Error(`Postgres destination contains rows in ${table}. Import requires empty tables.`);
      }

      const counts = {};
      for (const table of tables) {
        counts[table] = await copyTable(source, destination, table, tableColumns[table], sourceNextIds.get(table));
      }
      await destination.query('COMMIT');
      console.log('Imported MySQL rows into Postgres.', counts);
    } catch (error) {
      await destination.query('ROLLBACK');
      throw error;
    } finally {
      destination.release();
    }
  } finally {
    await source.end();
  }
}

migrateMysql()
  .finally(() => pool.end())
  .catch((error) => {
    if (error.code === '42P01') {
      console.error('Initialize Postgres with npm run db:init -- --schema-only before importing.');
    } else {
      console.error('MySQL import failed.', error.code || error.message);
    }
    process.exitCode = 1;
  });
