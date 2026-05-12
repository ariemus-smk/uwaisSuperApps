/**
 * CoA/POD Engine Service.
 * Handles sending Change of Authorization (CoA) and Packet of Disconnect (POD)
 * requests to NAS devices via SSH execution of radclient on the FreeRADIUS server.
 *
 * The flow:
 * 1. SSH into the FreeRADIUS server
 * 2. Execute radclient command targeting the NAS device on port 3799
 * 3. Parse the radclient output for ACK/NAK/Timeout
 * 4. Retry on NAK/Timeout with exponential backoff (1s, 2s, 4s)
 * 5. Log all operations to coa_logs table
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6
 */

const { Client } = require('ssh2');
const coaLogModel = require('../models/coaLog.model');
const customerModel = require('../models/customer.model');
const subscriptionModel = require('../models/subscription.model');
const notificationService = require('./notification.service');
const { appPool } = require('../config/database');
const {
  buildIsolirCoA,
  buildUnisolirCoA,
  buildSpeedChangeCoA,
  buildKickPOD,
  buildRadclientCommand,
  buildCoAAttributes,
  buildPODAttributes,
} = require('../utils/coaPacket');
const { COA_TRIGGER_TYPE, COA_RESPONSE_STATUS, ERROR_CODE, NOTIFICATION_ENTITY_TYPE } = require('../utils/constants');

// SSH configuration from environment variables
const SSH_CONFIG = {
  host: process.env.FREERADIUS_SSH_HOST || '',
  port: parseInt(process.env.FREERADIUS_SSH_PORT, 10) || 22,
  username: process.env.FREERADIUS_SSH_USER || '',
  password: process.env.FREERADIUS_SSH_PASSWORD || undefined,
  privateKey: process.env.FREERADIUS_SSH_PRIVATE_KEY_PATH || undefined,
};

// CoA retry configuration
const MAX_RETRIES = parseInt(process.env.COA_MAX_RETRIES, 10) || 3;
const BASE_BACKOFF_MS = 1000; // 1 second base for exponential backoff

/**
 * Calculate the number of months a subscription has been active.
 * Used to determine notification channel (WA+email for <=2 months, push for >2 months).
 *
 * @param {string|Date|null} activatedAt - Subscription activation date
 * @returns {number} Number of months since activation (0 if not yet activated)
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
 * Sleep utility for exponential backoff.
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get SSH connection configuration.
 * Reads private key from file if path is provided.
 * @returns {object} SSH connection config for ssh2
 */
function getSSHConfig() {
  const config = {
    host: SSH_CONFIG.host,
    port: SSH_CONFIG.port,
    username: SSH_CONFIG.username,
    readyTimeout: parseInt(process.env.COA_TIMEOUT_MS, 10) || 5000,
  };

  if (SSH_CONFIG.privateKey) {
    // eslint-disable-next-line global-require
    const fs = require('fs');
    try {
      config.privateKey = fs.readFileSync(SSH_CONFIG.privateKey);
    } catch (err) {
      console.error('[CoA] Failed to read SSH private key:', err.message);
      // Fall back to password auth
      if (SSH_CONFIG.password) {
        config.password = SSH_CONFIG.password;
      }
    }
  } else if (SSH_CONFIG.password) {
    config.password = SSH_CONFIG.password;
  }

  return config;
}

/**
 * Execute a command on the FreeRADIUS server via SSH.
 * @param {string} command - Shell command to execute
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
function executeSSHCommand(command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = '';
    let stderr = '';

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }

        stream.on('close', (code) => {
          conn.end();
          resolve({ stdout, stderr, exitCode: code || 0 });
        });

        stream.on('data', (data) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      });
    });

    conn.on('error', (err) => {
      reject(err);
    });

    conn.connect(getSSHConfig());
  });
}

/**
 * Parse radclient output to determine response status.
 * radclient outputs:
 * - "Received CoA-ACK" or "Received Disconnect-ACK" for success
 * - "Received CoA-NAK" or "Received Disconnect-NAK" for rejection
 * - No response or timeout message for timeout
 *
 * @param {string} stdout - Standard output from radclient
 * @param {string} stderr - Standard error from radclient
 * @param {number} exitCode - Exit code from radclient
 * @returns {string} Response status: 'ACK', 'NAK', or 'Timeout'
 */
