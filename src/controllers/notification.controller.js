/**
 * Notification controller.
 * Handles HTTP requests for notification queue management and broadcast messaging.
 *
 * Requirements: 30.5
 */

const notificationService = require('../services/notification.service');
const { success, created, error, paginated } = require('../utils/responseHelper');
const { ERROR_CODE } = require('../utils/constants');

/**
 * GET /api/notifications/queue
 * View notification queue with optional filters and pagination.
 */
async function getQueue(req, res) {
  try {
    const filters = {
      status: req.query.status,
      channel: req.query.channel,
      related_entity_type: req.query.related_entity_type,
      related_entity_id: req.query.related_entity_id ? Number(req.query.related_entity_id) : undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
    };

    const result = await notificationService.getQueue(filters);

    const page = filters.page;
    const limit = filters.limit;
    const totalPages = Math.ceil(result.total / limit);

    return paginated(res, result.notifications, {
      page,
      limit,
      totalItems: result.total,
      totalPages,
    }, 'Notification queue retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/notifications/broadcast
 * Send a broadcast notification to multiple recipients.
 */
async function broadcast(req, res) {
  try {
    const { recipients, template_name, parameters, channel } = req.body;

    const result = await notificationService.queueBroadcast({
      recipients,
      templateName: template_name,
      parameters: parameters || {},
      channel,
    });

    return created(res, result, 'Broadcast notifications queued successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

module.exports = {
  getQueue,
  broadcast,
};
