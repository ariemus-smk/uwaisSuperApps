/**
 * Customer controller.
 * Handles HTTP requests for customer management endpoints.
 */

const customerService = require('../services/customer.service');
const { success, created, error } = require('../utils/responseHelper');
const { ERROR_CODE } = require('../utils/constants');

/**
 * GET /api/customers
 * List customers with optional filters and branch scoping.
 */
async function list(req, res) {
  try {
    const lifecycleStatus = req.query.lifecycle_status || req.query['lifecycle_status[]'];
    
    const filters = {
      lifecycle_status: lifecycleStatus,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
    };

    const result = await customerService.listCustomers(filters, req.user);

    return success(res, result, 'Customers retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/customers/:id
 * Get a single customer by ID.
 */
async function getById(req, res) {
  try {
    const { id } = req.params;
    const customer = await customerService.getCustomerById(Number(id));

    return success(res, customer, 'Customer retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/customers
 * Create a new customer.
 */
async function create_(req, res) {
  try {
    const customer = await customerService.createCustomer(req.body, req.user);

    return created(res, customer, 'Customer created successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PUT /api/customers/:id
 * Update an existing customer.
 */
async function update(req, res) {
  try {
    const { id } = req.params;
    const customer = await customerService.updateCustomer(Number(id), req.body);

    return success(res, customer, 'Customer updated successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PATCH /api/customers/:id/status
 * Change customer lifecycle status.
 */
async function changeStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const result = await customerService.changeStatus(Number(id), status, req.user);

    return success(res, result, 'Customer status updated successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    const details = err.details || null;
    return error(res, err.message, statusCode, details, code);
  }
}

/**
 * GET /api/customers/:id/audit-log
 * Get customer status change audit log.
 */
async function getAuditLog(req, res) {
  try {
    const { id } = req.params;
    const options = {
      page: req.query.page,
      limit: req.query.limit,
    };

    const result = await customerService.getAuditLog(Number(id), options);

    return success(res, result, 'Audit log retrieved successfully.');
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
  changeStatus,
  getAuditLog,
};
