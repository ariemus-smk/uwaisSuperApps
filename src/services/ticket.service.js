/**
 * Ticket service.
 * Handles business logic for helpdesk ticketing including
 * ticket creation with auto-priority classification, assignment,
 * progress updates, resolution, and closure.
 *
 * Priority classification is based on configurable rules:
 * - Customer package tier (monthly_price thresholds)
 * - SLA level (derived from package tier)
 * - Issue severity keywords
 *
 * Requirements: 24.1, 24.2, 24.3, 24.4, 24.5
 */

const ticketModel = require('../models/ticket.model');
const ticketJournalModel = require('../models/ticketJournal.model');
const resolutionMetricsModel = require('../models/resolutionMetrics.model');
const overtimeModel = require('../models/overtime.model');
const customerModel = require('../models/customer.model');
const subscriptionModel = require('../models/subscription.model');
const packageModel = require('../models/package.model');
const coaService = require('./coa.service');
const { appPool } = require('../config/database');
const {
  TICKET_STATUS,
  TICKET_PRIORITY,
  TICKET_SOURCE,
  TICKET_JOURNAL_STATUS,
  TICKET_RESOLUTION_TYPE,
  REMOTE_FIX_ACTION,
  OVERTIME_STATUS,
  REGULAR_WORK_HOURS,
  COA_TRIGGER_TYPE,
  ERROR_CODE,
} = require('../utils/constants');

/**
 * Default priority classification rules.
 * These can be overridden by system_settings entries.
 *
 * Rules are evaluated in order (first match wins):
 * 1. VIP: package monthly_price >= vipThreshold
 * 2. High: package monthly_price >= highThreshold OR severity keywords match
 * 3. Low: severity keywords match low-priority patterns
 * 4. Normal: default fallback
 */
const DEFAULT_PRIORITY_RULES = {
  vipThreshold: 500000,       // Package price >= 500k = VIP
  highThreshold: 250000,      // Package price >= 250k = High
  highSeverityKeywords: ['total down', 'tidak bisa connect', 'mati total', 'los merah', 'no signal'],
  lowSeverityKeywords: ['lambat', 'slow', 'wifi password', 'ganti ssid', 'informasi'],
};

/**
 * Get priority classification rules from system_settings or use defaults.
 * @returns {Promise<object>} Priority rules configuration
 */
async function getPriorityRules() {
  try {
    const [rows] = await appPool.execute(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'ticket_priority_rules' LIMIT 1"
    );
    if (rows.length > 0 && rows[0].setting_value) {
      return JSON.parse(rows[0].setting_value);
    }
  } catch (err) {
    // Fall back to defaults if parsing fails or table doesn't exist
  }
  return DEFAULT_PRIORITY_RULES;
}

/**
 * Classify ticket priority based on configurable rules.
 * Evaluates customer package tier and issue severity keywords.
 *
 * Requirements: 24.2
 *
 * @param {object} options - Classification inputs
 * @param {number|null} [options.subscriptionId] - Subscription ID for package lookup
 * @param {string} options.issueDescription - Issue description text
 * @param {object} [options.rules] - Optional override rules (for testing)
 * @returns {Promise<string>} Priority value: 'VIP', 'High', 'Normal', or 'Low'
 */
async function classifyPriority({ subscriptionId, issueDescription, rules }) {
  const priorityRules = rules || await getPriorityRules();
  const descLower = (issueDescription || '').toLowerCase();

  // Check package tier if subscription is provided
  let packagePrice = 0;
  if (subscriptionId) {
    const subscription = await subscriptionModel.findById(subscriptionId);
    if (subscription && subscription.package_id) {
      const pkg = await packageModel.findById(subscription.package_id);
      if (pkg) {
        packagePrice = parseFloat(pkg.monthly_price) || 0;
      }
    }
  }

  // Rule 1: VIP based on package price
  if (packagePrice >= priorityRules.vipThreshold) {
    return TICKET_PRIORITY.VIP;
  }

  // Rule 2: High based on package price or severity keywords
  if (packagePrice >= priorityRules.highThreshold) {
    return TICKET_PRIORITY.HIGH;
  }

  const highKeywords = priorityRules.highSeverityKeywords || [];
  for (const keyword of highKeywords) {
    if (descLower.includes(keyword.toLowerCase())) {
      return TICKET_PRIORITY.HIGH;
    }
  }

  // Rule 3: Low based on low-severity keywords
  const lowKeywords = priorityRules.lowSeverityKeywords || [];
  for (const keyword of lowKeywords) {
    if (descLower.includes(keyword.toLowerCase())) {
      return TICKET_PRIORITY.LOW;
    }
  }

  // Rule 4: Default to Normal
  return TICKET_PRIORITY.NORMAL;
}

/**
 * Create a new ticket with auto-priority classification.
 * Supports multiple open tickets per customer (Req 24.3).
 * Notifies assigned Admin/CS team on creation (Req 24.4).
 *
 * Requirements: 24.1, 24.2, 24.3, 24.4, 24.5
 *
 * @param {object} data - Ticket creation data
 * @param {number} data.customer_id - Customer ID
 * @param {number|null} [data.subscription_id] - Subscription ID (optional)
 * @param {string} data.issue_description - Issue description
 * @param {string} data.source - 'Pelanggan', 'Teknisi', or 'Admin'
 * @param {object} user - Requesting user (from req.user)
 * @param {number} user.id - User ID
 * @param {number|null} user.branch_id - User's branch
 * @returns {Promise<object>} Created ticket
 * @throws {Error} If customer not found or validation fails
 */
