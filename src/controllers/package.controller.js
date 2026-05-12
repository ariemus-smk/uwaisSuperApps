/**
 * Package controller.
 * Handles HTTP requests for service package management endpoints.
 */

const packageService = require('../services/package.service');
const { success, created, error, noContent } = require('../utils/responseHelper');
const { ERROR_CODE } = require('../utils/constants');

/**
 * GET /api/packages
 * List all packages with optional status filter.
 */
async function list(req, res) {
  try {
    const filters = {};
    if (req.query.status) {
      filters.status = req.query.status;
    }

    const packages = await packageService.getAllPackages(filters);

    return success(res, packages, 'Packages retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/packages/:id
 * Get a single package by ID.
 */
async function getById(req, res) {
  try {
    const { id } = req.params;
    const pkg = await packageService.getPackageById(Number(id));

    return success(res, pkg, 'Package retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/packages
 * Create a new package.
 */
async function create_(req, res) {
  try {
    const pkg = await packageService.createPackage(req.body);

    return created(res, pkg, 'Package created successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    const errors = err.errors || null;
    return error(res, err.message, statusCode, errors, code);
  }
}

/**
 * PUT /api/packages/:id
 * Update an existing package.
 */
async function update(req, res) {
  try {
    const { id } = req.params;
    const pkg = await packageService.updatePackage(Number(id), req.body);

    return success(res, pkg, 'Package updated successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    const errors = err.errors || null;
    return error(res, err.message, statusCode, errors, code);
  }
}

/**
 * DELETE /api/packages/:id
 * Delete a package (if no active subscriptions).
 */
async function remove(req, res) {
  try {
    const { id } = req.params;
    await packageService.deletePackage(Number(id));

    return noContent(res);
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
  remove,
};
