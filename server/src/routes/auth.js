'use strict';
/**
 * routes/auth.js
 *
 * Authentication & Identity routes for Saw Mill Management System:
 *
 * POST  /api/v1/auth/login        - Credential verification (bcrypt) → sets HttpOnly cookies & returns safe user
 * POST  /api/v1/auth/logout       - Clears cookies & revokes refresh token in database
 * POST  /api/v1/auth/refresh      - Session refresh: validates refresh token, rotates token in DB, sets new cookies
 * GET   /api/v1/auth/me           - Returns authenticated user profile, role, & permissions
 * POST  /api/v1/auth/users        - Admin-only: creates a new user account (restricted to authorized administrators)
 * PATCH /api/v1/auth/users/:id/status - Admin-only: activate / deactivate / suspend user account
 */

const express   = require('express');
const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const rateLimit = require('express-rate-limit');
const router    = express.Router();

const { query }                  = require('../config/db');
const { ok, fail }               = require('../utils/respond');
const AppError                   = require('../utils/AppError');
const {
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  setAccessCookie,
  setRefreshCookie,
  clearAuthCookies,
}                                = require('../utils/tokens');
const authenticate               = require('../middleware/authenticate');
const authorize                  = require('../middleware/authorize');
const { validateBody, loginSchema, createUserSchema } = require('../middleware/validate');
const audit                      = require('../utils/audit');

// ── Rate limiter: 10 failed login attempts per 15 minutes per IP ─────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many login attempts. Please try again in 15 minutes.',
    code: 'RATE_LIMITED',
  },
  skipSuccessfulRequests: true, // Only count failed attempts against rate limit
});

// ── Helper: Safe user object (never returns password_hash) ───────────────────
function safeUser(u) {
  let permissionsList = [];
  if (Array.isArray(u.permissions)) {
    permissionsList = u.permissions;
  } else if (typeof u.permissions === 'string' && u.permissions.trim() !== '') {
    permissionsList = u.permissions.split(',').filter(Boolean);
  }

  return {
    id:          u.id,
    username:    u.username,
    name:        u.name || u.username,
    email:       u.email,
    role:        u.role,
    status:      u.status,
    permissions: permissionsList,
    createdAt:   u.created_at || u.createdAt,
  };
}

// ── Helper: SHA-256 hash a refresh token ─────────────────────────────────────
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── 1. POST /api/v1/auth/login ───────────────────────────────────────────────
router.post('/login', loginLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = email.trim().toLowerCase();

    // 1. Fetch user by email with role and aggregated permissions
    const [rows] = await query(
      `SELECT u.id, u.username, u.email, u.password_hash, u.status, u.created_at,
              r.name AS role,
              GROUP_CONCAT(p.name ORDER BY p.name SEPARATOR ',') AS permissions
       FROM   users u
       JOIN   roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE  LOWER(u.email) = ?
       GROUP BY u.id, r.name`,
      [cleanEmail]
    );

    const user = rows[0];

    // 2. Timing attack mitigation: always execute bcrypt.compare
    const dummyHash = '$2a$12$e8YqJ2FfO6lE4/sX981d3.m8g7kHw4Y.a5Q8j9W2Z8L5M4N3P2Q1.';
    const hashToCheck = user ? user.password_hash : dummyHash;
    const passwordMatches = await bcrypt.compare(password, hashToCheck);

    if (!user || !passwordMatches) {
      await audit.loginFailure(cleanEmail, req.ip);
      throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    // 3. Verify account activation status
    if (user.status === 'inactive') {
      await audit.loginFailure(cleanEmail, req.ip);
      throw new AppError('Your account has been deactivated. Contact an administrator.', 403, 'ACCOUNT_INACTIVE');
    }

    if (user.status === 'suspended') {
      await audit.loginFailure(cleanEmail, req.ip);
      throw new AppError('Your account has been suspended. Contact an administrator.', 403, 'ACCOUNT_SUSPENDED');
    }

    // 4. Issue short-lived access token and refresh token
    const accessToken  = createAccessToken({ id: user.id, email: user.email, role: user.role });
    const refreshToken = createRefreshToken(user.id);

    // 5. Store refresh token hash in DB for revocation support
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [user.id, tokenHash, expiresAt]
    );

    // 6. Set HttpOnly security cookies
    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);

    await audit.loginSuccess(user.id, req.ip);

    return ok(res, { user: safeUser(user), accessToken }, 'Login successful.');
  } catch (err) {
    next(err);
  }
});

