/**
 * Indonesian phone number validation utility.
 * Validates numbers with +62 or 08 prefix format.
 *
 * Valid formats:
 *   +62xxx (international format, 9-12 digits after +62)
 *   08xxx  (local format, 9-12 digits total including the leading 0)
 *
 * @module utils/phoneValidator
 */

/**
 * Validate an Indonesian phone number.
 * Accepts +62 prefix (international) or 08 prefix (local).
 * After normalizing to local format (08...), the total digit count
 * must be between 9 and 13 digits (including the leading 0).
 *
 * Normalization logic:
 *   +62xxx -> 0xxx (replace +62 with 0)
 *   08xxx  -> 08xxx (already local)
 *
 * The normalized number must have 10-13 digits total (0 + 8 + 8-11 subscriber digits),
 * which corresponds to 9-12 digits after removing the leading zero.
 *
 * @param {string} phoneNumber - The phone number to validate
 * @returns {boolean} True if the phone number is valid Indonesian format
 */
function isValidIndonesianPhone(phoneNumber) {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return false;
  }

  // Remove any whitespace or dashes for flexibility
  const cleaned = phoneNumber.replace(/[\s\-]/g, '');

  // Must start with +62 or 08
  if (!cleaned.startsWith('+62') && !cleaned.startsWith('08')) {
    return false;
  }

  // Normalize to local format (replace +62 with 0)
  let normalized;
  if (cleaned.startsWith('+62')) {
    normalized = '0' + cleaned.slice(3);
  } else {
    normalized = cleaned;
  }

  // After normalization, must start with 08
  if (!normalized.startsWith('08')) {
    return false;
  }

  // Must contain only digits after normalization
  if (!/^\d+$/.test(normalized)) {
    return false;
  }

  // Total digits should be 10-13 (which is 9-12 digits after the leading 0)
  const digitCount = normalized.length;
  if (digitCount < 10 || digitCount > 13) {
    return false;
  }

  return true;
}

module.exports = {
  isValidIndonesianPhone,
};
