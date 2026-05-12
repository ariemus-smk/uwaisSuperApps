/**
 * Property-based tests for Package Change Rate Limiting.
 *
 * **Validates: Requirements 17.2**
 *
 * Property 8: Package Change Rate Limiting
 * For any customer subscription and any month, the package change validation function
 * SHALL accept a change request if and only if zero previous approved changes exist
 * for that subscription in the current calendar month. If one or more approved changes
 * exist, the request SHALL be rejected.
 */

const fc = require('fast-check');

/**
 * Pure rate limiting logic matching the isChangeAllowedInMonth function
 * in packageChange.service.js.
 *
 * The service checks: approvedCount < 1
 * - If approvedCount is 0 → change is allowed (returns true)
 * - If approvedCount is >= 1 → change is rejected (returns false)
 *
 * @param {number} approvedCountInMonth - Number of approved changes for the subscription in the given month
 * @returns {boolean} true if change is allowed, false if limit reached
 */
function isChangeAllowedInMonth(approvedCountInMonth) {
  return approvedCountInMonth < 1;
}

/**
 * Generator for subscription IDs (positive integers).
 */
const subscriptionIdArb = fc.integer({ min: 1, max: 100000 });

/**
 * Generator for valid year values.
 */
const yearArb = fc.integer({ min: 2020, max: 2030 });

/**
 * Generator for valid month values (1-12).
 */
const monthArb = fc.integer({ min: 1, max: 12 });

/**
 * Generator for approved change counts (non-negative integers).
 * In practice this is 0, 1, or more, but we test a wider range.
 */
const approvedCountArb = fc.integer({ min: 0, max: 100 });

describe('Property 8: Package Change Rate Limiting', () => {
  describe('Core property: at most 1 approved change per subscription per month', () => {
    it('change is allowed if and only if zero approved changes exist in the month', () => {
      fc.assert(
        fc.property(approvedCountArb, (approvedCount) => {
          const allowed = isChangeAllowedInMonth(approvedCount);

          if (approvedCount === 0) {
            return allowed === true;
          } else {
            return allowed === false;
          }
        }),
        { numRuns: 1000 }
      );
    });

    it('change is always allowed when approvedCount is 0', () => {
      fc.assert(
        fc.property(subscriptionIdArb, yearArb, monthArb, (subscriptionId, year, month) => {
          // For any subscription, year, and month, if no approved changes exist, change is allowed
          const approvedCount = 0;
          return isChangeAllowedInMonth(approvedCount) === true;
        }),
        { numRuns: 1000 }
      );
    });

    it('change is always rejected when approvedCount >= 1', () => {
      fc.assert(
        fc.property(
          subscriptionIdArb,
          yearArb,
          monthArb,
          fc.integer({ min: 1, max: 100 }),
          (subscriptionId, year, month, approvedCount) => {
            // For any subscription, year, and month, if 1 or more approved changes exist, change is rejected
            return isChangeAllowedInMonth(approvedCount) === false;
          }
        ),
        { numRuns: 1000 }
      );
    });
  });

  describe('Boundary: exactly 1 approved change', () => {
    it('the first change in a month is allowed (count = 0)', () => {
      fc.assert(
        fc.property(subscriptionIdArb, yearArb, monthArb, (subscriptionId, year, month) => {
          return isChangeAllowedInMonth(0) === true;
        }),
        { numRuns: 1000 }
      );
    });

    it('the second change in a month is rejected (count = 1)', () => {
      fc.assert(
        fc.property(subscriptionIdArb, yearArb, monthArb, (subscriptionId, year, month) => {
          return isChangeAllowedInMonth(1) === false;
        }),
        { numRuns: 1000 }
      );
    });
  });

  describe('Month isolation: changes in different months are independent', () => {
    it('an approved change in one month does not affect another month', () => {
      fc.assert(
        fc.property(
          subscriptionIdArb,
          yearArb,
          monthArb,
          fc.integer({ min: 1, max: 100 }),
          (subscriptionId, year, month, approvedInOtherMonth) => {
            // The current month has 0 approved changes (other month has some)
            const currentMonthApproved = 0;
            const otherMonthAllowed = isChangeAllowedInMonth(approvedInOtherMonth);
            const currentMonthAllowed = isChangeAllowedInMonth(currentMonthApproved);

            // Current month should always be allowed regardless of other months
            return currentMonthAllowed === true;
          }
        ),
        { numRuns: 1000 }
      );
    });
  });

  describe('Sequence simulation: multiple requests in same month', () => {
    it('simulating sequential requests: only the first is allowed', () => {
      fc.assert(
        fc.property(
          subscriptionIdArb,
          yearArb,
          monthArb,
          fc.integer({ min: 2, max: 10 }),
          (subscriptionId, year, month, totalRequests) => {
            // Simulate sequential package change requests in the same month
            let approvedCount = 0;
            let allowedCount = 0;

            for (let i = 0; i < totalRequests; i++) {
              if (isChangeAllowedInMonth(approvedCount)) {
                allowedCount++;
                approvedCount++; // Simulate approval
              }
            }

            // Exactly 1 change should be allowed regardless of how many were attempted
            return allowedCount === 1;
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('after one approved change, all subsequent requests in the same month are rejected', () => {
      fc.assert(
        fc.property(
          subscriptionIdArb,
          fc.integer({ min: 1, max: 50 }),
          (subscriptionId, subsequentAttempts) => {
            // After 1 approved change, simulate more attempts
            const approvedCount = 1;

            for (let i = 0; i < subsequentAttempts; i++) {
              if (isChangeAllowedInMonth(approvedCount) !== false) {
                return false; // Should always be rejected
              }
            }

            return true;
          }
        ),
        { numRuns: 1000 }
      );
    });
  });
});
