/**
 * Merchant payment service.
 * Handles Merchant balance management, payment processing, and commission calculation.
 * Merchants are payment collection points that earn a fixed admin-defined commission per transaction.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

const { appPool } = require('../config/database');
const invoiceModel = require('../models/invoice.model');
const paymentModel = require('../models/payment.model');
const userModel = require('../models/user.model');
const { INVOICE_STATUS, PAYMENT_STATUS, PAYMENT_METHOD, USER_ROLE, ERROR_CODE } = require('../utils/constants');

/**
 * Verify that a user exists and has the Merchant role.
 * @param {number} merchantUserId - User ID to verify
 * @returns {Promise<object>} Merchant user record
 * @throws {Error} If user not found or not a Merchant
 */
async function verifyMerchantRole(merchantUserId) {
  const user = await userModel.findById(merchantUserId);

  if (!user) {
    throw Object.assign(new Error('User not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (user.role !== USER_ROLE.MERCHANT) {
    throw Object.assign(new Error('User is not a Merchant.'), {
      statusCode: 403,
      code: ERROR_CODE.AUTH_FORBIDDEN,
    });
  }

  return user;
}

/**
 * Top up a Merchant's saldo balance.
 * Records the topup transaction and increases the Merchant saldo in the users table.
 *
 * @param {number} merchantUserId - Merchant user ID
 * @param {number} amount - Topup amount (must be > 0)
 * @param {string} reference - Topup reference (e.g., transfer receipt number)
 * @returns {Promise<object>} Saldo transaction record
 * @throws {Error} If user is not a Merchant or amount is invalid
 */
async function topup(merchantUserId, amount, reference) {
  const merchant = await verifyMerchantRole(merchantUserId);

  if (!amount || amount <= 0) {
    throw Object.assign(new Error('Topup amount must be greater than zero.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const connection = await appPool.getConnection();
  try {
    await connection.beginTransaction();

    // Update saldo in users table
    const currentSaldo = parseFloat(merchant.saldo) || 0;
    const newSaldo = currentSaldo + amount;

    await connection.execute(
      'UPDATE users SET saldo = ?, updated_at = NOW() WHERE id = ?',
      [newSaldo, merchantUserId]
    );

    // Create saldo_transaction record
    const [result] = await connection.execute(
      `INSERT INTO saldo_transactions (user_id, type, amount, balance_after, reference, created_at)
       VALUES (?, 'Topup', ?, ?, ?, NOW())`,
      [merchantUserId, amount, newSaldo, reference || null]
    );

    await connection.commit();

    return {
      id: result.insertId,
      user_id: merchantUserId,
      type: 'Topup',
      amount,
      balance_after: newSaldo,
      reference: reference || null,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Process a customer payment via Merchant.
 * Validates sufficient saldo, deducts payment amount from Merchant saldo,
 * marks the invoice as LUNAS, records the admin fee (commission), and creates a saldo_transaction record.
 *
 * @param {number} merchantUserId - Merchant user ID
 * @param {number} invoiceId - Invoice ID to pay
 * @returns {Promise<object>} Payment result with payment record and updated balance
 * @throws {Error} If insufficient saldo, invoice not found, or user is not a Merchant
 */
async function processPayment(merchantUserId, invoiceId) {
  const merchant = await verifyMerchantRole(merchantUserId);

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
      new Error(`Invoice is not in UNPAID status. Current status: ${invoice.status}`),
      {
        statusCode: 400,
        code: ERROR_CODE.INVALID_STATUS_TRANSITION,
      }
    );
  }

  const paymentAmount = parseFloat(invoice.total_amount);
  const currentSaldo = parseFloat(merchant.saldo) || 0;

  // Validate sufficient saldo
  if (currentSaldo < paymentAmount) {
    throw Object.assign(
      new Error('Insufficient balance. Please top up your saldo before processing this payment.'),
      {
        statusCode: 400,
        code: ERROR_CODE.INSUFFICIENT_BALANCE,
      }
    );
  }

  // Get commission amount for this Merchant
  const commissionAmount = parseFloat(merchant.commission_amount) || 0;

  const connection = await appPool.getConnection();
  try {
    await connection.beginTransaction();

    // Deduct payment amount from Merchant saldo
    const newSaldo = currentSaldo - paymentAmount;

    await connection.execute(
      'UPDATE users SET saldo = ?, updated_at = NOW() WHERE id = ?',
      [newSaldo, merchantUserId]
    );

    // Create saldo_transaction record for the deduction
    await connection.execute(
      `INSERT INTO saldo_transactions (user_id, type, amount, balance_after, reference, created_at)
       VALUES (?, 'Deduction', ?, ?, ?, NOW())`,
      [merchantUserId, paymentAmount, newSaldo, `invoice_${invoiceId}`]
    );

    // Mark invoice as LUNAS
    const paidAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await connection.execute(
      'UPDATE invoices SET status = ?, paid_at = ?, payment_method = ? WHERE id = ?',
      [INVOICE_STATUS.LUNAS, paidAt, PAYMENT_METHOD.MERCHANT, invoiceId]
    );

    // Create payment record with admin fee (commission)
    const [paymentResult] = await connection.execute(
      `INSERT INTO payments (invoice_id, amount, method, tripay_reference, processed_by, admin_fee, status, paid_at, created_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NOW())`,
      [invoiceId, paymentAmount, PAYMENT_METHOD.MERCHANT, merchantUserId, commissionAmount, PAYMENT_STATUS.SUCCESS, paidAt]
    );

    await connection.commit();

    return {
      payment: {
        id: paymentResult.insertId,
        invoice_id: invoiceId,
        amount: paymentAmount,
        method: PAYMENT_METHOD.MERCHANT,
        processed_by: merchantUserId,
        admin_fee: commissionAmount,
        status: PAYMENT_STATUS.SUCCESS,
        paid_at: paidAt,
      },
      balance_after: newSaldo,
      commission: commissionAmount,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Get the current saldo balance for a Merchant.
 *
 * @param {number} merchantUserId - Merchant user ID
 * @returns {Promise<object>} Balance information
 * @throws {Error} If user is not a Merchant
 */
async function getBalance(merchantUserId) {
  const merchant = await verifyMerchantRole(merchantUserId);

  return {
    user_id: merchantUserId,
    full_name: merchant.full_name,
    saldo: parseFloat(merchant.saldo) || 0,
    commission_amount: parseFloat(merchant.commission_amount) || 0,
  };
}

/**
 * Get the fixed commission amount configured for a Merchant.
 * The commission is defined by Admin and stored in users.commission_amount.
 *
 * @param {number} merchantUserId - Merchant user ID
 * @returns {Promise<number>} Commission amount per transaction
 * @throws {Error} If user is not a Merchant
 */
async function calculateCommission(merchantUserId) {
  const merchant = await verifyMerchantRole(merchantUserId);
  return parseFloat(merchant.commission_amount) || 0;
}

module.exports = {
  topup,
  processPayment,
  getBalance,
  calculateCommission,
};
