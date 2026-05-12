/**
 * Payment model for App DB.
 * Provides data access methods for the `payments` table.
 * Tracks payment lifecycle: Pending -> Success | Failed | Expired.
 *
 * Requirements: 8.3, 8.4
 */

const { appPool } = require('../config/database');
const { PAYMENT_STATUS } = require('../utils/constants');

/**
 * Create a new payment record.
 * @param {object} paymentData - Payment data
 * @param {number} paymentData.invoice_id - Associated invoice ID
 * @param {number} paymentData.amount - Payment amount
 * @param {string} paymentData.method - Payment method (VA, QRIS, Minimarket, Mitra, Merchant, Cash)
 * @param {string|null} [paymentData.tripay_reference] - Tripay transaction reference
 * @param {number|null} [paymentData.processed_by] - User ID of processor (Mitra/Merchant/Admin)
 * @param {number} [paymentData.admin_fee=0] - Merchant commission/admin fee
 * @param {string} [paymentData.status='Pending'] - Initial payment status
 * @param {string|null} [paymentData.paid_at] - Payment timestamp (ISO string or null)
 * @returns {Promise<object>} Created payment with insertId
 */
async function create(paymentData) {
  const {
    invoice_id,
    amount,
    method,
    tripay_reference = null,
    processed_by = null,
    admin_fee = 0,
    status = PAYMENT_STATUS.PENDING,
    paid_at = null,
  } = paymentData;

  const [result] = await appPool.execute(
    `INSERT INTO payments (invoice_id, amount, method, tripay_reference, processed_by, admin_fee, status, paid_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [invoice_id, amount, method, tripay_reference, processed_by, admin_fee, status, paid_at]
  );

  return { id: result.insertId, ...paymentData, status };
}

/**
 * Find a payment by ID.
 * @param {number} id - Payment ID
 * @returns {Promise<object|null>} Payment record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    'SELECT * FROM payments WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find all payments for a given invoice.
 * @param {number} invoiceId - Invoice ID
 * @returns {Promise<Array>} List of payment records
 */
async function findByInvoiceId(invoiceId) {
  const [rows] = await appPool.execute(
    'SELECT * FROM payments WHERE invoice_id = ? ORDER BY created_at DESC',
    [invoiceId]
  );
  return rows;
}

/**
 * Find a payment by Tripay reference.
 * @param {string} tripayReference - Tripay transaction reference
 * @returns {Promise<object|null>} Payment record or null
 */
async function findByTripayReference(tripayReference) {
  const [rows] = await appPool.execute(
    'SELECT * FROM payments WHERE tripay_reference = ? LIMIT 1',
    [tripayReference]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Update payment status.
 * @param {number} id - Payment ID
 * @param {string} status - New status (Pending, Success, Failed, Expired)
 * @param {object} [extra={}] - Additional fields to update
 * @param {string|null} [extra.paid_at] - Payment timestamp
 * @returns {Promise<object>} Query result
 */
async function updateStatus(id, status, extra = {}) {
  const setClauses = ['status = ?'];
  const params = [status];

  if (extra.paid_at !== undefined) {
    setClauses.push('paid_at = ?');
    params.push(extra.paid_at);
  }

  params.push(id);

  const [result] = await appPool.execute(
    `UPDATE payments SET ${setClauses.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

module.exports = {
  create,
  findById,
  findByInvoiceId,
  findByTripayReference,
  updateStatus,
};
