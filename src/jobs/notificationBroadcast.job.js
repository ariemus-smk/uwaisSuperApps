/**
 * Notification Broadcast Job
 * Runs every 10 seconds (configurable via NOTIF_BROADCAST_CRON env var).
 * Processes queued notifications in batches of 10:
 * 1. Fetches notifications with status=Queued (LIMIT 10)
 * 2. Sends each via the appropriate channel (WhatsApp, Email, Push)
 * 3. Updates status to Sent on success
 * 4. Handles retries: increments retry_count on failure, marks as Failed after 3 retries
 *
 * Requirements: 30.1, 30.4
 */

const { registerJob } = require('./index');
const notificationService = require('../services/notification.service');

/** Cron schedule: every 10 seconds (configurable via env) */
const NOTIF_BROADCAST_CRON_SCHEDULE = process.env.NOTIF_BROADCAST_CRON || '*/10 * * * * *';

/**
 * Notification broadcast job handler.
 * Delegates to notificationService.processQueue() which:
 * 1. Fetches up to 10 queued notifications (SELECT WHERE status=Queued LIMIT 10)
 * 2. Sends each notification via the appropriate channel (WhatsApp API, Email, Push)
 * 3. On success: marks notification as Sent with sent_at timestamp
 * 4. On failure: increments retry_count; if retry_count >= 3, marks as Failed
 * 5. Notifications that fail but haven't reached max retries remain Queued for next batch
 *
 * @returns {Promise<{records_processed: number, records_failed: number, errors: string[]}>}
 */
async function notificationBroadcastHandler() {
  const result = await notificationService.processQueue();

  const recordsProcessed = result.sent + result.retried;
  const recordsFailed = result.failed;
  const errors = [];

  if (result.failed > 0) {
    errors.push(`${result.failed} notification(s) permanently failed after max retries`);
  }

  return {
    records_processed: recordsProcessed,
    records_failed: recordsFailed,
    errors,
  };
}

/**
 * Register the notification broadcast job with the scheduler.
 */
function register() {
  registerJob({
    name: 'notification-broadcast',
    schedule: NOTIF_BROADCAST_CRON_SCHEDULE,
    handler: notificationBroadcastHandler,
    description: 'Process queued notifications every 10 seconds, send via WhatsApp/Email/Push with retry logic',
  });
}

module.exports = {
  register,
  notificationBroadcastHandler,
};
