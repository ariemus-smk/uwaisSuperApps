const crypto = require('crypto');

/**
 * PPPoE Credential Generator
 * Generates unique PPPoE username/password pairs for customer subscriptions.
 * Ensures uniqueness by checking against existing radcheck entries via a provided checker function.
 *
 * Requirements: 3.2, 16.4
 */

/**
 * Generate a random alphanumeric string of the given length.
 * @param {number} length - Desired string length
 * @returns {string} Random alphanumeric string
 */
function generateRandomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * Generate a secure random password.
 * Uses a mix of uppercase, lowercase, digits, and special characters.
 * @param {number} [length=12] - Password length (minimum 8)
 * @returns {string} Secure random password
 */
function generatePassword(length = 12) {
  if (length < 8) {
    length = 8;
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

/**
 * Generate a PPPoE username based on date and random digits.
 * Format: YYYYMMDD + 6 random digits + @uwais.id (e.g., "20240515123456@uwais.id")
 * @returns {string} Generated username
 */
function generateUsername() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  
  // 6 random digits
  const randomSuffix = Math.floor(100000 + Math.random() * 900000).toString();
  
  return `${dateStr}${randomSuffix}@uwais.id`;
}

/**
 * Generate a unique PPPoE credential pair (username + password).
 * Checks uniqueness against existing radcheck entries using the provided checker function.
 *
 * @param {object} options - Generation options
 * @param {function} options.isUsernameUnique - Async function that checks radcheck uniqueness
 * @param {number} [options.maxAttempts=10] - Maximum attempts
 * @returns {Promise<{username: string, password: string}>} Generated credentials
 */
async function generatePPPoECredentials(options = {}) {
  const {
    isUsernameUnique,
    maxAttempts = 10,
  } = options;

  if (typeof isUsernameUnique !== 'function') {
    throw new Error('isUsernameUnique checker function is required');
  }

  let username;
  let isUnique = false;
  let attempts = 0;

  while (!isUnique && attempts < maxAttempts) {
    username = generateUsername();
    isUnique = await isUsernameUnique(username);
    attempts++;
  }

  if (!isUnique) {
    throw new Error(
      `Failed to generate unique PPPoE username after ${maxAttempts} attempts`
    );
  }

  const password = '1234567';

  return { username, password };
}

/**
 * Create a uniqueness checker function that queries the RADIUS database radcheck table.
 * This is a factory that returns the checker function expected by generatePPPoECredentials.
 *
 * @param {object} radiusPool - mysql2 connection pool for the RADIUS database
 * @returns {function} Async function that checks username uniqueness against radcheck
 */
function createRadcheckUniquenessChecker(radiusPool) {
  return async function isUsernameUnique(username) {
    const [rows] = await radiusPool.execute(
      'SELECT COUNT(*) as count FROM radcheck WHERE username = ?',
      [username]
    );
    return rows[0].count === 0;
  };
}

module.exports = {
  generatePPPoECredentials,
  generatePassword,
  generateUsername,
  generateRandomString,
  createRadcheckUniquenessChecker,
};
