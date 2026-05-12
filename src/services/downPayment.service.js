/**
 * Down Payment (DP) service.
 * Handles business logic for recording, retrieving, and applying down payments.
 *
 * Requirements: 46.1, 46.2, 46.3, 46.4
 */

const downPaymentModel = require('../models/downPayment.model');

/**
 * Record a new down payment for a customer.
 * @param {number} customerId - Customer ID
 * @param {number} amount - DP amount (must be > 0)
 * @param {string} paymentDate - Payment date (YYYY-MM-DD)
 * @param {number} recordedBy - User ID of the agent recording the DP
 * @returns {Promise<object>} Created down payment record
 * @throws {Error} If amount is invalid
 */
async function recordDP(customerId, amount, paymentDate, recordedBy) {
  if (!amount || amount <= 0) {
    throw new Error('Down payment amount must be greater than zero');
  }

  const dp = await downPaymentModel.create({
    customer_id: customerId,
    amount,
    payment_date: paymentDate,
    received_by: recordedBy,
  });

  return dp;
}

/**
 * Get all down payment records for a customer.
 * @param {number} customerId - Customer ID
 * @returns {Promise<Array>} List of down payment records
 */
async function getDP(customerId) {
  return downPaymentModel.findByCustomerId(customerId);
}

/**
 * Apply available DP balance to an invoice total.
 * Deducts DP from the invoice total. If DP > invoice total, the excess is
 * carried over as a new unapplied DP record for future invoices.
 * When DP is fully consumed, it is marked as applied (Exhausted).
 *
 * @param {number} customerId - Customer ID
 * @param {number} invoiceTotal - The invoice total to deduct from
 * @param {number} [invoiceId] - Optional invoice ID to link the applied DP
 * @returns {Promise<{deductionAmount: number, remainingDP: number}>}
 *   deductionAmount: how much was deducted from the invoice
 *   remainingDP: how much DP credit remains for future invoices
 */
async function applyDPToInvoice(customerId, invoiceTotal, invoiceId = null) {
  if (invoiceTotal <= 0) {
    return { deductionAmount: 0, remainingDP: await getDPBalance(customerId) };
  }

  const unappliedDPs = await downPaymentModel.findUnappliedByCustomerId(customerId);

  if (unappliedDPs.length === 0) {
    return { deductionAmount: 0, remainingDP: 0 };
  }

  let remainingInvoice = invoiceTotal;
  let totalDeduction = 0;

  for (const dp of unappliedDPs) {
    if (remainingInvoice <= 0) break;

    const dpAmount = parseFloat(dp.amount);

    if (dpAmount <= remainingInvoice) {
      // DP is fully consumed by this invoice
      totalDeduction += dpAmount;
      remainingInvoice -= dpAmount;

      if (invoiceId) {
        await downPaymentModel.markApplied(dp.id, invoiceId);
      } else {
        await downPaymentModel.markApplied(dp.id, null);
      }
    } else {
      // DP exceeds remaining invoice — partial application with carry-over
      totalDeduction += remainingInvoice;
      const carryOverAmount = dpAmount - remainingInvoice;
      remainingInvoice = 0;

      // Mark original DP as applied
      await downPaymentModel.updateAmount(dp.id, remainingInvoice === 0 ? totalDeduction : dpAmount - carryOverAmount);
      if (invoiceId) {
        await downPaymentModel.markApplied(dp.id, invoiceId);
      } else {
        await downPaymentModel.markApplied(dp.id, null);
      }

      // Create carry-over record for the remaining credit
      await downPaymentModel.createCarryOver({
        customer_id: customerId,
        amount: carryOverAmount,
        payment_date: dp.payment_date,
        received_by: dp.received_by,
      });
    }
  }

  const remainingDP = await getDPBalance(customerId);

  return { deductionAmount: totalDeduction, remainingDP };
}

/**
 * Get the remaining DP balance for a customer.
 * @param {number} customerId - Customer ID
 * @returns {Promise<number>} Total unapplied DP balance
 */
async function getDPBalance(customerId) {
  return downPaymentModel.getBalance(customerId);
}

module.exports = {
  recordDP,
  getDP,
  applyDPToInvoice,
  getDPBalance,
};
