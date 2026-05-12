/**
 * Unit tests for prorata billing calculator.
 * Tests the formula: (monthly_price / total_days_in_month) * remaining_days
 */

const { calculateProrata, getDaysInMonth, getRemainingDays } = require('../../src/utils/prorataCalc');

describe('prorataCalc', () => {
  describe('getDaysInMonth', () => {
    it('should return 31 for January', () => {
      expect(getDaysInMonth(2024, 1)).toBe(31);
    });

    it('should return 28 for February in a non-leap year', () => {
      expect(getDaysInMonth(2023, 2)).toBe(28);
    });

    it('should return 29 for February in a leap year', () => {
      expect(getDaysInMonth(2024, 2)).toBe(29);
    });

    it('should return 30 for April', () => {
      expect(getDaysInMonth(2024, 4)).toBe(30);
    });

    it('should return 31 for December', () => {
      expect(getDaysInMonth(2024, 12)).toBe(31);
    });
  });

  describe('getRemainingDays', () => {
    it('should return full month days when activation is on day 1', () => {
      expect(getRemainingDays(1, 31)).toBe(31);
    });

    it('should return 1 when activation is on the last day', () => {
      expect(getRemainingDays(31, 31)).toBe(1);
    });

    it('should return correct remaining days for mid-month', () => {
      expect(getRemainingDays(15, 30)).toBe(16);
    });
  });

  describe('calculateProrata', () => {
    it('should calculate prorata for mid-month activation', () => {
      const result = calculateProrata({
        monthlyPrice: 300000,
        activationDate: '2024-03-15',
      });

      // March has 31 days, activation on 15th = 17 remaining days
      expect(result.totalDaysInMonth).toBe(31);
      expect(result.remainingDays).toBe(17);
      expect(result.isFullMonth).toBe(false);
      expect(result.amount).toBeCloseTo((300000 / 31) * 17, 2);
    });

    it('should return full month charge for day-1 activation', () => {
      const result = calculateProrata({
        monthlyPrice: 250000,
        activationDate: '2024-06-01',
      });

      expect(result.isFullMonth).toBe(true);
      expect(result.remainingDays).toBe(30); // June has 30 days
      expect(result.totalDaysInMonth).toBe(30);
      expect(result.amount).toBe(250000);
    });

    it('should handle February 28 in non-leap year', () => {
      const result = calculateProrata({
        monthlyPrice: 200000,
        activationDate: '2023-02-15',
      });

      expect(result.totalDaysInMonth).toBe(28);
      expect(result.remainingDays).toBe(14);
      expect(result.amount).toBeCloseTo((200000 / 28) * 14, 2);
    });

    it('should handle February 29 in leap year', () => {
      const result = calculateProrata({
        monthlyPrice: 200000,
        activationDate: '2024-02-15',
      });

      expect(result.totalDaysInMonth).toBe(29);
      expect(result.remainingDays).toBe(15);
      expect(result.amount).toBeCloseTo((200000 / 29) * 15, 2);
    });

    it('should handle activation on last day of month', () => {
      const result = calculateProrata({
        monthlyPrice: 300000,
        activationDate: '2024-01-31',
      });

      expect(result.remainingDays).toBe(1);
      expect(result.amount).toBeCloseTo(300000 / 31, 2);
    });

    it('should handle zero monthly price', () => {
      const result = calculateProrata({
        monthlyPrice: 0,
        activationDate: '2024-03-15',
      });

      expect(result.amount).toBe(0);
      expect(result.dailyRate).toBe(0);
    });

    it('should accept Date object as activationDate', () => {
      const result = calculateProrata({
        monthlyPrice: 100000,
        activationDate: new Date(2024, 4, 10), // May 10, 2024
      });

      expect(result.totalDaysInMonth).toBe(31);
      expect(result.remainingDays).toBe(22);
      expect(result.amount).toBeCloseTo((100000 / 31) * 22, 2);
    });

    it('should throw error for missing monthlyPrice', () => {
      expect(() => calculateProrata({
        activationDate: '2024-03-15',
      })).toThrow('monthlyPrice must be a non-negative number');
    });

    it('should throw error for negative monthlyPrice', () => {
      expect(() => calculateProrata({
        monthlyPrice: -100,
        activationDate: '2024-03-15',
      })).toThrow('monthlyPrice must be a non-negative number');
    });

    it('should throw error for missing activationDate', () => {
      expect(() => calculateProrata({
        monthlyPrice: 100000,
      })).toThrow('activationDate is required');
    });

    it('should throw error for invalid activationDate', () => {
      expect(() => calculateProrata({
        monthlyPrice: 100000,
        activationDate: 'not-a-date',
      })).toThrow('activationDate must be a valid date');
    });
  });
});
