'use strict';

/**
 * db.js — Sawmill MySQL connection pool
 *
 * All credentials are read exclusively from environment variables.
 * No credentials are hardcoded here — the server will refuse to start
 * if required variables are missing.
 *
 * Exports:
 *   pool             — the raw mysql2 PromisePool (for advanced use)
 *   query(sql, params) — thin wrapper; picks a connection, runs a
 *                        parameterized query, and releases automatically
 *   withTransaction(cb) — runs cb(conn) inside a BEGIN/COMMIT block;
 *                         auto-rolls back on error
 *   testConnection() — verifies the pool can reach the DB server;
 *                      called once at startup
 */

const mysql = require('mysql2/promise');

// ─── Validate required environment variables ──────────────────────────────────
// DB_PASSWORD is intentionally allowed to be empty (valid for local dev MySQL)
const REQUIRED_VARS = ['DB_HOST', 'DB_USER', 'DB_NAME'];
const missing = REQUIRED_VARS.filter((k) => !process.env[k]);

if (missing.length > 0) {
  console.error(
    '❌ Database configuration error: the following environment variables are not set:\n' +
    missing.map((k) => `   • ${k}`).join('\n') +
    '\n   Copy server/.env.example to server/.env and fill in your values.'
  );
  // Exit immediately — there is no safe way to continue without credentials.
  process.exit(1);
}

// ─── Pool configuration ───────────────────────────────────────────────────────
const poolConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  // Pool behaviour
  waitForConnections: true,  // queue requests when all connections are busy
  connectionLimit: 10,       // maximum simultaneous connections
  queueLimit: 0,             // 0 = unlimited queue depth

  // Keep idle connections alive (avoids "Connection lost" after inactivity)
  enableKeepAlive: true,
  keepAliveInitialDelay: 30000, // 30 s

  // Use the faster text protocol — avoids double-encoding issues with DECIMAL
  decimalNumbers: true,

  // Character set
  charset: 'utf8mb4',

  // Timezone — store/read as UTC in the DB
  timezone: '+00:00',
};

if (process.env.DB_SSL === 'true') {
  poolConfig.ssl = {
    rejectUnauthorized: true,
    ...(process.env.DB_SSL_CA
      ? { ca: process.env.DB_SSL_CA.replace(/\\n/g, '\n') }
      : {}),
  };
}

const pool = mysql.createPool(poolConfig);

// ─── Convenience query helper ─────────────────────────────────────────────────
/**
 * Run a single parameterized query using the pool.
 * Always uses placeholders — never interpolate user input into SQL strings.
 *
 * @param {string} sql     - SQL string with ? placeholders
 * @param {Array}  params  - values to bind (optional)
 * @returns {Promise<[rows, fields]>}
 *
 * Example:
 *   const [rows] = await query('SELECT * FROM customers WHERE id = ?', [id]);
 */
async function query(sql, params = []) {
  // pool.execute() prepares the statement and is safe against SQL injection
  return pool.execute(sql, params);
}

// ─── Transaction helper ───────────────────────────────────────────────────────
/**
 * Run multiple operations inside a single database transaction.
 * Commits on success, rolls back and re-throws on any error.
 *
 * @param {Function} callback - async (conn) => { ... }
 * @returns {Promise<*>} whatever the callback returns
 *
 * Example:
 *   const result = await withTransaction(async (conn) => {
 *     await conn.execute('INSERT INTO sales_orders ...', [...]);
 *     await conn.execute('INSERT INTO sales_order_items ...', [...]);
 *     return { success: true };
 *   });
 */
async function withTransaction(callback) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ─── Startup connection test ──────────────────────────────────────────────────
/**
 * Attempt to acquire a connection from the pool and run a trivial query.
 * Logs a clear success or failure message.
 *
 * Returns true on success, false on failure.
 * Does NOT throw — a DB failure at startup is logged and the server
 * continues running so health endpoints remain reachable.
 */
async function testConnection() {
  let conn;
  try {
    conn = await pool.getConnection();

    // Run a no-op query to confirm the connection works end-to-end
    const [rows] = await conn.execute('SELECT 1 AS ping');

    if (rows[0]?.ping === 1) {
      console.log(`✅ MySQL connected  →  ${process.env.DB_HOST}:${process.env.DB_PORT || 3306} / ${process.env.DB_NAME}`);
      return true;
    }

    throw new Error('Unexpected response from MySQL server.');
  } catch (err) {
    // ── Provide an actionable diagnosis based on the error code ──────────────
    let advice = 'Check your .env file and ensure the MySQL server is running.';

    if (err.code === 'ECONNREFUSED') {
      advice =
        `No MySQL server is listening on ${process.env.DB_HOST}:${process.env.DB_PORT || 3306}.\n` +
        '   → Start MySQL:  net start MySQL  (Windows) or  sudo systemctl start mysql  (Linux)';
    } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      advice =
        `Access denied for user '${process.env.DB_USER}'.\n` +
        '   → Verify DB_USER and DB_PASSWORD in your .env file.';
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      advice =
        `Database '${process.env.DB_NAME}' does not exist.\n` +
        '   → Run:  mysql -u root -p -e "CREATE DATABASE sawmill_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"';
    } else if (err.code === 'ETIMEDOUT') {
      advice =
        `Connection to ${process.env.DB_HOST} timed out.\n` +
        '   → Confirm DB_HOST is correct and the server is reachable.';
    }

    console.error('❌ MySQL connection failed');
    console.error(`   Code   : ${err.code || 'UNKNOWN'}`);
    console.error(`   Reason : ${err.message || err.sqlMessage || '(no message)'}`);
    console.error(`   Fix    : ${advice}`);
    console.error('   The API server is still running — fix the database and restart.');

    return false;
  } finally {
    if (conn) conn.release();
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// Close the pool when the process exits so existing connections are freed cleanly
async function closePool() {
  try {
    await pool.end();
    console.log('🔌 MySQL pool closed.');
  } catch (err) {
    console.error('Error closing MySQL pool:', err.message);
  }
}

process.on('SIGINT', async () => {
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closePool();
  process.exit(0);
});

module.exports = { pool, query, withTransaction, testConnection };
