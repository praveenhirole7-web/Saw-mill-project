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
    const roleMatches = req.user.role === requiredRole || (requiredRole === 'admin' && req.user.role === 'owner');
    if (!roleMatches) {
      return next(
        new AppError(
          `Access denied. This action requires the '${requiredRole}' role.`,
          403,
          'INSUFFICIENT_ROLE'
        )
      );
    }
    if (requiredRole === 'admin' && req.user.role !== 'owner' && req.user.permissionOverride) {
      const permission = routePermission(req);
      if (permission && !hasPermission(req.user, permission)) {
        return next(new AppError(`Access denied. Missing permission: '${permission}'.`, 403, 'INSUFFICIENT_PERMISSION'));
      }
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
    const roleMatches = allowedRoles.includes(req.user.role) || (allowedRoles.includes('admin') && req.user.role === 'owner');
    if (!roleMatches) {
      return next(
        new AppError(
          `Access denied. Required role: one of [${allowedRoles.join(', ')}].`,
          403,
          'INSUFFICIENT_ROLE'
        )
      );
    }
    if (req.user.permissionOverride && req.user.role !== 'owner') {
      const permission = routePermission(req);
      if (permission && !hasPermission(req.user, permission)) {
        return next(new AppError(`Access denied. Missing permission: '${permission}'.`, 403, 'INSUFFICIENT_PERMISSION'));
      }
    }
    next();
  };
}

function routePermission(req) {
  const base = (req.baseUrl || '').replace(/^\/api\/v1\//, '');
  const method = req.method.toUpperCase();
  const read = method === 'GET' || method === 'HEAD';
  const map = {
    inventory: read ? 'view_inventory' : 'manage_inventory',
    purchases: read ? 'view_purchases' : 'manage_purchases',
    customers: read ? 'view_customers' : 'manage_customers',
    'cutting-jobs': read ? 'view_cutting_jobs' : 'manage_cutting_jobs',
    'sales-orders': read ? 'view_sales_orders' : 'manage_sales_orders',
    suppliers: read ? 'view_purchases' : 'manage_purchases',
    invoices: req.path.includes('/payments')
      ? (read ? 'view_payments' : 'manage_payments')
      : (read ? 'view_invoices' : 'manage_invoices'),
    'wood-types': 'manage_inventory',
    settings: 'manage_settings',
  };
  return map[base] || null;
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
    if (!hasPermission(req.user, requiredPermission)) {
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

function hasPermission(user, requiredPermission) {
  return user.permissions.includes(requiredPermission) ||
    (requiredPermission.startsWith('view_') && user.permissions.includes(requiredPermission.replace(/^view_/, 'manage_')));
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
