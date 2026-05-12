/**
 * KPI controller.
 * Handles HTTP requests for KPI score endpoints.
 *
 * Requirements: 38.4, 38.5
 */

const kpiService = require('../services/kpi.service');
const { success, paginated, error } = require('../utils/responseHelper');
const { ERROR_CODE } = require('../utils/constants');

/**
 * GET /api/kpi/scores
 * Get KPI scores with pagination and optional filters.
 * Supports branch scoping via req.branchFilter.
 */
async function getScores(req, res) {
  try {
    const {
      period,
      role_type,
      user_id,
      reward_eligible,
      page,
      limit,
    } = req.query;

    const options = {
      branchFilter: req.branchFilter,
      period,
      role_type,
      user_id: user_id ? Number(user_id) : undefined,
      reward_eligible: reward_eligible !== undefined ? reward_eligible === 'true' : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    };

    const result = await kpiService.getScores(options);

    return paginated(res, result.scores, result.pagination, 'KPI scores retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/kpi/history/:userId
 * Get KPI history for a specific user.
 */
async function getHistory(req, res) {
  try {
    const { userId } = req.params;
    const { period_from, period_to, page, limit } = req.query;

    const options = {
      period_from,
      period_to,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    };

    const result = await kpiService.getHistory(Number(userId), options);

    return paginated(res, result.history, result.pagination, 'KPI history retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

module.exports = {
  getScores,
  getHistory,
};
