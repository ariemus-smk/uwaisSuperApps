/**
 * CoA controller.
 * Handles HTTP requests for CoA/POD engine endpoints.
 * Provides manual CoA operations (kick, speed-change, isolir, unisolir) and log retrieval.
 *
 * Requirements: 13.1, 13.2, 13.5
 */

const coaService = require('../services/coa.service');
const { success, error } = require('../utils/responseHelper');
const { ERROR_CODE } = require('../utils/constants');

/**
 * POST /api/coa/kick
 * Disconnect a PPPoE session by sending a POD (Packet of Disconnect) to the NAS.
 */
async function kick(req, res) {
  try {
    const { subscription_id, nas_id, username } = req.body;

    const result = await coaService.sendPOD(
      Number(subscription_id),
      Number(nas_id),
      username
    );

    if (!result.success) {
      return error(
        res,
        `POD failed with status: ${result.responseStatus} after ${result.retryCount} retries.`,
        502,
        { logId: result.logId, responseStatus: result.responseStatus, retryCount: result.retryCount },
        ERROR_CODE.COA_FAILED
      );
    }

    return success(res, result, 'PPPoE session disconnected successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/coa/speed-change
 * Apply a speed change via CoA to update Mikrotik-Rate-Limit on the NAS.
 */
async function speedChange(req, res) {
  try {
    const { subscription_id, nas_id, username, rateLimit } = req.body;

    const result = await coaService.speedChange(
      Number(subscription_id),
      Number(nas_id),
      username,
      rateLimit
    );

    if (!result.success) {
      return error(
        res,
        `Speed change CoA failed with status: ${result.responseStatus} after ${result.retryCount} retries.`,
        502,
        { logId: result.logId, responseStatus: result.responseStatus, retryCount: result.retryCount },
        ERROR_CODE.COA_FAILED
      );
    }

    return success(res, result, 'Speed change applied successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/coa/isolir
 * Manually isolir a customer by sending a CoA to add them to the isolir Address_List.
 */
async function isolir(req, res) {
  try {
    const { subscription_id, nas_id, username } = req.body;

    const result = await coaService.isolir(
      Number(subscription_id),
      Number(nas_id),
      username
    );

    if (!result.success) {
      return error(
        res,
        `Isolir CoA failed with status: ${result.responseStatus} after ${result.retryCount} retries.`,
        502,
        { logId: result.logId, responseStatus: result.responseStatus, retryCount: result.retryCount },
        ERROR_CODE.COA_FAILED
      );
    }

    return success(res, result, 'Customer isolated successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/coa/unisolir
 * Manually remove isolir from a customer by sending a CoA to remove them from the isolir Address_List.
 */
async function unisolir(req, res) {
  try {
    const { subscription_id, nas_id, username } = req.body;

    const result = await coaService.unisolir(
      Number(subscription_id),
      Number(nas_id),
      username
    );

    if (!result.success) {
      return error(
        res,
        `Unisolir CoA failed with status: ${result.responseStatus} after ${result.retryCount} retries.`,
        502,
        { logId: result.logId, responseStatus: result.responseStatus, retryCount: result.retryCount },
        ERROR_CODE.COA_FAILED
      );
    }

    return success(res, result, 'Customer unisolated successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/coa/logs
 * Get CoA operation logs with optional filters.
 */
async function getLogs(req, res) {
  try {
    const filters = {
      subscription_id: req.query.subscription_id ? Number(req.query.subscription_id) : undefined,
      nas_id: req.query.nas_id ? Number(req.query.nas_id) : undefined,
      trigger_type: req.query.trigger_type,
      response_status: req.query.response_status,
      from_date: req.query.from_date,
      to_date: req.query.to_date,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    };

    const result = await coaService.getCoALogs(filters);

    return success(res, result, 'CoA logs retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

module.exports = {
  kick,
  speedChange,
  isolir,
  unisolir,
  getLogs,
};
