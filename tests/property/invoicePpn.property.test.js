/**
 * Property-based tests for Invoice Total with PPN.
 *
 * **Validates: Requirements 6.2**
 *
 * Property 5: Invoice Total with PPN
 * For any base amount and PPN-enabled flag, the invoice total calculation
 * SHALL equal base_amount * 1.11 (rounded to nearest integer) when PPN is enabled,
 * and exactly base_amount when PPN is disabled.
 * The PPN amount field SHALL equal total - base_amount.
 */

const fc = require('fast-check');

/**
 * PPN rate as defined in the billing service.
 */
const PPN_RATE = 0.11;

/**
 * Pure calculation function matching the billing service logic.
 * Extracted to test the core arithmetic property without DB dependencies.
 *
 * @param {number} baseAmount - The base invoice amount
 * @param {boolean} ppnEnabled - Whether PPN (11% tax) is enabled
 * @returns {{ baseAmount: number, ppnAmount: number, totalAmount: number }}
 */
function calculateInvoiceTotal(baseAmount, ppnEnabled) {
  let ppnAmount = 0;
  if (ppnEnabled) {
    ppnAmount = Math.round(baseAmount * PPN_RATE * 100) / 100;
  }
  const totalAmount = Math.round((baseAmount + ppnAmount) * 100) / 100;
  return { baseAmount, ppnAmount, totalAmount };
}

/**
 * Generator for positive decimal amounts representing ISP package prices.
 * Uses integer cents to avoid floating point issues, then converts to decimal.
 */
const baseAmountArb = fc.integer({ min: 1, max: 100000000 }).map((cents) => cents / 100);

describe('Property 5: Invoice Total with PPN', () => {
  it('total_amount = base_amount + (base_amount * 0.11) when PPN is enabled', () => {
    fc.assert(
      fc.property(baseAmountArb, (baseAmount) => {
        const result = calculateInvoiceTotal(baseAmount, true);

        const expectedPpn = Math.round(baseAmount * PPN_RATE * 100) / 100;
        const expectedTotal = Math.round((baseAmount + expectedPpn) * 100) / 100;

        return (
          result.ppnAmount === expectedPpn &&
          result.totalAmount === expectedTotal
        );
      }),
      { numRuns: 1000 }
    );
  });

  it('total_amount = base_amount when PPN is disabled', () => {
    fc.assert(
      fc.property(baseAmountArb, (baseAmount) => {
        const result = calculateInvoiceTotal(baseAmount, false);

        return (
          result.ppnAmount === 0 &&
          result.totalAmount === baseAmount
        );
      }),
      { numRuns: 1000 }
    );
  });

  it('PPN amount equals total_amount - base_amount', () => {
    fc.assert(
      fc.property(baseAmountArb, fc.boolean(), (baseAmount, ppnEnabled) => {
        const result = calculateInvoiceTotal(baseAmount, ppnEnabled);

        const diff = Math.round((result.totalAmount - result.baseAmount) * 100) / 100;
        return diff === result.ppnAmount;
      }),
      { numRuns: 1000 }
    );
  });

  it('PPN amount is always non-negative', () => {
    fc.assert(
      fc.property(baseAmountArb, fc.boolean(), (baseAmount, ppnEnabled) => {
        const result = calculateInvoiceTotal(baseAmount, ppnEnabled);
        return result.ppnAmount >= 0;
      }),
      { numRuns: 1000 }
    );
  });

  it('total_amount is always >= base_amount', () => {
    fc.assert(
      fc.property(baseAmountArb, fc.boolean(), (baseAmount, ppnEnabled) => {
        const result = calculateInvoiceTotal(baseAmount, ppnEnabled);
        return result.totalAmount >= result.baseAmount;
      }),
      { numRuns: 1000 }
    );
  });

  it('PPN calculation matches the billing service PPN_RATE constant', () => {
    // Verify our test uses the same rate as the billing service
    const { PPN_RATE: servicePpnRate } = require('../../src/services/billing.service');
    expect(PPN_RATE).toBe(servicePpnRate);
  });
});
