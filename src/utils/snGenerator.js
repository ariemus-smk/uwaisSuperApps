/**
 * Serial Number Auto-Generator.
 * Generates unique serial numbers for assets that don't have manufacturer serial numbers.
 * Format: UBG-YYYYMMDD-XXXXXX where YYYYMMDD is the current date and XXXXXX is a zero-padded sequential number.
 *
 * @module utils/snGenerator
 */

const SN_PREFIX = 'UBG';
const SEQUENCE_DIGITS = 6;
const MAX_SEQUENCE = Math.pow(10, SEQUENCE_DIGITS) - 1; // 999999

/**
 * Format a date as YYYYMMDD string.
 * @param {Date} date - The date to format
 * @returns {string} Date formatted as YYYYMMDD
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Zero-pad a number to the specified width.
 * @param {number} num - The number to pad
 * @param {number} width - The desired string width
 * @returns {string} Zero-padded number string
 */
function zeroPad(num, width) {
  return String(num).padStart(width, '0');
}

/**
 * Generate a single serial number.
 * @param {number} sequence - The sequential number (1-based)
 * @param {Date} [date] - The date to use (defaults to current date)
 * @returns {string} Serial number in format UBG-YYYYMMDD-XXXXXX
 * @throws {Error} If sequence exceeds maximum allowed value
 */
function generateSerialNumber(sequence, date = new Date()) {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error('Sequence must be a positive integer starting from 1');
  }

  if (sequence > MAX_SEQUENCE) {
    throw new Error(`Sequence exceeds maximum value of ${MAX_SEQUENCE}`);
  }

  const dateStr = formatDate(date);
  const seqStr = zeroPad(sequence, SEQUENCE_DIGITS);

  return `${SN_PREFIX}-${dateStr}-${seqStr}`;
}

/**
 * Generate a batch of sequential serial numbers.
 * @param {number} count - Number of serial numbers to generate
 * @param {object} [options] - Generation options
 * @param {Date} [options.date] - The date to use (defaults to current date)
 * @param {number} [options.startSequence=1] - Starting sequence number
 * @param {Set<string>} [options.existingSerials] - Set of existing serial numbers to check uniqueness against
 * @returns {string[]} Array of unique serial numbers
 * @throws {Error} If count is invalid or sequence would exceed maximum
 */
function generateBatch(count, options = {}) {
  const { date = new Date(), startSequence = 1, existingSerials = new Set() } = options;

  if (!Number.isInteger(count) || count < 1) {
    throw new Error('Count must be a positive integer');
  }

  if (!Number.isInteger(startSequence) || startSequence < 1) {
    throw new Error('Start sequence must be a positive integer starting from 1');
  }

  const endSequence = startSequence + count - 1;
  if (endSequence > MAX_SEQUENCE) {
    throw new Error(
      `Batch would exceed maximum sequence value of ${MAX_SEQUENCE}. ` +
      `Requested end sequence: ${endSequence}`
    );
  }

  const serials = [];
  let currentSequence = startSequence;

  for (let i = 0; i < count; i++) {
    const sn = generateSerialNumber(currentSequence, date);

    if (existingSerials.has(sn)) {
      throw new Error(`Duplicate serial number detected: ${sn}`);
    }

    serials.push(sn);
    currentSequence++;
  }

  return serials;
}

/**
 * Parse a serial number into its components.
 * @param {string} serialNumber - The serial number to parse
 * @returns {{ prefix: string, date: string, sequence: number } | null} Parsed components or null if invalid
 */
function parseSerialNumber(serialNumber) {
  if (typeof serialNumber !== 'string') {
    return null;
  }

  const regex = /^UBG-(\d{8})-(\d{6})$/;
  const match = serialNumber.match(regex);

  if (!match) {
    return null;
  }

  return {
    prefix: SN_PREFIX,
    date: match[1],
    sequence: parseInt(match[2], 10),
  };
}

/**
 * Validate that a serial number matches the expected format.
 * @param {string} serialNumber - The serial number to validate
 * @returns {boolean} True if the serial number is valid
 */
function isValidSerialNumber(serialNumber) {
  return parseSerialNumber(serialNumber) !== null;
}

/**
 * Determine the next available sequence number for a given date,
 * based on a set of existing serial numbers.
 * @param {Date} date - The date to check
 * @param {Set<string>} existingSerials - Set of existing serial numbers
 * @returns {number} The next available sequence number
 */
function getNextSequence(date, existingSerials) {
  const dateStr = formatDate(date);
  let maxSequence = 0;

  for (const sn of existingSerials) {
    const parsed = parseSerialNumber(sn);
    if (parsed && parsed.date === dateStr) {
      if (parsed.sequence > maxSequence) {
        maxSequence = parsed.sequence;
      }
    }
  }

  return maxSequence + 1;
}

module.exports = {
  generateSerialNumber,
  generateBatch,
  parseSerialNumber,
  isValidSerialNumber,
  getNextSequence,
  formatDate,
  SN_PREFIX,
  SEQUENCE_DIGITS,
  MAX_SEQUENCE,
};
