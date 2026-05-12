/**
 * Customer Audit Log model for App DB.
 * Provides data access methods for the `customer_audit_log` table.
 * Records all customer lifecycle status changes for audit purposes.
 */

const { appPool } = require('../config/database');

/**
 * Find audit log entries for a specific customer.
 * @param {number} customerId - Customer ID
 * @param {object} [options={}] - Query options
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=50] - Items per page
 * @returns {Promise<{logs: Array, total: number}>} Paginated audit log entries
 */
async function findByCustomerId(customerId, options = {}) {
  const { page = 1, limit = 50 } = options;

  const [countRows] = await appPool.execute(
    'SELECT COUNT(*) as total FROM customer_audit_log WHERE customer_id = ?',
    [customerId]
  );
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  const [rows] = await appPool.execute(
    `SELECT cal.*, u.full_name as actor_name
     FROM customer_audit_log cal
     LEFT JOIN users u ON cal.actor_id = u.id
     WHERE cal.customer_id = ?
     ORDER BY cal.changed_at DESC
     LIMIT ? OFFSET ?`,
    [customerId, String(limit), String(offset)]
  );

  return { logs: rows, total };
}

/**
 * Create a new audit log entry.
 * Typically called within a transaction by the customer model's updateStatus.
 * @param {object} data - Audit log data
 * @param {number} data.customer_id
 * @param {string} data.previous_status
 * @param {string} data.new_status
 * @param {number} data.actor_id
 * @param {object} [connection] - Optional DB connection (for transactions)
 * @returns {Promise<object>} Created audit log entry with insertId
 */
async function create(data, connection = null) {
  const { customer_id, previous_status, new_status, actor_id } = data;
  const db = connection || appPool;

  const [result] = await db.execute(
    `INSERT INTO customer_audit_log (customer_id, previous_status, new_status, actor_id, changed_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [customer_id, previous_status, new_status, actor_id]
  );

  return { id: result.insertId, ...data };
}

/**
 * Find the most recent status change for a customer.
 * @param {number} customerId - Customer ID
 * @returns {Promise<object|null>} Most recent audit log entry or null
 */
async function findLatestByCustomerId(customerId) {
  const [rows] = await appPool.execute(
    `SELECT * FROM customer_audit_log
     WHERE customer_id = ?
     ORDER BY changed_at DESC
     LIMIT 1`,
    [customerId]
  );
  return rows.length > 0 ? rows[0] : null;
}

module.exports = {
  findByCustomerId,
  create,
  findLatestByCustomerId,
};
