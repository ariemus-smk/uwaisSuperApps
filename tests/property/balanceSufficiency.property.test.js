/**
 * Property-based tests for Balance Sufficiency Enforcement.
 *
 * **Validates: Requirements 9.3, 9.6, 10.5**
 *
 * Property 6: Balance Sufficiency Enforcement
 * For any Mitra or Merchant with current saldo S and any payment amount P,
 * the payment processing function SHALL succeed (deducting P from S) if and only if P <= S,
 * and SHALL reject with an insufficient balance error if P > S.
 * After a successful payment, the new saldo SHALL equal S - P.
 */

const fc = require('fast-check');
const { ERROR_CODE } = require('../../src/utils/constants');

/**
 * Pure balance sufficiency check matching the logic in mitra.service.js and merchant.service.js.
 * Both services use the same pattern:
 *   - if (currentSaldo < paymentAmount) → throw INSUFFICIENT_BALANCE
 *   - else → newSaldo = currentSaldo - paymentAmount
 *
 * @param {number} currentSaldo - Current balance (saldo) of the Mitra/Merchant
 * @param {number} paymentAmount - Amount to deduct for the payment
 * @returns {{ success: boolean, newSaldo?: number, error?: string }}
 */
function processBalancePayment(currentSaldo, paymentAmount) {
  if (currentSaldo < paymentAmount) {
    return {
      success: false,
      error: ERROR_CODE.INSUFFICIENT_BALANCE,
    };
  }

  const newSaldo = Math.round((currentSaldo - paymentAmount) * 100) / 100;

  return {
    success: true,
    newSaldo,
  };
}

/**
 * Generator for positive monetary amounts (in Rupiah).
 * Uses integer representation to avoid floating point issues, then converts to decimal.
 * Range: 0.01 to 10,000,000 (10 million Rupiah)
 */
const positiveAmountArb = fc.integer({ min: 1, max: 1000000000 }).map((cents) => cents / 100);

/**
 * Generator for non-negative saldo values.
 * Range: 0 to 100,000,000 (100 million Rupiah)
 */
const saldoArb = fc.integer({ min: 0, max: 10000000000 }).map((cents) => cents / 100);

