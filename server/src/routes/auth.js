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

const { query, withTransaction } = require('../config/db');
const { ok, fail }               = require('../utils/respond');
const AppError                   = require('../utils/AppError');
const {
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  verifyAccessToken,
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

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many registration requests. Try again later.', code: 'RATE_LIMITED' },
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
    name:        u.name || u.employee_name || u.username,
    email:       typeof u.email === 'string' && u.email.endsWith('@registration.invalid') ? null : u.email,
    employeeId:  u.employee_id || null,
    role:        u.role,
    status:      u.status,
    permissions: permissionsList,
    permissionOverride: Boolean(u.permission_override),
    createdAt:   u.created_at || u.createdAt,
  };
}

// ── Helper: SHA-256 hash a refresh token ─────────────────────────────────────
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function findPermissions(names) {
  if (!names.length) return [];
  const placeholders = names.map(() => '?').join(', ');
  const [rows] = await query(`SELECT id, name FROM permissions WHERE name IN (${placeholders})`, names);
  return rows;
}

// ── 1. POST /api/v1/auth/login ───────────────────────────────────────────────
router.post('/login', loginLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, identifier, password, expectedRole } = req.body;
    const loginId = String(identifier || email || '').trim().toLowerCase();
    if (!loginId) throw new AppError('Email, username, or employee ID is required.', 422, 'VALIDATION_ERROR');

    // 1. Fetch user by email with role and aggregated permissions
    const [rows] = await query(
      `SELECT u.id, u.username, u.email, u.employee_id, u.token_version, u.password_hash, u.status, u.created_at,
              EXISTS (SELECT 1 FROM user_permission_settings ups WHERE ups.user_id = u.id) AS permission_override,
              r.name AS role,
              CASE WHEN EXISTS (SELECT 1 FROM user_permission_settings ups WHERE ups.user_id = u.id)
                   THEN (SELECT GROUP_CONCAT(p2.name ORDER BY p2.name SEPARATOR ',')
                         FROM user_permissions up JOIN permissions p2 ON p2.id = up.permission_id
                         WHERE up.user_id = u.id)
                   ELSE GROUP_CONCAT(p.name ORDER BY p.name SEPARATOR ',') END AS permissions
       FROM   users u
       JOIN   roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE  LOWER(u.email) = ? OR LOWER(u.username) = ? OR CAST(u.employee_id AS CHAR) = ?
       GROUP BY u.id, r.name`,
      [loginId, loginId, loginId]
    );

    const user = rows[0];

    // 2. Timing attack mitigation: always execute bcrypt.compare
    const dummyHash = '$2a$12$e8YqJ2FfO6lE4/sX981d3.m8g7kHw4Y.a5Q8j9W2Z8L5M4N3P2Q1.';
    const hashToCheck = user ? user.password_hash : dummyHash;
    const passwordMatches = await bcrypt.compare(password, hashToCheck);

    if (!user || !passwordMatches) {
      await audit.loginFailure(loginId, req.ip);
      throw new AppError('Invalid username, email, employee ID, or password.', 401, 'INVALID_CREDENTIALS');
    }

    if ((expectedRole === 'admin' && !['admin', 'owner'].includes(user.role)) ||
        (expectedRole === 'staff' && ['admin', 'owner'].includes(user.role))) {
      await audit.loginFailure(loginId, req.ip);
      throw new AppError('These credentials are not authorized for this login.', 403, 'ROLE_LOGIN_MISMATCH');
    }

    // 3. Verify account activation status
    if (user.status === 'inactive') {
      await audit.loginFailure(loginId, req.ip);
      throw new AppError('Your account has been deactivated. Contact an administrator.', 403, 'ACCOUNT_INACTIVE');
    }

    if (user.status === 'pending') {
      await audit.loginFailure(loginId, req.ip);
      throw new AppError('Your staff registration is awaiting administrator approval.', 403, 'ACCOUNT_PENDING');
    }

    if (user.status === 'rejected') {
      await audit.loginFailure(loginId, req.ip);
      throw new AppError('Your staff registration was not approved. Contact the sawmill administrator.', 403, 'ACCOUNT_REJECTED');
    }

    if (user.status === 'suspended') {
      await audit.loginFailure(loginId, req.ip);
      throw new AppError('Your account has been suspended. Contact an administrator.', 403, 'ACCOUNT_SUSPENDED');
    }

    // 4. Issue short-lived access token and refresh token
    const accessToken  = createAccessToken({ id: user.id, email: user.email, role: user.role, tokenVersion: user.token_version });
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

    return ok(res, { user: safeUser(user) }, 'Login successful.');
  } catch (err) {
    next(err);
  }
});

