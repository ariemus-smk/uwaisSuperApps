/**
 * Subscription controller.
 * Handles HTTP requests for subscription management endpoints.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 16.4, 16.5
 */

const subscriptionService = require('../services/subscription.service');
const { success, created, error } = require('../utils/responseHelper');
const { ERROR_CODE } = require('../utils/constants');

/**
 * GET /api/subscriptions
 * List subscriptions with optional filters and branch scoping.
 */
async function list(req, res) {
  try {
    const filters = {
      customer_id: req.query.customer_id,
      status: req.query.status,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
    };

    const result = await subscriptionService.listSubscriptions(filters, req.user);

    return success(res, result, 'Subscriptions retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/subscriptions/:id
 * Get a single subscription by ID with details.
 */
async function getById(req, res) {
  try {
    const { id } = req.params;
    const subscription = await subscriptionService.getSubscriptionById(Number(id));

    return success(res, subscription, 'Subscription retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/subscriptions
 * Create a new subscription for a customer.
 */
async function create_(req, res) {
  try {
    const { customer_id, package_id, nas_id } = req.body;

    const subscription = await subscriptionService.create(customer_id, package_id, nas_id);

    return created(res, subscription, 'Subscription created successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PUT /api/subscriptions/:id
 * Update an existing subscription.
 */
async function update(req, res) {
  try {
    const { id } = req.params;
    const subscription = await subscriptionService.updateSubscription(Number(id), req.body);

    return success(res, subscription, 'Subscription updated successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/subscriptions/:id/activate
 * Activate a subscription (writes PPPoE to RADIUS, sets status to Active).
 */
async function activate(req, res) {
  try {
    const { id } = req.params;
    const subscription = await subscriptionService.activate(Number(id));

    return success(res, subscription, 'Subscription activated successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/subscriptions/:id/installation
 * Submit installation data from technician.
 */
async function installation(req, res) {
  try {
    const { id } = req.params;
    const subscription = await subscriptionService.install(Number(id), req.body);

    return success(res, subscription, 'Installation data recorded successfully.');
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
  activate,
  installation,
};
