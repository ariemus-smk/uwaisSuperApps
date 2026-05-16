/**
 * Billing service.
 * Handles invoice generation, waiver, and retrieval.
 * Integrates prorata calculation for first-month billing,
 * PPN (11%) calculation, installation fees, addon charges,
 * and down payment deductions.
 *
 * Requirements: 5.1, 5.2, 5.3, 6.2, 6.3, 6.4, 11.1, 11.2, 45.2, 45.4, 46.2
 */

const invoiceModel = require('../models/invoice.model');
const subscriptionModel = require('../models/subscription.model');
const packageModel = require('../models/package.model');
const customerModel = require('../models/customer.model');
const notificationService = require('./notification.service');
const { appPool } = require('../config/database');
const { calculateProrata } = require('../utils/prorataCalc');
const { INVOICE_STATUS, ERROR_CODE, NOTIFICATION_ENTITY_TYPE, CUSTOMER_STATUS, USER_ROLE } = require('../utils/constants');

/** PPN rate: 11% */
const PPN_RATE = 0.11;

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
 * Get a system setting value from the system_settings table.
 * @param {string} key - Setting key
 * @returns {Promise<string|null>} Setting value or null
 */
async function getSystemSetting(key) {
  const [rows] = await appPool.execute(
    'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
    [key]
  );
  return rows.length > 0 ? rows[0].setting_value : null;
}

/**
 * Get unapplied down payments for a customer.
 * @param {number} customerId
 * @returns {Promise<Array>} List of unapplied down payment records
 */
async function getUnappliedDownPayments(customerId) {
  const [rows] = await appPool.execute(
    'SELECT * FROM down_payments WHERE customer_id = ? AND applied = 0 ORDER BY created_at ASC',
    [customerId]
  );
  return rows;
}

/**
 * Mark a down payment as applied to an invoice.
 * @param {number} dpId - Down payment ID
 * @param {number} invoiceId - Invoice ID it was applied to
 * @returns {Promise<object>} Query result
 */
async function applyDownPayment(dpId, invoiceId) {
  const [result] = await appPool.execute(
    'UPDATE down_payments SET applied = 1, applied_to_invoice_id = ? WHERE id = ?',
    [invoiceId, dpId]
  );
  return result;
}

/**
 * Generate an invoice for a subscription.
 *
 * Calculation:
 *   base_amount = package monthly_price (or prorata for first month)
 *   ppn_amount = base_amount * 0.11 (when ppn_enabled on package)
 *   total = base_amount + ppn_amount + installation_fee + addon_charges - dp_deduction
 *
 * Due date is set to the 10th of the billing month.
 *
 * @param {number} subscriptionId - Subscription ID
 * @param {object} [options={}] - Generation options
 * @param {boolean} [options.isFirstInvoice=false] - Whether this is the first invoice (triggers prorata)
 * @param {Date|string} [options.activationDate] - Activation date for prorata calculation
 * @param {number} [options.installationFee=0] - Installation fee to include
 * @param {number} [options.addonCharges=0] - Add-on service charges
 * @param {boolean} [options.applyDp=false] - Whether to apply down payment deduction
 * @param {string} [options.billingPeriod] - Override billing period (YYYY-MM), defaults to current month
 * @param {string} [options.generationDate] - Override generation date (YYYY-MM-DD), defaults to today
 * @returns {Promise<object>} Created invoice record
 * @throws {Error} If subscription or package not found
 */
