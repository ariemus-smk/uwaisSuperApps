/**
 * NAS controller.
 * Handles HTTP requests for NAS device management endpoints.
 * Provides CRUD operations, script generation, connectivity testing, and monitoring.
 *
 * Requirements: 12.4, 12.5, 14.2
 */

const nasService = require('../services/nas.service');
const { success, created, paginated, error } = require('../utils/responseHelper');
const { ERROR_CODE } = require('../utils/constants');

/**
 * GET /api/nas
 * List all NAS devices with optional filters.
 */
async function listNas(req, res) {
  try {
    const filters = {
      branch_id: req.query.branch_id ? Number(req.query.branch_id) : undefined,
      status: req.query.status,
      poll_status: req.query.poll_status,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
    };

    const result = await nasService.listNas(filters);

    const totalPages = Math.ceil(result.total / filters.limit);

    return paginated(
      res,
      result.devices,
      {
        page: filters.page,
        limit: filters.limit,
        totalItems: result.total,
        totalPages,
      },
      'NAS devices retrieved successfully.'
    );
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/nas/:id
 * Get a single NAS device by ID.
 */
async function getNas(req, res) {
  try {
    const nasId = Number(req.params.id);
    const nas = await nasService.getNas(nasId);

    return success(res, nas, 'NAS device retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/nas
 * Register a new NAS device.
 */
async function registerNas(req, res) {
  try {
    const { name, ip_address, radius_secret, api_port, branch_id } = req.body;

    const result = await nasService.register({
      name,
      ip_address,
      radius_secret,
      api_port,
      branch_id,
    });

    return created(res, result, 'NAS device registered successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PUT /api/nas/:id
 * Update an existing NAS device.
 */
async function updateNas(req, res) {
  try {
    const nasId = Number(req.params.id);
    const data = req.body;

    const result = await nasService.updateNas(nasId, data);

    return success(res, result, 'NAS device updated successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/nas/:id/script
 * Download/generate the Mikrotik configuration script for a NAS.
 */
async function getScript(req, res) {
  try {
    const nasId = Number(req.params.id);
    const script = await nasService.generateScript(nasId);

    return success(res, { script }, 'NAS configuration script generated successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/nas/:id/test
 * Test NAS connectivity (API and RADIUS via VPN).
 */
async function testConnectivity(req, res) {
  try {
    const nasId = Number(req.params.id);
    const result = await nasService.testConnectivity(nasId);

    return success(res, result, 'NAS connectivity test completed.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/nas/monitoring
 * Get NAS health status dashboard (all NAS devices with poll status).
 */
async function getMonitoring(req, res) {
  try {
    const filters = {
      branch_id: req.query.branch_id ? Number(req.query.branch_id) : undefined,
      page: 1,
      limit: 1000, // Return all for monitoring dashboard
    };

    const result = await nasService.listNas(filters);

    // Build monitoring summary
    const devices = result.devices;
    const summary = {
      total: devices.length,
      up: devices.filter((d) => d.poll_status === 'Up').length,
      down: devices.filter((d) => d.poll_status === 'Down').length,
      unknown: devices.filter((d) => !d.poll_status).length,
      totalActiveSessions: devices.reduce((sum, d) => sum + (d.active_sessions || 0), 0),
    };

    return success(
      res,
      { summary, devices },
      'NAS monitoring data retrieved successfully.'
    );
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

module.exports = {
  listNas,
  getNas,
  registerNas,
  updateNas,
  getScript,
  testConnectivity,
  getMonitoring,
};
