/**
 * Notification Queue Service.
 * Manages queuing, processing, and retry logic for notifications.
 * Supports WhatsApp, Email, and PushNotification channels.
 *
 * Queue flow:
 * 1. Business services call queueNotification() to add to queue
 * 2. processQueue() is called periodically (every 10s) by the scheduler
 * 3. Each queued notification is sent via the appropriate channel
 * 4. On failure, retry_count is incremented; after 3 retries, marked as Failed
 *
 * Requirements: 6.5, 6.6, 30.1, 30.2, 30.3, 30.4
 */

const notificationModel = require('../models/notification.model');
const whatsappService = require('./whatsapp.service');
const whatsappConfig = require('../config/whatsapp');
const {
  NOTIFICATION_CHANNEL,
  NOTIFICATION_STATUS,
  NOTIFICATION_ENTITY_TYPE,
} = require('../utils/constants');

/**
 * Queue a notification for sending.
 * @param {object} data - Notification data
 * @param {string} data.recipient - Recipient WhatsApp number (or email/device token)
 * @param {string} data.templateName - Message template name
 * @param {object} [data.parameters={}] - Template parameters (JSON)
 * @param {string} [data.channel='WhatsApp'] - Notification channel
 * @param {number} [data.relatedEntityId] - Related entity ID
 * @param {string} [data.relatedEntityType] - Related entity type
 * @returns {Promise<object>} Created notification record
 */
async function queueNotification(data) {
  const {
    recipient,
    templateName,
    parameters = {},
    channel = NOTIFICATION_CHANNEL.WHATSAPP,
    relatedEntityId = null,
    relatedEntityType = null,
  } = data;

  return notificationModel.create({
    recipient_whatsapp: recipient,
    template_name: templateName,
    parameters,
    channel,
    related_entity_id: relatedEntityId,
    related_entity_type: relatedEntityType,
  });
}

/**
 * Queue notifications for a customer based on subscription age.
 * - Subscribed <= 2 months: WhatsApp AND Email
 * - Subscribed > 2 months: PushNotification only
 *
 * @param {object} data - Notification data
 * @param {string} data.recipient - Recipient WhatsApp number
 * @param {string} data.templateName - Message template name
 * @param {object} [data.parameters={}] - Template parameters
 * @param {number} data.subscriptionMonths - Number of months subscribed
 * @param {number} [data.relatedEntityId] - Related entity ID
 * @param {string} [data.relatedEntityType] - Related entity type
 * @returns {Promise<Array>} Array of created notification records
 */
async function queueBySubscriptionAge(data) {
  const {
    recipient,
    templateName,
    parameters = {},
    subscriptionMonths,
    relatedEntityId = null,
    relatedEntityType = null,
  } = data;

  const notifications = [];

  if (subscriptionMonths <= 2) {
    // New customers: send via WhatsApp AND Email
    const waNotification = await queueNotification({
      recipient,
      templateName,
      parameters,
      channel: NOTIFICATION_CHANNEL.WHATSAPP,
      relatedEntityId,
      relatedEntityType,
    });
    notifications.push(waNotification);

    const emailNotification = await queueNotification({
      recipient,
      templateName,
      parameters,
      channel: NOTIFICATION_CHANNEL.EMAIL,
      relatedEntityId,
      relatedEntityType,
    });
    notifications.push(emailNotification);
  } else {
    // Older customers: push notification only
    const pushNotification = await queueNotification({
      recipient,
      templateName,
      parameters,
      channel: NOTIFICATION_CHANNEL.PUSH_NOTIFICATION,
      relatedEntityId,
      relatedEntityType,
    });
    notifications.push(pushNotification);
  }

  return notifications;
}

/**
 * Process the notification queue.
 * Fetches queued notifications and attempts to send them.
 * On failure, increments retry count; marks as Failed after max retries.
 *
 * @param {number} [batchSize] - Number of notifications to process per batch
 * @returns {Promise<{processed: number, sent: number, failed: number, retried: number}>}
 */
