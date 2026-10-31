'use strict';
/**
 * utils/audit.js
 *
 * Audit logging helper. Writes important auth and admin events to the
 * audit_logs table asynchronously (non-blocking — never throws to callers).
 *
 * Usage:
 *   const audit = require('../utils/audit');
 *   await audit.log({ userId: req.user?.id, action: 'USER_LOGIN', description: '...', ip: req.ip });
 */
const { query } = require('../config/db');

/**
 * Record an audit event.
 * @param {{ userId?, action, tableName?, recordId?, description?, ip? }} opts
 */
async function log({ userId = null, action, tableName = null, recordId = null, description = null, ip = null } = {}) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, table_name, record_id, description, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId || null, action, tableName, recordId || null, description, ip]
    );
  } catch (err) {
    // Audit failures must never crash the application
    console.error('[audit] Failed to write audit log:', err.message, { action, userId });
  }
}

// Convenience wrappers for common events
const audit = {
  log,
  loginSuccess: (userId, ip)     => log({ userId, action: 'USER_LOGIN',           description: 'Successful login',          ip }),
  loginFailure: (email, ip)      => log({ action: 'LOGIN_FAILED',                  description: `Failed login for ${email}`, ip }),
  logout:       (userId, ip)     => log({ userId, action: 'USER_LOGOUT',           description: 'User logged out',            ip }),
  tokenRefresh: (userId, ip)     => log({ userId, action: 'TOKEN_REFRESHED',       description: 'Access token refreshed',     ip }),
  userCreated:  (actorId, newId) => log({ userId: actorId, action: 'USER_CREATED', tableName: 'users', recordId: newId, description: 'New user account created' }),
  userStatusChange: (actorId, targetId, status) =>
    log({ userId: actorId, action: 'USER_STATUS_CHANGED', tableName: 'users', recordId: targetId, description: `Status set to: ${status}` }),
  userPermissionsChanged: (actorId, targetId, permissions) =>
    log({ userId: actorId, action: 'USER_PERMISSIONS_CHANGED', tableName: 'users', recordId: targetId, description: `Staff permissions set: ${permissions.join(', ') || 'none'}` }),
  userPasswordReset: (actorId, targetId) =>
    log({ userId: actorId, action: 'STAFF_PASSWORD_RESET', tableName: 'users', recordId: targetId, description: 'Staff password reset; existing sessions revoked' }),
};

module.exports = audit;
