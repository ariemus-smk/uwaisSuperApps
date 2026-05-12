/**
 * Branch controller.
 * Handles HTTP requests for branch management endpoints.
 */

const branchService = require('../services/branch.service');
const { success, created, error } = require('../utils/responseHelper');
const { ERROR_CODE } = require('../utils/constants');

/**
 * GET /api/branches
 * List all branches with optional status filter.
 */
async function list(req, res) {
  try {
    const filters = {};
    if (req.query.status) {
      filters.status = req.query.status;
    }

    const branches = await branchService.getAllBranches(filters);

    return success(res, branches, 'Branches retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/branches/:id
 * Get a single branch by ID.
 */
async function getById(req, res) {
  try {
    const { id } = req.params;
    const branch = await branchService.getBranchById(Number(id));

    return success(res, branch, 'Branch retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/branches
 * Create a new branch.
 */
async function create_(req, res) {
  try {
    const branch = await branchService.createBranch(req.body);

    return created(res, branch, 'Branch created successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PUT /api/branches/:id
 * Update an existing branch.
 */
async function update(req, res) {
  try {
    const { id } = req.params;
    const branch = await branchService.updateBranch(Number(id), req.body);

    return success(res, branch, 'Branch updated successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PATCH /api/branches/:id/status
 * Activate or deactivate a branch.
 */
async function updateStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return error(res, 'Status is required.', 400, null, ERROR_CODE.VALIDATION_ERROR);
    }

    const branch = await branchService.updateBranchStatus(Number(id), status);

    return success(res, branch, `Branch ${status === 'Active' ? 'activated' : 'deactivated'} successfully.`);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

module.exports = {
  list,
  getById,
  create: create_,
  update,
  updateStatus,
};
