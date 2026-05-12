/**
 * FUP Usage model for App DB.
 * Provides data access methods for the `fup_usage` table.
 * Tracks cumulative data usage per subscription per billing cycle
 * and whether the FUP threshold has been exceeded.
 *
 * Requirements: 41.1, 41.3
 */

const { appPool } = require('../config/database');

/**
 * Create or update a FUP usage record for a subscription/billing period.
 * Uses INSERT ... ON DUPLICATE KEY UPDATE for upsert behavior.
 *
 * @param {object} data - FUP usage data
 * @param {number} data.subscription_id - Subscription ID
 * @param {string} data.billing_period - Billing period (YYYY-MM)
 * @param {number} [data.bytes_used=0] - Cumulative bytes used
 * @param {boolean} [data.threshold_exceeded=false] - Whether threshold has been exceeded
 * @returns {Promise<object>} Created/updated record
 */
async function upsert(data) {
  const {
    subscription_id,
    billing_period,
    bytes_used = 0,
    threshold_exceeded = false,
  } = data;

  const [result] = await appPool.execute(
    `INSERT INTO fup_usage (subscription_id, billing_period, bytes_used, threshold_exceeded)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE bytes_used = VALUES(bytes_used), threshold_exceeded = VALUES(threshold_exceeded)`,
    [subscription_id, billing_period, bytes_used, threshold_exceeded ? 1 : 0]
  );

  return { id: result.insertId || result.affectedRows, subscription_id, billing_period, bytes_used, threshold_exceeded };
}

/**
 * Find FUP usage record by subscription and billing period.
 *
 * @param {number} subscriptionId - Subscription ID
 * @param {string} billingPeriod - Billing period (YYYY-MM)
 * @returns {Promise<object|null>} FUP usage record or null
 */
async function findBySubscriptionAndPeriod(subscriptionId, billingPeriod) {
  const [rows] = await appPool.execute(
    'SELECT * FROM fup_usage WHERE subscription_id = ? AND billing_period = ? LIMIT 1',
    [subscriptionId, billingPeriod]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find all throttled subscriptions (threshold_exceeded = true) for a given billing period.
 * Joins with subscriptions and packages to get necessary data for CoA restoration.
 *
 * @param {string} billingPeriod - Billing period (YYYY-MM)
 * @returns {Promise<Array>} List of throttled subscriptions with package and NAS info
 */
async function findThrottledByPeriod(billingPeriod) {
  const [rows] = await appPool.execute(
    `SELECT fu.id AS fup_usage_id, fu.subscription_id, fu.bytes_used, fu.exceeded_at,
            s.pppoe_username, s.nas_id, s.status AS subscription_status,
            p.upload_rate_limit, p.download_rate_limit,
            p.fup_upload_speed, p.fup_download_speed, p.fup_enabled
     FROM fup_usage fu
     INNER JOIN subscriptions s ON fu.subscription_id = s.id
     INNER JOIN packages p ON s.package_id = p.id
     WHERE fu.billing_period = ? AND fu.threshold_exceeded = 1 AND fu.reset_at IS NULL AND s.status = 'Active'`,
    [billingPeriod]
  );
  return rows;
}

/**
 * Reset all FUP usage records for a given billing period.
 * Sets bytes_used to 0, threshold_exceeded to false, and records reset_at timestamp.
 *
 * @param {string} billingPeriod - Billing period (YYYY-MM)
 * @returns {Promise<number>} Number of records updated
 */
async function resetByPeriod(billingPeriod) {
  const [result] = await appPool.execute(
    `UPDATE fup_usage
     SET bytes_used = 0, threshold_exceeded = 0, reset_at = NOW()
     WHERE billing_period = ? AND reset_at IS NULL`,
    [billingPeriod]
  );
  return result.affectedRows;
}

/**
 * Mark a FUP usage record as exceeded (throttled).
 * Creates or updates the record for the given subscription and billing period.
 *
 * @param {number} subscriptionId - Subscription ID
 * @param {string} billingPeriod - Billing period (YYYY-MM)
 * @param {number} bytesUsed - Current bytes used
 * @returns {Promise<object>} Query result
 */
async function markExceeded(subscriptionId, billingPeriod, bytesUsed) {
  const [result] = await appPool.execute(
    `INSERT INTO fup_usage (subscription_id, billing_period, bytes_used, threshold_exceeded, exceeded_at)
     VALUES (?, ?, ?, 1, NOW())
     ON DUPLICATE KEY UPDATE bytes_used = VALUES(bytes_used), threshold_exceeded = 1, exceeded_at = COALESCE(exceeded_at, NOW())`,
    [subscriptionId, billingPeriod, bytesUsed]
  );
  return result;
}

/**
 * Find all FUP usage records for a subscription.
 *
 * @param {number} subscriptionId - Subscription ID
 * @returns {Promise<Array>} List of FUP usage records
 */
async function findBySubscription(subscriptionId) {
  const [rows] = await appPool.execute(
    'SELECT * FROM fup_usage WHERE subscription_id = ? ORDER BY billing_period DESC',
    [subscriptionId]
  );
  return rows;
}

module.exports = {
  upsert,
  findBySubscriptionAndPeriod,
  findThrottledByPeriod,
  resetByPeriod,
  markExceeded,
  findBySubscription,
};
