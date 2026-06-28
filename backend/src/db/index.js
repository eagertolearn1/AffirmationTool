const { Pool } = require('pg');
const logger   = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max:              20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected PostgreSQL pool error');
});

/**
 * Execute a query with optional parameters.
 * @param {string} text  - SQL string
 * @param {any[]}  params - parameterised values
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug({ query: text, duration, rows: result.rowCount }, 'db query');
    return result;
  } catch (err) {
    logger.error({ err, query: text }, 'db query error');
    throw err;
  }
}

/**
 * Run a set of queries in a transaction.
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 */
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function healthCheck() {
  const { rows } = await query('SELECT NOW() AS now');
  return rows[0].now;
}

module.exports = { query, transaction, healthCheck, pool };
