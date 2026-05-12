/**
 * User model for App DB.
 * Provides data access methods for the `users` table.
 * Supports full CRUD operations for user management.
 */

const { appPool } = require('../config/database');

/**
 * Find a user by username.
 * @param {string} username
 * @returns {Promise<object|null>} User record or null
 */
async function findByUsername(username) {
  const [rows] = await appPool.execute(
    'SELECT * FROM users WHERE username = ? LIMIT 1',
    [username]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find a user by ID.
 * @param {number} id
 * @returns {Promise<object|null>} User record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    'SELECT id, username, full_name, role, branch_id, status, profit_sharing_pct, commission_amount, saldo, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find a user by ID including password hash (for auth).
 * @param {number} id
 * @returns {Promise<object|null>} Full user record or null
 */
async function findByIdFull(id) {
  const [rows] = await appPool.execute(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * List all users with optional filters.
 * @param {object} [filters={}] - Optional filters
 * @param {string} [filters.role] - Filter by role
 * @param {string} [filters.status] - Filter by status
 * @param {number} [filters.branch_id] - Filter by branch
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @returns {Promise<{users: Array, total: number}>} Paginated user list
 */
async function findAll(filters = {}) {
  const { role, status, branch_id, page = 1, limit = 20 } = filters;

  let countQuery = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
  let dataQuery = 'SELECT id, username, full_name, role, branch_id, status, profit_sharing_pct, commission_amount, saldo, created_at, updated_at FROM users WHERE 1=1';
  const params = [];

  if (role) {
    countQuery += ' AND role = ?';
    dataQuery += ' AND role = ?';
    params.push(role);
  }

  if (status) {
    countQuery += ' AND status = ?';
    dataQuery += ' AND status = ?';
    params.push(status);
  }

  if (branch_id) {
    countQuery += ' AND branch_id = ?';
    dataQuery += ' AND branch_id = ?';
    params.push(branch_id);
  }

  const [countRows] = await appPool.execute(countQuery, params);
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  dataQuery += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  const dataParams = [...params, String(limit), String(offset)];

  const [rows] = await appPool.execute(dataQuery, dataParams);

  return { users: rows, total };
}

/**
 * Create a new user.
 * @param {object} userData - User data
 * @param {string} userData.username
 * @param {string} userData.password_hash
 * @param {string} userData.full_name
 * @param {string} userData.role
 * @param {number|null} userData.branch_id
 * @param {string} [userData.status='Active']
 * @param {number|null} [userData.profit_sharing_pct]
 * @param {number|null} [userData.commission_amount]
 * @param {number} [userData.saldo=0]
 * @returns {Promise<object>} Created user with insertId
 */
async function create(userData) {
  const {
    username,
    password_hash,
    full_name,
    role,
    branch_id = null,
    status = 'Active',
    profit_sharing_pct = null,
    commission_amount = null,
    saldo = 0,
  } = userData;

  const [result] = await appPool.execute(
    `INSERT INTO users (username, password_hash, full_name, role, branch_id, status, profit_sharing_pct, commission_amount, saldo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [username, password_hash, full_name, role, branch_id, status, profit_sharing_pct, commission_amount, saldo]
  );

  return { id: result.insertId, ...userData, status };
}

/**
 * Update a user's profile data.
 * @param {number} id - User ID
 * @param {object} updateData - Fields to update
 * @returns {Promise<object>} Query result
 */
async function update(id, updateData) {
  const allowedFields = ['full_name', 'role', 'branch_id', 'profit_sharing_pct', 'commission_amount'];
  const setClauses = [];
  const params = [];

  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      params.push(updateData[field]);
    }
  }

  if (setClauses.length === 0) {
    return { affectedRows: 0 };
  }

  setClauses.push('updated_at = NOW()');
  params.push(id);

  const [result] = await appPool.execute(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Update a user's status (Active/Inactive).
 * @param {number} id - User ID
 * @param {string} status - New status
 * @returns {Promise<object>} Query result
 */
async function updateStatus(id, status) {
  const [result] = await appPool.execute(
    'UPDATE users SET status = ?, updated_at = NOW() WHERE id = ?',
    [status, id]
  );
  return result;
}

/**
 * Update a user's password hash.
 * @param {number} id - User ID
 * @param {string} passwordHash - New bcrypt hash
 * @returns {Promise<object>} Query result
 */
async function updatePassword(id, passwordHash) {
  const [result] = await appPool.execute(
    'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
    [passwordHash, id]
  );
  return result;
}

/**
 * Set a password reset token and expiry for a user.
 * @param {number} id - User ID
 * @param {string} resetToken - UUID reset token
 * @param {Date} expiresAt - Token expiry timestamp
 * @returns {Promise<object>} Query result
 */
async function setResetToken(id, resetToken, expiresAt) {
  const [result] = await appPool.execute(
    'UPDATE users SET reset_token = ?, reset_token_expires = ?, updated_at = NOW() WHERE id = ?',
    [resetToken, expiresAt, id]
  );
  return result;
}

/**
 * Find a user by their password reset token.
 * @param {string} resetToken
 * @returns {Promise<object|null>} User record or null
 */
async function findByResetToken(resetToken) {
  const [rows] = await appPool.execute(
    'SELECT * FROM users WHERE reset_token = ? LIMIT 1',
    [resetToken]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Clear the reset token fields for a user.
 * @param {number} id - User ID
 * @returns {Promise<object>} Query result
 */
async function clearResetToken(id) {
  const [result] = await appPool.execute(
    'UPDATE users SET reset_token = NULL, reset_token_expires = NULL, updated_at = NOW() WHERE id = ?',
    [id]
  );
  return result;
}

module.exports = {
  findByUsername,
  findById,
  findByIdFull,
  findAll,
  create,
  update,
  updateStatus,
  updatePassword,
  setResetToken,
  findByResetToken,
  clearResetToken,
};
