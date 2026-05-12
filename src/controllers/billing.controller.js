/**
 * Billing controller.
 * Handles HTTP requests for billing/invoice and down payment endpoints.
 *
 * Requirements: 6.4, 11.1, 11.2, 46.1
 */

const billingService = require('../services/billing.service');
const downPaymentService = require('../services/downPayment.service');
const { success, created, error } = require('../utils/responseHelper');
const { ERROR_CODE } = require('../utils/constants');

/**
 * GET /api/billing/invoices
 * List invoices with optional filters and branch scoping.
 */
async function listInvoices(req, res) {
  try {
    const filters = {
      customer_id: req.query.customer_id,
      subscription_id: req.query.subscription_id,
      status: req.query.status,
      billing_period: req.query.billing_period,
      page: req.query.page,
      limit: req.query.limit,
    };

    const result = await billingService.getInvoices(filters, req.user);

    return success(res, result, 'Invoices retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/billing/invoices/:id
 * Get a single invoice by ID.
 */
async function getInvoice(req, res) {
  try {
    const { id } = req.params;
    const invoice = await billingService.getInvoiceById(Number(id));

    return success(res, invoice, 'Invoice retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/billing/invoices/:id/waive
 * Waive an invoice (for extended isolir).
 */
async function waiveInvoice(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const invoice = await billingService.waiveInvoice(Number(id), reason);

    return success(res, invoice, 'Invoice waived successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/billing/dp
 * List down payments for a customer.
 */
async function listDownPayments(req, res) {
  try {
    const { customer_id } = req.query;

    if (!customer_id) {
      return error(res, 'customer_id query parameter is required.', 400, null, ERROR_CODE.VALIDATION_ERROR);
    }

    const downPayments = await downPaymentService.getDP(Number(customer_id));

    return success(res, downPayments, 'Down payments retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/billing/dp
 * Record a new down payment for a customer.
 */
async function createDownPayment(req, res) {
  try {
    const { customer_id, amount, payment_date } = req.body;

    const dp = await downPaymentService.recordDP(
      Number(customer_id),
      Number(amount),
      payment_date,
      req.user.id
    );

    return created(res, dp, 'Down payment recorded successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

module.exports = {
  listInvoices,
  getInvoice,
  waiveInvoice,
  listDownPayments,
  createDownPayment,
};
