/**
 * Payment service.
 * Handles payment processing, Tripay callback handling,
 * and payment retrieval. Integrates with billing service
 * for invoice updates and triggers unisolir when a customer
 * in Isolir status pays their invoice.
 *
 * Requirements: 8.3, 8.4
 */

const paymentModel = require('../models/payment.model');
const invoiceModel = require('../models/invoice.model');
const customerModel = require('../models/customer.model');
const subscriptionModel = require('../models/subscription.model');
const tripayService = require('./tripay.service');
const notificationService = require('./notification.service');
const { appPool } = require('../config/database');
const {
  INVOICE_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHOD,
  CUSTOMER_STATUS,
  ERROR_CODE,
  NOTIFICATION_ENTITY_TYPE,
} = require('../utils/constants');

/**
 * Calculate the number of months a subscription has been active.
 * Used to determine notification channel (WA+email for <=2 months, push for >2 months).
 *
 * @param {string|Date|null} activatedAt - Subscription activation date
 * @returns {number} Number of months since activation (0 if not yet activated)
 */
function calculateSubscriptionMonths(activatedAt) {
  if (!activatedAt) return 0;

  const activated = new Date(activatedAt);
  const now = new Date();

  const yearDiff = now.getFullYear() - activated.getFullYear();
  const monthDiff = now.getMonth() - activated.getMonth();

  return yearDiff * 12 + monthDiff;
}

/**
 * Process a payment for an invoice.
 * Creates a payment record, updates the invoice to LUNAS,
 * and triggers unisolir if the customer is in Isolir status.
 *
 * @param {number} invoiceId - Invoice ID to pay
 * @param {object} paymentData - Payment details
 * @param {number} paymentData.amount - Payment amount
 * @param {string} paymentData.method - Payment method (VA, QRIS, Minimarket, Mitra, Merchant, Cash)
 * @param {string|null} [paymentData.tripay_reference] - Tripay reference (for gateway payments)
 * @param {number|null} [paymentData.processed_by] - User ID of processor (Mitra/Merchant/Admin)
 * @param {number} [paymentData.admin_fee=0] - Admin fee / commission
 * @returns {Promise<object>} Created payment record
 * @throws {Error} If invoice not found, already paid, or amount mismatch
 */