function parseRadclientResponse(stdout, stderr, exitCode) {
  const combined = (stdout + ' ' + stderr).toLowerCase();

  if (combined.includes('received') && (combined.includes('coa-ack') || combined.includes('disconnect-ack'))) {
    return COA_RESPONSE_STATUS.ACK;
  }

  if (combined.includes('received') && (combined.includes('coa-nak') || combined.includes('disconnect-nak'))) {
    return COA_RESPONSE_STATUS.NAK;
  }

  // Timeout: no response received, or explicit timeout message
  return COA_RESPONSE_STATUS.TIMEOUT;
}

/**
 * Send a CoA or POD request with retry logic.
 * Retries up to MAX_RETRIES times on NAK or Timeout with exponential backoff.
 *
 * @param {object} params - Request parameters
 * @param {number} params.subscriptionId - Subscription ID for logging
 * @param {number} params.nasId - NAS device ID (App DB)
 * @param {string} params.nasIp - NAS IP address
 * @param {string} params.nasSecret - NAS RADIUS secret
 * @param {string} params.triggerType - Trigger type (SpeedChange, Isolir, Unisolir, FUP, Kick)
 * @param {string} params.command - Full radclient command to execute
 * @returns {Promise<{success: boolean, responseStatus: string, retryCount: number, logId: number}>}
 */
async function executeWithRetry(params) {
  const { subscriptionId, nasId, triggerType, command } = params;

  // Create initial log entry
  const logEntry = await coaLogModel.create({
    subscription_id: subscriptionId,
    nas_id: nasId,
    trigger_type: triggerType,
    request_payload: command,
    response_status: COA_RESPONSE_STATUS.PENDING,
    retry_count: 0,
  });

  let responseStatus = COA_RESPONSE_STATUS.TIMEOUT;
  let retryCount = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { stdout, stderr, exitCode } = await executeSSHCommand(command);
      responseStatus = parseRadclientResponse(stdout, stderr, exitCode);

      if (responseStatus === COA_RESPONSE_STATUS.ACK) {
        // Success - update log and return
        await coaLogModel.update(logEntry.id, {
          response_status: COA_RESPONSE_STATUS.ACK,
          retry_count: retryCount,
          responded_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        });

        return {
          success: true,
          responseStatus: COA_RESPONSE_STATUS.ACK,
          retryCount,
          logId: logEntry.id,
        };
      }

      // NAK or Timeout - retry if attempts remain
      retryCount = attempt + 1;

      if (attempt < MAX_RETRIES) {
        // Exponential backoff: 1s, 2s, 4s
        const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt);
        await module.exports.sleep(backoffMs);
      }
    } catch (err) {
      // SSH connection error - treat as Timeout
      console.error(`[CoA] SSH execution error (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`, err.message);
      responseStatus = COA_RESPONSE_STATUS.TIMEOUT;
      retryCount = attempt + 1;

      if (attempt < MAX_RETRIES) {
        const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt);
        await module.exports.sleep(backoffMs);
      }
    }
  }

  // All retries exhausted - update log with final status
  await coaLogModel.update(logEntry.id, {
    response_status: responseStatus,
    retry_count: retryCount,
    responded_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  });

  return {
    success: false,
    responseStatus,
    retryCount,
    logId: logEntry.id,
  };
}

/**
 * Get NAS device info from App DB.
 * @param {number} nasId - NAS device ID
 * @returns {Promise<object>} NAS device record with ip_address and radius_secret
 * @throws {Error} If NAS not found
 */
