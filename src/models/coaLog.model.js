/**
 * CoA Log model for App DB.
 * Provides data access methods for the `coa_logs` table.
 * Tracks all CoA/POD operations with timestamps, trigger types, and response statuses.
 *
 * Requirements: 13.5, 13.6
 */

const { appPool } = require('../config/database');

/**
 * Create a new CoA log entry.
 * @param {object} logData - CoA log data
 * @param {number} logData.subscription_id - Target subscription ID
 * @param {number} logData.nas_id - Target NAS device ID
 * @param {string} logData.trigger_type - Trigger type (SpeedChange, Isolir, Unisolir, FUP, Kick)
 * @param {string} [logData.request_payload] - Request payload (radclient command/attributes)
 * @param {string} [logData.response_status='Pending'] - Response status (ACK, NAK, Timeout, Pending)
 * @param {number} [logData.retry_count=0] - Number of retries performed
 * @returns {Promise<object>} Created log entry with insertId
 */
async function create(logData) {
  const {
    subscription_id,
    nas_id,
    trigger_type,
    request_payload = null,
    response_status = 'Pending',
    retry_count = 0,
  } = logData;

  const [result] = await appPool.execute(
    `INSERT INTO coa_logs (subscription_id, nas_id, trigger_type, request_payload, response_status, retry_count, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [subscription_id, nas_id, trigger_type, request_payload, response_status, retry_count]
  );

  return { id: result.insertId, ...logData, response_status, retry_count };
}

/**
 * Update a CoA log entry (typically to set response_status and responded_at).
 * @param {number} id - CoA log ID
 * @param {object} updateData - Fields to update
 * @param {string} [updateData.response_status] - Updated response status
 * @param {number} [updateData.retry_count] - Updated retry count
 * @returns {Promise<object>} Query result
 */
async function update(id, updateData) {
  const allowedFields = ['response_status', 'retry_count', 'responded_at'];
  const setClauses = [];
  const params = [];

  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      params.push(updateData[field]);
    }
  }

  if (setClauses.length === 0) {
    return { affectedRows: 0 };
  }

  params.push(id);

  const [result] = await appPool.execute(
    `UPDATE coa_logs SET ${setClauses.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Find a CoA log entry by ID.
 * @param {number} id
 * @returns {Promise<object|null>} CoA log record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    'SELECT * FROM coa_logs WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find CoA logs by subscription ID.
 * @param {number} subscriptionId
 * @returns {Promise<Array>} List of CoA log records
 */
async function findBySubscription(subscriptionId) {
  const [rows] = await appPool.execute(
    'SELECT * FROM coa_logs WHERE subscription_id = ? ORDER BY sent_at DESC',
    [subscriptionId]
  );
  return rows;
}

/**
 * Find all CoA logs with optional filters and pagination.
 * @param {object} [filters={}] - Optional filters
 * @param {number} [filters.subscription_id] - Filter by subscription
 * @param {number} [filters.nas_id] - Filter by NAS device
 * @param {string} [filters.trigger_type] - Filter by trigger type
 * @param {string} [filters.response_status] - Filter by response status
 * @param {string} [filters.from_date] - Filter from date (YYYY-MM-DD)
 * @param {string} [filters.to_date] - Filter to date (YYYY-MM-DD)
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @returns {Promise<{logs: Array, total: number}>} Paginated log list
 */
async function findAll(filters = {}) {
  const { subscription_id, nas_id, trigger_type, response_status, from_date, to_date, page = 1, limit = 20 } = filters;

  let countQuery = 'SELECT COUNT(*) as total FROM coa_logs WHERE 1=1';
  let dataQuery = `SELECT cl.*, s.pppoe_username, nd.name AS nas_name, nd.ip_address AS nas_ip
    FROM coa_logs cl
    LEFT JOIN subscriptions s ON cl.subscription_id = s.id
    LEFT JOIN nas_devices nd ON cl.nas_id = nd.id
    WHERE 1=1`;
  const params = [];

  if (subscription_id) {
    countQuery += ' AND subscription_id = ?';
    dataQuery += ' AND cl.subscription_id = ?';
    params.push(subscription_id);
  }

  if (nas_id) {
    countQuery += ' AND nas_id = ?';
    dataQuery += ' AND cl.nas_id = ?';
    params.push(nas_id);
  }

  if (trigger_type) {
    countQuery += ' AND trigger_type = ?';
    dataQuery += ' AND cl.trigger_type = ?';
    params.push(trigger_type);
  }

  if (response_status) {
    countQuery += ' AND response_status = ?';
    dataQuery += ' AND cl.response_status = ?';
    params.push(response_status);
  }

  if (from_date) {
    countQuery += ' AND sent_at >= ?';
    dataQuery += ' AND cl.sent_at >= ?';
    params.push(from_date);
  }

  if (to_date) {
    countQuery += ' AND sent_at <= ?';
    dataQuery += ' AND cl.sent_at <= ?';
    params.push(`${to_date} 23:59:59`);
  }

  const [countRows] = await appPool.execute(countQuery, params);
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  dataQuery += ' ORDER BY cl.sent_at DESC LIMIT ? OFFSET ?';
  const dataParams = [...params, String(limit), String(offset)];

  const [rows] = await appPool.execute(dataQuery, dataParams);

  return { logs: rows, total };
}

module.exports = {
  create,
  update,
  findById,
  findBySubscription,
  findAll,
};
