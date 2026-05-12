/**
 * Branch scoping middleware.
 * Injects `req.branchFilter` based on the authenticated user's role and branch assignment.
 *
 * - Superadmin: bypasses branch scoping (req.branchFilter = null)
 * - Branch-scoped roles (Admin, Accounting, Teknisi, Sales, Mitra, Merchant, Pelanggan):
 *   sets req.branchFilter = req.user.branch_id so downstream services filter by branch.
 *
 * Must be applied AFTER the auth middleware (req.user must be set).
 */

const { USER_ROLE, ERROR_CODE } = require('../utils/constants');

/**
 * Roles that bypass branch scoping entirely.
 */
const BRANCH_BYPASS_ROLES = [USER_ROLE.SUPERADMIN];

/**
 * Branch scoping middleware.
 * Sets req.branchFilter based on the user's role:
 * - null for Superadmin (no branch restriction)
 * - user's branch_id for all other roles
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
function branchScope(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      status: 'error',
      message: 'Access denied. Authentication required.',
      code: ERROR_CODE.AUTH_UNAUTHORIZED,
    });
  }

  if (BRANCH_BYPASS_ROLES.includes(req.user.role)) {
    req.branchFilter = null;
  } else {
    req.branchFilter = req.user.branch_id;
  }

  next();
}

module.exports = {
  branchScope,
  BRANCH_BYPASS_ROLES,
};
