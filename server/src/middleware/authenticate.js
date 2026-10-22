'use strict';
/**
 * middleware/authenticate.js
 *
 * JWT authentication middleware for Saw Mill Management System.
 *
 * Checks the access token from:
 *   1. HttpOnly cookie `access_token`
 *   2. Authorization: Bearer <token> header (for API / external clients)
 *
 * Validations performed:
 *   - Token existence
 *   - Signature verification & expiration check
 *   - Live user lookup against the database
 *   - Account status check (`status === 'active'`)
 *
 * On success:  attaches req.user = { id, username, name, email, role, permissions: [] }
 * On failure:  throws AppError with appropriate status code and error code:
 *              - 401 NO_TOKEN
 *              - 401 TOKEN_EXPIRED
 *              - 401 INVALID_TOKEN
 *              - 401 USER_NOT_FOUND
 *              - 403 ACCOUNT_INACTIVE
 */
const AppError = require('../utils/AppError');
const { query } = require('../config/db');
const { verifyAccessToken } = require('../utils/tokens');

module.exports = async function authenticate(req, res, next) {
  try {
    // ── 1. Extract token (cookie first, then Authorization header) ────────
    let token = req.cookies?.access_token;

    if (!token) {
      const authHeader = req.headers.authorization || '';
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      }
    }

    if (!token) {
      throw new AppError('No authentication token provided.', 401, 'NO_TOKEN');
    }

    // ── 2. Verify signature and expiry ────────────────────────────────────
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        throw new AppError('Your session has expired. Please log in again.', 401, 'TOKEN_EXPIRED');
      }
      throw new AppError('Invalid authentication token.', 401, 'INVALID_TOKEN');
    }

    // ── 3. Load fresh user row (catches deactivated accounts between tokens) ──
    const [rows] = await query(
      `SELECT u.id, u.username, u.email, u.status,
              r.name AS role,
              GROUP_CONCAT(p.name ORDER BY p.name SEPARATOR ',') AS permissions
       FROM   users u
       JOIN   roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE  u.id = ?
       GROUP BY u.id, r.name`,
      [payload.sub]
    );

    if (!rows.length) {
      throw new AppError('User account not found.', 401, 'USER_NOT_FOUND');
    }

    const user = rows[0];

    if (user.status !== 'active') {
      throw new AppError(
        'Your account has been deactivated. Please contact an administrator.',
        403,
        'ACCOUNT_INACTIVE'
      );
    }

    // ── 4. Attach to request ──────────────────────────────────────────────
    req.user = {
      id:          user.id,
      username:    user.username,
      name:        user.username,
      email:       user.email,
      role:        user.role,
      permissions: user.permissions ? user.permissions.split(',').filter(Boolean) : [],
    };

    next();
  } catch (err) {
    next(err);
  }
};
