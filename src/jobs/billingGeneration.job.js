/**
 * Billing Generation Job
 * Runs at 00:00 on the 1st of every month.
 * Generates invoices for all active subscriptions (base + PPN).
 * Queues WhatsApp notifications for each generated invoice.
 * Handles partial failures: continues processing and logs failed records.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 42.3
 */

const { registerJob } = require('./index');
const billingService = require('../services/billing.service');
const subscriptionModel = require('../models/subscription.model');
const { SUBSCRIPTION_STATUS } = require('../utils/constants');
const { appPool } = require('../config/database');

/** Cron schedule: 00:00 on the 1st of every month */
const BILLING_CRON_SCHEDULE = process.env.BILLING_CRON || '0 0 1 * *';

/**
 * Fetch all active subscriptions with package and customer details for billing.
 * Returns subscriptions that have status 'Active'.
 *
 * @returns {Promise<Array>} List of active subscriptions with joined details
 */
async function getActiveSubscriptions() {
  const [rows] = await appPool.execute(
    `SELECT s.id, s.customer_id, s.package_id, s.pppoe_username, s.activated_at,
            c.full_name AS customer_name, c.whatsapp_number, c.email,
            p.name AS package_name, p.monthly_price, p.ppn_enabled
     FROM subscriptions s
     LEFT JOIN customers c ON s.customer_id = c.id
     LEFT JOIN packages p ON s.package_id = p.id
     WHERE s.status = ?`,
    [SUBSCRIPTION_STATUS.ACTIVE]
  );
  return rows;
}

/**
 * Billing generation handler.
 * Iterates over all active subscriptions, generates an invoice for each,
 * and queues notifications. Continues processing on individual failures.
 *
 * @returns {Promise<{records_processed: number, records_failed: number, errors: string[]}>}
 */
async function billingGenerationHandler() {
  const now = new Date();
  const billingPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const generationDate = now.toISOString().slice(0, 10);

  // Fetch all active subscriptions
  const activeSubscriptions = await getActiveSubscriptions();

  let recordsProcessed = 0;
  let recordsFailed = 0;
  const errors = [];

  for (const subscription of activeSubscriptions) {
    try {
      // Generate invoice for this subscription
      // billingService.generateInvoice handles:
      // - Base amount calculation (package monthly_price)
      // - PPN calculation (11% when ppn_enabled)
      // - Invoice status set to UNPAID
      // - Due date set to 10th of billing month
      // - Queuing WhatsApp notification based on subscription age
      await billingService.generateInvoice(subscription.id, {
        isFirstInvoice: false,
        billingPeriod,
        generationDate,
      });

      recordsProcessed++;
    } catch (err) {
      // Handle duplicate invoice (already generated) - count as processed
      if (err.code === 'RESOURCE_ALREADY_EXISTS') {
        recordsProcessed++;
        continue;
      }

      // Log the failure and continue processing other subscriptions
      recordsFailed++;
      errors.push(
        `Subscription ${subscription.id} (${subscription.pppoe_username || 'unknown'}): ${err.message}`
      );
      console.error(
        `[BillingGeneration] Failed for subscription ${subscription.id}:`,
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
 * Register the billing generation job with the scheduler.
 */
function register() {
  registerJob({
    name: 'billing-generation',
    schedule: BILLING_CRON_SCHEDULE,
    handler: billingGenerationHandler,
    description: 'Generate monthly invoices for all active subscriptions on the 1st of each month',
  });
}

module.exports = {
  register,
  billingGenerationHandler,
  getActiveSubscriptions,
};
