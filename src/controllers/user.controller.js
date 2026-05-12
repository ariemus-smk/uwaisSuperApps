/**
 * User management controller.
 * Handles CRUD operations for user accounts.
 * All endpoints require Superadmin role (enforced via RBAC middleware).
 */

const userService = require('../services/user.service');
const { success, created, paginated, error } = require('../utils/responseHelper');
const { ERROR_CODE } = require('../utils/constants');

/**
 * GET /api/users
 * List all users with optional filters and pagination.
 * Query params: role, status, branch_id, page, limit
 */
async function listUsers(req, res) {
  try {
    const { role, status, branch_id, page, limit } = req.query;

    const result = await userService.listUsers({ role, status, branch_id, page, limit });

    return paginated(res, result.users, {
      page: result.page,
      limit: result.limit,
      totalItems: result.total,
      totalPages: result.totalPages,
    }, 'Users retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return error(res, err.message, statusCode, null, err.code || ERROR_CODE.INTERNAL_ERROR);
  }
}

/**
 * GET /api/users/:id
 * Get a single user by ID.
 */
async function getUser(req, res) {
  try {
    const { id } = req.params;
    const user = await userService.getUserById(parseInt(id, 10));

    return success(res, user, 'User retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return error(res, err.message, statusCode, null, err.code || ERROR_CODE.INTERNAL_ERROR);
  }
}

/**
 * POST /api/users
 * Create a new user account.
 * Body: username, password, full_name, role, branch_id, profit_sharing_pct, commission_amount
 */
async function createUser(req, res) {
  try {
    const user = await userService.createUser(req.body);

    return created(res, user, 'User created successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return error(res, err.message, statusCode, null, err.code || ERROR_CODE.INTERNAL_ERROR);
  }
}

/**
 * PUT /api/users/:id
 * Update an existing user account.
 * Body: full_name, role, branch_id, profit_sharing_pct, commission_amount
 */
async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const user = await userService.updateUser(parseInt(id, 10), req.body);

    return success(res, user, 'User updated successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return error(res, err.message, statusCode, null, err.code || ERROR_CODE.INTERNAL_ERROR);
  }
}

/**
 * PATCH /api/users/:id/status
 * Activate or deactivate a user account.
 * Body: { status: 'Active' | 'Inactive' }
 */
async function updateUserStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const user = await userService.updateUserStatus(parseInt(id, 10), status);

    return success(res, user, 'User status updated successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return error(res, err.message, statusCode, null, err.code || ERROR_CODE.INTERNAL_ERROR);
  }
}

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  updateUserStatus,
};
