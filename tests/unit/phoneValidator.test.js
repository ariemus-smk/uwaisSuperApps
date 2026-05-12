const { isValidIndonesianPhone } = require('../../src/utils/phoneValidator');

describe('phoneValidator - isValidIndonesianPhone', () => {
  describe('valid phone numbers', () => {
    test('accepts +62 prefix with 9 digits after prefix', () => {
      expect(isValidIndonesianPhone('+6281234567890')).toBe(true); // 10 digits after +62 -> 0 + 10 = 11 total
    });

    test('accepts +62 prefix with minimum valid length', () => {
      // +62 + 9 digits = normalized to 0 + 9 digits = 10 total
      expect(isValidIndonesianPhone('+62812345678')).toBe(true);
    });

    test('accepts +62 prefix with maximum valid length', () => {
      // +62 + 12 digits = normalized to 0 + 12 digits = 13 total
      expect(isValidIndonesianPhone('+62812345678901')).toBe(true);
    });

    test('accepts 08 prefix with minimum valid length (10 digits)', () => {
      expect(isValidIndonesianPhone('0812345678')).toBe(true);
    });

    test('accepts 08 prefix with maximum valid length (13 digits)', () => {
      expect(isValidIndonesianPhone('0812345678901')).toBe(true);
    });

    test('accepts common Indonesian mobile numbers', () => {
      expect(isValidIndonesianPhone('081234567890')).toBe(true);
      expect(isValidIndonesianPhone('085678901234')).toBe(true);
      expect(isValidIndonesianPhone('087812345678')).toBe(true);
      expect(isValidIndonesianPhone('+6281234567890')).toBe(true);
      expect(isValidIndonesianPhone('+6285678901234')).toBe(true);
    });

    test('accepts numbers with spaces or dashes (cleaned)', () => {
      expect(isValidIndonesianPhone('0812 3456 7890')).toBe(true);
      expect(isValidIndonesianPhone('0812-3456-7890')).toBe(true);
      expect(isValidIndonesianPhone('+62 812 3456 7890')).toBe(true);
      expect(isValidIndonesianPhone('+62-812-3456-7890')).toBe(true);
    });
  });

  describe('invalid phone numbers', () => {
    test('rejects null or undefined', () => {
      expect(isValidIndonesianPhone(null)).toBe(false);
      expect(isValidIndonesianPhone(undefined)).toBe(false);
    });

    test('rejects non-string input', () => {
      expect(isValidIndonesianPhone(81234567890)).toBe(false);
      expect(isValidIndonesianPhone({})).toBe(false);
      expect(isValidIndonesianPhone([])).toBe(false);
    });

    test('rejects empty string', () => {
      expect(isValidIndonesianPhone('')).toBe(false);
    });

    test('rejects numbers without valid prefix', () => {
      expect(isValidIndonesianPhone('1234567890')).toBe(false);
      expect(isValidIndonesianPhone('62812345678')).toBe(false);
      expect(isValidIndonesianPhone('0912345678')).toBe(false);
    });

    test('rejects +62 prefix not followed by 8', () => {
      expect(isValidIndonesianPhone('+62712345678')).toBe(false);
    });

    test('rejects numbers that are too short', () => {
      // 08 + 7 digits = 9 total (below minimum of 10)
      expect(isValidIndonesianPhone('081234567')).toBe(false);
      // +62 + 8 digits = normalized to 0 + 8 = 9 total (below minimum)
      expect(isValidIndonesianPhone('+6281234567')).toBe(false);
    });

    test('rejects numbers that are too long', () => {
      // 08 + 12 digits = 14 total (above maximum of 13)
      expect(isValidIndonesianPhone('08123456789012')).toBe(false);
      // +62 + 13 digits = normalized to 0 + 13 = 14 total (above maximum)
      expect(isValidIndonesianPhone('+6281234567890123')).toBe(false);
    });

    test('rejects numbers with non-digit characters (after cleaning)', () => {
      expect(isValidIndonesianPhone('+62812abc7890')).toBe(false);
      expect(isValidIndonesianPhone('0812#4567890')).toBe(false);
    });
  });
});
