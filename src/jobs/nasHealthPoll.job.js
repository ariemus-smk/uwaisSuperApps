/**
 * NAS Health Polling Scheduled Job
 * Runs every 5 minutes (configurable via NAS_POLL_CRON env var).
 * Polls all active NAS devices to determine their Up/Down status,
 * tracks status transitions with timestamps, and generates alert events
 * on status changes.
 *
 * Requirements: 14.1, 14.3, 14.4
 */

const { registerJob } = require('./index');
const nasService = require('../services/nas.service');

/** Cron schedule: every 5 minutes (configurable via env) */
const NAS_POLL_CRON_SCHEDULE = process.env.NAS_POLL_CRON || '*/5 * * * *';

/**
 * NAS health poll job handler.
 * Delegates to nasService.pollAllNas() which:
 * 1. Fetches all active NAS devices from the database
 * 2. Pings/tests connectivity for each NAS (TCP to API port)
 * 3. Detects Up/Down status transitions
 * 4. Logs outage start time when NAS goes Down (Req 14.3)
 * 5. Logs outage end time and calculates downtime when NAS recovers (Req 14.4)
 * 6. Updates the NAS poll_status and last_poll_at in the database
 * 7. Generates alert events on status changes
 *
 * @returns {Promise<{records_processed: number, records_failed: number, errors: string[]}>}
 */
async function nasHealthPollHandler() {
  const pollResults = await nasService.pollAllNas();

  const recordsProcessed = pollResults.up + pollResults.down;
  const recordsFailed = pollResults.errors.length;
  const errors = pollResults.errors.map(
    (e) => `NAS ${e.nasId} (${e.nasName}): ${e.error}`
  );

  return {
    records_processed: recordsProcessed,
    records_failed: recordsFailed,
    errors,
  };
}

/**
 * Register the NAS health poll job with the scheduler.
 */
function register() {
  registerJob({
    name: 'nas-health-poll',
    schedule: NAS_POLL_CRON_SCHEDULE,
    handler: nasHealthPollHandler,
    description: 'Poll all active NAS devices every 5 minutes to determine Up/Down status and track transitions',
  });
}

module.exports = {
  register,
  nasHealthPollHandler,
};