async function generateInvoice(subscriptionId, options = {}) {
  const {
    isFirstInvoice = false,
    activationDate = null,
    installationFee = 0,
    addonCharges = 0,
    applyDp = false,
    billingPeriod = null,
    generationDate = null,
  } = options;

  // Fetch subscription with package details
  const subscription = await subscriptionModel.findByIdWithDetails(subscriptionId);
  if (!subscription) {
    throw Object.assign(new Error('Subscription not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // Fetch the package for pricing and PPN config
  const pkg = await packageModel.findById(subscription.package_id);
  if (!pkg) {
    throw Object.assign(new Error('Package not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // Determine billing period
  const now = new Date();
  const period = billingPeriod || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Check for duplicate invoice
  const existing = await invoiceModel.findBySubscriptionAndPeriod(subscriptionId, period);
  if (existing) {
    throw Object.assign(new Error(`Invoice already exists for subscription ${subscriptionId} in period ${period}.`), {
      statusCode: 409,
      code: ERROR_CODE.RESOURCE_ALREADY_EXISTS,
    });
  }

  // Calculate base amount
  let baseAmount;
  if (isFirstInvoice && activationDate) {
    // Check if prorata is enabled system-wide
    const prorataEnabled = await getSystemSetting('prorata_enabled');
    if (prorataEnabled === 'true' || prorataEnabled === '1') {
      const prorata = calculateProrata({
        monthlyPrice: parseFloat(pkg.monthly_price),
        activationDate,
      });
      baseAmount = prorata.amount;
    } else {
      baseAmount = parseFloat(pkg.monthly_price);
    }
  } else {
    baseAmount = parseFloat(pkg.monthly_price);
  }

  // Calculate PPN (11% when enabled on package)
  let ppnAmount = 0;
  if (pkg.ppn_enabled) {
    ppnAmount = Math.round(baseAmount * PPN_RATE * 100) / 100;
  }

  // Calculate DP deduction
  let dpDeduction = 0;
  if (applyDp) {
    const downPayments = await getUnappliedDownPayments(subscription.customer_id);
    for (const dp of downPayments) {
      dpDeduction += parseFloat(dp.amount);
    }
  }

  // Calculate total
  const totalBeforeDp = baseAmount + ppnAmount + installationFee + addonCharges;
  const totalAmount = Math.max(0, Math.round((totalBeforeDp - dpDeduction) * 100) / 100);

  // Cap DP deduction to not exceed total before DP
  const actualDpDeduction = Math.min(dpDeduction, totalBeforeDp);

  // Determine due date (10th of billing month)
  const [periodYear, periodMonth] = period.split('-').map(Number);
  const dueDate = `${period}-10`;

  // Determine generation date
  const genDate = generationDate || now.toISOString().slice(0, 10);

  // Generate invoice number
  const invoiceNumber = await invoiceModel.generateInvoiceNumber(period);

  // Create the invoice
  const invoice = await invoiceModel.create({
    invoice_number: invoiceNumber,
    customer_id: subscription.customer_id,
    subscription_id: subscriptionId,
    billing_period: period,
    base_amount: Math.round(baseAmount * 100) / 100,
    ppn_amount: ppnAmount,
    installation_fee: installationFee,
    addon_charges: addonCharges,
    dp_deduction: Math.round(actualDpDeduction * 100) / 100,
    total_amount: Math.round((totalBeforeDp - actualDpDeduction) * 100) / 100,
    status: INVOICE_STATUS.UNPAID,
    due_date: dueDate,
    generation_date: genDate,
  });

  // Mark down payments as applied
  if (applyDp && actualDpDeduction > 0) {
    const downPayments = await getUnappliedDownPayments(subscription.customer_id);
    let remaining = actualDpDeduction;
    for (const dp of downPayments) {
      if (remaining <= 0) break;
      await applyDownPayment(dp.id, invoice.id);
      remaining -= parseFloat(dp.amount);
    }
  }

  // Queue notification for invoice generation (Requirement 6.5, 6.6)
  try {
    const customer = await customerModel.findById(subscription.customer_id);
    if (customer && customer.whatsapp_number) {
      const subscriptionMonths = calculateSubscriptionMonths(subscription.activated_at);
      await notificationService.queueBySubscriptionAge({
        recipient: customer.whatsapp_number,
        templateName: 'invoice_generated',
        parameters: {
          customer_name: customer.full_name,
          invoice_number: invoiceNumber,
          billing_period: period,
          total_amount: String(Math.round((totalBeforeDp - actualDpDeduction) * 100) / 100),
          due_date: dueDate,
        },
        subscriptionMonths,
        relatedEntityId: invoice.id,
        relatedEntityType: NOTIFICATION_ENTITY_TYPE.INVOICE,
      });
    }
  } catch (notifError) {
    // Log but don't fail invoice generation if notification queuing fails
    console.error('[Billing] Error queuing invoice notification:', notifError.message);
  }

  return invoice;
}

/**
 * Waive an invoice (for extended isolir).
 * Sets status to WAIVED with a reason for audit purposes.
 *
 * @param {number} invoiceId - Invoice ID
 * @param {string} reason - Waiver reason (e.g., "Extended Isolir")
 * @returns {Promise<object>} Updated invoice
 * @throws {Error} If invoice not found or not in UNPAID status
 */
async function waiveInvoice(invoiceId, reason) {
  const invoice = await invoiceModel.findById(invoiceId);

  if (!invoice) {
    throw Object.assign(new Error('Invoice not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (invoice.status !== INVOICE_STATUS.UNPAID) {
    throw Object.assign(
      new Error(`Cannot waive invoice with status '${invoice.status}'. Only UNPAID invoices can be waived.`),
      {
        statusCode: 400,
        code: ERROR_CODE.INVALID_STATUS_TRANSITION,
      }
    );
  }

  if (!reason || reason.trim().length === 0) {
    throw Object.assign(new Error('Waiver reason is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  await invoiceModel.update(invoiceId, {
    status: INVOICE_STATUS.WAIVED,
    waiver_reason: reason.trim(),
  });

  return invoiceModel.findById(invoiceId);
}

/**
 * Get invoices with pagination and filters.
 * Applies branch scoping based on user role.
 *
 * @param {object} [filters={}] - Query filters
 * @param {number} [filters.customer_id] - Filter by customer
 * @param {number} [filters.subscription_id] - Filter by subscription
 * @param {string} [filters.status] - Filter by invoice status
 * @param {string} [filters.billing_period] - Filter by billing period
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @param {object} [user={}] - Requesting user (from req.user)
 * @param {number|null} [user.branch_id] - User's branch (null for Superadmin)
 * @returns {Promise<{invoices: Array, total: number, page: number, limit: number, totalPages: number}>}
 */
async function getInvoices(filters = {}, user = {}) {
  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 20;

  const queryFilters = {
    customer_id: filters.customer_id,
    subscription_id: filters.subscription_id,
    status: filters.status,
    billing_period: filters.billing_period,
    page,
    limit,
  };

  // Apply branch scoping
  if (user.branch_id && user.role !== USER_ROLE.SUPERADMIN) {
    queryFilters.branch_id = user.branch_id;
  }

  const { invoices, total } = await invoiceModel.findAll(queryFilters);
  const totalPages = Math.ceil(total / limit);

  return { invoices, total, page, limit, totalPages };
}

/**
 * Get a single invoice by ID.
 *
 * @param {number} id - Invoice ID
 * @returns {Promise<object>} Invoice record
 * @throws {Error} If invoice not found
 */
async function getInvoiceById(id) {
  const invoice = await invoiceModel.findById(id);

  if (!invoice) {
    throw Object.assign(new Error('Invoice not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  return invoice;
}

/**
 * Waive all unpaid invoices generated during an extended isolir period.
 * Called from the payment processing flow when a payment is received for an isolir customer.
 *
 * Logic:
 * 1. Verify customer is currently in Isolir status
 * 2. Find the isolir start date from customer_audit_log (most recent transition to 'Isolir')
 * 3. Calculate duration: if > 30 days, trigger waiver
 * 4. Find all UNPAID invoices generated during the isolir period
 * 5. Mark those invoices as WAIVED with reason "Extended Isolir"
 * 6. Return summary with waived invoices and total waived amount
 *
 * @param {number} customerId - Customer ID
 * @returns {Promise<{waived: boolean, waivedInvoices: Array, totalWaivedAmount: number, isolirDays: number}>}
 * @throws {Error} If customer not found or not in Isolir status
 *
 * Requirements: 11.1, 11.2
 */
async function waiveExtendedIsolir(customerId) {
  // 1. Verify customer exists and is in Isolir status
  const customer = await customerModel.findById(customerId);
  if (!customer) {
    throw Object.assign(new Error('Customer not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (customer.lifecycle_status !== CUSTOMER_STATUS.ISOLIR) {
    throw Object.assign(
      new Error(`Customer is not in Isolir status. Current status: '${customer.lifecycle_status}'.`),
      {
        statusCode: 400,
        code: ERROR_CODE.INVALID_STATUS_TRANSITION,
      }
    );
  }

  // 2. Find the most recent isolir start date from customer_audit_log
  const [auditRows] = await appPool.execute(
    `SELECT changed_at FROM customer_audit_log
     WHERE customer_id = ? AND new_status = 'Isolir'
     ORDER BY changed_at DESC LIMIT 1`,
    [customerId]
  );

  if (auditRows.length === 0) {
    throw Object.assign(new Error('Isolir start date not found in audit log.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  const isolirStartDate = new Date(auditRows[0].changed_at);
  const now = new Date();

  // 3. Calculate duration in days
  const isolirDays = Math.floor((now - isolirStartDate) / (1000 * 60 * 60 * 24));

  // If isolir duration is 30 days or less, no waiver needed
  if (isolirDays <= 30) {
    return {
      waived: false,
      waivedInvoices: [],
      totalWaivedAmount: 0,
      isolirDays,
    };
  }

  // 4. Find all UNPAID invoices for this customer generated during the isolir period
  const isolirStartStr = isolirStartDate.toISOString().slice(0, 10);
  const [unpaidInvoices] = await appPool.execute(
    `SELECT * FROM invoices
     WHERE customer_id = ? AND status = ? AND generation_date >= ?
     ORDER BY generation_date ASC`,
    [customerId, INVOICE_STATUS.UNPAID, isolirStartStr]
  );

  if (unpaidInvoices.length === 0) {
    return {
      waived: false,
      waivedInvoices: [],
      totalWaivedAmount: 0,
      isolirDays,
    };
  }

  // 5. Waive all unpaid invoices during isolir period
  const waivedInvoices = [];
  let totalWaivedAmount = 0;

  for (const invoice of unpaidInvoices) {
    await invoiceModel.update(invoice.id, {
      status: INVOICE_STATUS.WAIVED,
      waiver_reason: 'Extended Isolir',
    });

    const waivedAmount = parseFloat(invoice.total_amount);
    totalWaivedAmount += waivedAmount;
    waivedInvoices.push({
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      billing_period: invoice.billing_period,
      waived_amount: waivedAmount,
    });
  }

  // 6. Record waiver summary in audit (log for audit purposes)
  // The individual invoice updates already record the waiver_reason per invoice.
  // We round the total for consistency.
  totalWaivedAmount = Math.round(totalWaivedAmount * 100) / 100;

  return {
    waived: true,
    waivedInvoices,
    totalWaivedAmount,
    isolirDays,
  };
}

module.exports = {
  generateInvoice,
  waiveInvoice,
  waiveExtendedIsolir,
  getInvoices,
  getInvoiceById,
  PPN_RATE,
};
