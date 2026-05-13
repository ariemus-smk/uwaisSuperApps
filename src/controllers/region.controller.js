/**
 * Region controller.
 * Handles HTTP requests for managing administrative regions (Provinsi, Kabupaten, Kecamatan, Desa).
 */

const regionService = require('../services/region.service');
const { success, created, paginated, error } = require('../utils/responseHelper');
const { ERROR_CODE } = require('../utils/constants');

/**
 * GET /api/regions
 * List regions with filtering and optional pagination.
 */
async function listRegions(req, res) {
  try {
    const filters = {
      region_type: req.query.region_type,
      region_ref: req.query.region_ref ? Number(req.query.region_ref) : undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 100,
    };

    const result = await regionService.listRegions(filters);

    const totalPages = Math.ceil(result.total / filters.limit);

    return paginated(res, result.regions, {
      page: filters.page,
      limit: filters.limit,
      totalItems: result.total,
      totalPages,
    }, 'Regions retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/regions/:id
 * Retrieve detail of a single region.
 */
async function getRegion(req, res) {
  try {
    const { id } = req.params;
    const region = await regionService.getRegion(Number(id));
    return success(res, region, 'Region retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/regions
 * Create a new region. Only available to Superadmins.
 */
async function createRegion(req, res) {
  try {
    const region = await regionService.createRegion(req.body);
    return created(res, region, 'Region created successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PUT /api/regions/:id
 * Update an existing region. Only available to Superadmins.
 */
async function updateRegion(req, res) {
  try {
    const { id } = req.params;
    const region = await regionService.updateRegion(Number(id), req.body);
    return success(res, region, 'Region updated successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * DELETE /api/regions/:id
 * Delete a region. Only available to Superadmins.
 */
async function deleteRegion(req, res) {
  try {
    const { id } = req.params;
    await regionService.deleteRegion(Number(id));
    return success(res, null, 'Region deleted successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/regions/import
 * Import multiple regions from a list. Superadmin only.
 */
async function importRegions(req, res) {
  try {
    const { regions } = req.body;
    if (!Array.isArray(regions)) {
      throw Object.assign(new Error('Payload "regions" must be an array of objects.'), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }

    const result = await regionService.importRegions(regions);
    return success(res, result, 'Regions import completed.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

module.exports = {
  listRegions,
  getRegion,
  createRegion,
  updateRegion,
  deleteRegion,
  importRegions,
};
