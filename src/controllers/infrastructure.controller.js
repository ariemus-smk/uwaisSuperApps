/**
 * Infrastructure controller.
 * Handles HTTP requests for infrastructure management endpoints (OLT, ODP, Coverage).
 *
 * Requirements: 28.1, 28.2, 28.3, 28.4, 29.1, 47.1
 */

const infrastructureService = require('../services/infrastructure.service');
const coverageService = require('../services/coverage.service');
const odpModel = require('../models/odp.model');
const oltModel = require('../models/olt.model');
const { success, created, paginated, error } = require('../utils/responseHelper');
const { ERROR_CODE } = require('../utils/constants');

// ============================================================
// OLT Handlers
// ============================================================

/**
 * GET /api/infrastructure/olts
 * List all OLTs with optional filters.
 */
async function listOlts(req, res) {
  try {
    const filters = {};
    if (req.query.branch_id) {
      filters.branch_id = Number(req.query.branch_id);
    }
    if (req.query.status) {
      filters.status = req.query.status;
    }
    if (req.query.page) {
      filters.page = Number(req.query.page);
    }
    if (req.query.limit) {
      filters.limit = Number(req.query.limit);
    }

    const result = await infrastructureService.listOlts(filters);

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const totalPages = Math.ceil(result.total / limit);

    return paginated(res, result.olts, {
      page,
      limit,
      totalItems: result.total,
      totalPages,
    }, 'OLTs retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/infrastructure/olts
 * Register a new OLT device.
 */
async function registerOlt(req, res) {
  try {
    const olt = await infrastructureService.registerOlt(req.body);

    return created(res, olt, 'OLT registered successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PUT /api/infrastructure/olts/:id
 * Update an existing OLT device.
 */
async function updateOlt(req, res) {
  try {
    const { id } = req.params;
    const olt = await infrastructureService.updateOlt(Number(id), req.body);

    return success(res, olt, 'OLT updated successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/infrastructure/olts/:id/test
 * Test OLT connectivity.
 */
async function testOltConnectivity(req, res) {
  try {
    const { id } = req.params;
    const result = await infrastructureService.testOltConnectivity(Number(id));

    const message = result.reachable
      ? 'OLT connectivity test passed. Status set to Active.'
      : 'OLT connectivity test failed. Status set to Inactive.';

    return success(res, result, message);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

// ============================================================
// ODP Handlers
// ============================================================

/**
 * GET /api/infrastructure/odps
 * List ODPs with optional filters.
 *
 * Requirements: 29.1
 */
async function listOdps(req, res) {
  try {
    const filters = {};
    if (req.query.branch_id) {
      filters.branch_id = Number(req.query.branch_id);
    }
    if (req.query.olt_id) {
      filters.olt_id = Number(req.query.olt_id);
    }
    if (req.query.status) {
      filters.status = req.query.status;
    }
    if (req.query.page) {
      filters.page = Number(req.query.page);
    }
    if (req.query.limit) {
      filters.limit = Number(req.query.limit);
    }

    const result = await odpModel.findAll(filters);

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const totalPages = Math.ceil(result.total / limit);

    return paginated(res, result.odps, {
      page,
      limit,
      totalItems: result.total,
      totalPages,
    }, 'ODPs retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/infrastructure/odps
 * Register a new ODP device.
 *
 * Requirements: 29.1, 29.2
 */
async function createOdp(req, res) {
  try {
    const { name, latitude, longitude, total_ports, olt_id, olt_pon_port, branch_id } = req.body;

    // Validate that the mapped OLT exists and is active (Requirement 29.2)
    const olt = await oltModel.findById(olt_id);
    if (!olt) {
      return error(res, 'The specified OLT does not exist.', 404, null, ERROR_CODE.RESOURCE_NOT_FOUND);
    }
    if (olt.status !== 'Active') {
      return error(res, 'The specified OLT is not active.', 400, null, ERROR_CODE.VALIDATION_ERROR);
    }
    if (olt_pon_port > olt.total_pon_ports || olt_pon_port < 1) {
      return error(
        res,
        `OLT PON port must be between 1 and ${olt.total_pon_ports}.`,
        400,
        null,
        ERROR_CODE.VALIDATION_ERROR
      );
    }

    const odp = await odpModel.create({
      name,
      latitude,
      longitude,
      total_ports,
      used_ports: 0,
      olt_id,
      olt_pon_port,
      branch_id,
      status: 'Active',
    });

    return created(res, odp, 'ODP registered successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PUT /api/infrastructure/odps/:id
 * Update an existing ODP device.
 *
 * Requirements: 29.1
 */
async function updateOdp(req, res) {
  try {
    const { id } = req.params;
    const odp = await odpModel.findById(Number(id));
    if (!odp) {
      return error(res, 'ODP device not found.', 404, null, ERROR_CODE.RESOURCE_NOT_FOUND);
    }

    // If olt_id or olt_pon_port is changing, validate the OLT
    const newOltId = req.body.olt_id || odp.olt_id;
    const newOltPonPort = req.body.olt_pon_port || odp.olt_pon_port;

    if (req.body.olt_id || req.body.olt_pon_port) {
      const olt = await oltModel.findById(newOltId);
      if (!olt) {
        return error(res, 'The specified OLT does not exist.', 404, null, ERROR_CODE.RESOURCE_NOT_FOUND);
      }
      if (olt.status !== 'Active') {
        return error(res, 'The specified OLT is not active.', 400, null, ERROR_CODE.VALIDATION_ERROR);
      }
      if (newOltPonPort > olt.total_pon_ports || newOltPonPort < 1) {
        return error(
          res,
          `OLT PON port must be between 1 and ${olt.total_pon_ports}.`,
          400,
          null,
          ERROR_CODE.VALIDATION_ERROR
        );
      }
    }

    await odpModel.update(Number(id), req.body);
    const updatedOdp = await odpModel.findById(Number(id));

    return success(res, updatedOdp, 'ODP updated successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

// ============================================================
// Coverage Handler
// ============================================================

/**
 * GET /api/infrastructure/coverage
 * Check coverage at GPS coordinates.
 *
 * Requirements: 47.1, 47.2, 47.3
 */
async function checkCoverage(req, res) {
  try {
    const { latitude, longitude, radius_meters } = req.query;

    const result = await coverageService.checkCoverage(
      Number(latitude),
      Number(longitude),
      radius_meters ? Number(radius_meters) : undefined
    );

    return success(res, result, result.message);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * DELETE /api/infrastructure/olts/:id
 * Delete an OLT device.
 */
async function deleteOlt(req, res) {
  try {
    const { id } = req.params;
    
    const olt = await oltModel.findById(Number(id));
    if (!olt) {
      return error(res, 'OLT device not found.', 404, null, ERROR_CODE.RESOURCE_NOT_FOUND);
    }

    // Check if any child ODPs exist
    const odpResult = await odpModel.findAll({ olt_id: Number(id) });
    if (odpResult.total > 0) {
      return error(res, 'Cannot delete OLT because it has associated ODP boxes. Delete ODPs first.', 400, null, ERROR_CODE.VALIDATION_ERROR);
    }

    await oltModel.deleteById(Number(id));
    return success(res, null, 'OLT deleted successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * DELETE /api/infrastructure/odps/:id
 * Delete an ODP splitter box.
 */
async function deleteOdp(req, res) {
  try {
    const { id } = req.params;
    
    const odp = await odpModel.findById(Number(id));
    if (!odp) {
      return error(res, 'ODP device not found.', 404, null, ERROR_CODE.RESOURCE_NOT_FOUND);
    }

    await odpModel.deleteById(Number(id));
    return success(res, null, 'ODP deleted successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

module.exports = {
  listOlts,
  registerOlt,
  updateOlt,
  testOltConnectivity,
  listOdps,
  createOdp,
  updateOdp,
  checkCoverage,
  deleteOlt,
  deleteOdp,
};
