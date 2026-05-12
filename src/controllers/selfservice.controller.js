/**
 * Self-service controller.
 * Handles HTTP requests for Pelanggan (customer) self-service endpoints.
 * All endpoints restrict access to the authenticated Pelanggan's own data only.
 *
 * Requirements: 43.1, 43.2, 43.3, 43.4, 43.5
 */

const customerService = require('../services/customer.service');
const subscriptionService = require('../services/subscription.service');
const billingService = require('../services/billing.service');
const ticketService = require('../services/ticket.service');
const acsService = require('../services/acs.service');
const packageChangeService = require('../services/packageChange.service');
const customerModel = require('../models/customer.model');
const subscriptionModel = require('../models/subscription.model');
const { success, created, error, paginated } = require('../utils/responseHelper');
const { ERROR_CODE, TICKET_SOURCE } = require('../utils/constants');
const { appPool } = require('../config/database');

/**
 * Resolve the customer record linked to the authenticated Pelanggan user.
 * A Pelanggan user's id is stored in the customers.user_id column.
 * @param {number} userId - The authenticated user's ID
 * @returns {Promise<object>} Customer record
 * @throws {Error} If no linked customer found
 */
async function resolveCustomerForUser(userId) {
  const [rows] = await appPool.execute(
    'SELECT * FROM customers WHERE user_id = ? LIMIT 1',
    [userId]
  );

  if (rows.length === 0) {
    throw Object.assign(new Error('No customer profile linked to this account.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  return rows[0];
}

/**
 * GET /api/selfservice/profile
 * View own customer profile.
 */
async function getProfile(req, res) {
  try {
    const customer = await resolveCustomerForUser(req.user.id);
    return success(res, customer, 'Profile retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/selfservice/subscriptions
 * View own active service subscriptions.
 */
async function getSubscriptions(req, res) {
  try {
    const customer = await resolveCustomerForUser(req.user.id);
    const subscriptions = await subscriptionModel.findByCustomerId(customer.id);

    return success(res, subscriptions, 'Subscriptions retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/selfservice/billing
 * View own billing/invoice history.
 */
async function getBillingHistory(req, res) {
  try {
    const customer = await resolveCustomerForUser(req.user.id);

    const filters = {
      customer_id: customer.id,
      status: req.query.status,
      billing_period: req.query.billing_period,
      page: req.query.page,
      limit: req.query.limit,
    };

    const result = await billingService.getInvoices(filters, {});

    return paginated(res, result.invoices, {
      page: result.page,
      limit: result.limit,
      totalItems: result.total,
      totalPages: result.totalPages,
    }, 'Billing history retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/selfservice/payments
 * View own payment history.
 */
async function getPaymentHistory(req, res) {
  try {
    const customer = await resolveCustomerForUser(req.user.id);

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;

    // Query payments linked to the customer's invoices
    const [countRows] = await appPool.execute(
      `SELECT COUNT(*) as total FROM payments p
       INNER JOIN invoices i ON p.invoice_id = i.id
       WHERE i.customer_id = ?`,
      [customer.id]
    );
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / limit);

    const [payments] = await appPool.execute(
      `SELECT p.*, i.invoice_number, i.billing_period
       FROM payments p
       INNER JOIN invoices i ON p.invoice_id = i.id
       WHERE i.customer_id = ?
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [customer.id, String(limit), String(offset)]
    );

    return paginated(res, payments, {
      page,
      limit,
      totalItems: total,
      totalPages,
    }, 'Payment history retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/selfservice/tickets
 * View own ticket history.
 */
async function getTicketHistory(req, res) {
  try {
    const customer = await resolveCustomerForUser(req.user.id);

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;

    const [countRows] = await appPool.execute(
      'SELECT COUNT(*) as total FROM tickets WHERE customer_id = ?',
      [customer.id]
    );
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / limit);

    const [tickets] = await appPool.execute(
      `SELECT id, customer_id, subscription_id, issue_description, source, priority, status,
              assigned_teknisi_id, created_at, updated_at
       FROM tickets WHERE customer_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [customer.id, String(limit), String(offset)]
    );

    return paginated(res, tickets, {
      page,
      limit,
      totalItems: total,
      totalPages,
    }, 'Ticket history retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/selfservice/tickets
 * Submit a new trouble ticket.
 */
async function submitTicket(req, res) {
  try {
    const customer = await resolveCustomerForUser(req.user.id);

    const data = {
      customer_id: customer.id,
      subscription_id: req.body.subscription_id || null,
      issue_description: req.body.issue_description,
      source: TICKET_SOURCE.PELANGGAN,
    };

    // If subscription_id is provided, verify it belongs to this customer
    if (data.subscription_id) {
      const subscription = await subscriptionModel.findById(data.subscription_id);
      if (!subscription || subscription.customer_id !== customer.id) {
        return error(
          res,
          'Subscription not found or does not belong to your account.',
          403,
          null,
          ERROR_CODE.AUTH_FORBIDDEN
        );
      }
    }

    const ticket = await ticketService.createTicket(data, req.user);

    return created(res, ticket, 'Ticket submitted successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/selfservice/wifi
 * Change WiFi SSID/password (triggers ACS command).
 */
async function changeWifi(req, res) {
  try {
    const customer = await resolveCustomerForUser(req.user.id);

    const { subscription_id, ssid, password } = req.body;

    // Verify subscription belongs to this customer
    const subscription = await subscriptionModel.findById(subscription_id);
    if (!subscription || subscription.customer_id !== customer.id) {
      return error(
        res,
        'Subscription not found or does not belong to your account.',
        403,
        null,
        ERROR_CODE.AUTH_FORBIDDEN
      );
    }

    const wifiData = {};
    if (ssid) wifiData.ssid = ssid;
    if (password) wifiData.password = password;

    const result = await acsService.changeWifi(subscription_id, wifiData);

    return success(res, result, 'WiFi configuration updated successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/selfservice/package-change
 * Request package upgrade/downgrade.
 */
async function requestPackageChange(req, res) {
  try {
    const customer = await resolveCustomerForUser(req.user.id);

    const { subscription_id, requested_package_id } = req.body;

    // Verify subscription belongs to this customer
    const subscription = await subscriptionModel.findById(subscription_id);
    if (!subscription || subscription.customer_id !== customer.id) {
      return error(
        res,
        'Subscription not found or does not belong to your account.',
        403,
        null,
        ERROR_CODE.AUTH_FORBIDDEN
      );
    }

    const result = await packageChangeService.requestPackageChange({
      subscription_id,
      requested_package_id,
      requested_by: req.user.id,
    });

    return created(res, result, 'Package change request submitted successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

module.exports = {
  getProfile,
  getSubscriptions,
  getBillingHistory,
  getPaymentHistory,
  getTicketHistory,
  submitTicket,
  changeWifi,
  requestPackageChange,
};
