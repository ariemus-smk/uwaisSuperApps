/**
 * Role-Based Access Control (RBAC) middleware.
 * Defines a permission matrix for all 8 user roles and provides
 * an `authorize(...allowedRoles)` middleware factory that checks
 * req.user.role against the allowed roles list.
 */

const { USER_ROLE, ERROR_CODE } = require('../utils/constants');
const { error } = require('../utils/responseHelper');

/**
 * Permission matrix mapping each role to allowed resource/action categories.
 * This serves as documentation and can be used for fine-grained permission checks.
 */
const PERMISSION_MATRIX = Object.freeze({
  [USER_ROLE.SUPERADMIN]: [
    'system:*',
    'users:*',
    'branches:*',
    'packages:*',
    'nas:*',
    'vpn-chr:*',
    'olt:*',
    'odp:*',
    'customers:*',
    'subscriptions:*',
    'billing:*',
    'payments:*',
    'coa:*',
    'acs:*',
    'assets:*',
    'tickets:*',
    'reports:*',
    'capex:*',
    'kpi:*',
    'payroll:*',
    'notifications:*',
    'scheduler:*',
  ],
  [USER_ROLE.ADMIN]: [
    'customers:read',
    'customers:write',
    'customers:status',
    'subscriptions:read',
    'subscriptions:write',
    'subscriptions:activate',
    'billing:read',
    'billing:write',
    'payments:create',
    'coa:*',
    'acs:*',
    'assets:*',
    'tickets:*',
    'nas:read',
    'nas:monitoring',
    'vpn-chr:read',
    'odp:read',
    'odp:write',
    'olt:read',
    'infrastructure:read',
    'infrastructure:coverage',
    'reports:read',
    'capex:write',
    'kpi:read',
    'notifications:*',
    'package-change:*',
  ],
  [USER_ROLE.ACCOUNTING]: [
    'billing:read',
    'billing:write',
    'billing:waive',
    'customers:read',
    'assets:read',
    'reports:financial',
    'payments:read',
  ],
  [USER_ROLE.MITRA]: [
    'customers:read',
    'customers:write',
    'payments:mitra',
    'payments:topup',
    'payments:balance',
    'billing:read',
    'reports:revenue',
    'package-change:request',
  ],
  [USER_ROLE.SALES]: [
    'customers:read',
    'customers:write',
    'infrastructure:read',
    'infrastructure:coverage',
    'odp:read',
    'reports:growth',
    'billing:dp',
    'assets:direct-sale',
    'package-change:request',
  ],
  [USER_ROLE.MERCHANT]: [
    'payments:merchant',
    'payments:topup',
    'payments:balance',
    'reports:payment',
  ],
  [USER_ROLE.TEKNISI]: [
    'customers:read',
    'customers:write',
    'subscriptions:read',
    'subscriptions:installation',
    'infrastructure:read',
    'infrastructure:coverage',
    'odp:read',
    'odp:write',
    'assets:read',
    'assets:request',
    'assets:return',
    'assets:tools',
    'tickets:read',
    'tickets:write',
    'tickets:progress',
    'tickets:journal',
  ],
  [USER_ROLE.PELANGGAN]: [
    'selfservice:read',
    'selfservice:wifi',
    'billing:read:own',
    'payments:create',
    'payments:history',
    'tickets:read:own',
    'tickets:write',
    'package-change:request',
  ],
});

/**
 * Middleware factory that authorizes requests based on user role.
 * Accepts a list of allowed roles and checks req.user.role against them.
 *
 * @param {...string} allowedRoles - Roles permitted to access the route
 * @returns {import('express').RequestHandler} Express middleware function
 *
 * @example
 * // Allow only Superadmin and Admin
 * router.get('/users', authenticate, authorize('Superadmin', 'Admin'), controller.list);
 *
 * // Allow all authenticated users
 * router.get('/packages', authenticate, authorize(...Object.values(USER_ROLE)), controller.list);
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    // Ensure user is authenticated (auth middleware should run before this)
    if (!req.user || !req.user.role) {
      return error(res, 'Access denied. Authentication required.', 401, null, ERROR_CODE.AUTH_UNAUTHORIZED);
    }

    const userRole = req.user.role;

    // Superadmin is the global owner and bypasses all endpoint restrictions
    if (userRole === USER_ROLE.SUPERADMIN) {
      return next();
    }

    // Check if the user's role is in the allowed roles list
    if (!allowedRoles.includes(userRole)) {
      return error(
        res,
        'Forbidden. You do not have permission to access this resource.',
        403,
        null,
        ERROR_CODE.AUTH_FORBIDDEN
      );
    }

    next();
  };
}

module.exports = {
  authorize,
  PERMISSION_MATRIX,
};
