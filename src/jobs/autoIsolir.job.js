/**
 * Auto-Isolir Scheduled Job
 * Runs at 23:59 on the 10th of every month.
 * Identifies subscriptions with UNPAID invoices past due date and:
 * 1. Sends CoA to NAS to add customer to isolir Address_List
 * 2. Updates customer lifecycle status to Isolir
 * 3. Sends notification to customer about service suspension
 * 4. For 2-month arrears: sends termination notice and creates device withdrawal ticket
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 11.3, 11.4
 */

const { registerJob } = require('./index');
const coaService = require('../services/coa.service');
const notificationService = require('../services/notification.service');
const customerModel = require('../models/customer.model');
const invoiceModel = require('../models/invoice.model');
const ticketService = require('../services/ticket.service');
const { appPool } = require('../config/database');
const {
  INVOICE_STATUS,
  CUSTOMER_STATUS,
  SUBSCRIPTION_STATUS,
  TICKET_SOURCE,
  NOTIFICATION_ENTITY_TYPE,
} = require('../utils/constants');

/** Cron schedule: 23:59 on the 10th of every month */
const ISOLIR_CRON_SCHEDULE = process.env.ISOLIR_CRON || '59 23 10 * *';

/** System user ID for automated actions (job actor) */
const SYSTEM_USER_ID = 0;
const SYSTEM_USER = { id: SYSTEM_USER_ID, role: 'System' };

/**
 * Fetch all subscriptions with UNPAID invoices past due date.
 * Joins with customers and subscriptions to get necessary data for CoA and notifications.
 *
 * @param {string} dueDate - The due date cutoff (YYYY-MM-DD)
 * @returns {Promise<Array>} List of subscriptions with unpaid invoices
 */
async function getUnpaidSubscriptions(dueDate) {
  const [rows] = await appPool.execute(
    `SELECT DISTINCT s.id AS subscription_id, s.customer_id, s.pppoe_username, s.nas_id,
            s.activated_at, s.status AS subscription_status,
            c.full_name AS customer_name, c.whatsapp_number, c.lifecycle_status,
            c.branch_id
     FROM invoices i
     INNER JOIN subscriptions s ON i.subscription_id = s.id
     INNER JOIN customers c ON i.customer_id = c.id
     WHERE i.status = ? AND i.due_date <= ? AND s.status = ? AND c.lifecycle_status = ?`,
    [INVOICE_STATUS.UNPAID, dueDate, SUBSCRIPTION_STATUS.ACTIVE, CUSTOMER_STATUS.AKTIF]
  );
  return rows;
}

/**
 * Count consecutive unpaid invoices for a subscription.
 * Used to determine 2-month arrears for termination notice.
 *
 * @param {number} subscriptionId - Subscription ID
 * @returns {Promise<number>} Number of consecutive unpaid invoices
 */
async function countConsecutiveUnpaidInvoices(subscriptionId) {
  const count = await invoiceModel.countBySubscriptionAndStatus(
    subscriptionId,
    INVOICE_STATUS.UNPAID
  );
  return count;
}

/**
 * Calculate subscription months since activation for notification channel selection.
 *
 * @param {string|Date|null} activatedAt - Subscription activation date
 * @returns {number} Number of months since activation
 */
function calculateSubscriptionMonths(activatedAt) {
  if (!activatedAt) return 0;

  const activated = new Date(activatedAt);
  const now = new Date();

  const yearDiff = now.getFullYear() - activated.getFullYear();
  const monthDiff = now.getMonth() - activated.getMonth();

  return yearDiff * 12 + monthDiff;
}

/**
 * Send isolir notification to customer (Requirement 7.4).
 *
 * @param {object} subscription - Subscription data with customer info
 * @returns {Promise<void>}
 */
async function sendIsolirNotification(subscription) {
  const subscriptionMonths = calculateSubscriptionMonths(subscription.activated_at);

  await notificationService.queueBySubscriptionAge({
    recipient: subscription.whatsapp_number,
    templateName: 'auto_isolir_notice',
    parameters: {
      customer_name: subscription.customer_name,
      pppoe_username: subscription.pppoe_username,
    },
    subscriptionMonths,
    relatedEntityId: subscription.subscription_id,
    relatedEntityType: NOTIFICATION_ENTITY_TYPE.SUBSCRIPTION,
  });
}

/**
 * Send termination notice for 2-month arrears (Requirement 11.3).
 *
 * @param {object} subscription - Subscription data with customer info
 * @returns {Promise<void>}
 */
async function sendTerminationNotice(subscription) {
  const subscriptionMonths = calculateSubscriptionMonths(subscription.activated_at);

  await notificationService.queueBySubscriptionAge({
    recipient: subscription.whatsapp_number,
    templateName: 'termination_notice_arrears',
    parameters: {
      customer_name: subscription.customer_name,
      pppoe_username: subscription.pppoe_username,
      arrears_months: 2,
    },
    subscriptionMonths,
    relatedEntityId: subscription.subscription_id,
    relatedEntityType: NOTIFICATION_ENTITY_TYPE.SUBSCRIPTION,
  });
}

