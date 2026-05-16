/**
 * Payment controller.
 * Handles HTTP requests for payment endpoints including Tripay gateway,
 * Mitra payments, and Merchant payments.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 9.3, 10.3
 */

const paymentService = require('../services/payment.service');
const tripayService = require('../services/tripay.service');
const mitraService = require('../services/mitra.service');
const merchantService = require('../services/merchant.service');
const invoiceModel = require('../models/invoice.model');
const customerModel = require('../models/customer.model');
const { success, created, error } = require('../utils/responseHelper');
const { ERROR_CODE, PAYMENT_METHOD } = require('../utils/constants');

/**
 * POST /api/payments/tripay/create
 * Create a Tripay payment transaction for an invoice.
 * Returns payment instructions (VA number, QR code, or payment code).
 */
async function createTripayPayment(req, res) {
  try {
    const { invoice_id, payment_method } = req.body;

    // Fetch the invoice
    const invoice = await invoiceModel.findById(Number(invoice_id));
    if (!invoice) {
      return error(res, 'Invoice not found.', 404, null, ERROR_CODE.RESOURCE_NOT_FOUND);
    }

    // Get customer details for Tripay
    const customer = await customerModel.findById(invoice.customer_id);
    if (!customer) {
      return error(res, 'Customer not found.', 404, null, ERROR_CODE.RESOURCE_NOT_FOUND);
    }

    const transaction = await tripayService.createTransaction(
      invoice.id,
      parseFloat(invoice.total_amount),
      customer.full_name,
      customer.email || `customer${customer.id}@uwais.id`,
      payment_method
    );

    return created(res, transaction, 'Tripay payment created successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/payments/tripay/callback
 * Handle Tripay payment callback (webhook).
 * Verifies signature, updates invoice status, triggers unisolir if needed.
 */
async function handleTripayCallback(req, res) {
  try {
    const signature = req.headers['x-callback-signature'] || req.headers['x-callback-token'] || '';
    const callbackData = req.body;

    const result = await paymentService.processTripayCallback(callbackData, signature);

    return success(res, result, 'Callback processed successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/payments/mitra
 * Process a customer payment via Mitra.
 * Deducts from Mitra saldo and marks invoice as LUNAS.
 */
async function processMitraPayment(req, res) {
  try {
    const { invoice_id } = req.body;
    const mitraUserId = req.user.id;

    const result = await mitraService.processPayment(mitraUserId, Number(invoice_id));

    return success(res, result, 'Payment processed successfully via Mitra.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/payments/merchant
 * Process a customer payment via Merchant.
 * Deducts from Merchant saldo and marks invoice as LUNAS.
 */
async function processMerchantPayment(req, res) {
  try {
    const { invoice_id } = req.body;
    const merchantUserId = req.user.id;

    const result = await merchantService.processPayment(merchantUserId, Number(invoice_id));

    return success(res, result, 'Payment processed successfully via Merchant.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/payments/cash
 * Process a direct cash payment by Superadmin or Admin.
 * Marks invoice as LUNAS directly without balance deduction.
 */
async function processCashPayment(req, res) {
  try {
    const { invoice_id } = req.body;
    const userId = req.user.id;

    // Fetch the invoice to get the amount
    const invoice = await invoiceModel.findById(Number(invoice_id));
    if (!invoice) {
      return error(res, 'Invoice not found.', 404, null, ERROR_CODE.RESOURCE_NOT_FOUND);
    }

    const result = await paymentService.processPayment(invoice.id, {
      amount: invoice.total_amount,
      method: PAYMENT_METHOD.CASH,
      processed_by: userId
    });

    return success(res, result, 'Cash payment processed successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/payments/mitra/topup
 * Top up Mitra balance.
 */
async function topupMitra(req, res) {
  try {
    const { amount, reference } = req.body;
    const mitraUserId = req.user.id;

    const result = await mitraService.topup(mitraUserId, Number(amount), reference);

    return created(res, result, 'Mitra balance topped up successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/payments/merchant/topup
 * Top up Merchant balance.
 */
async function topupMerchant(req, res) {
  try {
    const { amount, reference } = req.body;
    const merchantUserId = req.user.id;

    const result = await merchantService.topup(merchantUserId, Number(amount), reference);

    return created(res, result, 'Merchant balance topped up successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/payments/mitra/balance
 * Get current Mitra saldo balance.
 */
async function getMitraBalance(req, res) {
  try {
    const mitraUserId = req.user.id;

    const result = await mitraService.getBalance(mitraUserId);

    return success(res, result, 'Mitra balance retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/payments/merchant/balance
 * Get current Merchant saldo balance.
 */
async function getMerchantBalance(req, res) {
  try {
    const merchantUserId = req.user.id;

    const result = await merchantService.getBalance(merchantUserId);

    return success(res, result, 'Merchant balance retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

module.exports = {
  createTripayPayment,
  handleTripayCallback,
  processMitraPayment,
  processMerchantPayment,
  topupMitra,
  topupMerchant,
  getMitraBalance,
  getMerchantBalance,
  processCashPayment,
};
