/**
 * Invoice model for App DB.
 * Provides data access methods for the `invoices` table.
 * Tracks invoice lifecycle: UNPAID -> LUNAS | WAIVED | CANCELLED.
 *
 * Requirements: 6.2, 6.3, 6.4, 11.1, 11.2
 */

const { appPool } = require('../config/database');
const { INVOICE_STATUS } = require('../utils/constants');

/**
 * Find an invoice by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Invoice record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    'SELECT * FROM invoices WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find an invoice by invoice number.
 * @param {string} invoiceNumber
 * @returns {Promise<object|null>} Invoice record or null
 */
async function findByInvoiceNumber(invoiceNumber) {
  const [rows] = await appPool.execute(
    'SELECT * FROM invoices WHERE invoice_number = ? LIMIT 1',
    [invoiceNumber]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find invoices by subscription ID and billing period.
 * @param {number} subscriptionId
 * @param {string} billingPeriod - Format YYYY-MM
 * @returns {Promise<object|null>} Invoice record or null
 */
async function findBySubscriptionAndPeriod(subscriptionId, billingPeriod) {
  const [rows] = await appPool.execute(
    'SELECT * FROM invoices WHERE subscription_id = ? AND billing_period = ? LIMIT 1',
    [subscriptionId, billingPeriod]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find all invoices for a customer.
 * @param {number} customerId
 * @returns {Promise<Array>} List of invoice records
 */
async function findByCustomerId(customerId) {
  const [rows] = await appPool.execute(
    'SELECT * FROM invoices WHERE customer_id = ? ORDER BY created_at DESC',
    [customerId]
  );
  return rows;
}

/**
 * Find all invoices for a subscription.
 * @param {number} subscriptionId
 * @returns {Promise<Array>} List of invoice records
 */
async function findBySubscriptionId(subscriptionId) {
  const [rows] = await appPool.execute(
    'SELECT * FROM invoices WHERE subscription_id = ? ORDER BY created_at DESC',
    [subscriptionId]
  );
  return rows;
}

/**
 * List invoices with optional filters and pagination.
 * Supports branch scoping via customer's branch_id.
 * @param {object} [filters={}] - Optional filters
 * @param {number} [filters.branch_id] - Filter by customer's branch
 * @param {number} [filters.customer_id] - Filter by customer
 * @param {number} [filters.subscription_id] - Filter by subscription
 * @param {string} [filters.status] - Filter by invoice status
 * @param {string} [filters.billing_period] - Filter by billing period (YYYY-MM)
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @returns {Promise<{invoices: Array, total: number}>} Paginated invoice list
 */
async function findAll(filters = {}) {
  const { branch_id, customer_id, subscription_id, status, billing_period, page = 1, limit = 20 } = filters;

  let countQuery = `SELECT COUNT(*) as total FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id WHERE 1=1`;
  let dataQuery = `SELECT i.*, c.full_name AS customer_name, c.branch_id,
    s.pppoe_username, p.name AS package_name, p.service_type
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    LEFT JOIN subscriptions s ON i.subscription_id = s.id
    LEFT JOIN packages p ON s.package_id = p.id
    WHERE 1=1`;
  const params = [];

  if (branch_id) {
    countQuery += ' AND c.branch_id = ?';
    dataQuery += ' AND c.branch_id = ?';
    params.push(branch_id);
  }

  if (customer_id) {
    countQuery += ' AND i.customer_id = ?';
    dataQuery += ' AND i.customer_id = ?';
    params.push(customer_id);
  }

  if (subscription_id) {
    countQuery += ' AND i.subscription_id = ?';
    dataQuery += ' AND i.subscription_id = ?';
    params.push(subscription_id);
  }

  if (status) {
    countQuery += ' AND i.status = ?';
    dataQuery += ' AND i.status = ?';
    params.push(status);
  }

  if (billing_period) {
    countQuery += ' AND i.billing_period = ?';
    dataQuery += ' AND i.billing_period = ?';
    params.push(billing_period);
  }

  const [countRows] = await appPool.execute(countQuery, params);
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  dataQuery += ' ORDER BY i.created_at DESC LIMIT ? OFFSET ?';
  const dataParams = [...params, String(limit), String(offset)];

  const [rows] = await appPool.execute(dataQuery, dataParams);

  return { invoices: rows, total };
}

/**
 * Create a new invoice record.
 * @param {object} data - Invoice data
 * @param {string} data.invoice_number - Unique invoice number
 * @param {number} data.customer_id
 * @param {number} data.subscription_id
 * @param {string} data.billing_period - Format YYYY-MM
 * @param {number} data.base_amount
 * @param {number} data.ppn_amount
 * @param {number} [data.installation_fee=0]
 * @param {number} [data.addon_charges=0]
 * @param {number} [data.dp_deduction=0]
 * @param {number} data.total_amount
 * @param {string} [data.status='UNPAID']
 * @param {string} data.due_date - Format YYYY-MM-DD
 * @param {string} data.generation_date - Format YYYY-MM-DD
 * @returns {Promise<object>} Created invoice with insertId
 */
async function create(data) {
  const {
    invoice_number,
    customer_id,
    subscription_id,
    billing_period,
    base_amount,
    ppn_amount,
    installation_fee = 0,
    addon_charges = 0,
    dp_deduction = 0,
    total_amount,
    status = INVOICE_STATUS.UNPAID,
    due_date,
    generation_date,
  } = data;

  const [result] = await appPool.execute(
    `INSERT INTO invoices (invoice_number, customer_id, subscription_id, billing_period,
      base_amount, ppn_amount, installation_fee, addon_charges, dp_deduction, total_amount,
      status, due_date, generation_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      invoice_number, customer_id, subscription_id, billing_period,
      base_amount, ppn_amount, installation_fee, addon_charges, dp_deduction, total_amount,
      status, due_date, generation_date,
    ]
  );

  return { id: result.insertId, ...data, status };
}

/**
 * Update an invoice record.
 * @param {number} id - Invoice ID
 * @param {object} updateData - Fields to update
 * @returns {Promise<object>} Query result
 */
async function update(id, updateData) {
  const allowedFields = [
    'status', 'waiver_reason', 'paid_at', 'payment_method',
  ];
  const setClauses = [];
  const params = [];

  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      params.push(updateData[field]);
    }
  }

  if (setClauses.length === 0) {
    return { affectedRows: 0 };
  }

  params.push(id);

  const [result] = await appPool.execute(
    `UPDATE invoices SET ${setClauses.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Find unpaid invoices past due date for auto-isolir.
 * @param {string} dueDate - Due date to check against (YYYY-MM-DD)
 * @returns {Promise<Array>} List of unpaid invoices past due
 */
async function findUnpaidPastDue(dueDate) {
  const [rows] = await appPool.execute(
    `SELECT i.*, s.pppoe_username, s.nas_id, c.branch_id
     FROM invoices i
     LEFT JOIN subscriptions s ON i.subscription_id = s.id
     LEFT JOIN customers c ON i.customer_id = c.id
     WHERE i.status = ? AND i.due_date <= ?`,
    [INVOICE_STATUS.UNPAID, dueDate]
  );
  return rows;
}

/**
 * Count invoices for a subscription with a given status.
 * @param {number} subscriptionId
 * @param {string} status
 * @returns {Promise<number>} Count
 */
async function countBySubscriptionAndStatus(subscriptionId, status) {
  const [rows] = await appPool.execute(
    'SELECT COUNT(*) AS count FROM invoices WHERE subscription_id = ? AND status = ?',
    [subscriptionId, status]
  );
  return rows[0].count;
}

/**
 * Generate the next invoice number.
 * Format: INV-YYYYMM-XXXXX (sequential per month).
 * @param {string} billingPeriod - Format YYYY-MM
 * @returns {Promise<string>} Generated invoice number
 */
async function generateInvoiceNumber(billingPeriod) {
  const prefix = `INV-${billingPeriod.replace('-', '')}-`;

  const [rows] = await appPool.execute(
    `SELECT invoice_number FROM invoices
     WHERE invoice_number LIKE ?
     ORDER BY invoice_number DESC LIMIT 1`,
    [`${prefix}%`]
  );

  let sequence = 1;
  if (rows.length > 0) {
    const lastNumber = rows[0].invoice_number;
    const lastSeq = parseInt(lastNumber.replace(prefix, ''), 10);
    if (!isNaN(lastSeq)) {
      sequence = lastSeq + 1;
    }
  }

  return `${prefix}${String(sequence).padStart(5, '0')}`;
}

module.exports = {
  findById,
  findByInvoiceNumber,
  findBySubscriptionAndPeriod,
  findByCustomerId,
  findBySubscriptionId,
  findAll,
  create,
  update,
  findUnpaidPastDue,
  countBySubscriptionAndStatus,
  generateInvoiceNumber,
};
