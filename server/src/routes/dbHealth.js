'use strict';

/**
 * dbHealth.js
 *
 * Protected database health check route.
 *
 * GET /api/db-health
 *   → Requires the X-Health-Token header to match HEALTH_CHECK_TOKEN from .env
 *   → Returns pool statistics and a live ping to the database
 *
 * This endpoint is intentionally restricted so it is not callable by
 * anonymous public users — only internal monitoring tools or admins
 * with the shared token can access it.
 */

const express = require('express');
const { pool, query } = require('../config/db');

const router = express.Router();

// ─── Simple token guard ───────────────────────────────────────────────────────
function requireHealthToken(req, res, next) {
  const token = process.env.HEALTH_CHECK_TOKEN;

  // If no token is configured, block all external access in production
  if (!token) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message: 'DB health check is disabled. Set HEALTH_CHECK_TOKEN in production.',
      });
    }
    // In development, allow without a token but warn
    console.warn('⚠️  HEALTH_CHECK_TOKEN is not set — /api/db-health is open in development mode.');
    return next();
  }

  const provided = req.headers['x-health-token'];
  if (provided !== token) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: invalid or missing X-Health-Token header.',
    });
  }

  next();
}

// ─── GET /api/db-health ───────────────────────────────────────────────────────
router.get('/', requireHealthToken, async (req, res) => {
  const start = Date.now();
  let dbStatus = 'unreachable';
  let pingMs = null;
  let dbVersion = null;
  let poolInfo = {};

  try {
    const [rows] = await query('SELECT VERSION() AS version, NOW() AS server_time');
    pingMs = Date.now() - start;
    dbVersion = rows[0]?.version ?? 'unknown';
    dbStatus = 'connected';

    // Pool state (mysql2 exposes these via pool.pool internally)
    const p = pool.pool;
    poolInfo = {
      connectionLimit: poolConfig_safe(),
      freeConnections: p?._freeConnections?.length ?? 'n/a',
      allConnections: p?._allConnections?.length ?? 'n/a',
      acquiringConnections: p?._acquiringConnections?.length ?? 'n/a',
    };
  } catch (err) {
    dbStatus = 'error';
    console.error('[db-health] ping failed:', err.message);
  }

  const healthy = dbStatus === 'connected';

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    database: {
      status: dbStatus,
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '3306', 10),
      name: process.env.DB_NAME,
      version: dbVersion,
      pingMs,
      pool: poolInfo,
    },
    checkedAt: new Date().toISOString(),
  });
});

// Safe read of pool config limit without touching internals
function poolConfig_safe() {
  try {
    return pool.pool?.config?.connectionLimit ?? 10;
  } catch {
    return 10;
  }
}

module.exports = router;
