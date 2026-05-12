/**
 * FUP Reset Scheduled Job
 * Runs at 00:00 on the 1st of every month.
 * Resets FUP usage counters for all subscriptions and restores
 * original speed profiles via CoA for throttled subscriptions.
 *
 * Requirements: 41.3
 */

const { registerJob } = require('./index');
const fupUsageModel = require('../models/fupUsage.model');
const radiusService = require('../services/radius.service');
const coaService = require('../services/coa.service');
const { buildNormalRateLimit } = require('../utils/fupCalc');
const { COA_TRIGGER_TYPE, SUBSCRIPTION_STATUS } = require('../utils/constants');

/** Cron schedule: 00:00 on the 1st of every month */
const FUP_RESET_CRON_SCHEDULE = process.env.FUP_RESET_CRON || '0 0 1 * *';

/**
 * Get the previous billing period (YYYY-MM) relative to the current date.
 * Since this job runs on the 1st of the month, the previous period is last month.
 *
 * @returns {string} Previous billing period in YYYY-MM format
 */
function getPreviousBillingPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed, so current month index = previous month number

  // Handle January -> December of previous year
  if (month === 0) {
    return `${year - 1}-12`;
  }

  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * FUP reset job handler.
 * Performs the following for the previous billing period:
 * 1. Find all throttled subscriptions (threshold_exceeded = true)
 * 2. For each throttled subscription:
 *    a. Reset the RADIUS FUP profile (remove rate limit attribute)
 *    b. Send CoA to NAS to restore original speed
 * 3. Reset all FUP usage records for the period (set bytes_used=0, threshold_exceeded=false)
 *
 * @returns {Promise<{records_processed: number, records_failed: number, errors: string[]}>}
 */
async function fupResetHandler() {
  const previousPeriod = getPreviousBillingPeriod();

  // Step 1: Find all throttled subscriptions for the previous billing period
  const throttledSubscriptions = await fupUsageModel.findThrottledByPeriod(previousPeriod);

  let recordsProcessed = 0;
  let recordsFailed = 0;
  const errors = [];

  // Step 2: Restore original speed for each throttled subscription
  for (const subscription of throttledSubscriptions) {
    try {
      // 2a: Reset FUP profile in RADIUS DB (remove Mikrotik-Rate-Limit attribute)
      await radiusService.resetFUPProfile(subscription.pppoe_username);

      // 2b: Send CoA to NAS to apply original speed
      const normalRateLimit = buildNormalRateLimit({
        upload_rate_limit: subscription.upload_rate_limit,
        download_rate_limit: subscription.download_rate_limit,
      });

      if (normalRateLimit && subscription.nas_id) {
        const coaResult = await coaService.sendCoA(
          subscription.subscription_id,
          subscription.nas_id,
          COA_TRIGGER_TYPE.FUP,
          {
            username: subscription.pppoe_username,
            rateLimit: normalRateLimit,
          }
        );

        if (!coaResult.success) {
          console.warn(
            `[FUPReset] CoA failed for subscription ${subscription.subscription_id} ` +
            `(${subscription.pppoe_username}): status=${coaResult.responseStatus}, retries=${coaResult.retryCount}. ` +
            'RADIUS profile was reset; speed will apply on next session reconnect.'
          );
        }
      }

      recordsProcessed++;
    } catch (err) {
      recordsFailed++;
      errors.push(
        `Subscription ${subscription.subscription_id} (${subscription.pppoe_username || 'unknown'}): ${err.message}`
      );
      console.error(
        `[FUPReset] Failed for subscription ${subscription.subscription_id}:`,
        err.message
      );
    }
  }

  // Step 3: Reset all FUP usage records for the previous period
  try {
    const resetCount = await fupUsageModel.resetByPeriod(previousPeriod);
    console.log(`[FUPReset] Reset ${resetCount} FUP usage record(s) for period ${previousPeriod}`);
  } catch (err) {
    // If bulk reset fails, log but don't override individual record results
    errors.push(`Bulk reset for period ${previousPeriod}: ${err.message}`);
    console.error(`[FUPReset] Bulk reset failed for period ${previousPeriod}:`, err.message);
  }

  return {
    records_processed: recordsProcessed,
    records_failed: recordsFailed,
    errors,
  };
}

/**
 * Register the FUP reset job with the scheduler.
 */
function register() {
  registerJob({
    name: 'fup-reset',
    schedule: FUP_RESET_CRON_SCHEDULE,
    handler: fupResetHandler,
    description: 'Reset FUP usage counters and restore original speed profiles on the 1st of each month',
  });
}

module.exports = {
  register,
  fupResetHandler,
  getPreviousBillingPeriod,
};
