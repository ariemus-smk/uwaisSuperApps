/**
 * Property-based tests for Down Payment Deduction.
 *
 * **Validates: Requirements 46.2, 46.3**
 *
 * Property 13: Down Payment Deduction
 * For any invoice total T and down payment amount DP, the final invoice amount
 * SHALL equal max(0, T - DP). If DP > T, the remaining credit (DP - T) SHALL be
 * recorded as carry-over for the next billing cycle.
 *
 * Properties verified:
 * 1. When DP <= invoice total: deducted_amount = DP, final_total = invoice_total - DP
 * 2. When DP > invoice total: deducted_amount = invoice_total, carry_over = DP - invoice_total, final_total = 0
 * 3. DP deduction should never result in negative invoice total
 */

const fc = require('fast-check');

/**
 * Pure function implementing the down payment deduction logic as specified
 * in the billing service. This mirrors the logic in billing.service.js:
 * - actualDpDeduction = min(dpAmount, totalBeforeDp)
 * - totalAmount = max(0, totalBeforeDp - dpAmount)
 * - carryOver = max(0, dpAmount - totalBeforeDp)
 *
 * @param {number} invoiceTotal - The invoice total before DP deduction (>= 0)
 * @param {number} dpAmount - The down payment amount to deduct (>= 0)
 * @returns {{ deductedAmount: number, finalTotal: number, carryOver: number }}
 */
function applyDownPaymentDeduction(invoiceTotal, dpAmount) {
  const deductedAmount = Math.min(dpAmount, invoiceTotal);
  const finalTotal = Math.max(0, Math.round((invoiceTotal - dpAmount) * 100) / 100);
  const carryOver = Math.max(0, Math.round((dpAmount - invoiceTotal) * 100) / 100);

  return { deductedAmount, finalTotal, carryOver };
}

/**
 * Generator for positive monetary amounts (simulating invoice totals and DP amounts).
 * Uses integers in cents to avoid floating point issues, then converts to currency.
 */
const positiveAmountArb = fc.integer({ min: 1, max: 100000000 }).map((cents) => cents / 100);

/**
 * Generator for non-negative monetary amounts (including zero).
 */
const nonNegativeAmountArb = fc.integer({ min: 0, max: 100000000 }).map((cents) => cents / 100);

describe('Property 13: Down Payment Deduction', () => {
  describe('When DP <= invoice total', () => {
    it('deducted_amount equals DP and final_total equals invoice_total - DP', () => {
      fc.assert(
        fc.property(
          positiveAmountArb,
          positiveAmountArb,
          (invoiceTotal, dpAmount) => {
            // Constrain: DP <= invoice total
            fc.pre(dpAmount <= invoiceTotal);

            const result = applyDownPaymentDeduction(invoiceTotal, dpAmount);

            // deducted_amount should equal the full DP
            const deductedCorrect = Math.abs(result.deductedAmount - dpAmount) < 0.01;

            // final_total should equal invoice_total - DP
            const expectedFinal = Math.round((invoiceTotal - dpAmount) * 100) / 100;
            const finalCorrect = Math.abs(result.finalTotal - expectedFinal) < 0.01;

            // No carry-over when DP <= invoice total
            const noCarryOver = result.carryOver === 0;

            return deductedCorrect && finalCorrect && noCarryOver;
          }
        ),
        { numRuns: 1000 }
      );
    });
  });

  describe('When DP > invoice total', () => {
    it('deducted_amount equals invoice_total, carry_over equals DP - invoice_total, final_total equals 0', () => {
      fc.assert(
        fc.property(
          positiveAmountArb,
          positiveAmountArb,
          (invoiceTotal, dpAmount) => {
            // Constrain: DP > invoice total
            fc.pre(dpAmount > invoiceTotal);

            const result = applyDownPaymentDeduction(invoiceTotal, dpAmount);

            // deducted_amount should equal the invoice total (can't deduct more than the invoice)
            const deductedCorrect = Math.abs(result.deductedAmount - invoiceTotal) < 0.01;

            // final_total should be 0 (fully covered by DP)
            const finalCorrect = result.finalTotal === 0;

            // carry_over should equal DP - invoice_total
            const expectedCarryOver = Math.round((dpAmount - invoiceTotal) * 100) / 100;
            const carryOverCorrect = Math.abs(result.carryOver - expectedCarryOver) < 0.01;

            return deductedCorrect && finalCorrect && carryOverCorrect;
          }
        ),
        { numRuns: 1000 }
      );
    });
  });

  describe('DP deduction never results in negative invoice total', () => {
    it('final_total is always >= 0 for any positive DP and invoice total', () => {
      fc.assert(
        fc.property(
          nonNegativeAmountArb,
          nonNegativeAmountArb,
          (invoiceTotal, dpAmount) => {
            const result = applyDownPaymentDeduction(invoiceTotal, dpAmount);

            return result.finalTotal >= 0;
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('deducted_amount + carry_over always equals the original DP amount', () => {
      fc.assert(
        fc.property(
          positiveAmountArb,
          positiveAmountArb,
          (invoiceTotal, dpAmount) => {
            const result = applyDownPaymentDeduction(invoiceTotal, dpAmount);

            // The DP is either fully deducted or split between deduction and carry-over
            const sum = Math.round((result.deductedAmount + result.carryOver) * 100) / 100;
            return Math.abs(sum - dpAmount) < 0.01;
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('deducted_amount never exceeds the invoice total', () => {
      fc.assert(
        fc.property(
          positiveAmountArb,
          positiveAmountArb,
          (invoiceTotal, dpAmount) => {
            const result = applyDownPaymentDeduction(invoiceTotal, dpAmount);

            return result.deductedAmount <= invoiceTotal + 0.01;
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('deducted_amount never exceeds the DP amount', () => {
      fc.assert(
        fc.property(
          positiveAmountArb,
          positiveAmountArb,
          (invoiceTotal, dpAmount) => {
            const result = applyDownPaymentDeduction(invoiceTotal, dpAmount);

            return result.deductedAmount <= dpAmount + 0.01;
          }
        ),
        { numRuns: 1000 }
      );
    });
  });
});
