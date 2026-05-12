/**
 * Property-based tests for Indonesian Phone Number Validation.
 *
 * **Validates: Requirements 2.3**
 *
 * Property 2: Indonesian Phone Number Validation
 * - All valid numbers (correct prefix + correct digit count) pass validation
 * - All invalid numbers (wrong prefix, wrong length, non-digits) fail validation
 * - The validator is consistent (same input always gives same output)
 */

const fc = require('fast-check');
const { isValidIndonesianPhone } = require('../../src/utils/phoneValidator');

/**
 * Arbitrary that generates valid Indonesian phone numbers in +62 format.
 * +62 followed by 8 then 8-11 more digits (total normalized: 10-13 digits).
 */
const validPlus62Phone = fc
  .integer({ min: 8, max: 11 })
  .chain((subscriberLen) =>
    fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
      minLength: subscriberLen,
      maxLength: subscriberLen,
    })
  )
  .map((subscriberDigits) => `+628${subscriberDigits}`);

/**
 * Arbitrary that generates valid Indonesian phone numbers in 08 format.
 * 08 followed by 8-11 more digits (total: 10-13 digits).
 */
const valid08Phone = fc
  .integer({ min: 8, max: 11 })
  .chain((subscriberLen) =>
    fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
      minLength: subscriberLen,
      maxLength: subscriberLen,
    })
  )
  .map((subscriberDigits) => `08${subscriberDigits}`);

/**
 * Arbitrary that generates valid Indonesian phone numbers (either format).
 */
const validPhone = fc.oneof(validPlus62Phone, valid08Phone);

/**
 * Arbitrary that generates numbers with wrong prefix (not +62 or 08).
 */
const wrongPrefixPhone = fc
  .stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
    minLength: 8,
    maxLength: 13,
  })
  .filter((s) => !s.startsWith('08'))
  .map((digits) => digits);

/**
 * Arbitrary that generates numbers with too few digits (normalized < 10).
 * Using 08 prefix with fewer than 8 subscriber digits.
 */
const tooShortPhone = fc
  .integer({ min: 1, max: 7 })
  .chain((len) =>
    fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
      minLength: len,
      maxLength: len,
    })
  )
  .map((digits) => `08${digits}`);

/**
 * Arbitrary that generates numbers with too many digits (normalized > 13).
 * Using 08 prefix with more than 11 subscriber digits.
 */
const tooLongPhone = fc
  .integer({ min: 12, max: 20 })
  .chain((len) =>
    fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
      minLength: len,
      maxLength: len,
    })
  )
  .map((digits) => `08${digits}`);

/**
 * Arbitrary that generates numbers containing non-digit characters after prefix.
 */
const nonDigitPhone = fc
  .tuple(
    fc.constantFrom('+62', '08'),
    fc.stringOf(fc.constantFrom('a', 'b', 'c', 'x', '!', '@', '#', '1', '2', '3'), {
      minLength: 8,
      maxLength: 11,
    })
  )
  .filter(([, body]) => /[^0-9]/.test(body))
  .map(([prefix, body]) => `${prefix}${body}`);

describe('Property: Indonesian Phone Number Validation', () => {
  it('should ALWAYS accept valid phone numbers with correct prefix and digit count', () => {
    fc.assert(
      fc.property(validPhone, (phone) => {
        return isValidIndonesianPhone(phone) === true;
      }),
      { numRuns: 500 }
    );
  });

  it('should NEVER accept phone numbers with wrong prefix', () => {
    fc.assert(
      fc.property(wrongPrefixPhone, (phone) => {
        return isValidIndonesianPhone(phone) === false;
      }),
      { numRuns: 200 }
    );
  });

  it('should NEVER accept phone numbers that are too short', () => {
    fc.assert(
      fc.property(tooShortPhone, (phone) => {
        return isValidIndonesianPhone(phone) === false;
      }),
      { numRuns: 200 }
    );
  });

  it('should NEVER accept phone numbers that are too long', () => {
    fc.assert(
      fc.property(tooLongPhone, (phone) => {
        return isValidIndonesianPhone(phone) === false;
      }),
      { numRuns: 200 }
    );
  });

  it('should NEVER accept phone numbers containing non-digit characters', () => {
    fc.assert(
      fc.property(nonDigitPhone, (phone) => {
        return isValidIndonesianPhone(phone) === false;
      }),
      { numRuns: 200 }
    );
  });

  it('should be consistent - same input always produces same output', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result1 = isValidIndonesianPhone(input);
        const result2 = isValidIndonesianPhone(input);
        const result3 = isValidIndonesianPhone(input);
        return result1 === result2 && result2 === result3;
      }),
      { numRuns: 500 }
    );
  });
});