async function processQueue(batchSize) {
  const limit = batchSize || whatsappConfig.batchSize || 10;
  const maxRetries = whatsappConfig.maxRetries || 3;

  const queued = await notificationModel.findQueued(limit);

  let sent = 0;
  let failed = 0;
  let retried = 0;

  for (const notification of queued) {
    const result = await sendNotification(notification);

    if (result.success) {
      await notificationModel.markSent(notification.id);
      sent++;
    } else {
      const retryResult = await notificationModel.incrementRetry(
        notification.id,
        result.error,
        maxRetries
      );

      if (retryResult.newStatus === NOTIFICATION_STATUS.FAILED) {
        failed++;
      } else {
        retried++;
      }
    }
  }

  return {
    processed: queued.length,
    sent,
    failed,
    retried,
  };
}

/**
 * Send a single notification via the appropriate channel.
 * @param {object} notification - Notification record from DB
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendNotification(notification) {
  const { channel, recipient_whatsapp, template_name, parameters } = notification;

  // Parse parameters if stored as string
  let parsedParams = {};
  if (parameters) {
    try {
      parsedParams = typeof parameters === 'string' ? JSON.parse(parameters) : parameters;
    } catch (err) {
      return { success: false, error: 'Invalid parameters JSON' };
    }
  }

  switch (channel) {
    case NOTIFICATION_CHANNEL.WHATSAPP:
      return whatsappService.sendMessage(recipient_whatsapp, template_name, parsedParams);

    case NOTIFICATION_CHANNEL.EMAIL:
      // Email sending is a placeholder - would integrate with email service
      return sendEmail(recipient_whatsapp, template_name, parsedParams);

    case NOTIFICATION_CHANNEL.PUSH_NOTIFICATION:
      // Push notification is a placeholder - would integrate with FCM/APNs
      return sendPushNotification(recipient_whatsapp, template_name, parsedParams);

    default:
      return { success: false, error: `Unsupported notification channel: ${channel}` };
  }
}

/**
 * Send an email notification (placeholder implementation).
 * @param {string} recipient - Recipient identifier (email or phone for lookup)
 * @param {string} templateName - Email template name
 * @param {object} parameters - Template parameters
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendEmail(recipient, templateName, parameters) {
  // Placeholder: Email service integration would go here
  // For now, log and return success to not block the queue
  console.log(`[Notification] Email send to ${recipient}: template=${templateName}`);
  return { success: true };
}

/**
 * Send a push notification (placeholder implementation).
 * @param {string} recipient - Recipient identifier (device token or phone for lookup)
 * @param {string} templateName - Push notification template name
 * @param {object} parameters - Template parameters
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendPushNotification(recipient, templateName, parameters) {
  // Placeholder: FCM/APNs integration would go here
  // For now, log and return success to not block the queue
  console.log(`[Notification] Push notification to ${recipient}: template=${templateName}`);
  return { success: true };
}

/**
 * Queue a broadcast notification to multiple recipients.
 * @param {object} data - Broadcast data
 * @param {Array<string>} data.recipients - List of recipient WhatsApp numbers
 * @param {string} data.templateName - Message template name
 * @param {object} [data.parameters={}] - Template parameters
 * @param {string} [data.channel='WhatsApp'] - Notification channel
 * @returns {Promise<{queued: number, notifications: Array}>}
 */
async function queueBroadcast(data) {
  const {
    recipients,
    templateName,
    parameters = {},
    channel = NOTIFICATION_CHANNEL.WHATSAPP,
  } = data;

  const notifications = [];

  for (const recipient of recipients) {
    const notification = await queueNotification({
      recipient,
      templateName,
      parameters,
      channel,
    });
    notifications.push(notification);
  }

  return {
    queued: notifications.length,
    notifications,
  };
}

/**
 * Get notification queue status (for admin dashboard).
 * @param {object} [filters={}] - Optional filters
 * @returns {Promise<{notifications: Array, total: number}>}
 */
async function getQueue(filters = {}) {
  return notificationModel.findAll(filters);
}

module.exports = {
  queueNotification,
  queueBySubscriptionAge,
  processQueue,
  sendNotification,
  queueBroadcast,
  getQueue,
};
