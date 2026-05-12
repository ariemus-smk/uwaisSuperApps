/**
 * Package Change controller.
 * Handles HTTP requests for package change (upgrade/downgrade) endpoints.
 *
 * Requirements: 17.3, 17.4, 17.5
 */

const packageChangeService = require('../services/packageChange.service');
const { success, created, error } = require('../utils/responseHelper');
const { ERROR_CODE } = require('../utils/constants');

/**
 * POST /api/package-change/request
 * Submit a package change request (upgrade/downgrade).
 */
async function requestPackageChange(req, res) {
  try {
    const { subscription_id, requested_package_id } = req.body;

    const request = await packageChangeService.requestPackageChange({
      subscription_id: Number(subscription_id),
      requested_package_id: Number(requested_package_id),
      requested_by: req.user.id,
    });

    return created(res, request, 'Package change request submitted successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/package-change
 * List package change requests with optional filters.
 */
async function listPackageChangeRequests(req, res) {
  try {
    const filters = {
      status: req.query.status,
      subscription_id: req.query.subscription_id,
      page: req.query.page,
      limit: req.query.limit,
    };

    const result = await packageChangeService.getPackageChangeRequests(filters, req.user);

    return success(res, result, 'Package change requests retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PATCH /api/package-change/:id/approve
 * Approve a pending package change request.
 */
async function approvePackageChange(req, res) {
  try {
    const { id } = req.params;

    const result = await packageChangeService.approvePackageChange(Number(id), req.user.id);

    return success(res, result, 'Package change request approved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PATCH /api/package-change/:id/reject
 * Reject a pending package change request.
 */
async function rejectPackageChange(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await packageChangeService.rejectPackageChange(Number(id), req.user.id, reason);

    return success(res, result, 'Package change request rejected successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

module.exports = {
  requestPackageChange,
  listPackageChangeRequests,
  approvePackageChange,
  rejectPackageChange,
};
