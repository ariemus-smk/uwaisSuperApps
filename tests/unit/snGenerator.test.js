/**
 * Unit tests for Serial Number Auto-Generator utility.
 * Tests format compliance, sequential numbering, and uniqueness.
 */

const {
  generateSerialNumber,
  generateBatch,
  parseSerialNumber,
  isValidSerialNumber,
  getNextSequence,
  formatDate,
  SN_PREFIX,
  SEQUENCE_DIGITS,
  MAX_SEQUENCE,
} = require('../../src/utils/snGenerator');

describe('snGenerator', () => {
  const fixedDate = new Date(2024, 5, 15); // June 15, 2024

  describe('formatDate', () => {
    it('should format date as YYYYMMDD', () => {
      expect(formatDate(fixedDate)).toBe('20240615');
    });

    it('should zero-pad single-digit months and days', () => {
      const jan1 = new Date(2024, 0, 1); // January 1
      expect(formatDate(jan1)).toBe('20240101');
    });

    it('should handle December 31', () => {
      const dec31 = new Date(2024, 11, 31);
      expect(formatDate(dec31)).toBe('20241231');
    });
  });

  describe('generateSerialNumber', () => {
    it('should generate serial number in correct format UBG-YYYYMMDD-XXXXXX', () => {
      const sn = generateSerialNumber(1, fixedDate);
      expect(sn).toBe('UBG-20240615-000001');
    });

    it('should zero-pad the sequence number to 6 digits', () => {
      expect(generateSerialNumber(42, fixedDate)).toBe('UBG-20240615-000042');
      expect(generateSerialNumber(123456, fixedDate)).toBe('UBG-20240615-123456');
    });

    it('should use current date when no date is provided', () => {
      const sn = generateSerialNumber(1);
      const today = formatDate(new Date());
      expect(sn).toBe(`UBG-${today}-000001`);
    });

    it('should throw error for sequence less than 1', () => {
      expect(() => generateSerialNumber(0, fixedDate)).toThrow('Sequence must be a positive integer starting from 1');
      expect(() => generateSerialNumber(-1, fixedDate)).toThrow('Sequence must be a positive integer starting from 1');
    });

    it('should throw error for non-integer sequence', () => {
      expect(() => generateSerialNumber(1.5, fixedDate)).toThrow('Sequence must be a positive integer starting from 1');
    });

    it('should throw error when sequence exceeds maximum', () => {
      expect(() => generateSerialNumber(MAX_SEQUENCE + 1, fixedDate)).toThrow(`Sequence exceeds maximum value of ${MAX_SEQUENCE}`);
    });

    it('should accept the maximum sequence value', () => {
      const sn = generateSerialNumber(MAX_SEQUENCE, fixedDate);
      expect(sn).toBe('UBG-20240615-999999');
    });
  });

  describe('generateBatch', () => {
    it('should generate the correct number of serial numbers', () => {
      const batch = generateBatch(5, { date: fixedDate });
      expect(batch).toHaveLength(5);
    });

    it('should generate sequential serial numbers within a batch', () => {
      const batch = generateBatch(3, { date: fixedDate });
      expect(batch[0]).toBe('UBG-20240615-000001');
      expect(batch[1]).toBe('UBG-20240615-000002');
      expect(batch[2]).toBe('UBG-20240615-000003');
    });

    it('should start from the specified startSequence', () => {
      const batch = generateBatch(3, { date: fixedDate, startSequence: 10 });
      expect(batch[0]).toBe('UBG-20240615-000010');
      expect(batch[1]).toBe('UBG-20240615-000011');
      expect(batch[2]).toBe('UBG-20240615-000012');
    });

    it('should generate all unique serial numbers', () => {
      const batch = generateBatch(100, { date: fixedDate });
      const uniqueSet = new Set(batch);
      expect(uniqueSet.size).toBe(100);
    });

    it('should throw error when duplicate is detected against existing serials', () => {
      const existingSerials = new Set(['UBG-20240615-000001']);
      expect(() => generateBatch(3, { date: fixedDate, existingSerials }))
        .toThrow('Duplicate serial number detected: UBG-20240615-000001');
    });

    it('should throw error for invalid count', () => {
      expect(() => generateBatch(0)).toThrow('Count must be a positive integer');
      expect(() => generateBatch(-1)).toThrow('Count must be a positive integer');
      expect(() => generateBatch(1.5)).toThrow('Count must be a positive integer');
    });

    it('should throw error for invalid startSequence', () => {
      expect(() => generateBatch(1, { startSequence: 0 })).toThrow('Start sequence must be a positive integer starting from 1');
      expect(() => generateBatch(1, { startSequence: -1 })).toThrow('Start sequence must be a positive integer starting from 1');
    });

    it('should throw error when batch would exceed maximum sequence', () => {
      expect(() => generateBatch(10, { date: fixedDate, startSequence: MAX_SEQUENCE - 5 }))
        .toThrow(/Batch would exceed maximum sequence value/);
    });
  });

  describe('parseSerialNumber', () => {
    it('should parse a valid serial number', () => {
      const result = parseSerialNumber('UBG-20240615-000042');
      expect(result).toEqual({
        prefix: 'UBG',
        date: '20240615',
        sequence: 42,
      });
    });

    it('should return null for invalid format', () => {
      expect(parseSerialNumber('INVALID')).toBeNull();
      expect(parseSerialNumber('UBG-2024061-000001')).toBeNull(); // short date
      expect(parseSerialNumber('UBG-20240615-00001')).toBeNull(); // short sequence
      expect(parseSerialNumber('XYZ-20240615-000001')).toBeNull(); // wrong prefix
    });

    it('should return null for non-string input', () => {
      expect(parseSerialNumber(null)).toBeNull();
      expect(parseSerialNumber(undefined)).toBeNull();
      expect(parseSerialNumber(123)).toBeNull();
    });
  });

  describe('isValidSerialNumber', () => {
    it('should return true for valid serial numbers', () => {
      expect(isValidSerialNumber('UBG-20240615-000001')).toBe(true);
      expect(isValidSerialNumber('UBG-20241231-999999')).toBe(true);
    });

    it('should return false for invalid serial numbers', () => {
      expect(isValidSerialNumber('INVALID')).toBe(false);
      expect(isValidSerialNumber('')).toBe(false);
      expect(isValidSerialNumber(null)).toBe(false);
    });
  });

  describe('getNextSequence', () => {
    it('should return 1 when no existing serials for the date', () => {
      const existingSerials = new Set();
      expect(getNextSequence(fixedDate, existingSerials)).toBe(1);
    });

    it('should return next sequence after the highest existing one for the same date', () => {
      const existingSerials = new Set([
        'UBG-20240615-000001',
        'UBG-20240615-000002',
        'UBG-20240615-000005',
      ]);
      expect(getNextSequence(fixedDate, existingSerials)).toBe(6);
    });

    it('should ignore serials from different dates', () => {
      const existingSerials = new Set([
        'UBG-20240614-000010', // different date
        'UBG-20240615-000003',
      ]);
      expect(getNextSequence(fixedDate, existingSerials)).toBe(4);
    });

    it('should ignore invalid serial number strings', () => {
      const existingSerials = new Set([
        'INVALID',
        'UBG-20240615-000002',
      ]);
      expect(getNextSequence(fixedDate, existingSerials)).toBe(3);
    });
  });

  describe('constants', () => {
    it('should have correct prefix', () => {
      expect(SN_PREFIX).toBe('UBG');
    });

    it('should have 6 sequence digits', () => {
      expect(SEQUENCE_DIGITS).toBe(6);
    });

    it('should have max sequence of 999999', () => {
      expect(MAX_SEQUENCE).toBe(999999);
    });
  });
});