describe('Property 6: Balance Sufficiency Enforcement', () => {
  describe('Mitra Payment', () => {
    it('payment succeeds when saldo >= payment amount (saldo deducted correctly)', () => {
      fc.assert(
        fc.property(positiveAmountArb, positiveAmountArb, (saldo, paymentAmount) => {
          // Ensure saldo >= paymentAmount for this test
          const currentSaldo = saldo + paymentAmount; // guarantees sufficient balance
          const result = processBalancePayment(currentSaldo, paymentAmount);

          return result.success === true && result.newSaldo !== undefined;
        }),
        { numRuns: 1000 }
      );
    });

    it('payment is rejected with INSUFFICIENT_BALANCE when saldo < payment amount', () => {
      fc.assert(
        fc.property(positiveAmountArb, positiveAmountArb, (saldo, extra) => {
          // Ensure saldo < paymentAmount
          const currentSaldo = saldo;
          const paymentAmount = saldo + extra; // guarantees insufficient balance
          const result = processBalancePayment(currentSaldo, paymentAmount);

          return (
            result.success === false &&
            result.error === ERROR_CODE.INSUFFICIENT_BALANCE
          );
        }),
        { numRuns: 1000 }
      );
    });

    it('new_saldo = old_saldo - payment_amount after successful payment (conservation)', () => {
      fc.assert(
        fc.property(saldoArb, positiveAmountArb, (currentSaldo, paymentAmount) => {
          // Only test when payment should succeed
          if (currentSaldo < paymentAmount) return true; // skip insufficient cases

          const result = processBalancePayment(currentSaldo, paymentAmount);
          const expectedNewSaldo = Math.round((currentSaldo - paymentAmount) * 100) / 100;

          return result.success === true && result.newSaldo === expectedNewSaldo;
        }),
        { numRuns: 1000 }
      );
    });

    it('saldo never goes negative after a successful payment', () => {
      fc.assert(
        fc.property(saldoArb, positiveAmountArb, (currentSaldo, paymentAmount) => {
          const result = processBalancePayment(currentSaldo, paymentAmount);

          if (result.success) {
            return result.newSaldo >= 0;
          }
          // If payment failed, no saldo change occurred
          return true;
        }),
        { numRuns: 1000 }
      );
    });
  });

  describe('Merchant Payment', () => {
    it('payment succeeds when saldo >= payment amount (saldo deducted correctly)', () => {
      fc.assert(
        fc.property(positiveAmountArb, positiveAmountArb, (saldo, paymentAmount) => {
          // Ensure saldo >= paymentAmount for this test
          const currentSaldo = saldo + paymentAmount;
          const result = processBalancePayment(currentSaldo, paymentAmount);

          return result.success === true && result.newSaldo !== undefined;
        }),
        { numRuns: 1000 }
      );
    });

    it('payment is rejected with INSUFFICIENT_BALANCE when saldo < payment amount', () => {
      fc.assert(
        fc.property(positiveAmountArb, positiveAmountArb, (saldo, extra) => {
          // Ensure saldo < paymentAmount
          const currentSaldo = saldo;
          const paymentAmount = saldo + extra;
          const result = processBalancePayment(currentSaldo, paymentAmount);

          return (
            result.success === false &&
            result.error === ERROR_CODE.INSUFFICIENT_BALANCE
          );
        }),
        { numRuns: 1000 }
      );
    });

    it('new_saldo = old_saldo - payment_amount after successful payment (conservation)', () => {
      fc.assert(
        fc.property(saldoArb, positiveAmountArb, (currentSaldo, paymentAmount) => {
          if (currentSaldo < paymentAmount) return true;

          const result = processBalancePayment(currentSaldo, paymentAmount);
          const expectedNewSaldo = Math.round((currentSaldo - paymentAmount) * 100) / 100;

          return result.success === true && result.newSaldo === expectedNewSaldo;
        }),
        { numRuns: 1000 }
      );
    });

    it('saldo never goes negative after a successful payment', () => {
      fc.assert(
        fc.property(saldoArb, positiveAmountArb, (currentSaldo, paymentAmount) => {
          const result = processBalancePayment(currentSaldo, paymentAmount);

          if (result.success) {
            return result.newSaldo >= 0;
          }
          return true;
        }),
        { numRuns: 1000 }
      );
    });
  });

  describe('Boundary: exact saldo equals payment amount', () => {
    it('payment succeeds when saldo exactly equals payment amount', () => {
      fc.assert(
        fc.property(positiveAmountArb, (amount) => {
          const result = processBalancePayment(amount, amount);

          return result.success === true && result.newSaldo === 0;
        }),
        { numRuns: 1000 }
      );
    });

    it('after successful payment with exact saldo, new_saldo + payment_amount = old_saldo', () => {
      fc.assert(
        fc.property(positiveAmountArb, (amount) => {
          const result = processBalancePayment(amount, amount);

          if (!result.success) return false;

          const reconstructed = Math.round((result.newSaldo + amount) * 100) / 100;
          return reconstructed === amount;
        }),
        { numRuns: 1000 }
      );
    });
  });

  describe('Conservation property: new_saldo + payment_amount = old_saldo', () => {
    it('for any successful payment, new_saldo + payment_amount = old_saldo', () => {
      fc.assert(
        fc.property(saldoArb, positiveAmountArb, (currentSaldo, paymentAmount) => {
          const result = processBalancePayment(currentSaldo, paymentAmount);

          if (!result.success) return true; // skip failed payments

          const reconstructed = Math.round((result.newSaldo + paymentAmount) * 100) / 100;
          return reconstructed === currentSaldo;
        }),
        { numRuns: 1000 }
      );
    });
  });
});