/**
 * Create a device withdrawal ticket for 2-month arrears (Requirement 11.4).
 * Assigned to the relevant Branch technician team.
 *
 * @param {object} subscription - Subscription data with customer and branch info
 * @returns {Promise<object>} Created ticket
 */
async function createDeviceWithdrawalTicket(subscription) {
  const ticketData = {
    customer_id: subscription.customer_id,
    subscription_id: subscription.subscription_id,
    issue_description: `[Auto] Penarikan perangkat - Pelanggan ${subscription.customer_name} memiliki tunggakan 2 bulan berturut-turut. PPPoE: ${subscription.pppoe_username}`,
    source: TICKET_SOURCE.ADMIN,
  };

  return ticketService.createTicket(ticketData, SYSTEM_USER);
}

/**
 * Auto-isolir job handler.
 * Processes all subscriptions with unpaid invoices past due date.
 *
 * For each unpaid subscription:
 * 1. Send CoA to NAS for isolir (add to Address_List) - Req 7.2
 * 2. Update customer status to Isolir - Req 7.3
 * 3. Send notification to customer - Req 7.4
 * 4. If 2-month arrears: send termination notice + create withdrawal ticket - Req 11.3, 11.4
 *
 * @returns {Promise<{records_processed: number, records_failed: number, errors: string[]}>}
 */
async function autoIsolirHandler() {
  const now = new Date();
  const dueDate = now.toISOString().slice(0, 10);

  // Fetch all subscriptions with unpaid invoices past due (Req 7.1)
  const unpaidSubscriptions = await getUnpaidSubscriptions(dueDate);

  let recordsProcessed = 0;
  let recordsFailed = 0;
  const errors = [];

  for (const subscription of unpaidSubscriptions) {
    try {
      // Step 1: Send CoA to NAS for isolir (Req 7.2, 7.5)
      // The CoA service handles retry logic (3 retries with exponential backoff)
      let coaResult = null;
      if (subscription.nas_id && subscription.pppoe_username) {
        coaResult = await coaService.isolir(
          subscription.subscription_id,
          subscription.nas_id,
          subscription.pppoe_username
        );

        // If CoA failed after all retries, log for manual review but continue (Req 7.5)
        if (!coaResult.success) {
          console.error(
            `[AutoIsolir] CoA failed for subscription ${subscription.subscription_id} ` +
            `(${subscription.pppoe_username}): status=${coaResult.responseStatus}, retries=${coaResult.retryCount}`
          );
        }
      }

      // Step 2: Update customer lifecycle status to Isolir (Req 7.3)
      try {
        await customerModel.updateStatus(
          subscription.customer_id,
          CUSTOMER_STATUS.ISOLIR,
          SYSTEM_USER_ID
        );
      } catch (statusErr) {
        // If already Isolir or invalid transition, log but don't fail the record
        if (statusErr.code === 'INVALID_STATUS_TRANSITION') {
          console.warn(
            `[AutoIsolir] Customer ${subscription.customer_id} status transition skipped: ${statusErr.message}`
          );
        } else {
          throw statusErr;
        }
      }

      // Step 3: Send isolir notification to customer (Req 7.4)
      if (subscription.whatsapp_number) {
        await sendIsolirNotification(subscription);
      }

      // Step 4: Check for 2-month arrears (Req 11.3, 11.4)
      const unpaidCount = await countConsecutiveUnpaidInvoices(subscription.subscription_id);
      if (unpaidCount >= 2) {
        // Send termination notice (Req 11.3)
        if (subscription.whatsapp_number) {
          await sendTerminationNotice(subscription);
        }

        // Create device withdrawal ticket (Req 11.4)
        await createDeviceWithdrawalTicket(subscription);
      }

      recordsProcessed++;
    } catch (err) {
      recordsFailed++;
      errors.push(
        `Subscription ${subscription.subscription_id} (${subscription.pppoe_username || 'unknown'}): ${err.message}`
      );
      console.error(
        `[AutoIsolir] Failed for subscription ${subscription.subscription_id}:`,
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
 * Register the auto-isolir job with the scheduler.
 */
function register() {
  registerJob({
    name: 'auto-isolir',
    schedule: ISOLIR_CRON_SCHEDULE,
    handler: autoIsolirHandler,
    description: 'Auto-isolir subscriptions with unpaid invoices past due date on the 10th of each month',
  });
}

module.exports = {
  register,
  autoIsolirHandler,
  getUnpaidSubscriptions,
  countConsecutiveUnpaidInvoices,
  calculateSubscriptionMonths,
  sendIsolirNotification,
  sendTerminationNotice,
  createDeviceWithdrawalTicket,
};
