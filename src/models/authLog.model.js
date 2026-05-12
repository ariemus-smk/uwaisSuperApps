/**
 * AuthLog model for App DB.
 * Provides data access methods for the `auth_logs` table.
 */

const { appPool } = require('../config/database');

/**
 * Create a new auth log entry.
 * @param {object} params
 * @param {number|null} params.userId - User ID (null for failed logins with unknown user)
 * @param {string} params.username - Username attempted
 * @param {string} params.eventType - One of: LoginSuccess, LoginFailed, TokenRefresh, PasswordReset
 * @param {string} params.ipAddress - Client IP address
 * @returns {Promise<object>} Insert result
 */
async function create({ userId, username, eventType, ipAddress }) {
  const [result] = await appPool.execute(
    'INSERT INTO auth_logs (user_id, username, event_type, ip_address) VALUES (?, ?, ?, ?)',
    [userId || null, username, eventType, ipAddress]
  );
  return result;
}

module.exports = {
  create,
};