async function processPayment(invoiceId, paymentData) {
  // Fetch the invoice
  const invoice = await invoiceModel.findById(invoiceId);
  if (!invoice) {
    throw Object.assign(new Error('Invoice not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // Validate invoice is still payable
  if (invoice.status !== INVOICE_STATUS.UNPAID) {
    throw Object.assign(
      new Error(`Invoice is already '${invoice.status}'. Only UNPAID invoices can be paid.`),
      {
        statusCode: 400,
        code: ERROR_CODE.INVALID_STATUS_TRANSITION,
      }
    );
  }

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // Create payment record with Success status
  const payment = await paymentModel.create({
    invoice_id: invoiceId,
    amount: paymentData.amount,
    method: paymentData.method,
    tripay_reference: paymentData.tripay_reference || null,
    processed_by: paymentData.processed_by || null,
    admin_fee: paymentData.admin_fee || 0,
    status: PAYMENT_STATUS.SUCCESS,
    paid_at: now,
  });

  // Update invoice to LUNAS
  await invoiceModel.update(invoiceId, {
    status: INVOICE_STATUS.LUNAS,
    paid_at: now,
    payment_method: paymentData.method,
  });

  // Check customer status and trigger appropriate post-payment actions (CoA, Activation, Unisolir)
  await triggerPostPaymentActions(invoice, paymentData);

  // Queue payment confirmation notification (Requirement 8.4)
  try {
    const customer = await customerModel.findById(invoice.customer_id);
    const subscription = await subscriptionModel.findById(invoice.subscription_id);
    if (customer && customer.whatsapp_number) {
      const subscriptionMonths = calculateSubscriptionMonths(
        subscription ? subscription.activated_at : null
      );
      await notificationService.queueBySubscriptionAge({
        recipient: customer.whatsapp_number,
        templateName: 'payment_confirmed',
        parameters: {
          customer_name: customer.full_name,
          amount: String(paymentData.amount),
          payment_method: paymentData.method,
          invoice_number: invoice.invoice_number || String(invoiceId),
        },
        subscriptionMonths,
        relatedEntityId: payment.id,
        relatedEntityType: NOTIFICATION_ENTITY_TYPE.PAYMENT,
      });
    }
  } catch (notifError) {
    // Log but don't fail payment processing if notification queuing fails
    console.error('[Payment] Error queuing payment confirmation notification:', notifError.message);
  }

  return payment;
}

/**
 * Handle Tripay payment callback.
 * Verifies the callback signature, updates the payment and invoice status,
 * and triggers unisolir if needed.
 *
 * @param {object} callbackData - Tripay callback payload
 * @param {string} callbackData.merchant_ref - Merchant reference (invoice ID)
 * @param {string} callbackData.reference - Tripay transaction reference
 * @param {string} callbackData.status - Payment status from Tripay (PAID, EXPIRED, FAILED)
 * @param {number} callbackData.total_amount - Total amount paid
 * @param {string} signature - HMAC signature from Tripay callback header
 * @returns {Promise<object>} Processing result
 * @throws {Error} If signature is invalid or payment not found
 */
async function processTripayCallback(callbackData, signature) {
  // Verify callback signature
  const isValid = tripayService.verifyCallback(callbackData, signature);
  if (!isValid) {
    throw Object.assign(new Error('Invalid callback signature.'), {
      statusCode: 403,
      code: ERROR_CODE.AUTH_FORBIDDEN,
    });
  }

  const { merchant_ref, reference, status, total_amount } = callbackData;

  // Find the existing payment by Tripay reference
  let payment = await paymentModel.findByTripayReference(reference);

  // If no payment record exists yet, find by invoice (merchant_ref)
  if (!payment) {
    const invoiceId = parseInt(merchant_ref, 10);
    const invoice = await invoiceModel.findById(invoiceId);
    if (!invoice) {
      throw Object.assign(new Error('Invoice not found for callback.'), {
        statusCode: 404,
        code: ERROR_CODE.RESOURCE_NOT_FOUND,
      });
    }

    // Check if invoice is already paid (idempotency)
    if (invoice.status === INVOICE_STATUS.LUNAS) {
      return { message: 'Invoice already paid.', idempotent: true };
    }
  } else {
    // Check if payment is already processed (idempotency)
    if (payment.status === PAYMENT_STATUS.SUCCESS) {
      return { message: 'Payment already processed.', idempotent: true };
    }
  }

  // Map Tripay status to internal status
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  if (status === 'PAID') {
    const invoiceId = parseInt(merchant_ref, 10);
    const invoice = await invoiceModel.findById(invoiceId);

    if (payment) {
      // Update existing payment record
      await paymentModel.updateStatus(payment.id, PAYMENT_STATUS.SUCCESS, { paid_at: now });
    } else {
      // Create a new payment record
      payment = await paymentModel.create({
        invoice_id: invoiceId,
        amount: total_amount,
        method: PAYMENT_METHOD.VA, // Default; actual method comes from Tripay data
        tripay_reference: reference,
        processed_by: null,
        admin_fee: 0,
        status: PAYMENT_STATUS.SUCCESS,
        paid_at: now,
      });
    }

    // Update invoice to LUNAS
    if (invoice && invoice.status === INVOICE_STATUS.UNPAID) {
      await invoiceModel.update(invoiceId, {
        status: INVOICE_STATUS.LUNAS,
        paid_at: now,
        payment_method: payment.method || PAYMENT_METHOD.VA,
      });

      // Trigger post-payment actions (CoA, Activation, Unisolir)
      await triggerPostPaymentActions(invoice, { processed_by: null });
    }

    return { message: 'Payment processed successfully.', payment_id: payment.id };
  } else if (status === 'EXPIRED') {
    if (payment) {
      await paymentModel.updateStatus(payment.id, PAYMENT_STATUS.EXPIRED);
    }
    return { message: 'Payment expired.', status: PAYMENT_STATUS.EXPIRED };
  } else if (status === 'FAILED') {
    if (payment) {
      await paymentModel.updateStatus(payment.id, PAYMENT_STATUS.FAILED);
    }
    return { message: 'Payment failed.', status: PAYMENT_STATUS.FAILED };
  }

  return { message: `Unhandled callback status: ${status}` };
}

/**
 * Get all payments for an invoice.
 *
 * @param {number} invoiceId - Invoice ID
 * @returns {Promise<Array>} List of payment records
 * @throws {Error} If invoice not found
 */
async function getPaymentsByInvoice(invoiceId) {
  const invoice = await invoiceModel.findById(invoiceId);
  if (!invoice) {
    throw Object.assign(new Error('Invoice not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  return paymentModel.findByInvoiceId(invoiceId);
}

/**
 * Perform post-payment actions based on customer lifecycle status.
 * - ISOLIR: trigger unisolir process (restore service)
 * - INSTALASI: trigger full activation process
 * - AKTIF: send CoA to refresh the session parameters (e.g. rate limit)
 *
 * @param {object} invoice - Invoice record
 * @param {object} paymentData - Payment data for actor attribution
 * @returns {Promise<void>}
 */
async function triggerPostPaymentActions(invoice, paymentData) {
  try {
    // Get the customer for this invoice
    const customer = await customerModel.findById(invoice.customer_id);
    if (!customer) return;

    // Get the subscription to find NAS details
    const subscriptionModelWithDetails = require('../models/subscription.model');
    const subscription = await subscriptionModelWithDetails.findByIdWithDetails(invoice.subscription_id);
    if (!subscription) return;

    const { SUBSCRIPTION_STATUS } = require('../utils/constants');

    if (customer.lifecycle_status === CUSTOMER_STATUS.ISOLIR || subscription.status === SUBSCRIPTION_STATUS.SUSPENDED) {
      // Update customer status from Isolir to Aktif if it's currently Isolir
      if (customer.lifecycle_status === CUSTOMER_STATUS.ISOLIR) {
        await customerModel.updateStatus(customer.id, CUSTOMER_STATUS.AKTIF, paymentData.processed_by || 1);
      }

      // Update subscription status to Active
      await subscriptionModel.update(subscription.id, {
        status: SUBSCRIPTION_STATUS.ACTIVE,
      });

      // Remove Isolir profile from RADIUS
      const radiusService = require('./radius.service');
      try {
        await radiusService.removeIsolirProfile(subscription.pppoe_username);
      } catch (radErr) {
        console.error(`[Payment] Error removing isolir profile for ${subscription.pppoe_username}:`, radErr.message);
      }

      // Call CoA service to unisolir the NAS
      const coaService = require('./coa.service');
      try {
        if (subscription.nas_id) {
          await coaService.unisolir(subscription.id, subscription.nas_id, subscription.pppoe_username);
        }
      } catch (coaErr) {
        console.error(`[Payment] CoA Unisolir failed for ${subscription.pppoe_username}:`, coaErr.message);
      }
      console.log(`[Payment] Unisolir triggered successfully for customer ${customer.id}`);

    } else if (customer.lifecycle_status === CUSTOMER_STATUS.INSTALASI || subscription.status === SUBSCRIPTION_STATUS.PENDING) {
      const customerService = require('./customer.service');
      try {
        await customerService.activateCustomer(subscription.id, { id: paymentData.processed_by || 1 });
        console.log(`[Payment] Activation triggered successfully for customer ${customer.id}`);
      } catch (actErr) {
        console.error(`[Payment] Activation failed for customer ${customer.id}:`, actErr.message);
      }

    } else if (customer.lifecycle_status === CUSTOMER_STATUS.AKTIF || subscription.status === SUBSCRIPTION_STATUS.ACTIVE) {
      // General CoA session refresh for already active customers
      const coaService = require('./coa.service');
      try {
        if (subscription.nas_id && subscription.upload_rate_limit && subscription.download_rate_limit) {
          const rateLimit = `${subscription.upload_rate_limit}k/${subscription.download_rate_limit}k`;
          await coaService.speedChange(
            subscription.id,
            subscription.nas_id,
            subscription.pppoe_username,
            rateLimit
          );
          console.log(`[Payment] CoA session refresh triggered successfully for customer ${customer.id}`);
        }
      } catch (coaErr) {
        console.error(`[Payment] CoA refresh failed for customer ${customer.id}:`, coaErr.message);
      }
    }
  } catch (error) {
    // Log but don't fail the payment if post-payment actions fail
    console.error('[Payment] Error triggering post-payment actions:', error.message);
  }
}

module.exports = {
  processPayment,
  processTripayCallback,
  getPaymentsByInvoice,
};