// ── 2. POST /api/v1/auth/logout ──────────────────────────────────────────────
router.post('/logout', async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;

    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await query('DELETE FROM refresh_tokens WHERE token_hash = ?', [tokenHash]);

      try {
        const payload = verifyRefreshToken(refreshToken);
        await audit.logout(payload.sub, req.ip);
      } catch {
        // Token already expired/invalid; proceed with cookie clearance
      }
    }

    clearAuthCookies(res);
    return ok(res, null, 'Logged out successfully.');
  } catch (err) {
    next(err);
  }
});

// ── 3. POST /api/v1/auth/refresh ─────────────────────────────────────────────
router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;

    if (!refreshToken) {
      throw new AppError('No refresh token provided.', 401, 'NO_REFRESH_TOKEN');
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      clearAuthCookies(res);
      throw new AppError('Refresh token is invalid or expired. Please log in again.', 401, 'INVALID_REFRESH_TOKEN');
    }

    // Check DB for active, unrevoked token
    const tokenHash = hashToken(refreshToken);
    const [rows] = await query(
      'SELECT id, user_id FROM refresh_tokens WHERE token_hash = ? AND expires_at > NOW()',
      [tokenHash]
    );

    if (!rows.length) {
      clearAuthCookies(res);
      throw new AppError('Session has been revoked or expired. Please log in again.', 401, 'REVOKED_TOKEN');
    }

    // Load current user status
    const [userRows] = await query(
      `SELECT u.id, u.username, u.email, u.status, r.name AS role,
              GROUP_CONCAT(p.name ORDER BY p.name SEPARATOR ',') AS permissions
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE u.id = ?
       GROUP BY u.id, r.name`,
      [payload.sub]
    );

    const user = userRows[0];
    if (!user || user.status !== 'active') {
      clearAuthCookies(res);
      throw new AppError('Account is no longer active.', 403, 'ACCOUNT_INACTIVE');
    }

    // Token rotation: delete old refresh token and issue new token pair
    await query('DELETE FROM refresh_tokens WHERE token_hash = ?', [tokenHash]);

    const newAccessToken  = createAccessToken({ id: user.id, email: user.email, role: user.role });
    const newRefreshToken = createRefreshToken(user.id);
    const newHash         = hashToken(newRefreshToken);
    const newExpiry       = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [user.id, newHash, newExpiry]
    );

    setAccessCookie(res, newAccessToken);
    setRefreshCookie(res, newRefreshToken);
    await audit.tokenRefresh(user.id, req.ip);

    return ok(res, { user: safeUser(user), accessToken: newAccessToken }, 'Token refreshed successfully.');
  } catch (err) {
    next(err);
  }
});

