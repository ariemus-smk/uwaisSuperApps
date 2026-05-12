/**
 * Saldo Transaction model for App DB.
 * Provides data access methods for the `saldo_transactions` table.
 * Tracks Mitra/Merchant balance changes: Topup, Deduction, Refund.
 *
 * Requirements: 9.1, 9.2, 10.1, 10.2
 */

const { appPool } = require('../config/database');

/**
 * Create a new saldo transaction record.
 * @param {object} transactionData - Transaction data
 * @param {number} transactionData.user_id - Mitra or Merchant user ID
 * @param {string} transactionData.type - Transaction type (Topup, Deduction, Refund)
 * @param {number} transactionData.amount - Transaction amount
 * @param {number} transactionData.balance_after - Balance after this transaction
 * @param {string|null} [transactionData.reference] - Reference (invoice_id or topup ref)
 * @returns {Promise<object>} Created transaction with insertId
 */
async function create(transactionData) {
  const {
    user_id,
    type,
    amount,
    balance_after,
    reference = null,
  } = transactionData;

  const [result] = await appPool.execute(
    `INSERT INTO saldo_transactions (user_id, type, amount, balance_after, reference, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [user_id, type, amount, balance_after, reference]
  );

  return { id: result.insertId, ...transactionData };
}

/**
 * Find saldo transactions for a user with pagination.
 * @param {number} userId - User ID (Mitra or Merchant)
 * @param {object} [options={}] - Query options
 * @param {string} [options.type] - Filter by transaction type
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=20] - Items per page
 * @returns {Promise<{transactions: Array, total: number}>} Paginated transaction list
 */
async function findByUserId(userId, options = {}) {
  const { type, page = 1, limit = 20 } = options;

  let countQuery = 'SELECT COUNT(*) as total FROM saldo_transactions WHERE user_id = ?';
  let dataQuery = 'SELECT * FROM saldo_transactions WHERE user_id = ?';
  const params = [userId];

  if (type) {
    countQuery += ' AND type = ?';
    dataQuery += ' AND type = ?';
    params.push(type);
  }

  const [countRows] = await appPool.execute(countQuery, params);
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  dataQuery += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  const dataParams = [...params, String(limit), String(offset)];

  const [rows] = await appPool.execute(dataQuery, dataParams);

  return { transactions: rows, total };
}

/**
 * Get current balance for a user by reading the most recent transaction.
 * Falls back to the user's saldo field if no transactions exist.
 * @param {number} userId - User ID (Mitra or Merchant)
 * @returns {Promise<number>} Current balance
 */
async function getBalance(userId) {
  const [rows] = await appPool.execute(
    'SELECT balance_after FROM saldo_transactions WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1',
    [userId]
  );

  if (rows.length > 0) {
    return parseFloat(rows[0].balance_after);
  }

  // Fallback: read from users table saldo field
  const [userRows] = await appPool.execute(
    'SELECT saldo FROM users WHERE id = ? LIMIT 1',
    [userId]
  );

  if (userRows.length > 0 && userRows[0].saldo !== null) {
    return parseFloat(userRows[0].saldo);
  }

  return 0;
}

module.exports = {
  create,
  findByUserId,
  getBalance,
};