async function getNasDevice(nasId) {
  const [rows] = await appPool.execute(
    'SELECT * FROM nas_devices WHERE id = ? LIMIT 1',
    [nasId]
  );

  if (rows.length === 0) {
    throw Object.assign(new Error(`NAS device with ID ${nasId} not found.`), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  return rows[0];
}

/**
 * Get subscription info from App DB.
 * @param {number} subscriptionId - Subscription ID
 * @returns {Promise<object>} Subscription record with pppoe_username and nas_id
 * @throws {Error} If subscription not found
 */
async function getSubscription(subscriptionId) {
  const [rows] = await appPool.execute(
    'SELECT * FROM subscriptions WHERE id = ? LIMIT 1',
    [subscriptionId]
  );

  if (rows.length === 0) {
    throw Object.assign(new Error(`Subscription with ID ${subscriptionId} not found.`), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  return rows[0];
}

/**
 * Send a CoA request for a subscription.
 * Builds the radclient command and executes it via SSH with retry logic.
 *
 * @param {number} subscriptionId - Target subscription ID
 * @param {number} nasId - Target NAS device ID
 * @param {string} triggerType - Trigger type (SpeedChange, Isolir, Unisolir, FUP, Kick)
 * @param {object} [options={}] - Additional CoA options
 * @param {string} [options.username] - PPPoE username (auto-resolved from subscription if not provided)
 * @param {string} [options.rateLimit] - Mikrotik-Rate-Limit value for speed change
 * @param {string} [options.mikrotikAddressList] - Mikrotik-Address-List value
 * @param {object} [options.customAttributes] - Additional RADIUS attributes
 * @returns {Promise<{success: boolean, responseStatus: string, retryCount: number, logId: number}>}
 */
async function sendCoA(subscriptionId, nasId, triggerType, options = {}) {
  // Get NAS device info
  const nasDevice = await getNasDevice(nasId);
  const nasIp = nasDevice.ip_address;
  const nasSecret = nasDevice.radius_secret;

  // Resolve username from subscription if not provided
  let username = options.username;
  if (!username) {
    const subscription = await getSubscription(subscriptionId);
    username = subscription.pppoe_username;
  }

  // Build CoA attributes
  const attributes = buildCoAAttributes({
    username,
    rateLimit: options.rateLimit,
    mikrotikAddressList: options.mikrotikAddressList,
    customAttributes: options.customAttributes,
  });

  // Build radclient command
  const command = buildRadclientCommand(nasIp, 3799, nasSecret, 'coa', attributes);

  // Execute with retry
  return executeWithRetry({
    subscriptionId,
    nasId,
    nasIp,
    nasSecret,
    triggerType,
    command,
  });
}

/**
 * Send a POD (Packet of Disconnect) request to kick a PPPoE session.
 *
 * @param {number} subscriptionId - Target subscription ID
 * @param {number} nasId - Target NAS device ID
 * @param {string} username - PPPoE username to disconnect
 * @returns {Promise<{success: boolean, responseStatus: string, retryCount: number, logId: number}>}
 */
async function sendPOD(subscriptionId, nasId, username) {
  // Get NAS device info
  const nasDevice = await getNasDevice(nasId);
  const nasIp = nasDevice.ip_address;
  const nasSecret = nasDevice.radius_secret;

  // Build POD command using the convenience function
  const command = buildKickPOD(username, nasIp, nasSecret);

  // Execute with retry
  return executeWithRetry({
    subscriptionId,
    nasId,
    nasIp,
    nasSecret,
    triggerType: COA_TRIGGER_TYPE.KICK,
    command,
  });
}

/**
 * Convenience function: Send isolir CoA to add customer to isolir Address_List.
 *
 * @param {number} subscriptionId - Target subscription ID
 * @param {number} nasId - Target NAS device ID
 * @param {string} username - PPPoE username
 * @returns {Promise<{success: boolean, responseStatus: string, retryCount: number, logId: number}>}
 */
async function isolir(subscriptionId, nasId, username) {
  const nasDevice = await getNasDevice(nasId);
  const command = buildIsolirCoA(username, nasDevice.ip_address, nasDevice.radius_secret);

  const result = await executeWithRetry({
    subscriptionId,
    nasId,
    nasIp: nasDevice.ip_address,
    nasSecret: nasDevice.radius_secret,
    triggerType: COA_TRIGGER_TYPE.ISOLIR,
    command,
  });

  // Queue isolir warning notification (Requirement 7.4)
  try {
    const subscription = await getSubscription(subscriptionId);
    if (subscription && subscription.customer_id) {
      const customer = await customerModel.findById(subscription.customer_id);
      if (customer && customer.whatsapp_number) {
        const subscriptionMonths = calculateSubscriptionMonths(subscription.activated_at);
        await notificationService.queueBySubscriptionAge({
          recipient: customer.whatsapp_number,
          templateName: 'isolir_warning',
          parameters: {
            customer_name: customer.full_name,
            pppoe_username: username,
          },
          subscriptionMonths,
          relatedEntityId: subscriptionId,
          relatedEntityType: NOTIFICATION_ENTITY_TYPE.SUBSCRIPTION,
        });
      }
    }
  } catch (notifError) {
    // Log but don't fail isolir if notification queuing fails
    console.error('[CoA] Error queuing isolir warning notification:', notifError.message);
  }

  return result;
}

/**
 * Convenience function: Send unisolir CoA to remove customer from isolir Address_List.
 *
 * @param {number} subscriptionId - Target subscription ID
 * @param {number} nasId - Target NAS device ID
 * @param {string} username - PPPoE username
 * @returns {Promise<{success: boolean, responseStatus: string, retryCount: number, logId: number}>}
 */
async function unisolir(subscriptionId, nasId, username) {
  const nasDevice = await getNasDevice(nasId);
  const command = buildUnisolirCoA(username, nasDevice.ip_address, nasDevice.radius_secret);

  return executeWithRetry({
    subscriptionId,
    nasId,
    nasIp: nasDevice.ip_address,
    nasSecret: nasDevice.radius_secret,
    triggerType: COA_TRIGGER_TYPE.UNISOLIR,
    command,
  });
}

/**
 * Convenience function: Send speed change CoA to update Mikrotik-Rate-Limit.
 *
 * @param {number} subscriptionId - Target subscription ID
 * @param {number} nasId - Target NAS device ID
 * @param {string} username - PPPoE username
 * @param {string} rateLimit - Mikrotik rate limit string (e.g., "10M/20M")
 * @returns {Promise<{success: boolean, responseStatus: string, retryCount: number, logId: number}>}
 */
async function speedChange(subscriptionId, nasId, username, rateLimit) {
  if (!rateLimit) {
    throw Object.assign(new Error('rateLimit is required for speed change CoA.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const nasDevice = await getNasDevice(nasId);
  const command = buildSpeedChangeCoA(username, nasDevice.ip_address, nasDevice.radius_secret, rateLimit);

  return executeWithRetry({
    subscriptionId,
    nasId,
    nasIp: nasDevice.ip_address,
    nasSecret: nasDevice.radius_secret,
    triggerType: COA_TRIGGER_TYPE.SPEED_CHANGE,
    command,
  });
}

/**
 * Retrieve CoA operation logs with optional filters.
 *
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
async function getCoALogs(filters = {}) {
  return coaLogModel.findAll(filters);
}

module.exports = {
  sendCoA,
  sendPOD,
  isolir,
  unisolir,
  speedChange,
  getCoALogs,
  // Exported for testing
  parseRadclientResponse,
  executeSSHCommand,
  executeWithRetry,
  sleep,
};