// ── 4. GET /api/v1/auth/me ───────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const [rows] = await query(
      `SELECT u.id, u.username, u.email, u.status, u.created_at,
              r.name AS role,
              GROUP_CONCAT(p.name ORDER BY p.name SEPARATOR ',') AS permissions
       FROM   users u
       JOIN   roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE  u.id = ?
       GROUP BY u.id, r.name`,
      [req.user.id]
    );

    if (!rows.length) {
      throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    }

    return ok(res, { user: safeUser(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// ── 5. GET /api/v1/auth/users (Admin-only: list user accounts) ──────────────
router.get('/users', authenticate, authorize.role('admin'), async (req, res, next) => {
  try {
    const [rows] = await query(
      `SELECT u.id, u.username, u.email, u.status, u.created_at,
              r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       ORDER BY u.created_at DESC, u.id DESC`
    );
    return ok(res, {
      items: rows.map((user) => ({
        id: user.id,
        username: user.username,
        name: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.created_at
      }))
    });
  } catch (err) {
    next(err);
  }
});

// ── 6. POST /api/v1/auth/users (Admin-only: create user account) ─────────────
router.post(
  '/users',
  authenticate,
  authorize.role('admin'), // Restrict administrative user creation to authorized administrators
  validateBody(createUserSchema),
  async (req, res, next) => {
    try {
      const { username, email, password, role_id, role } = req.body;
      const cleanEmail = email.trim().toLowerCase();
      const cleanUsername = username.trim();

      // Check for existing username or email
      const [existing] = await query(
        'SELECT id FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?',
        [cleanEmail, cleanUsername.toLowerCase()]
      );

      if (existing.length) {
        throw new AppError('A user with that email or username already exists.', 409, 'USER_EXISTS');
      }

      // Determine target role ID
      let resolvedRoleId = role_id;
      if (!resolvedRoleId && role) {
        const [roleByName] = await query('SELECT id FROM roles WHERE LOWER(name) = ?', [role.toLowerCase()]);
        if (roleByName.length) {
          resolvedRoleId = roleByName[0].id;
        }
      }

      if (!resolvedRoleId) {
        // Default to 'operator' role if none provided
        const [defaultRole] = await query("SELECT id FROM roles WHERE name = 'operator'");
        resolvedRoleId = defaultRole.length ? defaultRole[0].id : 1;
      }

      // Verify resolved role exists in DB
      const [roleRows] = await query('SELECT id, name FROM roles WHERE id = ?', [resolvedRoleId]);
      if (!roleRows.length) {
        throw new AppError('Invalid role specified.', 400, 'INVALID_ROLE');
      }

      // Only administrators can create admin accounts
      if (roleRows[0].name === 'admin' && req.user.role !== 'admin') {
        throw new AppError('Only administrators can create admin accounts.', 403, 'INSUFFICIENT_ROLE');
      }

      // Secure bcrypt password hash (salt rounds: 12)
      const passwordHash = await bcrypt.hash(password, 12);

      const [result] = await query(
        'INSERT INTO users (username, email, password_hash, role_id, status) VALUES (?, ?, ?, ?, ?)',
        [cleanUsername, cleanEmail, passwordHash, resolvedRoleId, 'active']
      );

      await audit.userCreated(req.user.id, result.insertId);

      return ok(
        res,
        { userId: result.insertId, username: cleanUsername, email: cleanEmail, role: roleRows[0].name },
        'User account created successfully.',
        201
      );
    } catch (err) {
      next(err);
    }
  }
);

// ── 7. PATCH /api/v1/auth/users/:id/status (Admin: activate / deactivate) ────
router.patch(
  '/users/:id/status',
  authenticate,
  authorize.role('admin'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const VALID_STATUSES = ['active', 'inactive', 'suspended'];
      if (!VALID_STATUSES.includes(status)) {
        throw new AppError(`status must be one of: ${VALID_STATUSES.join(', ')}`, 422, 'VALIDATION_ERROR');
      }

      // Prevent self-deactivation
      if (Number(id) === Number(req.user.id) && status !== 'active') {
        throw new AppError('You cannot deactivate your own administrative account.', 400, 'SELF_DEACTIVATION');
      }

      const [result] = await query('UPDATE users SET status = ? WHERE id = ?', [status, id]);

      if (result.affectedRows === 0) {
        throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
      }

      // Immediate revocation: if deactivated or suspended, revoke all active refresh tokens immediately
      if (status !== 'active') {
        await query('DELETE FROM refresh_tokens WHERE user_id = ?', [id]);
      }

      await audit.userStatusChange(req.user.id, id, status);

      return ok(res, { userId: Number(id), status }, `User account status updated to '${status}'.`);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
