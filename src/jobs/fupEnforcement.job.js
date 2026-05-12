/**
 * FUP (Fair Usage Policy) Enforcement Scheduled Job
 * Runs every hour (configurable via FUP_CHECK_CRON env var).
 * Checks cumulative data usage from radacct (RADIUS DB) for all active
 * subscriptions with FUP-enabled packages. Triggers CoA speed reduction
 * when quota is exceeded.
 *
 * Requirements: 41.1, 41.2, 41.4
 */

const { registerJob } = require('./index');
const coaService = require('../services/coa.service');
const radacctModel = require('../radiusModels/radacct.model');
const fupUsageModel = require('../models/fupUsage.model');
const { appPool } = require('../config/database');
const { SUBSCRIPTION_STATUS, COA_TRIGGER_TYPE } = require('../utils/constants');
const { isThresholdExceeded, buildFupRateLimit } = require('../utils/fupCalc');

/** Cron schedule: every hour (configurable via env) */
const FUP_CHECK_CRON_SCHEDULE = process.env.FUP_CHECK_CRON || '0 * * * *';

/**
 * Get the current billing period in YYYY-MM format.
 * @returns {string} Current billing period
 */
function getCurrentBillingPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get the start date of the current billing period.
 * Billing cycle starts on the 1st of each month.
 * @param {string} billingPeriod - Billing period in YYYY-MM format
 * @returns {string} Start date in YYYY-MM-DD format
 */
function getBillingPeriodStartDate(billingPeriod) {
  return `${billingPeriod}-01`;
}

/**
 * Get the end date of the current billing period (last day of month).
 * @param {string} billingPeriod - Billing period in YYYY-MM format
 * @returns {string} End date in YYYY-MM-DD 23:59:59 format
 */
function getBillingPeriodEndDate(billingPeriod) {
  const [year, month] = billingPeriod.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${billingPeriod}-${String(lastDay).padStart(2, '0')} 23:59:59`;
}

/**
 * Fetch all active subscriptions with FUP-enabled packages.
 * Joins subscriptions with packages to get FUP configuration.
 *
 * @returns {Promise<Array>} List of subscriptions with FUP package details
 */
async function getFupEnabledSubscriptions() {
  const [rows] = await appPool.execute(
    `SELECT s.id AS subscription_id, s.pppoe_username, s.nas_id, s.customer_id,
            p.id AS package_id, p.name AS package_name,
            p.fup_enabled, p.fup_quota_gb, p.fup_upload_speed, p.fup_download_speed,
            p.upload_rate_limit, p.download_rate_limit
     FROM subscriptions s
     INNER JOIN packages p ON s.package_id = p.id
     WHERE s.status = ? AND p.fup_enabled = 1 AND p.fup_quota_gb IS NOT NULL`,
    [SUBSCRIPTION_STATUS.ACTIVE]
  );
  return rows;
}

/**
 * Get cumulative data usage for a PPPoE username within a billing period.
 * Queries the radacct table in the RADIUS DB for total input + output octets.
 *
 * @param {string} username - PPPoE username
 * @param {string} startDate - Start date of billing period (YYYY-MM-DD)
 * @param {string} endDate - End date of billing period (YYYY-MM-DD HH:MM:SS)
 * @returns {Promise<number>} Total bytes used (input + output)
 */
async function getUsageFromRadacct(username, startDate, endDate) {
  const usage = await radacctModel.getUsageSummary(username, startDate, endDate);
  // Total usage = download (outputOctets from NAS perspective) + upload (inputOctets)
  return (usage.inputOctets || 0) + (usage.outputOctets || 0);
}

/**
 * FUP enforcement job handler.
 * For each active subscription with FUP-enabled package:
 * 1. Query cumulative data usage from radacct (RADIUS DB)
 * 2. Compare against FUP quota threshold
 * 3. If exceeded and not already throttled: trigger CoA speed reduction
 * 4. Update fup_usage tracking record
 *
 * @returns {Promise<{records_processed: number, records_failed: number, errors: string[]}>}
 */
async function fupEnforcementHandler() {
  const billingPeriod = getCurrentBillingPeriod();
  const startDate = getBillingPeriodStartDate(billingPeriod);
  const endDate = getBillingPeriodEndDate(billingPeriod);

  // Fetch all active subscriptions with FUP-enabled packages
  const subscriptions = await getFupEnabledSubscriptions();

  let recordsProcessed = 0;
  let recordsFailed = 0;
  const errors = [];

  for (const subscription of subscriptions) {
    try {
      // Step 1: Get cumulative usage from radacct (Req 41.1)
      const bytesUsed = await getUsageFromRadacct(
        subscription.pppoe_username,
        startDate,
        endDate
      );

      // Step 2: Check if threshold is exceeded
      const exceeded = isThresholdExceeded(bytesUsed, subscription);

      // Step 3: Check current FUP tracking status
      const existingRecord = await fupUsageModel.findBySubscriptionAndPeriod(
        subscription.subscription_id,
        billingPeriod
      );

      const alreadyThrottled = existingRecord && existingRecord.threshold_exceeded === 1;

      if (exceeded && !alreadyThrottled) {
        // Threshold just exceeded - trigger CoA speed reduction (Req 41.2)
        const fupRateLimit = buildFupRateLimit(subscription);

        if (fupRateLimit && subscription.nas_id && subscription.pppoe_username) {
          await coaService.speedChange(
            subscription.subscription_id,
            subscription.nas_id,
            subscription.pppoe_username,
            fupRateLimit
          );
        }

        // Mark as exceeded in tracking table
        await fupUsageModel.markExceeded(
          subscription.subscription_id,
          billingPeriod,
          bytesUsed
        );
      } else {
        // Update usage tracking (not exceeded or already throttled)
        await fupUsageModel.upsert({
          subscription_id: subscription.subscription_id,
          billing_period: billingPeriod,
          bytes_used: bytesUsed,
        });
      }

      recordsProcessed++;
    } catch (err) {
      recordsFailed++;
      errors.push(
        `Subscription ${subscription.subscription_id} (${subscription.pppoe_username || 'unknown'}): ${err.message}`
      );
      console.error(
        `[FUPEnforcement] Failed for subscription ${subscription.subscription_id}:`,
        err.message
      );
    }
  }

  return {
    records_processed: recordsProcessed,
    records_failed: recordsFailed,
    errors,
  };
}

/**
 * Register the FUP enforcement job with the scheduler.
 */
function register() {
  registerJob({
    name: 'fup-enforcement',
    schedule: FUP_CHECK_CRON_SCHEDULE,
    handler: fupEnforcementHandler,
    description: 'Check cumulative data usage and enforce FUP speed reduction every hour',
  });
}

module.exports = {
  register,
  fupEnforcementHandler,
  getFupEnabledSubscriptions,
  getUsageFromRadacct,
  getCurrentBillingPeriod,
  getBillingPeriodStartDate,
  getBillingPeriodEndDate,
};
