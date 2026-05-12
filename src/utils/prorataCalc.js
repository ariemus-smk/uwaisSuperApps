/**
 * Prorata billing calculator.
 * Calculates proportional billing for mid-month service activations.
 *
 * Formula: (monthly_price / total_days_in_month) * remaining_days_in_month
 *
 * @module utils/prorataCalc
 */

/**
 * Get the total number of days in a given month/year.
 * Handles February (28/29 for leap years) and varying month lengths.
 *
 * @param {number} year - Full year (e.g. 2024)
 * @param {number} month - Month (1-12)
 * @returns {number} Total days in the month
 */
function getDaysInMonth(year, month) {
  // Date with day 0 of next month gives last day of current month
  return new Date(year, month, 0).getDate();
}

/**
 * Calculate the remaining days in the month from a given activation date (inclusive).
 * The activation day itself counts as a billable day.
 *
 * @param {number} activationDay - Day of the month the service was activated (1-31)
 * @param {number} totalDaysInMonth - Total days in the month
 * @returns {number} Remaining days including the activation day
 */
function getRemainingDays(activationDay, totalDaysInMonth) {
  return totalDaysInMonth - activationDay + 1;
}

/**
 * Calculate prorata billing amount for a mid-month activation.
 *
 * @param {object} params - Calculation parameters
 * @param {number} params.monthlyPrice - Full monthly package price
 * @param {Date|string} params.activationDate - The date the service was activated
 * @returns {object} Prorata calculation result
 * @returns {number} result.amount - The prorata amount (rounded to 2 decimal places)
 * @returns {number} result.dailyRate - The daily rate used for calculation
 * @returns {number} result.remainingDays - Number of remaining days charged
 * @returns {number} result.totalDaysInMonth - Total days in the activation month
 * @returns {boolean} result.isFullMonth - Whether activation is on day 1 (full month charge)
 */
function calculateProrata({ monthlyPrice, activationDate }) {
  if (monthlyPrice == null || monthlyPrice < 0) {
    throw new Error('monthlyPrice must be a non-negative number');
  }

  if (!activationDate) {
    throw new Error('activationDate is required');
  }

  const date = new Date(activationDate);

  if (isNaN(date.getTime())) {
    throw new Error('activationDate must be a valid date');
  }

  const year = date.getFullYear();
  const month = date.getMonth() + 1; // getMonth() is 0-indexed
  const day = date.getDate();

  const totalDaysInMonth = getDaysInMonth(year, month);
  const remainingDays = getRemainingDays(day, totalDaysInMonth);

  // Day-1 activation means full month charge
  const isFullMonth = day === 1;

  const dailyRate = monthlyPrice / totalDaysInMonth;
  const amount = Math.round((dailyRate * remainingDays) * 100) / 100;

  return {
    amount,
    dailyRate: Math.round(dailyRate * 100) / 100,
    remainingDays,
    totalDaysInMonth,
    isFullMonth,
  };
}

module.exports = {
  calculateProrata,
  getDaysInMonth,
  getRemainingDays,
};
