/**
 * Down Payment (DP) model for App DB.
 * Provides data access methods for the `down_payments` table.
 * Handles recording, retrieval, and application of customer down payments.
 *
 * Requirements: 46.1, 46.2, 46.3, 46.4
 */

const { appPool } = require('../config/database');

/**
 * Find a down payment by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Down payment record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    'SELECT * FROM down_payments WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find all down payments for a customer.
 * @param {number} customerId
 * @returns {Promise<Array>} List of down payment records
 */
async function findByCustomerId(customerId) {
  const [rows] = await appPool.execute(
    'SELECT * FROM down_payments WHERE customer_id = ? ORDER BY created_at DESC',
    [customerId]
  );
  return rows;
}

/**
 * Find unapplied (available) down payments for a customer.
 * These are DP records that have not yet been fully applied to an invoice.
 * @param {number} customerId
 * @returns {Promise<Array>} List of unapplied down payment records
 */
async function findUnappliedByCustomerId(customerId) {
  const [rows] = await appPool.execute(
    'SELECT * FROM down_payments WHERE customer_id = ? AND applied = 0 ORDER BY created_at ASC',
    [customerId]
  );
  return rows;
}

/**
 * Get total unapplied DP balance for a customer.
 * @param {number} customerId
 * @returns {Promise<number>} Total remaining DP balance
 */
async function getBalance(customerId) {
  const [rows] = await appPool.execute(
    'SELECT COALESCE(SUM(amount), 0) AS balance FROM down_payments WHERE customer_id = ? AND applied = 0',
    [customerId]
  );
  return parseFloat(rows[0].balance);
}

/**
 * Record a new down payment.
 * @param {object} data - Down payment data
 * @param {number} data.customer_id - Customer ID
 * @param {number} data.amount - DP amount
 * @param {string} data.payment_date - Payment date (YYYY-MM-DD)
 * @param {number} data.received_by - User ID of the agent who received the payment
 * @returns {Promise<object>} Created down payment with insertId
 */
async function create(data) {
  const { customer_id, amount, payment_date, received_by } = data;

  const [result] = await appPool.execute(
    `INSERT INTO down_payments (customer_id, amount, payment_date, received_by, applied, created_at)
     VALUES (?, ?, ?, ?, 0, NOW())`,
    [customer_id, amount, payment_date, received_by]
  );

  return { id: result.insertId, ...data, applied: 0, applied_to_invoice_id: null };
}

/**
 * Mark a down payment as applied to a specific invoice.
 * @param {number} id - Down payment ID
 * @param {number} invoiceId - Invoice ID it was applied to
 * @returns {Promise<object>} Query result
 */
async function markApplied(id, invoiceId) {
  const [result] = await appPool.execute(
    'UPDATE down_payments SET applied = 1, applied_to_invoice_id = ? WHERE id = ?',
    [invoiceId, id]
  );
  return result;
}

/**
 * Update the amount of a down payment record (used for partial application / carry-over).
 * When a DP partially covers an invoice, the original record is marked applied and
 * a new record with the remaining amount is created via createCarryOver.
 * @param {number} id - Down payment ID
 * @param {number} newAmount - New amount value
 * @returns {Promise<object>} Query result
 */
async function updateAmount(id, newAmount) {
  const [result] = await appPool.execute(
    'UPDATE down_payments SET amount = ? WHERE id = ?',
    [newAmount, id]
  );
  return result;
}

/**
 * Create a carry-over DP record when DP exceeds invoice total.
 * The carry-over record represents the remaining credit for future invoices.
 * @param {object} data - Carry-over data
 * @param {number} data.customer_id - Customer ID
 * @param {number} data.amount - Remaining amount after deduction
 * @param {string} data.payment_date - Original payment date
 * @param {number} data.received_by - Original receiving agent
 * @returns {Promise<object>} Created carry-over record
 */
async function createCarryOver(data) {
  return create(data);
}

module.exports = {
  findById,
  findByCustomerId,
  findUnappliedByCustomerId,
  getBalance,
  create,
  markApplied,
  updateAmount,
  createCarryOver,
};
