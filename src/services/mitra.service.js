/**
 * Mitra payment service.
 * Handles Mitra balance management, payment processing, profit sharing,
 * and revenue reporting.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

const { appPool } = require('../config/database');
const userModel = require('../models/user.model');
const invoiceModel = require('../models/invoice.model');
const { USER_ROLE, INVOICE_STATUS, ERROR_CODE } = require('../utils/constants');

/**
 * Verify that a user exists and has the Mitra role.
 * @param {number} mitraUserId - User ID to verify
 * @returns {Promise<object>} Mitra user record
 * @throws {Error} If user not found or not a Mitra
 */
async function verifyMitraRole(mitraUserId) {
  const user = await userModel.findById(mitraUserId);

  if (!user) {
    throw Object.assign(new Error('User not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (user.role !== USER_ROLE.MITRA) {
    throw Object.assign(new Error('User is not a Mitra. Only Mitra accounts can perform this operation.'), {
      statusCode: 403,
      code: ERROR_CODE.AUTH_FORBIDDEN,
    });
  }

  return user;
}

/**
 * Top up Mitra balance.
 * Records the topup transaction and increases the Mitra saldo in the users table.
 *
 * @param {number} mitraUserId - Mitra user ID
 * @param {number} amount - Topup amount (must be positive)
 * @param {string} reference - Topup reference (e.g., transfer receipt number)
 * @returns {Promise<object>} Topup transaction record with new balance
 * @throws {Error} If user not found, not a Mitra, or invalid amount
 */
async function topup(mitraUserId, amount, reference) {
  const mitra = await verifyMitraRole(mitraUserId);

  if (!amount || amount <= 0) {
    throw Object.assign(new Error('Topup amount must be greater than zero.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  if (!reference || reference.trim().length === 0) {
    throw Object.assign(new Error('Topup reference is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const connection = await appPool.getConnection();
  try {
    await connection.beginTransaction();

    // Update saldo in users table
    const currentSaldo = parseFloat(mitra.saldo) || 0;
    const newSaldo = currentSaldo + parseFloat(amount);

    await connection.execute(
      'UPDATE users SET saldo = ?, updated_at = NOW() WHERE id = ?',
      [newSaldo, mitraUserId]
    );

    // Create saldo_transaction record
    const [result] = await connection.execute(
      `INSERT INTO saldo_transactions (user_id, type, amount, balance_after, reference, created_at)
       VALUES (?, 'Topup', ?, ?, ?, NOW())`,
      [mitraUserId, amount, newSaldo, reference.trim()]
    );

    await connection.commit();

    return {
      id: result.insertId,
      user_id: mitraUserId,
      type: 'Topup',
      amount: parseFloat(amount),
      balance_after: newSaldo,
      reference: reference.trim(),
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Process a customer payment via Mitra.
 * Validates sufficient saldo, deducts payment amount from Mitra saldo,
 * marks the invoice as LUNAS, creates a saldo_transaction record,
 * and calculates profit sharing.
 *
 * @param {number} mitraUserId - Mitra user ID
 * @param {number} invoiceId - Invoice ID to pay
 * @returns {Promise<object>} Payment result with profit sharing details
 * @throws {Error} If insufficient balance, invoice not found, or invoice already paid
 */
async function processPayment(mitraUserId, invoiceId) {
  const mitra = await verifyMitraRole(mitraUserId);

  // Fetch the invoice
  const invoice = await invoiceModel.findById(invoiceId);

  if (!invoice) {
    throw Object.assign(new Error('Invoice not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (invoice.status !== INVOICE_STATUS.UNPAID) {
    throw Object.assign(
      new Error(`Invoice is already ${invoice.status}. Only UNPAID invoices can be processed.`),
      {
        statusCode: 400,
        code: ERROR_CODE.INVALID_STATUS_TRANSITION,
      }
    );
  }

  const paymentAmount = parseFloat(invoice.total_amount);
  const currentSaldo = parseFloat(mitra.saldo) || 0;

  // Validate sufficient saldo (Requirement 9.6)
  if (currentSaldo < paymentAmount) {
    throw Object.assign(
      new Error(`Insufficient balance. Current saldo: ${currentSaldo}, required: ${paymentAmount}.`),
      {
        statusCode: 400,
        code: ERROR_CODE.INSUFFICIENT_BALANCE,
      }
    );
  }

  // Calculate profit sharing (Requirement 9.4)
  const profitSharing = calculateProfitSharing(mitra, invoice.base_amount);

  const connection = await appPool.getConnection();
  try {
    await connection.beginTransaction();

    // Deduct saldo from Mitra
    const newSaldo = currentSaldo - paymentAmount;

    await connection.execute(
      'UPDATE users SET saldo = ?, updated_at = NOW() WHERE id = ?',
      [newSaldo, mitraUserId]
    );

    // Create saldo_transaction record for the deduction
    const [saldoTxResult] = await connection.execute(
      `INSERT INTO saldo_transactions (user_id, type, amount, balance_after, reference, created_at)
       VALUES (?, 'Deduction', ?, ?, ?, NOW())`,
      [mitraUserId, paymentAmount, newSaldo, `invoice_${invoiceId}`]
    );

    // Mark invoice as LUNAS
    await connection.execute(
      `UPDATE invoices SET status = ?, paid_at = NOW(), payment_method = 'Mitra' WHERE id = ?`,
      [INVOICE_STATUS.LUNAS, invoiceId]
    );

    await connection.commit();

    return {
      invoice_id: invoiceId,
      payment_amount: paymentAmount,
      new_saldo: newSaldo,
      profit_sharing: profitSharing,
      saldo_transaction_id: saldoTxResult.insertId,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Get current Mitra saldo balance.
 *
 * @param {number} mitraUserId - Mitra user ID
 * @returns {Promise<object>} Balance information
 * @throws {Error} If user not found or not a Mitra
 */
async function getBalance(mitraUserId) {
  const mitra = await verifyMitraRole(mitraUserId);

  return {
    user_id: mitraUserId,
    full_name: mitra.full_name,
    saldo: parseFloat(mitra.saldo) || 0,
    profit_sharing_pct: parseFloat(mitra.profit_sharing_pct) || 0,
  };
}

/**
 * Generate a revenue report for a Mitra.
 * Shows: total payments received, profit sharing earned, current saldo, transaction history.
 *
 * @param {number} mitraUserId - Mitra user ID
 * @param {object} [options={}] - Report options
 * @param {string} [options.startDate] - Start date filter (YYYY-MM-DD)
 * @param {string} [options.endDate] - End date filter (YYYY-MM-DD)
 * @param {number} [options.page=1] - Page number for transaction history
 * @param {number} [options.limit=20] - Items per page
 * @returns {Promise<object>} Revenue report
 * @throws {Error} If user not found or not a Mitra
 */
async function getReport(mitraUserId, options = {}) {
  const mitra = await verifyMitraRole(mitraUserId);

  const { startDate, endDate, page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  // Build date filter clause
  let dateFilter = '';
  const dateParams = [];
  if (startDate) {
    dateFilter += ' AND created_at >= ?';
    dateParams.push(startDate);
  }
  if (endDate) {
    dateFilter += ' AND created_at <= ?';
    dateParams.push(`${endDate} 23:59:59`);
  }

  // Total payments received (sum of Deduction transactions)
  const [paymentRows] = await appPool.execute(
    `SELECT COUNT(*) AS total_payments, COALESCE(SUM(amount), 0) AS total_amount
     FROM saldo_transactions
     WHERE user_id = ? AND type = 'Deduction'${dateFilter}`,
    [mitraUserId, ...dateParams]
  );

  const totalPayments = paymentRows[0].total_payments;
  const totalPaymentAmount = parseFloat(paymentRows[0].total_amount) || 0;

  // Calculate profit sharing earned
  const profitSharingPct = parseFloat(mitra.profit_sharing_pct) || 0;
  const profitSharingEarned = calculateTotalProfitSharing(totalPaymentAmount, profitSharingPct);

  // Total topups
  const [topupRows] = await appPool.execute(
    `SELECT COUNT(*) AS total_topups, COALESCE(SUM(amount), 0) AS total_topup_amount
     FROM saldo_transactions
     WHERE user_id = ? AND type = 'Topup'${dateFilter}`,
    [mitraUserId, ...dateParams]
  );

  // Transaction history with pagination
  const [historyCountRows] = await appPool.execute(
    `SELECT COUNT(*) AS total FROM saldo_transactions WHERE user_id = ?${dateFilter}`,
    [mitraUserId, ...dateParams]
  );
  const totalHistory = historyCountRows[0].total;

  const [historyRows] = await appPool.execute(
    `SELECT * FROM saldo_transactions WHERE user_id = ?${dateFilter}
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [mitraUserId, ...dateParams, String(limit), String(offset)]
  );

  return {
    user_id: mitraUserId,
    full_name: mitra.full_name,
    current_saldo: parseFloat(mitra.saldo) || 0,
    profit_sharing_pct: profitSharingPct,
    summary: {
      total_payments: totalPayments,
      total_payment_amount: totalPaymentAmount,
      profit_sharing_earned: profitSharingEarned,
      total_topups: topupRows[0].total_topups,
      total_topup_amount: parseFloat(topupRows[0].total_topup_amount) || 0,
    },
    transactions: {
      data: historyRows,
      total: totalHistory,
      page,
      limit,
      totalPages: Math.ceil(totalHistory / limit),
    },
  };
}

/**
 * Calculate profit sharing for a single payment.
 * Profit sharing is a flexible percentage of the package base price,
 * configured per Mitra at account creation time.
 *
 * @param {object} mitra - Mitra user record (must include profit_sharing_pct)
 * @param {number} packagePrice - The base package price (base_amount from invoice)
 * @returns {object} Profit sharing details
 */
function calculateProfitSharing(mitra, packagePrice) {
  const profitSharingPct = parseFloat(mitra.profit_sharing_pct) || 0;
  const basePrice = parseFloat(packagePrice) || 0;
  const profitAmount = Math.round((basePrice * profitSharingPct / 100) * 100) / 100;

  return {
    percentage: profitSharingPct,
    base_price: basePrice,
    profit_amount: profitAmount,
  };
}

/**
 * Calculate total profit sharing earned from total payment amount.
 * Note: This is an approximation based on total deductions.
 * For exact calculation, each payment's base_amount should be tracked separately.
 *
 * @param {number} totalPaymentAmount - Total payment amount processed
 * @param {number} profitSharingPct - Profit sharing percentage
 * @returns {number} Total profit sharing earned
 */
function calculateTotalProfitSharing(totalPaymentAmount, profitSharingPct) {
  return Math.round((totalPaymentAmount * profitSharingPct / 100) * 100) / 100;
}

module.exports = {
  topup,
  processPayment,
  getBalance,
  getReport,
  calculateProfitSharing,
};
