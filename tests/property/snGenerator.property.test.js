/**
 * Property-based tests for Serial Number Format Generation.
 *
 * **Validates: Requirements 18.3**
 *
 * Property 9: Serial Number Format Generation
 * - All generated serial numbers match the regex pattern /^UBG-\d{8}-\d{6}$/
 * - Batch generation produces all unique serial numbers
 * - Sequential numbering within a batch (each SN's sequence is exactly 1 more than the previous)
 * - parseSerialNumber correctly round-trips with generateSerialNumber
 * - getNextSequence always returns a value higher than any existing sequence for the same date
 */

const fc = require('fast-check');
const {
  generateSerialNumber,
  generateBatch,
  parseSerialNumber,
  getNextSequence,
  formatDate,
  MAX_SEQUENCE,
} = require('../../src/utils/snGenerator');

const SN_REGEX = /^UBG-\d{8}-\d{6}$/;

/**
 * Arbitrary for a valid date (between 2000-01-01 and 2099-12-31).
 */
const validDateArb = fc.date({
  min: new Date(2000, 0, 1),
  max: new Date(2099, 11, 31),
});

/**
 * Arbitrary for a valid sequence number (1 to MAX_SEQUENCE).
 */
const validSequenceArb = fc.integer({ min: 1, max: MAX_SEQUENCE });

/**
 * Arbitrary for a valid batch size and start sequence that won't overflow.
 */
const validBatchArb = fc.integer({ min: 1, max: 100 }).chain((count) =>
  fc.integer({ min: 1, max: MAX_SEQUENCE - count + 1 }).map((startSeq) => ({
    count,
    startSequence: startSeq,
  }))
);

describe('Property 9: Serial Number Format Generation', () => {
  it('all generated serial numbers match the regex pattern /^UBG-\\d{8}-\\d{6}$/', () => {
    fc.assert(
      fc.property(validSequenceArb, validDateArb, (sequence, date) => {
        const sn = generateSerialNumber(sequence, date);
        return SN_REGEX.test(sn);
      }),
      { numRuns: 500 }
    );
  });

  it('batch generation produces all unique serial numbers', () => {
    fc.assert(
      fc.property(validBatchArb, validDateArb, ({ count, startSequence }, date) => {
        const batch = generateBatch(count, { date, startSequence });

        // All serial numbers should be unique
        const uniqueSet = new Set(batch);
        return uniqueSet.size === batch.length;
      }),
      { numRuns: 200 }
    );
  });

  it('sequential numbering within a batch (each SN sequence is exactly 1 more than the previous)', () => {
    fc.assert(
      fc.property(validBatchArb, validDateArb, ({ count, startSequence }, date) => {
        const batch = generateBatch(count, { date, startSequence });

        for (let i = 1; i < batch.length; i++) {
          const prevParsed = parseSerialNumber(batch[i - 1]);
          const currParsed = parseSerialNumber(batch[i]);

          if (!prevParsed || !currParsed) return false;
          if (currParsed.sequence !== prevParsed.sequence + 1) return false;
        }
        return true;
      }),
      { numRuns: 200 }
    );
  });

  it('parseSerialNumber correctly round-trips with generateSerialNumber', () => {
    fc.assert(
      fc.property(validSequenceArb, validDateArb, (sequence, date) => {
        const sn = generateSerialNumber(sequence, date);
        const parsed = parseSerialNumber(sn);

        if (!parsed) return false;
        if (parsed.prefix !== 'UBG') return false;
        if (parsed.date !== formatDate(date)) return false;
        if (parsed.sequence !== sequence) return false;
        return true;
      }),
      { numRuns: 500 }
    );
  });

  it('getNextSequence always returns a value higher than any existing sequence for the same date', () => {
    fc.assert(
      fc.property(
        validDateArb,
        fc.array(validSequenceArb, { minLength: 1, maxLength: 50 }),
        (date, sequences) => {
          // Build a set of existing serial numbers for the given date
          const existingSerials = new Set(
            sequences.map((seq) => generateSerialNumber(seq, date))
          );

          const nextSeq = getNextSequence(date, existingSerials);
          const maxExisting = Math.max(...sequences);

          // Next sequence must be greater than the maximum existing sequence
          return nextSeq > maxExisting;
        }
      ),
      { numRuns: 200 }
    );
  });
});
