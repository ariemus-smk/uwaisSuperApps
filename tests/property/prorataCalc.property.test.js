/**
 * Property-based tests for Prorata Billing Calculation.
 *
 * **Validates: Requirements 5.1**
 *
 * Property 4: Prorata Billing Calculation
 * For any valid monthly price (> 0) and activation date within a month,
 * the prorata calculation SHALL produce a result where:
 * (a) result >= 0
 * (b) result <= monthly_price
 * (c) result equals monthly_price when activation is on day 1
 * (d) prorata amount increases as activation day decreases (earlier = more days = higher charge)
 * (e) complementary prorata amounts approximate the monthly price
 */

const fc = require('fast-check');
const { calculateProrata, getDaysInMonth } = require('../../src/utils/prorataCalc');

/**
 * Generator for a valid monthly price (positive number, reasonable ISP range).
 */
const monthlyPriceArb = fc.integer({ min: 1, max: 10000000 });

/**
 * Generator for a valid year/month combination.
 */
const yearArb = fc.integer({ min: 2000, max: 2100 });
const monthArb = fc.integer({ min: 1, max: 12 });

/**
 * Generator for a valid activation day given a year and month.
 * Returns { year, month, day } where day is valid for that month.
 */
const validDateArb = fc.tuple(yearArb, monthArb).chain(([year, month]) => {
  const daysInMonth = getDaysInMonth(year, month);
  return fc.integer({ min: 1, max: daysInMonth }).map((day) => ({
    year,
    month,
    day,
    daysInMonth,
  }));
});

/**
 * Helper to create a Date from year/month/day.
 */
function makeDate(year, month, day) {
  return new Date(year, month - 1, day);
}

describe('Property 4: Prorata Billing Calculation', () => {
  it('prorata amount is always >= 0 for valid inputs', () => {
    fc.assert(
      fc.property(monthlyPriceArb, validDateArb, (monthlyPrice, dateInfo) => {
        const result = calculateProrata({
          monthlyPrice,
          activationDate: makeDate(dateInfo.year, dateInfo.month, dateInfo.day),
        });

        return result.amount >= 0;
      }),
      { numRuns: 500 }
    );
  });

  it('prorata amount is always <= monthly_price', () => {
    fc.assert(
      fc.property(monthlyPriceArb, validDateArb, (monthlyPrice, dateInfo) => {
        const result = calculateProrata({
          monthlyPrice,
          activationDate: makeDate(dateInfo.year, dateInfo.month, dateInfo.day),
        });

        return result.amount <= monthlyPrice;
      }),
      { numRuns: 500 }
    );
  });

  it('day-1 activation always equals full monthly price', () => {
    fc.assert(
      fc.property(monthlyPriceArb, yearArb, monthArb, (monthlyPrice, year, month) => {
        const result = calculateProrata({
          monthlyPrice,
          activationDate: makeDate(year, month, 1),
        });

        return result.amount === monthlyPrice && result.isFullMonth === true;
      }),
      { numRuns: 500 }
    );
  });

  it('prorata amount increases as activation day decreases (earlier activation = higher charge)', () => {
    fc.assert(
      fc.property(
        monthlyPriceArb,
        fc.tuple(yearArb, monthArb).chain(([year, month]) => {
          const daysInMonth = getDaysInMonth(year, month);
          // Generate two distinct days where dayEarlier < dayLater
          return fc
            .tuple(
              fc.integer({ min: 1, max: daysInMonth - 1 }),
              fc.integer({ min: 2, max: daysInMonth })
            )
            .filter(([a, b]) => a < b)
            .map(([dayEarlier, dayLater]) => ({
              year,
              month,
              dayEarlier,
              dayLater,
              daysInMonth,
            }));
        }),
        (monthlyPrice, dateInfo) => {
          const resultEarlier = calculateProrata({
            monthlyPrice,
            activationDate: makeDate(dateInfo.year, dateInfo.month, dateInfo.dayEarlier),
          });

          const resultLater = calculateProrata({
            monthlyPrice,
            activationDate: makeDate(dateInfo.year, dateInfo.month, dateInfo.dayLater),
          });

          // Earlier activation means more remaining days, so higher charge
          return resultEarlier.amount >= resultLater.amount;
        }
      ),
      { numRuns: 500 }
    );
  });

  it('complementary prorata amounts sum to approximately the monthly price', () => {
    fc.assert(
      fc.property(
        monthlyPriceArb,
        validDateArb,
        (monthlyPrice, dateInfo) => {
          const { year, month, day, daysInMonth } = dateInfo;

          // Calculate prorata for day X
          const resultDayX = calculateProrata({
            monthlyPrice,
            activationDate: makeDate(year, month, day),
          });

          // The complementary day: covers the days before activation day
          // If activated on day X, remaining = daysInMonth - X + 1
          // Complement covers days 1 to (X-1), which is (X-1) days
          // That's equivalent to activating on day (daysInMonth - (X-1) + 1) = daysInMonth - X + 2
          // But simpler: complement amount = dailyRate * (X - 1)
          const complementDays = day - 1;
          const dailyRate = monthlyPrice / daysInMonth;
          const complementAmount = Math.round(dailyRate * complementDays * 100) / 100;

          const sum = resultDayX.amount + complementAmount;

          // Due to floating point rounding, allow a small tolerance (1 unit)
          return Math.abs(sum - monthlyPrice) <= 1;
        }
      ),
      { numRuns: 500 }
    );
  });
});