async function createTicket(data, user) {
  // Validate customer exists
  const customer = await customerModel.findById(data.customer_id);
  if (!customer) {
    throw Object.assign(new Error('Customer not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // Validate source
  const validSources = Object.values(TICKET_SOURCE);
  if (!validSources.includes(data.source)) {
    throw Object.assign(new Error(`Invalid ticket source. Must be one of: ${validSources.join(', ')}`), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Validate subscription if provided
  if (data.subscription_id) {
    const subscription = await subscriptionModel.findById(data.subscription_id);
    if (!subscription) {
      throw Object.assign(new Error('Subscription not found.'), {
        statusCode: 404,
        code: ERROR_CODE.RESOURCE_NOT_FOUND,
      });
    }
    if (subscription.customer_id !== data.customer_id) {
      throw Object.assign(new Error('Subscription does not belong to the specified customer.'), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }
  }

  // Validate issue description
  if (!data.issue_description || data.issue_description.trim().length === 0) {
    throw Object.assign(new Error('Issue description is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Auto-classify priority (Req 24.2)
  const priority = await classifyPriority({
    subscriptionId: data.subscription_id || null,
    issueDescription: data.issue_description,
  });

  // Determine branch_id from customer
  const branchId = customer.branch_id;

  // Create ticket (Req 24.1, 24.5)
  const ticket = await ticketModel.create({
    customer_id: data.customer_id,
    subscription_id: data.subscription_id || null,
    issue_description: data.issue_description,
    source: data.source,
    priority,
    branch_id: branchId,
  });

  // Notify Admin/CS team (Req 24.4)
  // Queue notification for the branch admin team
  await queueAdminNotification(ticket);

  return ticket;
}

/**
 * Queue a notification to the Admin/CS team for a new ticket.
 * Inserts a notification record into the notifications table.
 *
 * Requirements: 24.4
 *
 * @param {object} ticket - Created ticket data
 */
async function queueAdminNotification(ticket) {
  try {
    await appPool.execute(
      `INSERT INTO notifications (recipient_whatsapp, template_name, parameters, channel, status, related_entity_id, related_entity_type, queued_at)
       VALUES (?, ?, ?, ?, 'Queued', ?, 'ticket', NOW())`,
      [
        null, // Admin team notification - no specific WhatsApp number
        'new_ticket_alert',
        JSON.stringify({
          ticket_id: ticket.id,
          customer_id: ticket.customer_id,
          priority: ticket.priority,
          source: ticket.source,
          issue_description: ticket.issue_description,
          branch_id: ticket.branch_id,
        }),
        'PushNotification',
        ticket.id,
      ]
    );
  } catch (err) {
    // Log but don't fail ticket creation if notification fails
    console.error('[TicketService] Failed to queue admin notification:', err.message);
  }
}

/**
 * Assign a ticket to a technician.
 *
 * @param {number} ticketId - Ticket ID
 * @param {number} teknisiId - Technician user ID to assign
 * @param {object} user - Requesting user (from req.user)
 * @returns {Promise<object>} Updated ticket
 * @throws {Error} If ticket not found or already closed
 */
async function assignTicket(ticketId, teknisiId, user) {
  const ticket = await ticketModel.findById(ticketId);
  if (!ticket) {
    throw Object.assign(new Error('Ticket not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (ticket.status === TICKET_STATUS.CLOSED) {
    throw Object.assign(new Error('Cannot assign a closed ticket.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Update ticket with assigned technician and set status to InProgress
  await ticketModel.update(ticketId, {
    assigned_teknisi_id: teknisiId,
    status: TICKET_STATUS.IN_PROGRESS,
  });

  return ticketModel.findById(ticketId);
}

/**
 * Update ticket progress with a journal entry.
 *
 * Requirements: 26.6
 *
 * @param {number} ticketId - Ticket ID
 * @param {object} progressData - Progress update data
 * @param {string} progressData.description - Progress description
 * @param {string[]} [progressData.photo_urls] - Photo evidence URLs
 * @param {string} progressData.progress_status - 'Selesai', 'BelumSelesai', or 'Progress'
 * @param {number|null} [progressData.latitude] - GPS latitude
 * @param {number|null} [progressData.longitude] - GPS longitude
 * @param {object} user - Requesting user (from req.user)
 * @param {number} user.id - Technician user ID
 * @returns {Promise<object>} Created journal entry
 * @throws {Error} If ticket not found or validation fails
 */
async function updateProgress(ticketId, progressData, user) {
  const ticket = await ticketModel.findById(ticketId);
  if (!ticket) {
    throw Object.assign(new Error('Ticket not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (ticket.status === TICKET_STATUS.CLOSED || ticket.status === TICKET_STATUS.RESOLVED) {
    throw Object.assign(new Error('Cannot update progress on a resolved or closed ticket.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Validate progress_status
  const validStatuses = Object.values(TICKET_JOURNAL_STATUS);
  if (!validStatuses.includes(progressData.progress_status)) {
    throw Object.assign(new Error(`Invalid progress status. Must be one of: ${validStatuses.join(', ')}`), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  if (!progressData.description || progressData.description.trim().length === 0) {
    throw Object.assign(new Error('Progress description is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Create journal entry
  const journal = await ticketJournalModel.create({
    ticket_id: ticketId,
    teknisi_id: user.id,
    description: progressData.description,
    photo_urls: progressData.photo_urls || null,
    progress_status: progressData.progress_status,
    latitude: progressData.latitude || null,
    longitude: progressData.longitude || null,
  });

  // If progress_status is 'Selesai', keep ticket in InProgress (Admin resolves)
  // Ensure ticket is in InProgress status
  if (ticket.status === TICKET_STATUS.OPEN || ticket.status === TICKET_STATUS.PENDING) {
    await ticketModel.update(ticketId, { status: TICKET_STATUS.IN_PROGRESS });
  }

  return journal;
}

/**
 * Default SLA thresholds for resolution time (in minutes).
 * Used to determine SLA compliance when recording resolution metrics.
 * Can be overridden by system_settings.
 */
const DEFAULT_SLA_THRESHOLDS = {
  VIP: 120,      // 2 hours
  High: 240,     // 4 hours
  Normal: 480,   // 8 hours
  Low: 1440,     // 24 hours
};

/**
 * Get SLA thresholds from system_settings or use defaults.
 * @returns {Promise<object>} SLA thresholds by priority
 */
async function getSLAThresholds() {
  try {
    const [rows] = await appPool.execute(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'sla_thresholds' LIMIT 1"
    );
    if (rows.length > 0 && rows[0].setting_value) {
      return JSON.parse(rows[0].setting_value);
    }
  } catch (err) {
    // Fall back to defaults
  }
  return DEFAULT_SLA_THRESHOLDS;
}

/**
 * Calculate resolution time in minutes from ticket creation to resolution.
 *
 * Requirements: 27.1
 *
 * @param {Date|string} createdAt - Ticket creation timestamp
 * @param {Date|string} resolvedAt - Resolution timestamp
 * @returns {number} Resolution time in minutes (rounded)
 */
function calculateResolutionTimeMinutes(createdAt, resolvedAt) {
  const created = new Date(createdAt);
  const resolved = new Date(resolvedAt);
  const diffMs = resolved.getTime() - created.getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60)));
}

/**
 * Resolve a ticket.
 * Sets status to Resolved, records resolution timestamp, calculates resolution time,
 * and stores resolution metrics per Teknisi for KPI tracking.
 *
 * Requirements: 27.1, 27.2
 *
 * @param {number} ticketId - Ticket ID
 * @param {object} resolutionData - Resolution data
 * @param {string} [resolutionData.resolution_type] - 'RemoteFix' or 'FieldFix'
 * @param {string} [resolutionData.damage_classification] - Damage classification
 * @param {object} user - Requesting user (from req.user)
 * @returns {Promise<object>} Updated ticket with resolution_time_minutes
 * @throws {Error} If ticket not found or already resolved/closed
 */
async function resolveTicket(ticketId, resolutionData, user) {
  const ticket = await ticketModel.findById(ticketId);
  if (!ticket) {
    throw Object.assign(new Error('Ticket not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (ticket.status === TICKET_STATUS.RESOLVED || ticket.status === TICKET_STATUS.CLOSED) {
    throw Object.assign(new Error('Ticket is already resolved or closed.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const now = new Date();
  const nowStr = now.toISOString().slice(0, 19).replace('T', ' ');

  // Calculate resolution time from creation to resolution (Req 27.1)
  const resolutionTimeMinutes = calculateResolutionTimeMinutes(ticket.created_at, now);

  await ticketModel.update(ticketId, {
    status: TICKET_STATUS.RESOLVED,
    resolution_type: resolutionData.resolution_type || null,
    damage_classification: resolutionData.damage_classification || null,
    resolved_at: nowStr,
  });

  // Store resolution metrics per Teknisi (Req 27.2)
  if (ticket.assigned_teknisi_id) {
    try {
      // Determine SLA compliance
      const slaThresholds = await getSLAThresholds();
      const slaThreshold = slaThresholds[ticket.priority] || slaThresholds.Normal;
      const slaCompliant = resolutionTimeMinutes <= slaThreshold;

      await resolutionMetricsModel.create({
        teknisi_id: ticket.assigned_teknisi_id,
        ticket_id: ticketId,
        resolution_time_minutes: resolutionTimeMinutes,
        resolution_category: resolutionData.resolution_type || null,
        sla_compliant: slaCompliant,
        resolved_at: nowStr,
      });
    } catch (err) {
      // Log but don't fail resolution if metrics storage fails
      console.error('[TicketService] Failed to store resolution metrics:', err.message);
    }
  }

  const updatedTicket = await ticketModel.findById(ticketId);
  return { ...updatedTicket, resolution_time_minutes: resolutionTimeMinutes };
}

/**
 * Close a ticket.
 * Sets status to Closed and records closure timestamp, closing admin,
 * and resolution category.
 *
 * Requirements: 27.3
 *
 * @param {number} ticketId - Ticket ID
 * @param {object} user - Requesting user (from req.user)
 * @param {number} user.id - Closing admin user ID
 * @param {object} [closeData={}] - Optional closure data
 * @param {string} [closeData.resolution_category] - Resolution category (RemoteFix, FieldFix, etc.)
 * @returns {Promise<object>} Updated ticket
 * @throws {Error} If ticket not found or already closed
 */
async function closeTicket(ticketId, user, closeData = {}) {
  const ticket = await ticketModel.findById(ticketId);
  if (!ticket) {
    throw Object.assign(new Error('Ticket not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (ticket.status === TICKET_STATUS.CLOSED) {
    throw Object.assign(new Error('Ticket is already closed.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const updateData = {
    status: TICKET_STATUS.CLOSED,
    closed_at: now,
    closed_by: user.id,
  };

  // Record resolution category if provided (Req 27.3)
  if (closeData.resolution_category) {
    updateData.resolution_category = closeData.resolution_category;
  }

  await ticketModel.update(ticketId, updateData);

  return ticketModel.findById(ticketId);
}

/**
 * Get a ticket by ID with full details.
 *
 * @param {number} ticketId - Ticket ID
 * @returns {Promise<object>} Ticket with details
 * @throws {Error} If ticket not found
 */
async function getTicketById(ticketId) {
  const ticket = await ticketModel.findByIdWithDetails(ticketId);
  if (!ticket) {
    throw Object.assign(new Error('Ticket not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }
  return ticket;
}

/**
 * List tickets with branch scoping and filters.
 *
 * @param {object} filters - Query filters
 * @param {object} user - Requesting user (from req.user)
 * @returns {Promise<object>} Paginated ticket list
 */
async function listTickets(filters = {}, user = {}) {
  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 20;

  const queryFilters = {
    status: filters.status,
    priority: filters.priority,
    assigned_teknisi_id: filters.assigned_teknisi_id,
    customer_id: filters.customer_id,
    search: filters.search,
    page,
    limit,
  };

  // Apply branch scoping
  if (user.branch_id) {
    queryFilters.branch_id = user.branch_id;
  }

  const { tickets, total } = await ticketModel.findAll(queryFilters);
  const totalPages = Math.ceil(total / limit);

  return { tickets, total, page, limit, totalPages };
}

/**
 * Get journal entries for a ticket.
 *
 * @param {number} ticketId - Ticket ID
 * @returns {Promise<Array>} List of journal entries
 * @throws {Error} If ticket not found
 */
async function getTicketJournals(ticketId) {
  const ticket = await ticketModel.findById(ticketId);
  if (!ticket) {
    throw Object.assign(new Error('Ticket not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  return ticketJournalModel.findByTicketId(ticketId);
}

/**
 * Trigger a remote fix action (ACS command or NAS CoA/POD) linked to a ticket.
 * Records the action in the ticket journal and sends a confirmation notification
 * to the customer.
 *
 * Supported actions:
 * - ACS: DeviceReboot, SSIDChange, WiFiPasswordChange
 * - NAS: SessionKick, CoASpeedChange, CoAIsolir, CoAUnisolir
 *
 * Requirements: 25.1, 25.2
 *
 * @param {number} ticketId - Ticket ID
 * @param {object} actionData - Remote fix action data
 * @param {string} actionData.action - Action type from REMOTE_FIX_ACTION enum
 * @param {object} [actionData.params] - Action-specific parameters
 * @param {string} [actionData.params.ssid] - New SSID (for SSIDChange)
 * @param {string} [actionData.params.wifi_password] - New WiFi password (for WiFiPasswordChange)
 * @param {string} [actionData.params.rate_limit] - Rate limit string (for CoASpeedChange)
 * @param {object} user - Requesting user (from req.user)
 * @param {number} user.id - Admin user ID
 * @returns {Promise<object>} Result with action status and journal entry
 * @throws {Error} If ticket not found, no subscription linked, or action invalid
 */
async function triggerRemoteFix(ticketId, actionData, user) {
  // Validate ticket exists
  const ticket = await ticketModel.findByIdWithDetails(ticketId);
  if (!ticket) {
    throw Object.assign(new Error('Ticket not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // Ticket must not be closed
  if (ticket.status === TICKET_STATUS.CLOSED) {
    throw Object.assign(new Error('Cannot perform remote fix on a closed ticket.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Validate action type
  const validActions = Object.values(REMOTE_FIX_ACTION);
  if (!validActions.includes(actionData.action)) {
    throw Object.assign(new Error(`Invalid remote fix action. Must be one of: ${validActions.join(', ')}`), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Ticket must have a subscription linked for NAS/ACS commands
  if (!ticket.subscription_id) {
    throw Object.assign(new Error('Ticket must have a linked subscription for remote troubleshooting.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Get subscription details
  const subscription = await subscriptionModel.findById(ticket.subscription_id);
  if (!subscription) {
    throw Object.assign(new Error('Linked subscription not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  const params = actionData.params || {};
  let actionResult = null;
  let actionDescription = '';

  // Execute the remote fix action
  const action = actionData.action;

  if (action === REMOTE_FIX_ACTION.DEVICE_REBOOT ||
      action === REMOTE_FIX_ACTION.SSID_CHANGE ||
      action === REMOTE_FIX_ACTION.WIFI_PASSWORD_CHANGE) {
    // ACS commands - call ACS API
    actionResult = await executeACSCommand(subscription, action, params);
    actionDescription = buildACSDescription(action, params);
  } else {
    // NAS commands (CoA/POD)
    actionResult = await executeNASCommand(subscription, action, params);
    actionDescription = buildNASDescription(action, params);
  }

  // Record action in ticket journal (Req 25.2)
  const journalDescription = `[Remote Fix] ${actionDescription} — Result: ${actionResult.success ? 'Success' : 'Failed'}`;
  const journal = await ticketJournalModel.create({
    ticket_id: ticketId,
    teknisi_id: user.id,
    description: journalDescription,
    photo_urls: null,
    progress_status: actionResult.success ? TICKET_JOURNAL_STATUS.SELESAI : TICKET_JOURNAL_STATUS.PROGRESS,
    latitude: null,
    longitude: null,
  });

  // Update ticket status to InProgress if it was Open
  if (ticket.status === TICKET_STATUS.OPEN) {
    await ticketModel.update(ticketId, { status: TICKET_STATUS.IN_PROGRESS });
  }

  // Send confirmation notification to customer (Req 25.2)
  await queueCustomerRemoteFixNotification(ticket, actionDescription, actionResult.success);

  return {
    ticket_id: ticketId,
    action: actionData.action,
    success: actionResult.success,
    details: actionResult,
    journal,
  };
}

/**
 * Execute an ACS command (TR-069) for remote troubleshooting.
 * Since the ACS service may not be fully implemented yet, this provides
 * a structured call that can be connected to the ACS API.
 *
 * @param {object} subscription - Subscription record
 * @param {string} action - ACS action type
 * @param {object} params - Action parameters
 * @returns {Promise<object>} Action result
 */
async function executeACSCommand(subscription, action, params) {
  const acsApiUrl = process.env.ACS_API_URL;
  const acsUsername = process.env.ACS_API_USERNAME;
  const acsPassword = process.env.ACS_API_PASSWORD;

  // If ACS is not configured, return a structured error
  if (!acsApiUrl) {
    return {
      success: false,
      error: 'ACS_NOT_CONFIGURED',
      message: 'ACS server is not configured. Set ACS_API_URL environment variable.',
    };
  }

  try {
    const axios = require('axios');
    const deviceId = subscription.pppoe_username;
    let endpoint = '';
    let payload = {};

    switch (action) {
      case REMOTE_FIX_ACTION.DEVICE_REBOOT:
        endpoint = `${acsApiUrl}/devices/${encodeURIComponent(deviceId)}/reboot`;
        payload = {};
        break;
      case REMOTE_FIX_ACTION.SSID_CHANGE:
        endpoint = `${acsApiUrl}/devices/${encodeURIComponent(deviceId)}/wifi`;
        payload = { ssid: params.ssid };
        break;
      case REMOTE_FIX_ACTION.WIFI_PASSWORD_CHANGE:
        endpoint = `${acsApiUrl}/devices/${encodeURIComponent(deviceId)}/wifi`;
        payload = { password: params.wifi_password };
        break;
      default:
        return { success: false, error: 'UNKNOWN_ACS_ACTION', message: `Unknown ACS action: ${action}` };
    }

    const response = await axios.post(endpoint, payload, {
      auth: { username: acsUsername, password: acsPassword },
      timeout: parseInt(process.env.COA_TIMEOUT_MS, 10) || 5000,
    });

    return {
      success: response.status >= 200 && response.status < 300,
      statusCode: response.status,
      data: response.data,
    };
  } catch (err) {
    return {
      success: false,
      error: 'ACS_ERROR',
      message: err.message,
    };
  }
}

/**
 * Execute a NAS command (CoA/POD) for remote troubleshooting.
 * Uses the existing CoA service for session management.
 *
 * @param {object} subscription - Subscription record
 * @param {string} action - NAS action type
 * @param {object} params - Action parameters
 * @returns {Promise<object>} Action result
 */
async function executeNASCommand(subscription, action, params) {
  const { id: subscriptionId, pppoe_username: username, nas_id: nasId } = subscription;

  if (!nasId) {
    return {
      success: false,
      error: 'NO_NAS_ASSIGNED',
      message: 'Subscription does not have an assigned NAS device.',
    };
  }

  try {
    let result;

    switch (action) {
      case REMOTE_FIX_ACTION.SESSION_KICK:
        result = await coaService.sendPOD(subscriptionId, nasId, username);
        break;
      case REMOTE_FIX_ACTION.COA_SPEED_CHANGE:
        if (!params.rate_limit) {
          return { success: false, error: 'MISSING_PARAM', message: 'rate_limit parameter is required for speed change.' };
        }
        result = await coaService.speedChange(subscriptionId, nasId, username, params.rate_limit);
        break;
      case REMOTE_FIX_ACTION.COA_ISOLIR:
        result = await coaService.isolir(subscriptionId, nasId, username);
        break;
      case REMOTE_FIX_ACTION.COA_UNISOLIR:
        result = await coaService.unisolir(subscriptionId, nasId, username);
        break;
      default:
        return { success: false, error: 'UNKNOWN_NAS_ACTION', message: `Unknown NAS action: ${action}` };
    }

    return {
      success: result.success,
      responseStatus: result.responseStatus,
      retryCount: result.retryCount,
      logId: result.logId,
    };
  } catch (err) {
    return {
      success: false,
      error: 'NAS_ERROR',
      message: err.message,
    };
  }
}

/**
 * Build a human-readable description for an ACS action.
 * @param {string} action - ACS action type
 * @param {object} params - Action parameters
 * @returns {string} Description
 */
function buildACSDescription(action, params) {
  switch (action) {
    case REMOTE_FIX_ACTION.DEVICE_REBOOT:
      return 'ACS: Device reboot triggered';
    case REMOTE_FIX_ACTION.SSID_CHANGE:
      return `ACS: SSID changed to "${params.ssid || 'N/A'}"`;
    case REMOTE_FIX_ACTION.WIFI_PASSWORD_CHANGE:
      return 'ACS: WiFi password changed';
    default:
      return `ACS: ${action}`;
  }
}

/**
 * Build a human-readable description for a NAS action.
 * @param {string} action - NAS action type
 * @param {object} params - Action parameters
 * @returns {string} Description
 */
function buildNASDescription(action, params) {
  switch (action) {
    case REMOTE_FIX_ACTION.SESSION_KICK:
      return 'NAS: PPPoE session disconnected (POD)';
    case REMOTE_FIX_ACTION.COA_SPEED_CHANGE:
      return `NAS: Speed changed to ${params.rate_limit || 'N/A'} (CoA)`;
    case REMOTE_FIX_ACTION.COA_ISOLIR:
      return 'NAS: Customer isolated (CoA)';
    case REMOTE_FIX_ACTION.COA_UNISOLIR:
      return 'NAS: Isolation removed (CoA)';
    default:
      return `NAS: ${action}`;
  }
}

/**
 * Queue a confirmation notification to the customer after a remote fix action.
 *
 * Requirements: 25.2
 *
 * @param {object} ticket - Ticket with customer details
 * @param {string} actionDescription - Human-readable action description
 * @param {boolean} success - Whether the action was successful
 */
async function queueCustomerRemoteFixNotification(ticket, actionDescription, success) {
  try {
    const customerWhatsapp = ticket.customer_whatsapp || null;
    await appPool.execute(
      `INSERT INTO notifications (recipient_whatsapp, template_name, parameters, channel, status, related_entity_id, related_entity_type, queued_at)
       VALUES (?, ?, ?, ?, 'Queued', ?, 'ticket', NOW())`,
      [
        customerWhatsapp,
        'remote_fix_confirmation',
        JSON.stringify({
          ticket_id: ticket.id,
          customer_id: ticket.customer_id,
          action: actionDescription,
          success,
        }),
        customerWhatsapp ? 'WhatsApp' : 'PushNotification',
        ticket.id,
      ]
    );
  } catch (err) {
    // Log but don't fail the remote fix if notification fails
    console.error('[TicketService] Failed to queue remote fix notification:', err.message);
  }
}

/**
 * Close a ticket with "Remote Fix" resolution type.
 * Combines resolve + close in one operation for remote fixes.
 *
 * Requirements: 25.3
 *
 * @param {number} ticketId - Ticket ID
 * @param {object} user - Requesting user (from req.user)
 * @param {number} user.id - Admin user ID
 * @returns {Promise<object>} Updated ticket
 * @throws {Error} If ticket not found or already closed
 */
async function closeTicketWithRemoteFix(ticketId, user) {
  const ticket = await ticketModel.findById(ticketId);
  if (!ticket) {
    throw Object.assign(new Error('Ticket not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (ticket.status === TICKET_STATUS.CLOSED) {
    throw Object.assign(new Error('Ticket is already closed.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // Resolve with RemoteFix type and close in one step
  await ticketModel.update(ticketId, {
    status: TICKET_STATUS.CLOSED,
    resolution_type: TICKET_RESOLUTION_TYPE.REMOTE_FIX,
    resolved_at: now,
    closed_at: now,
    closed_by: user.id,
  });

  return ticketModel.findById(ticketId);
}

// ============================================================================
// Technician Dispatch and Multi-Ticket Assignment
// Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7
// ============================================================================

/**
 * Check if a given date/time is outside regular working hours.
 * Regular hours are defined in REGULAR_WORK_HOURS (default 08:00-17:00).
 * Weekends (Saturday/Sunday) are also considered outside regular hours.
 *
 * @param {Date} [dateTime] - Date/time to check (defaults to now)
 * @returns {boolean} True if outside regular working hours
 */
function isOutsideRegularHours(dateTime) {
  const dt = dateTime || new Date();
  const hour = dt.getHours();
  const day = dt.getDay(); // 0=Sunday, 6=Saturday

  // Weekend
  if (day === 0 || day === 6) {
    return true;
  }

  // Outside 08:00-17:00
  if (hour < REGULAR_WORK_HOURS.START_HOUR || hour >= REGULAR_WORK_HOURS.END_HOUR) {
    return true;
  }

  return false;
}

/**
 * Dispatch multiple tickets to a single Teknisi or team as a grouped work order.
 * Groups tickets by area and assigns them to the specified technician.
 *
 * When dispatch is outside regular hours AND ticket priority is High/VIP,
 * creates an overtime approval request instead of direct assignment.
 *
 * Requirements: 26.1, 26.2, 26.3
 *
 * @param {object} dispatchData - Dispatch data
 * @param {number[]} dispatchData.ticket_ids - Array of ticket IDs to dispatch
 * @param {number} dispatchData.teknisi_id - Technician user ID to assign
 * @param {Date} [dispatchData.dispatch_time] - Dispatch time (defaults to now)
 * @param {object} user - Requesting user (from req.user)
 * @returns {Promise<object>} Dispatch result with assigned tickets and overtime requests
 * @throws {Error} If no tickets provided, tickets not found, or technician invalid
 */
async function dispatchTickets(dispatchData, user) {
  const { ticket_ids, teknisi_id, dispatch_time } = dispatchData;

  // Validate input
  if (!ticket_ids || !Array.isArray(ticket_ids) || ticket_ids.length === 0) {
    throw Object.assign(new Error('At least one ticket ID is required for dispatch.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  if (!teknisi_id) {
    throw Object.assign(new Error('Technician ID is required for dispatch.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Validate technician exists
  const [teknisiRows] = await appPool.execute(
    "SELECT id, full_name, branch_id FROM users WHERE id = ? AND role = 'Teknisi' LIMIT 1",
    [teknisi_id]
  );
  if (teknisiRows.length === 0) {
    throw Object.assign(new Error('Technician not found or user is not a Teknisi.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  const teknisi = teknisiRows[0];
  const dispatchTime = dispatch_time ? new Date(dispatch_time) : new Date();
  const outsideHours = isOutsideRegularHours(dispatchTime);

  const assignedTickets = [];
  const overtimeRequests = [];
  const pendingTickets = [];
  const errors = [];

  for (const ticketId of ticket_ids) {
    const ticket = await ticketModel.findById(ticketId);
    if (!ticket) {
      errors.push({ ticket_id: ticketId, error: 'Ticket not found' });
      continue;
    }

    if (ticket.status === TICKET_STATUS.CLOSED || ticket.status === TICKET_STATUS.RESOLVED) {
      errors.push({ ticket_id: ticketId, error: 'Cannot dispatch a resolved or closed ticket' });
      continue;
    }

    // Check if overtime approval is needed (Req 26.3)
    const isHighPriority = ticket.priority === TICKET_PRIORITY.HIGH || ticket.priority === TICKET_PRIORITY.VIP;

    if (outsideHours && isHighPriority) {
      // Create overtime approval request
      const overtimeDate = dispatchTime.toISOString().slice(0, 10);
      const overtimeRequest = await overtimeModel.create({
        ticket_id: ticketId,
        teknisi_id,
        overtime_date: overtimeDate,
      });
      overtimeRequests.push({ ticket_id: ticketId, overtime_request: overtimeRequest });
    } else {
      // Direct assignment (Req 26.1)
      await ticketModel.update(ticketId, {
        assigned_teknisi_id: teknisi_id,
        status: TICKET_STATUS.IN_PROGRESS,
      });
      assignedTickets.push(ticketId);
    }
  }

  // Send notification to assigned Teknisi via mobile app (Req 26.2)
  if (assignedTickets.length > 0) {
    await queueTeknisiDispatchNotification(teknisi, assignedTickets);
  }

  return {
    assigned_tickets: assignedTickets,
    overtime_requests: overtimeRequests,
    errors,
    teknisi_id,
    teknisi_name: teknisi.full_name,
    dispatch_time: dispatchTime.toISOString(),
    outside_regular_hours: outsideHours,
  };
}

/**
 * Queue a push notification to the assigned Teknisi for dispatched tickets.
 *
 * Requirements: 26.2
 *
 * @param {object} teknisi - Technician user record
 * @param {number[]} ticketIds - Array of assigned ticket IDs
 */
async function queueTeknisiDispatchNotification(teknisi, ticketIds) {
  try {
    await appPool.execute(
      `INSERT INTO notifications (recipient_whatsapp, template_name, parameters, channel, status, related_entity_id, related_entity_type, queued_at)
       VALUES (?, ?, ?, ?, 'Queued', ?, 'dispatch', NOW())`,
      [
        null, // Push notification, no WhatsApp number needed
        'teknisi_dispatch',
        JSON.stringify({
          teknisi_id: teknisi.id,
          teknisi_name: teknisi.full_name,
          ticket_ids: ticketIds,
          ticket_count: ticketIds.length,
        }),
        'PushNotification',
        teknisi.id,
      ]
    );
  } catch (err) {
    console.error('[TicketService] Failed to queue teknisi dispatch notification:', err.message);
  }
}

/**
 * Approve an overtime request.
 * Notifies the Teknisi team and allows ticket processing.
 *
 * Requirements: 26.4
 *
 * @param {number} overtimeId - Overtime request ID
 * @param {object} approvalData - Approval data
 * @param {number} [approvalData.approved_hours] - Approved overtime hours
 * @param {number} [approvalData.compensation_amount] - Compensation amount
 * @param {object} user - Approving user (from req.user)
 * @returns {Promise<object>} Updated overtime request and ticket
 * @throws {Error} If overtime request not found or not in Requested status
 */
async function approveOvertime(overtimeId, approvalData, user) {
  const overtime = await overtimeModel.findById(overtimeId);
  if (!overtime) {
    throw Object.assign(new Error('Overtime request not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (overtime.status !== OVERTIME_STATUS.REQUESTED) {
    throw Object.assign(new Error('Overtime request has already been processed.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Update overtime request to Approved
  await overtimeModel.approve(overtimeId, {
    approved_by: user.id,
    approved_hours: approvalData.approved_hours || null,
    compensation_amount: approvalData.compensation_amount || null,
  });

  // Assign the ticket to the technician and set to InProgress (Req 26.4)
  await ticketModel.update(overtime.ticket_id, {
    assigned_teknisi_id: overtime.teknisi_id,
    status: TICKET_STATUS.IN_PROGRESS,
  });

  // Notify Teknisi team that overtime is approved (Req 26.4)
  await queueOvertimeApprovalNotification(overtime, true);

  const updatedOvertime = await overtimeModel.findById(overtimeId);
  const updatedTicket = await ticketModel.findById(overtime.ticket_id);

  return { overtime: updatedOvertime, ticket: updatedTicket };
}

/**
 * Reject an overtime request.
 * Queues the ticket for the next available shift with status "Pending".
 *
 * Requirements: 26.5
 *
 * @param {number} overtimeId - Overtime request ID
 * @param {object} user - Rejecting user (from req.user)
 * @returns {Promise<object>} Updated overtime request and ticket
 * @throws {Error} If overtime request not found or not in Requested status
 */
async function rejectOvertime(overtimeId, user) {
  const overtime = await overtimeModel.findById(overtimeId);
  if (!overtime) {
    throw Object.assign(new Error('Overtime request not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (overtime.status !== OVERTIME_STATUS.REQUESTED) {
    throw Object.assign(new Error('Overtime request has already been processed.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Update overtime request to Rejected
  await overtimeModel.reject(overtimeId, user.id);

  // Queue ticket for next shift with status "Pending" (Req 26.5)
  await ticketModel.update(overtime.ticket_id, {
    status: TICKET_STATUS.PENDING,
  });

  // Notify Teknisi team that overtime is rejected
  await queueOvertimeApprovalNotification(overtime, false);

  const updatedOvertime = await overtimeModel.findById(overtimeId);
  const updatedTicket = await ticketModel.findById(overtime.ticket_id);

  return { overtime: updatedOvertime, ticket: updatedTicket };
}

/**
 * Queue a notification about overtime approval/rejection to the Teknisi.
 *
 * @param {object} overtime - Overtime request record
 * @param {boolean} approved - Whether the overtime was approved
 */
async function queueOvertimeApprovalNotification(overtime, approved) {
  try {
    await appPool.execute(
      `INSERT INTO notifications (recipient_whatsapp, template_name, parameters, channel, status, related_entity_id, related_entity_type, queued_at)
       VALUES (?, ?, ?, ?, 'Queued', ?, 'overtime', NOW())`,
      [
        null,
        approved ? 'overtime_approved' : 'overtime_rejected',
        JSON.stringify({
          overtime_id: overtime.id,
          ticket_id: overtime.ticket_id,
          teknisi_id: overtime.teknisi_id,
          overtime_date: overtime.overtime_date,
          approved,
        }),
        'PushNotification',
        overtime.teknisi_id,
      ]
    );
  } catch (err) {
    console.error('[TicketService] Failed to queue overtime notification:', err.message);
  }
}

/**
 * Get pending overtime requests, optionally filtered by branch.
 *
 * @param {object} user - Requesting user (from req.user)
 * @returns {Promise<object>} Paginated list of pending overtime requests
 */
async function getPendingOvertimeRequests(user) {
  const filters = { status: OVERTIME_STATUS.REQUESTED };
  if (user.branch_id) {
    filters.branch_id = user.branch_id;
  }
  return overtimeModel.findAll(filters);
}

/**
 * Record damage classification in a ticket for reporting purposes.
 *
 * Requirements: 26.7
 *
 * @param {number} ticketId - Ticket ID
 * @param {string} damageClassification - Damage classification string
 * @param {object} user - Requesting user (from req.user)
 * @returns {Promise<object>} Updated ticket
 * @throws {Error} If ticket not found or damage classification is empty
 */
async function recordDamageClassification(ticketId, damageClassification, user) {
  const ticket = await ticketModel.findById(ticketId);
  if (!ticket) {
    throw Object.assign(new Error('Ticket not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (!damageClassification || damageClassification.trim().length === 0) {
    throw Object.assign(new Error('Damage classification is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  await ticketModel.update(ticketId, {
    damage_classification: damageClassification.trim(),
  });

  return ticketModel.findById(ticketId);
}

// ============================================================================
// Resolution Metrics and KPI Tracking
// Requirements: 27.1, 27.2, 27.3
// ============================================================================

/**
 * Get resolution metrics for a specific Teknisi.
 * Returns aggregated KPI data: total tickets resolved, average resolution time,
 * and SLA compliance rate.
 *
 * Requirements: 27.2
 *
 * @param {number} teknisiId - Teknisi user ID
 * @param {object} [options={}] - Optional filters
 * @param {string} [options.period] - Filter by period (YYYY-MM format)
 * @param {string} [options.startDate] - Filter from date (YYYY-MM-DD)
 * @param {string} [options.endDate] - Filter to date (YYYY-MM-DD)
 * @returns {Promise<object>} Resolution metrics for the Teknisi
 * @throws {Error} If Teknisi not found
 */
async function getResolutionMetrics(teknisiId, options = {}) {
  // Validate Teknisi exists
  const [teknisiRows] = await appPool.execute(
    "SELECT id, full_name, branch_id FROM users WHERE id = ? AND role = 'Teknisi' LIMIT 1",
    [teknisiId]
  );
  if (teknisiRows.length === 0) {
    throw Object.assign(new Error('Technician not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  const teknisi = teknisiRows[0];
  const metrics = await resolutionMetricsModel.getMetricsByTeknisi(teknisiId, options);

  return {
    teknisi_id: teknisi.id,
    teknisi_name: teknisi.full_name,
    branch_id: teknisi.branch_id,
    ...metrics,
    period: options.period || null,
  };
}

/**
 * Get resolution history for a specific Teknisi with pagination.
 *
 * @param {number} teknisiId - Teknisi user ID
 * @param {object} [options={}] - Optional filters
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=20] - Items per page
 * @returns {Promise<object>} Paginated resolution history
 * @throws {Error} If Teknisi not found
 */
async function getResolutionHistory(teknisiId, options = {}) {
  // Validate Teknisi exists
  const [teknisiRows] = await appPool.execute(
    "SELECT id, full_name FROM users WHERE id = ? AND role = 'Teknisi' LIMIT 1",
    [teknisiId]
  );
  if (teknisiRows.length === 0) {
    throw Object.assign(new Error('Technician not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  const { records, total } = await resolutionMetricsModel.getHistoryByTeknisi(teknisiId, options);
  const page = options.page || 1;
  const limit = options.limit || 20;
  const totalPages = Math.ceil(total / limit);

  return {
    teknisi_id: teknisiId,
    teknisi_name: teknisiRows[0].full_name,
    records,
    total,
    page,
    limit,
    totalPages,
  };
}

module.exports = {
  classifyPriority,
  createTicket,
  assignTicket,
  updateProgress,
  resolveTicket,
  closeTicket,
  getTicketById,
  listTickets,
  getTicketJournals,
  triggerRemoteFix,
  closeTicketWithRemoteFix,
  // Dispatch and overtime (Req 26.1-26.7)
  dispatchTickets,
  approveOvertime,
  rejectOvertime,
  getPendingOvertimeRequests,
  recordDamageClassification,
  isOutsideRegularHours,
  // Resolution metrics and KPI (Req 27.1, 27.2, 27.3)
  getResolutionMetrics,
  getResolutionHistory,
  calculateResolutionTimeMinutes,
  // Exported for testing
  getPriorityRules,
  DEFAULT_PRIORITY_RULES,
  DEFAULT_SLA_THRESHOLDS,
  getSLAThresholds,
  executeACSCommand,
  executeNASCommand,
};
