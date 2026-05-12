/**
 * KPI model for App DB.
 * Provides data access methods for the `kpi_scores` table.
 * Stores monthly KPI scores for Sales and Teknisi employees.
 *
 * Requirements: 38.4, 38.5
 */

const { appPool } = require('../config/database');

/**
 * Find a KPI score by ID.
 * @param {number} id
 * @returns {Promise<object|null>} KPI score record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    'SELECT * FROM kpi_scores WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * List KPI scores with optional filters and pagination.
 * Supports branch scoping via user join.
 * @param {object} [filters={}] - Optional filters
 * @param {number} [filters.branch_id] - Filter by user's branch
 * @param {string} [filters.period] - Filter by period (YYYY-MM)
 * @param {string} [filters.role_type] - Filter by role type (Sales, Teknisi)
 * @param {number} [filters.user_id] - Filter by specific user
 * @param {boolean} [filters.reward_eligible] - Filter by reward eligibility
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @returns {Promise<{scores: Array, total: number}>} Paginated KPI scores
 */
async function findAll(filters = {}) {
  const { branch_id, period, role_type, user_id, reward_eligible, page = 1, limit = 20 } = filters;

  let countQuery = `SELECT COUNT(*) as total FROM kpi_scores k
     INNER JOIN users u ON k.user_id = u.id
     WHERE 1=1`;
  let dataQuery = `SELECT k.*, u.full_name AS user_name, u.branch_id, u.role AS user_role
     FROM kpi_scores k
     INNER JOIN users u ON k.user_id = u.id
     WHERE 1=1`;
  const params = [];

  if (branch_id) {
    countQuery += ' AND u.branch_id = ?';
    dataQuery += ' AND u.branch_id = ?';
    params.push(branch_id);
  }

  if (period) {
    countQuery += ' AND k.period = ?';
    dataQuery += ' AND k.period = ?';
    params.push(period);
  }

  if (role_type) {
    countQuery += ' AND k.role_type = ?';
    dataQuery += ' AND k.role_type = ?';
    params.push(role_type);
  }

  if (user_id) {
    countQuery += ' AND k.user_id = ?';
    dataQuery += ' AND k.user_id = ?';
    params.push(user_id);
  }

  if (reward_eligible !== undefined) {
    countQuery += ' AND k.reward_eligible = ?';
    dataQuery += ' AND k.reward_eligible = ?';
    params.push(reward_eligible ? 1 : 0);
  }

  const [countRows] = await appPool.execute(countQuery, params);
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  dataQuery += ' ORDER BY k.calculated_at DESC LIMIT ? OFFSET ?';
  const dataParams = [...params, String(limit), String(offset)];

  const [rows] = await appPool.execute(dataQuery, dataParams);

  return { scores: rows, total };
}

/**
 * Get KPI history for a specific user with optional period filtering.
 * Returns all KPI scores for the user ordered by period descending.
 * @param {number} userId - User ID
 * @param {object} [filters={}] - Optional filters
 * @param {string} [filters.period_from] - Start period (YYYY-MM)
 * @param {string} [filters.period_to] - End period (YYYY-MM)
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @returns {Promise<{history: Array, total: number}>} Paginated KPI history
 */
async function findByUserId(userId, filters = {}) {
  const { period_from, period_to, page = 1, limit = 20 } = filters;

  let countQuery = 'SELECT COUNT(*) as total FROM kpi_scores WHERE user_id = ?';
  let dataQuery = `SELECT k.*, u.full_name AS user_name, u.branch_id, u.role AS user_role
     FROM kpi_scores k
     INNER JOIN users u ON k.user_id = u.id
     WHERE k.user_id = ?`;
  const params = [userId];

  if (period_from) {
    countQuery += ' AND period >= ?';
    dataQuery += ' AND k.period >= ?';
    params.push(period_from);
  }

  if (period_to) {
    countQuery += ' AND period <= ?';
    dataQuery += ' AND k.period <= ?';
    params.push(period_to);
  }

  const [countRows] = await appPool.execute(countQuery, params);
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  dataQuery += ' ORDER BY k.period DESC LIMIT ? OFFSET ?';
  const dataParams = [...params, String(limit), String(offset)];

  const [rows] = await appPool.execute(dataQuery, dataParams);

  return { history: rows, total };
}

/**
 * Create a new KPI score record.
 * @param {object} data - KPI score data
 * @param {number} data.user_id
 * @param {string} data.period - YYYY-MM
 * @param {string} data.role_type - 'Sales' or 'Teknisi'
 * @param {number} data.target_value
 * @param {number} data.actual_value
 * @param {number} data.score_percentage
 * @param {boolean} data.reward_eligible
 * @param {number|null} [data.reward_amount]
 * @returns {Promise<object>} Created KPI score with insertId
 */
async function create(data) {
  const {
    user_id,
    period,
    role_type,
    target_value,
    actual_value,
    score_percentage,
    reward_eligible,
    reward_amount = null,
  } = data;

  const [result] = await appPool.execute(
    `INSERT INTO kpi_scores (user_id, period, role_type, target_value, actual_value, score_percentage, reward_eligible, reward_amount, calculated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [user_id, period, role_type, target_value, actual_value, score_percentage, reward_eligible ? 1 : 0, reward_amount]
  );

  return { id: result.insertId, ...data };
}

/**
 * Find existing KPI score for a user in a specific period.
 * Used to prevent duplicate entries.
 * @param {number} userId
 * @param {string} period - YYYY-MM
 * @returns {Promise<object|null>} KPI score record or null
 */
async function findByUserAndPeriod(userId, period) {
  const [rows] = await appPool.execute(
    'SELECT * FROM kpi_scores WHERE user_id = ? AND period = ? LIMIT 1',
    [userId, period]
  );
  return rows.length > 0 ? rows[0] : null;
}

module.exports = {
  findById,
  findAll,
  findByUserId,
  create,
  findByUserAndPeriod,
};
