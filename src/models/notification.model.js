/**
 * Notification model for App DB.
 * Provides data access methods for the `notifications` table.
 * Manages the notification queue for WhatsApp, Email, and PushNotification channels.
 *
 * Requirements: 6.5, 6.6, 30.1, 30.2, 30.3, 30.4
 */

const { appPool } = require('../config/database');
const { NOTIFICATION_STATUS, NOTIFICATION_CHANNEL } = require('../utils/constants');

/**
 * Find a notification by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Notification record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    'SELECT * FROM notifications WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Create a new notification record (queue a notification).
 * @param {object} data - Notification data
 * @param {string} data.recipient_whatsapp - Recipient WhatsApp number
 * @param {string} data.template_name - Message template name
 * @param {object|string} [data.parameters] - Template parameters (JSON)
 * @param {string} [data.channel='WhatsApp'] - Notification channel
 * @param {number} [data.related_entity_id] - Related entity ID
 * @param {string} [data.related_entity_type] - Related entity type
 * @returns {Promise<object>} Created notification with insertId
 */
async function create(data) {
  const {
    recipient_whatsapp,
    template_name,
    parameters = null,
    channel = NOTIFICATION_CHANNEL.WHATSAPP,
    related_entity_id = null,
    related_entity_type = null,
  } = data;

  const parametersJson = parameters
    ? (typeof parameters === 'string' ? parameters : JSON.stringify(parameters))
    : null;

  const [result] = await appPool.execute(
    `INSERT INTO notifications (recipient_whatsapp, template_name, parameters, channel,
      status, retry_count, related_entity_id, related_entity_type, queued_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, NOW())`,
    [
      recipient_whatsapp,
      template_name,
      parametersJson,
      channel,
      NOTIFICATION_STATUS.QUEUED,
      related_entity_id,
      related_entity_type,
    ]
  );

  return {
    id: result.insertId,
    recipient_whatsapp,
    template_name,
    parameters: parametersJson,
    channel,
    status: NOTIFICATION_STATUS.QUEUED,
    retry_count: 0,
    related_entity_id,
    related_entity_type,
  };
}

/**
 * Find queued notifications ready for processing.
 * @param {number} [limit=10] - Maximum number of notifications to fetch
 * @returns {Promise<Array>} List of queued notifications
 */
async function findQueued(limit = 10) {
  const [rows] = await appPool.execute(
    `SELECT * FROM notifications
     WHERE status = ?
     ORDER BY queued_at ASC
     LIMIT ?`,
    [NOTIFICATION_STATUS.QUEUED, String(limit)]
  );
  return rows;
}

/**
 * Update notification status to Sent.
 * @param {number} id - Notification ID
 * @returns {Promise<object>} Query result
 */
async function markSent(id) {
  const [result] = await appPool.execute(
    `UPDATE notifications SET status = ?, sent_at = NOW() WHERE id = ?`,
    [NOTIFICATION_STATUS.SENT, id]
  );
  return result;
}

/**
 * Increment retry count and optionally mark as Failed.
 * @param {number} id - Notification ID
 * @param {string} failureReason - Reason for failure
 * @param {number} maxRetries - Maximum retry attempts before marking as Failed
 * @returns {Promise<object>} Query result with updated status
 */
async function incrementRetry(id, failureReason, maxRetries = 3) {
  // Get current retry count
  const notification = await findById(id);
  if (!notification) {
    return { affectedRows: 0 };
  }

  const newRetryCount = notification.retry_count + 1;
  const newStatus = newRetryCount >= maxRetries
    ? NOTIFICATION_STATUS.FAILED
    : NOTIFICATION_STATUS.QUEUED;

  const [result] = await appPool.execute(
    `UPDATE notifications SET retry_count = ?, status = ?, failure_reason = ? WHERE id = ?`,
    [newRetryCount, newStatus, failureReason, id]
  );

  return { ...result, newStatus, newRetryCount };
}

/**
 * Mark a notification as Failed.
 * @param {number} id - Notification ID
 * @param {string} failureReason - Reason for failure
 * @returns {Promise<object>} Query result
 */
async function markFailed(id, failureReason) {
  const [result] = await appPool.execute(
    `UPDATE notifications SET status = ?, failure_reason = ? WHERE id = ?`,
    [NOTIFICATION_STATUS.FAILED, failureReason, id]
  );
  return result;
}

/**
 * List notifications with optional filters and pagination.
 * @param {object} [filters={}] - Optional filters
 * @param {string} [filters.status] - Filter by status
 * @param {string} [filters.channel] - Filter by channel
 * @param {string} [filters.related_entity_type] - Filter by entity type
 * @param {number} [filters.related_entity_id] - Filter by entity ID
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @returns {Promise<{notifications: Array, total: number}>} Paginated notification list
 */
async function findAll(filters = {}) {
  const { status, channel, related_entity_type, related_entity_id, page = 1, limit = 20 } = filters;

  let countQuery = 'SELECT COUNT(*) as total FROM notifications WHERE 1=1';
  let dataQuery = 'SELECT * FROM notifications WHERE 1=1';
  const params = [];

  if (status) {
    countQuery += ' AND status = ?';
    dataQuery += ' AND status = ?';
    params.push(status);
  }

  if (channel) {
    countQuery += ' AND channel = ?';
    dataQuery += ' AND channel = ?';
    params.push(channel);
  }

  if (related_entity_type) {
    countQuery += ' AND related_entity_type = ?';
    dataQuery += ' AND related_entity_type = ?';
    params.push(related_entity_type);
  }

  if (related_entity_id) {
    countQuery += ' AND related_entity_id = ?';
    dataQuery += ' AND related_entity_id = ?';
    params.push(related_entity_id);
  }

  const [countRows] = await appPool.execute(countQuery, params);
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  dataQuery += ' ORDER BY queued_at DESC LIMIT ? OFFSET ?';
  const dataParams = [...params, String(limit), String(offset)];

  const [rows] = await appPool.execute(dataQuery, dataParams);

  return { notifications: rows, total };
}

/**
 * Find notifications by related entity.
 * @param {string} entityType - Related entity type
 * @param {number} entityId - Related entity ID
 * @returns {Promise<Array>} List of notifications for the entity
 */
async function findByEntity(entityType, entityId) {
  const [rows] = await appPool.execute(
    `SELECT * FROM notifications
     WHERE related_entity_type = ? AND related_entity_id = ?
     ORDER BY queued_at DESC`,
    [entityType, entityId]
  );
  return rows;
}

module.exports = {
  findById,
  create,
  findQueued,
  markSent,
  incrementRetry,
  markFailed,
  findAll,
  findByEntity,
};