// ── 2. POST /api/v1/auth/logout ──────────────────────────────────────────────
router.post('/logout', async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
    const accessToken = req.cookies?.access_token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;

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

    if (accessToken) {
      try {
        const payload = verifyAccessToken(accessToken);
        if (payload.exp) {
          await query('INSERT IGNORE INTO revoked_access_tokens (token_hash, expires_at) VALUES (?, ?)',
            [hashToken(accessToken), new Date(payload.exp * 1000)]);
        }
      } catch {
        // Invalid or expired access tokens need no denylist entry.
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
      `SELECT u.id, u.username, u.email, u.employee_id, u.token_version, u.status,
              EXISTS (SELECT 1 FROM user_permission_settings ups WHERE ups.user_id = u.id) AS permission_override,
              r.name AS role,
              CASE WHEN EXISTS (SELECT 1 FROM user_permission_settings ups WHERE ups.user_id = u.id)
                   THEN (SELECT GROUP_CONCAT(p2.name ORDER BY p2.name SEPARATOR ',')
                         FROM user_permissions up JOIN permissions p2 ON p2.id = up.permission_id
                         WHERE up.user_id = u.id)
                   ELSE GROUP_CONCAT(p.name ORDER BY p.name SEPARATOR ',') END AS permissions
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

    const newAccessToken  = createAccessToken({ id: user.id, email: user.email, role: user.role, tokenVersion: user.token_version });
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

    return ok(res, { user: safeUser(user) }, 'Token refreshed successfully.');
  } catch (err) {
    next(err);
  }
});

// ── 4. GET /api/v1/auth/me ───────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const [rows] = await query(
      `SELECT u.id, u.username, u.email, u.employee_id, u.token_version, e.name AS employee_name, u.status, u.created_at,
              EXISTS (SELECT 1 FROM user_permission_settings ups WHERE ups.user_id = u.id) AS permission_override,
              r.name AS role,
              CASE WHEN EXISTS (SELECT 1 FROM user_permission_settings ups WHERE ups.user_id = u.id)
                   THEN (SELECT GROUP_CONCAT(p2.name ORDER BY p2.name SEPARATOR ',')
                         FROM user_permissions up JOIN permissions p2 ON p2.id = up.permission_id
                         WHERE up.user_id = u.id)
                   ELSE GROUP_CONCAT(p.name ORDER BY p.name SEPARATOR ',') END AS permissions
       FROM   users u
       JOIN   roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       LEFT JOIN employees e ON e.id = u.employee_id
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
router.post('/staff-registration', registrationLimiter, async (req, res, next) => {
  try {
    const { name, employeeId, phone, email, department, username, password } = req.body || {};
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanUsername = typeof username === 'string' ? username.trim() : '';
    const cleanEmail = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
    if (cleanName.length < 2 || cleanName.length > 120 || cleanUsername.length < 3 || cleanUsername.length > 100 ||
        typeof password !== 'string' || password.length < 12 || password.length > 128 ||
        typeof phone !== 'string' || phone.trim().length < 5 || phone.trim().length > 30 ||
        typeof department !== 'string' || department.trim().length < 2 || department.trim().length > 120 ||
        (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) ||
        (employeeId !== undefined && employeeId !== null && employeeId !== '' && (!Number.isSafeInteger(Number(employeeId)) || Number(employeeId) < 1))) {
      throw new AppError('Enter valid registration details and a password of at least 12 characters.', 422, 'VALIDATION_ERROR');
    }
    const [duplicate] = await query('SELECT id FROM users WHERE LOWER(username) = ? OR (? IS NOT NULL AND LOWER(email) = ?)',
      [cleanUsername.toLowerCase(), cleanEmail, cleanEmail || '']);
    if (duplicate.length) throw new AppError('That username or email is already registered.', 409, 'USER_EXISTS');
    const employeeRecordId = employeeId ? Number(employeeId) : null;
    if (employeeRecordId) {
      const [employeeRows] = await query('SELECT id FROM employees WHERE id = ?', [employeeRecordId]);
      if (!employeeRows.length) throw new AppError('The employee record was not found.', 422, 'INVALID_EMPLOYEE');
      const [linked] = await query('SELECT id FROM users WHERE employee_id = ?', [employeeRecordId]);
      if (linked.length) throw new AppError('This employee already has an account.', 409, 'EMPLOYEE_ACCOUNT_EXISTS');
    }
    const [staffRole] = await query("SELECT id FROM roles WHERE name = 'operator'");
    if (!staffRole.length) throw new AppError('Staff role is not configured.', 500, 'ROLE_NOT_CONFIGURED');
    const passwordHash = await bcrypt.hash(password, 12);
    const accountEmail = cleanEmail || `pending-${crypto.randomUUID()}@registration.invalid`;
    const created = await withTransaction(async (conn) => {
      const [userResult] = await conn.execute(
        "INSERT INTO users (username,email,password_hash,role_id,employee_id,status,phone) VALUES (?,?,?,?,?,'pending',?)",
        [cleanUsername, accountEmail, passwordHash, staffRole[0].id, employeeRecordId, phone.trim()]
      );
      await conn.execute('INSERT INTO staff_registration_requests (user_id, full_name, contact_email, department, request_status) VALUES (?,?,?,?,?)',
        [userResult.insertId, cleanName, cleanEmail, department.trim(), 'pending']);
      return userResult;
    });
    await audit.log({ action: 'STAFF_REGISTRATION_SUBMITTED', tableName: 'users', recordId: created.insertId, description: 'Staff registration request submitted', ip: req.ip });
    return ok(res, { status: 'pending' }, 'Registration request submitted. An administrator must approve it before you can sign in.', 201);
  } catch (err) { next(err); }
});

router.get('/staff-registration-requests', authenticate, authorize.role('admin'), async (req, res, next) => {
  try {
    if (!req.user.permissions.includes('manage_staff')) throw new AppError('Access denied. Missing permission: manage_staff.', 403, 'INSUFFICIENT_PERMISSION');
    const [rows] = await query(
      `SELECT sr.user_id AS id, sr.full_name AS name, u.username, sr.contact_email AS email, u.phone,
              u.employee_id, sr.department, sr.request_status AS status, sr.created_at
       FROM staff_registration_requests sr JOIN users u ON u.id = sr.user_id
       WHERE sr.request_status = 'pending' ORDER BY sr.created_at ASC`
    );
    return ok(res, { items: rows });
  } catch (err) { next(err); }
});

router.post('/staff-registration-requests/:id/decision', authenticate, authorize.role('admin'), async (req, res, next) => {
  try {
    if (!req.user.permissions.includes('manage_staff')) throw new AppError('Access denied. Missing permission: manage_staff.', 403, 'INSUFFICIENT_PERMISSION');
    const userId = Number(req.params.id);
    const { decision, permissions = [] } = req.body || {};
    if (!Number.isSafeInteger(userId) || userId < 1 || !['approve', 'reject'].includes(decision) ||
        !Array.isArray(permissions) || permissions.length > 100 || permissions.some((p) => typeof p !== 'string')) {
      throw new AppError('A valid request decision and permission list are required.', 422, 'VALIDATION_ERROR');
    }
    if (userId === Number(req.user.id)) throw new AppError('You cannot approve your own registration.', 400, 'SELF_APPROVAL');
    const unique = [...new Set(permissions)];
    const found = decision === 'approve' ? await findPermissions(unique) : [];
    if (found.length !== unique.length) throw new AppError('One or more permissions are invalid.', 422, 'INVALID_PERMISSION');
    if (found.some((p) => ['manage_staff', 'manage_admins', 'manage_settings'].includes(p.name))) {
      throw new AppError('Staff registration cannot receive administrator management permissions.', 403, 'OWNER_REQUIRED');
    }
    await withTransaction(async (conn) => {
      const [requests] = await conn.execute(
        `SELECT sr.user_id, sr.full_name, sr.contact_email, sr.department, sr.request_status,
                u.employee_id, u.phone FROM staff_registration_requests sr JOIN users u ON u.id = sr.user_id
         WHERE sr.user_id = ? FOR UPDATE`, [userId]);
      if (!requests.length || requests[0].request_status !== 'pending') throw new AppError('Pending registration request not found.', 404, 'REQUEST_NOT_FOUND');
      const request = requests[0];
      if (decision === 'approve') {
        let employeeId = request.employee_id;
        if (!employeeId) {
          const [employee] = await conn.execute(
            'INSERT INTO employees (name,phone,email,job_title,joining_date,created_by_id) VALUES (?,?,?,?,CURRENT_DATE(),?)',
            [request.full_name, request.phone, request.contact_email, request.department, req.user.id]);
          employeeId = employee.insertId;
        }
        await conn.execute("UPDATE users SET status='active', employee_id=?, token_version=token_version+1 WHERE id=?", [employeeId, userId]);
        await conn.execute("UPDATE staff_registration_requests SET request_status='approved', reviewed_by_id=?, reviewed_at=NOW() WHERE user_id=?", [req.user.id, userId]);
        await conn.execute('INSERT INTO user_permission_settings (user_id) VALUES (?)', [userId]);
        for (const permission of found) await conn.execute('INSERT INTO user_permissions (user_id,permission_id) VALUES (?,?)', [userId, permission.id]);
      } else {
        await conn.execute("UPDATE users SET status='rejected', token_version=token_version+1 WHERE id=?", [userId]);
        await conn.execute("UPDATE staff_registration_requests SET request_status='rejected', reviewed_by_id=?, reviewed_at=NOW() WHERE user_id=?", [req.user.id, userId]);
      }
    });
    if (decision === 'reject') await query('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
    await audit.log({ userId: req.user.id, action: decision === 'approve' ? 'STAFF_REGISTRATION_APPROVED' : 'STAFF_REGISTRATION_REJECTED', tableName: 'users', recordId: userId, description: decision === 'approve' ? `Approved with permissions: ${unique.join(', ') || 'none'}` : 'Staff registration request rejected', ip: req.ip });
    return ok(res, { userId, status: decision === 'approve' ? 'active' : 'rejected' }, `Registration ${decision}d.`);
  } catch (err) { next(err); }
});

router.get('/users', authenticate, authorize.role('admin'), async (req, res, next) => {
  try {
    if (!req.user.permissions.includes('manage_staff') && !req.user.permissions.includes('manage_admins')) {
      throw new AppError('Access denied. Missing permission: manage_staff.', 403, 'INSUFFICIENT_PERMISSION');
    }
    const [rows] = await query(
      `SELECT u.id, u.username, u.email, u.employee_id, e.name AS employee_name, u.status, u.created_at,
              EXISTS (SELECT 1 FROM user_permission_settings ups WHERE ups.user_id = u.id) AS permission_override,
              r.name AS role,
              CASE WHEN EXISTS (SELECT 1 FROM user_permission_settings ups WHERE ups.user_id = u.id)
                   THEN (SELECT GROUP_CONCAT(p2.name ORDER BY p2.name SEPARATOR ',')
                         FROM user_permissions up JOIN permissions p2 ON p2.id = up.permission_id
                         WHERE up.user_id = u.id)
                   ELSE (SELECT GROUP_CONCAT(p.name ORDER BY p.name SEPARATOR ',')
                         FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
                         WHERE rp.role_id = u.role_id) END AS permissions
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN employees e ON e.id = u.employee_id
       WHERE u.status NOT IN ('pending','rejected')
         AND ${req.user.role === 'owner' ? '1=1' : req.user.permissions.includes('manage_admins') ? "r.name <> 'owner'" : "r.name NOT IN ('admin','owner')"}
       ORDER BY u.created_at DESC, u.id DESC`
    );
    const [profiles] = await query('SELECT user_id, full_name, contact_email, department FROM staff_registration_requests');
    const profileByUser = new Map(profiles.map((profile) => [Number(profile.user_id), profile]));
    return ok(res, {
      items: rows.map((user) => ({
        id: user.id,
        username: user.username,
        name: profileByUser.get(Number(user.id))?.full_name || user.employee_name || user.username,
        email: profileByUser.get(Number(user.id))?.contact_email || user.email,
        department: profileByUser.get(Number(user.id))?.department || null,
        employeeId: user.employee_id,
        employeeName: user.employee_name,
        role: user.role,
        status: user.status,
        permissions: user.permissions ? user.permissions.split(',').filter(Boolean) : [],
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
      if (!req.user.permissions.includes('manage_staff')) throw new AppError('Access denied. Missing permission: manage_staff.', 403, 'INSUFFICIENT_PERMISSION');
      const { username, email, password, role_id, role } = req.body;
      const employeeId = req.body.employee_id ? Number(req.body.employee_id) : null;
      let requestedPermissions = req.body.permissions === undefined ? [] : req.body.permissions;
      if (!Array.isArray(requestedPermissions) || requestedPermissions.some((p) => typeof p !== 'string')) {
        throw new AppError('permissions must be a list of permission names.', 422, 'VALIDATION_ERROR');
      }
      requestedPermissions = [...new Set(requestedPermissions)];
      if (employeeId !== null) {
        if (!Number.isSafeInteger(employeeId) || employeeId < 1) throw new AppError('employee_id must be a valid employee record.', 422, 'VALIDATION_ERROR');
        const [employeeRows] = await query('SELECT id FROM employees WHERE id = ?', [employeeId]);
        if (!employeeRows.length) throw new AppError('The selected employee record does not exist.', 422, 'INVALID_EMPLOYEE');
        const [linked] = await query('SELECT id FROM users WHERE employee_id = ?', [employeeId]);
        if (linked.length) throw new AppError('This employee already has a login account.', 409, 'EMPLOYEE_ACCOUNT_EXISTS');
      }
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
      if (['admin', 'owner'].includes(roleRows[0].name)) {
        throw new AppError('Administrator accounts can only be created with the secure server bootstrap.', 403, 'ADMIN_BOOTSTRAP_REQUIRED');
      }

      const permissionRows = await findPermissions(requestedPermissions);
      if (permissionRows.length !== new Set(requestedPermissions).size) {
        throw new AppError('One or more permissions are invalid.', 422, 'INVALID_PERMISSION');
      }
      if (requestedPermissions.some((name) => ['manage_staff', 'manage_admins', 'manage_settings'].includes(name))) {
        throw new AppError('Staff accounts cannot receive administrator management permissions.', 403, 'OWNER_REQUIRED');
      }

      // Secure bcrypt password hash (salt rounds: 12)
      const passwordHash = await bcrypt.hash(password, 12);

      const result = await withTransaction(async (conn) => {
        const [inserted] = await conn.execute(
          'INSERT INTO users (username, email, password_hash, role_id, employee_id, status) VALUES (?, ?, ?, ?, ?, ?)',
          [cleanUsername, cleanEmail, passwordHash, resolvedRoleId, employeeId, 'active']
        );
        await conn.execute('INSERT INTO user_permission_settings (user_id) VALUES (?)', [inserted.insertId]);
        for (const permission of permissionRows) {
          await conn.execute('INSERT INTO user_permissions (user_id, permission_id) VALUES (?, ?)', [inserted.insertId, permission.id]);
        }
        return inserted;
      });

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

router.post('/admins', authenticate, authorize.role('admin'), validateBody(createUserSchema), async (req, res, next) => {
  try {
    if (req.user.role !== 'owner' && !req.user.permissions.includes('manage_admins')) {
      throw new AppError('Only the owner or a delegated administrator can create admin accounts.', 403, 'OWNER_REQUIRED');
    }
    const { username, email, password } = req.body;
    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const permissions = req.body.permissions === undefined ? [] : req.body.permissions;
    if (!Array.isArray(permissions) || permissions.some((name) => typeof name !== 'string')) {
      throw new AppError('permissions must be a list of permission names.', 422, 'VALIDATION_ERROR');
    }
    const unique = [...new Set(permissions)];
    if (req.user.role !== 'owner' && unique.some((name) => ['manage_admins', 'manage_settings'].includes(name))) {
      throw new AppError('Only the owner can grant administrator or business settings access.', 403, 'OWNER_REQUIRED');
    }
    const [duplicate] = await query('SELECT id FROM users WHERE LOWER(email)=? OR LOWER(username)=?', [cleanEmail, cleanUsername.toLowerCase()]);
    if (duplicate.length) throw new AppError('A user with that email or username already exists.', 409, 'USER_EXISTS');
    const found = await findPermissions(unique);
    if (found.length !== unique.length) throw new AppError('One or more permissions are invalid.', 422, 'INVALID_PERMISSION');
    if (!targetIsAdmin && unique.some((name) => ['manage_staff', 'manage_admins', 'manage_settings'].includes(name))) {
      throw new AppError('Staff accounts cannot receive administrator management permissions.', 403, 'OWNER_REQUIRED');
    }
    const [roleRows] = await query("SELECT id FROM roles WHERE name='admin'");
    if (!roleRows.length) throw new AppError('Admin role is not configured.', 500, 'ROLE_NOT_CONFIGURED');
    const passwordHash = await bcrypt.hash(password, 12);
    const created = await withTransaction(async (conn) => {
      const [inserted] = await conn.execute("INSERT INTO users (username,email,password_hash,role_id,status) VALUES (?,?,?,?,'active')",
        [cleanUsername, cleanEmail, passwordHash, roleRows[0].id]);
      await conn.execute('INSERT INTO user_permission_settings (user_id) VALUES (?)', [inserted.insertId]);
      for (const permission of found) await conn.execute('INSERT INTO user_permissions (user_id,permission_id) VALUES (?,?)', [inserted.insertId, permission.id]);
      return inserted;
    });
    await audit.log({ userId: req.user.id, action: 'ADMIN_ACCOUNT_CREATED', tableName: 'users', recordId: created.insertId, description: `Administrator created with permissions: ${unique.join(', ') || 'none'}`, ip: req.ip });
    return ok(res, { userId: created.insertId, username: cleanUsername, email: cleanEmail, role: 'admin', permissions: unique }, 'Administrator account created.', 201);
  } catch (err) { next(err); }
});

router.put('/users/:id/permissions', authenticate, authorize.role('admin'), async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const permissions = req.body?.permissions;
    if (!Number.isSafeInteger(userId) || userId < 1 || !Array.isArray(permissions) ||
        permissions.length > 100 || permissions.some((name) => typeof name !== 'string')) {
      throw new AppError('A valid user and permission list are required.', 422, 'VALIDATION_ERROR');
    }
    const [target] = await query('SELECT u.id, u.status, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?', [userId]);
    if (!target.length) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    if (['pending', 'rejected'].includes(target[0].status)) throw new AppError('Registration requests must be managed through the approval workflow.', 403, 'REGISTRATION_REVIEW_REQUIRED');
    if (target[0].role === 'owner') throw new AppError('Owner permissions cannot be changed.', 403, 'OWNER_PROTECTED');
    const targetIsAdmin = target[0].role === 'admin';
    if (!targetIsAdmin && !req.user.permissions.includes('manage_staff')) throw new AppError('Access denied. Missing permission: manage_staff.', 403, 'INSUFFICIENT_PERMISSION');
    if (targetIsAdmin && req.user.role !== 'owner' && !req.user.permissions.includes('manage_admins')) {
      throw new AppError('Only the owner or a delegated administrator can change admin permissions.', 403, 'OWNER_REQUIRED');
    }
    const unique = [...new Set(permissions)];
    const found = await findPermissions(unique);
    if (found.length !== unique.length) throw new AppError('One or more permissions are invalid.', 422, 'INVALID_PERMISSION');
    if (targetIsAdmin && req.user.role !== 'owner' && unique.some((name) => ['manage_admins', 'manage_settings'].includes(name))) {
      throw new AppError('Only the owner can grant administrator or business settings access.', 403, 'OWNER_REQUIRED');
    }
    await query('INSERT IGNORE INTO user_permission_settings (user_id) VALUES (?)', [userId]);
    await query('DELETE FROM user_permissions WHERE user_id = ?', [userId]);
    for (const permission of found) await query('INSERT INTO user_permissions (user_id, permission_id) VALUES (?, ?)', [userId, permission.id]);
    await query('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
    await audit.log({ userId: req.user.id, action: 'USER_PERMISSIONS_CHANGED', tableName: 'users', recordId: userId, description: `${targetIsAdmin ? 'Admin' : 'Staff'} permissions set: ${unique.join(', ') || 'none'}`, ip: req.ip });
    return ok(res, { userId, permissions: unique }, 'Permissions updated. The user must sign in again to apply the changes.');
  } catch (err) { next(err); }
});

router.post('/users/:id/password-reset', authenticate, authorize.role('admin'), async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const password = req.body?.password;
    if (!Number.isSafeInteger(userId) || userId < 1 || typeof password !== 'string' || password.length < 12 || password.length > 128) {
      throw new AppError('A valid user and a password of at least 12 characters are required.', 422, 'VALIDATION_ERROR');
    }
    const [target] = await query('SELECT u.id, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?', [userId]);
    if (!target.length) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    if (target[0].role === 'owner') throw new AppError('Owner credentials must be reset through the secure server process.', 403, 'ADMIN_RESET_RESTRICTED');
    if (target[0].role !== 'admin' && !req.user.permissions.includes('manage_staff')) throw new AppError('Access denied. Missing permission: manage_staff.', 403, 'INSUFFICIENT_PERMISSION');
    if (target[0].role === 'admin' && req.user.role !== 'owner' && !req.user.permissions.includes('manage_admins')) throw new AppError('Only the owner can manage administrator credentials.', 403, 'OWNER_REQUIRED');
    const passwordHash = await bcrypt.hash(password, 12);
    await query('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [passwordHash, userId]);
    await query('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
    await audit.userPasswordReset(req.user.id, userId);
    return ok(res, { userId }, 'Staff password reset; existing sessions have been revoked.');
  } catch (err) { next(err); }
});

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

      const [target] = await query('SELECT u.status, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?', [id]);
      if (!target.length) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
      if (['pending', 'rejected'].includes(target[0].status)) throw new AppError('Registration requests cannot be activated through account status controls.', 403, 'REGISTRATION_REVIEW_REQUIRED');
      if (target[0].role === 'owner') throw new AppError('The owner account is protected from account status changes.', 403, 'OWNER_PROTECTED');
      if (target[0].role !== 'admin' && !req.user.permissions.includes('manage_staff')) throw new AppError('Access denied. Missing permission: manage_staff.', 403, 'INSUFFICIENT_PERMISSION');
      if (target[0].role === 'admin' && req.user.role !== 'owner' && !req.user.permissions.includes('manage_admins')) throw new AppError('Only the owner can manage administrator accounts.', 403, 'OWNER_REQUIRED');

      const [result] = await query('UPDATE users SET status = ?, token_version = token_version + 1 WHERE id = ?', [status, id]);

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
