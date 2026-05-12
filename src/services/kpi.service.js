/**
 * KPI service.
 * Handles business logic for KPI score retrieval and history.
 * Provides getScores (with pagination, branch scoping) and
 * getHistory (for a specific user with period filtering).
 *
 * Requirements: 38.4, 38.5
 */

const kpiModel = require('../models/kpi.model');
const { ERROR_CODE } = require('../utils/constants');
const { appPool } = require('../config/database');

/**
 * Get KPI scores with pagination and optional filters.
 * Supports branch scoping via branchFilter.
 * @param {object} options - Query options
 * @param {number|null} [options.branchFilter] - Branch ID for scoping (null = all branches)
 * @param {string} [options.period] - Filter by period (YYYY-MM)
 * @param {string} [options.role_type] - Filter by role type (Sales, Teknisi)
 * @param {number} [options.user_id] - Filter by specific user
 * @param {boolean} [options.reward_eligible] - Filter by reward eligibility
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=20] - Items per page
 * @returns {Promise<{scores: Array, pagination: object}>} Paginated KPI scores
 */
async function getScores(options = {}) {
  const {
    branchFilter = null,
    period,
    role_type,
    user_id,
    reward_eligible,
    page = 1,
    limit = 20,
  } = options;

  const filters = {
    page,
    limit,
  };

  if (branchFilter) {
    filters.branch_id = branchFilter;
  }

  if (period) {
    filters.period = period;
  }

  if (role_type) {
    filters.role_type = role_type;
  }

  if (user_id) {
    filters.user_id = user_id;
  }

  if (reward_eligible !== undefined) {
    filters.reward_eligible = reward_eligible;
  }

  const { scores, total } = await kpiModel.findAll(filters);

  const totalPages = Math.ceil(total / limit);

  return {
    scores,
    pagination: {
      page,
      limit,
      totalItems: total,
      totalPages,
    },
  };
}

/**
 * Get KPI history for a specific user.
 * Validates that the user exists before retrieving history.
 * @param {number} userId - User ID
 * @param {object} [options={}] - Query options
 * @param {string} [options.period_from] - Start period (YYYY-MM)
 * @param {string} [options.period_to] - End period (YYYY-MM)
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=20] - Items per page
 * @returns {Promise<{history: Array, pagination: object}>} Paginated KPI history
 * @throws {Error} If user not found
 */
async function getHistory(userId, options = {}) {
  const { period_from, period_to, page = 1, limit = 20 } = options;

  // Validate user exists
  const [userRows] = await appPool.execute(
    'SELECT id, full_name, role, branch_id FROM users WHERE id = ? LIMIT 1',
    [userId]
  );

  if (userRows.length === 0) {
    throw Object.assign(new Error('User not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  const filters = {
    page,
    limit,
  };

  if (period_from) {
    filters.period_from = period_from;
  }

  if (period_to) {
    filters.period_to = period_to;
  }

  const { history, total } = await kpiModel.findByUserId(userId, filters);

  const totalPages = Math.ceil(total / limit);

  return {
    user: userRows[0],
    history,
    pagination: {
      page,
      limit,
      totalItems: total,
      totalPages,
    },
  };
}

module.exports = {
  getScores,
  getHistory,
};
