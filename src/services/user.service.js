/**
 * User management service.
 * Handles business logic for creating, updating, listing, and managing user accounts.
 * Only Superadmin can manage users (enforced at route level via RBAC).
 */

const bcrypt = require('bcryptjs');
const userModel = require('../models/user.model');
const { USER_ROLE, ERROR_CODE } = require('../utils/constants');

const SALT_ROUNDS = 10;

/**
 * Valid user roles.
 */
const VALID_ROLES = Object.values(USER_ROLE);

/**
 * Valid user statuses.
 */
const VALID_STATUSES = ['Active', 'Inactive'];

/**
 * List users with optional filters and pagination.
 * @param {object} filters - Query filters
 * @param {string} [filters.role] - Filter by role
 * @param {string} [filters.status] - Filter by status
 * @param {number} [filters.branch_id] - Filter by branch
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @returns {Promise<{users: Array, total: number, page: number, limit: number, totalPages: number}>}
 */
async function listUsers(filters = {}) {
  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 20;

  const { users, total } = await userModel.findAll({
    role: filters.role,
    status: filters.status,
    branch_id: filters.branch_id,
    page,
    limit,
  });

  const totalPages = Math.ceil(total / limit);

  return { users, total, page, limit, totalPages };
}

/**
 * Get a single user by ID.
 * @param {number} id - User ID
 * @returns {Promise<object>} User record
 * @throws {Error} If user not found
 */
async function getUserById(id) {
  const user = await userModel.findById(id);

  if (!user) {
    throw Object.assign(new Error('User not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  return user;
}

/**
 * Create a new user account.
 * Validates username uniqueness, role-specific fields, and hashes password.
 * @param {object} data - User creation data
 * @param {string} data.username - Unique username
 * @param {string} data.password - Plain-text password (will be hashed)
 * @param {string} data.full_name - Full name
 * @param {string} data.role - User role
 * @param {number|null} [data.branch_id] - Branch assignment
 * @param {number|null} [data.profit_sharing_pct] - Mitra profit sharing percentage
 * @param {number|null} [data.commission_amount] - Merchant commission amount
 * @returns {Promise<object>} Created user (without password_hash)
 * @throws {Error} If username already exists or validation fails
 */
async function createUser(data) {
  const { username, password, full_name, role, branch_id, profit_sharing_pct, commission_amount } = data;

  // Validate role
  if (!VALID_ROLES.includes(role)) {
    throw Object.assign(new Error(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Check username uniqueness
  const existingUser = await userModel.findByUsername(username);
  if (existingUser) {
    throw Object.assign(new Error('Username already exists.'), {
      statusCode: 409,
      code: ERROR_CODE.RESOURCE_ALREADY_EXISTS,
    });
  }

  // Validate role-specific fields
  if (role === USER_ROLE.MITRA && (profit_sharing_pct === undefined || profit_sharing_pct === null)) {
    throw Object.assign(new Error('profit_sharing_pct is required for Mitra accounts.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  if (role === USER_ROLE.MERCHANT && (commission_amount === undefined || commission_amount === null)) {
    throw Object.assign(new Error('commission_amount is required for Merchant accounts.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Hash password
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  // Build user data
  const userData = {
    username,
    password_hash,
    full_name,
    role,
    branch_id: branch_id || null,
    status: 'Active',
    profit_sharing_pct: role === USER_ROLE.MITRA ? profit_sharing_pct : null,
    commission_amount: role === USER_ROLE.MERCHANT ? commission_amount : null,
    saldo: 0,
  };

  const created = await userModel.create(userData);

  // Return without sensitive fields
  const { password_hash: _, ...safeUser } = created;
  return safeUser;
}

/**
 * Update an existing user account.
 * @param {number} id - User ID
 * @param {object} data - Fields to update
 * @param {string} [data.full_name] - Updated full name
 * @param {string} [data.role] - Updated role
 * @param {number|null} [data.branch_id] - Updated branch
 * @param {number|null} [data.profit_sharing_pct] - Updated profit sharing (Mitra)
 * @param {number|null} [data.commission_amount] - Updated commission (Merchant)
 * @returns {Promise<object>} Updated user
 * @throws {Error} If user not found or validation fails
 */
async function updateUser(id, data) {
  const user = await userModel.findById(id);

  if (!user) {
    throw Object.assign(new Error('User not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // Validate role if being changed
  if (data.role && !VALID_ROLES.includes(data.role)) {
    throw Object.assign(new Error(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const effectiveRole = data.role || user.role;

  // Validate role-specific fields
  if (effectiveRole === USER_ROLE.MITRA && data.profit_sharing_pct !== undefined && data.profit_sharing_pct === null) {
    throw Object.assign(new Error('profit_sharing_pct cannot be null for Mitra accounts.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  if (effectiveRole === USER_ROLE.MERCHANT && data.commission_amount !== undefined && data.commission_amount === null) {
    throw Object.assign(new Error('commission_amount cannot be null for Merchant accounts.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const updateData = {};
  if (data.full_name !== undefined) updateData.full_name = data.full_name;
  if (data.role !== undefined) updateData.role = data.role;
  if (data.branch_id !== undefined) updateData.branch_id = data.branch_id;
  if (data.profit_sharing_pct !== undefined) updateData.profit_sharing_pct = data.profit_sharing_pct;
  if (data.commission_amount !== undefined) updateData.commission_amount = data.commission_amount;

  await userModel.update(id, updateData);

  // Return updated user
  return userModel.findById(id);
}

/**
 * Update a user's status (Active/Inactive).
 * @param {number} id - User ID
 * @param {string} status - New status
 * @returns {Promise<object>} Updated user
 * @throws {Error} If user not found or invalid status
 */
async function updateUserStatus(id, status) {
  if (!VALID_STATUSES.includes(status)) {
    throw Object.assign(new Error(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const user = await userModel.findById(id);

  if (!user) {
    throw Object.assign(new Error('User not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  await userModel.updateStatus(id, status);

  return userModel.findById(id);
}

module.exports = {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserStatus,
};
