'use strict';
/**
 * middleware/authorize.js
 *
 * Role and permission authorization middleware factory.
 *
 * IMPORTANT: Always compose AFTER authenticate middleware.
 *
 * Usage examples:
 *
 *   // Require a specific role:
 *   router.delete('/users/:id', authenticate, authorize.role('admin'), handler);
 *
 *   // Require one of several roles:
 *   router.get('/reports', authenticate, authorize.roles(['admin','manager']), handler);
 *
 *   // Require a specific permission:
 *   router.post('/users', authenticate, authorize.permission('manage_users'), handler);
 *
 *   // Require all listed permissions:
 *   router.put('/inventory/:id', authenticate, authorize.permissions(['manage_inventory']), handler);
 */
const AppError = require('../utils/AppError');

/**
 * Require the authenticated user to have a specific role name.
 */
function role(requiredRole) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Unauthenticated.', 401, 'NO_TOKEN'));
    }
    if (req.user.role !== requiredRole) {
      return next(
        new AppError(
          `Access denied. This action requires the '${requiredRole}' role.`,
          403,
          'INSUFFICIENT_ROLE'
        )
      );
    }
    next();
  };
}

/**
 * Require the authenticated user to have one of the listed role names.
 * @param {string[]} allowedRoles
 */
function roles(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Unauthenticated.', 401, 'NO_TOKEN'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Access denied. Required role: one of [${allowedRoles.join(', ')}].`,
          403,
          'INSUFFICIENT_ROLE'
        )
      );
    }
    next();
  };
}

/**
 * Require the authenticated user to hold a specific named permission.
 * @param {string} requiredPermission
 */
function permission(requiredPermission) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Unauthenticated.', 401, 'NO_TOKEN'));
    }
    if (!req.user.permissions.includes(requiredPermission)) {
      return next(
        new AppError(
          `Access denied. Missing permission: '${requiredPermission}'.`,
          403,
          'INSUFFICIENT_PERMISSION'
        )
      );
    }
    next();
  };
}

/**
 * Require the authenticated user to hold ALL listed permissions.
 * @param {string[]} requiredPermissions
 */
function permissions(requiredPermissions) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Unauthenticated.', 401, 'NO_TOKEN'));
    }
    const missing = requiredPermissions.filter(
      (p) => !req.user.permissions.includes(p)
    );
    if (missing.length > 0) {
      return next(
        new AppError(
          `Access denied. Missing permissions: [${missing.join(', ')}].`,
          403,
          'INSUFFICIENT_PERMISSION'
        )
      );
    }
    next();
  };
}

module.exports = { role, roles, permission, permissions };
