/**
 * Subscription service.
 * Handles business logic for subscription management including
 * creation with PPPoE generation, activation via RADIUS provisioning,
 * installation data recording, and branch-scoped listing.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 16.4, 16.5
 */

const subscriptionModel = require('../models/subscription.model');
const customerModel = require('../models/customer.model');
const packageModel = require('../models/package.model');
const radiusService = require('./radius.service');
const { generatePPPoECredentials, createRadcheckUniquenessChecker } = require('../utils/pppoeGenerator');
const { radiusPool } = require('../config/database');
const { SUBSCRIPTION_STATUS, ERROR_CODE } = require('../utils/constants');

/**
 * List subscriptions with branch scoping and optional filters.
 * @param {object} filters - Query filters
 * @param {number} [filters.customer_id] - Filter by customer
 * @param {string} [filters.status] - Filter by subscription status
 * @param {string} [filters.search] - Search by PPPoE username
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @param {object} user - Requesting user (from req.user)
 * @param {number|null} user.branch_id - User's branch (null for Superadmin)
 * @returns {Promise<{subscriptions: Array, total: number, page: number, limit: number, totalPages: number}>}
 */
async function listSubscriptions(filters = {}, user = {}) {
  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 20;

  const queryFilters = {
    customer_id: filters.customer_id,
    status: filters.status,
    search: filters.search,
    page,
    limit,
  };

  // Apply branch scoping (Only if not Superadmin)
  if (user.role !== 'Superadmin' && user.branch_id) {
    queryFilters.branch_id = user.branch_id;
  }

  const { subscriptions, total } = await subscriptionModel.findAll(queryFilters);
  const totalPages = Math.ceil(total / limit);

  return { subscriptions, total, page, limit, totalPages };
}

/**
 * Get a single subscription by ID with details.
 * @param {number} id - Subscription ID
 * @returns {Promise<object>} Subscription record with customer and package details
 * @throws {Error} If subscription not found
 */
async function getSubscriptionById(id) {
  const subscription = await subscriptionModel.findByIdWithDetails(id);

  if (!subscription) {
    throw Object.assign(new Error('Subscription not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  return subscription;
}

/**
 * Create a new subscription for a customer.
 * Generates unique PPPoE credentials using the radcheck uniqueness checker.
 * @param {number} customerId - Customer ID
 * @param {number} packageId - Package ID
 * @param {number} nasId - NAS device ID
 * @returns {Promise<object>} Created subscription
 * @throws {Error} If customer or package not found, or PPPoE generation fails
 */
async function create(customerId, packageId, nasId) {
  // Validate customer exists
  const customer = await customerModel.findById(customerId);
  if (!customer) {
    throw Object.assign(new Error('Customer not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // Validate package exists and is active
  const pkg = await packageModel.findById(packageId);
  if (!pkg) {
    throw Object.assign(new Error('Package not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }
  if (pkg.status !== 'Active') {
    throw Object.assign(new Error('Cannot assign an inactive package.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Generate unique PPPoE credentials
  const isUsernameUnique = createRadcheckUniquenessChecker(radiusPool);
  const { username, password } = await generatePPPoECredentials({
    isUsernameUnique,
    maxAttempts: 10,
  });

  // Create subscription record
  const subscription = await subscriptionModel.create({
    customer_id: customerId,
    package_id: packageId,
    pppoe_username: username,
    pppoe_password: password,
    nas_id: nasId,
  });

  return subscription;
}

/**
 * Activate a subscription.
 * Writes PPPoE account to RADIUS DB, assigns user to package group,
 * and sets subscription status to Active.
 * @param {number} subscriptionId - Subscription ID
 * @param {number} [actorId=1] - User ID performing the activation
 * @returns {Promise<object>} Updated subscription
 * @throws {Error} If subscription not found or not in Pending status
 */
async function activate(subscriptionId, actorId = 1) {
  const subscription = await subscriptionModel.findById(subscriptionId);

  if (!subscription) {
    throw Object.assign(new Error('Subscription not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (subscription.status !== SUBSCRIPTION_STATUS.PENDING) {
    throw Object.assign(
      new Error(`Cannot activate subscription with status '${subscription.status}'. Only Pending subscriptions can be activated.`),
      {
        statusCode: 400,
        code: ERROR_CODE.INVALID_STATUS_TRANSITION,
      }
    );
  }

  // Get the package for group name
  const pkg = await packageModel.findById(subscription.package_id);
  if (!pkg) {
    throw Object.assign(new Error('Associated package not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // Write PPPoE account to RADIUS DB (radcheck)
  await radiusService.createPPPoEAccount(
    subscription.pppoe_username,
    subscription.pppoe_password
  );

  // Assign user to package group (radusergroup)
  const groupname = `pkg-${pkg.id}`;
  await radiusService.updateUserGroup(subscription.pppoe_username, groupname);

  // Apply Isolir profile immediately because first invoice is unpaid
  await radiusService.setIsolirProfile(subscription.pppoe_username);

  const activationDate = new Date();

  // Update subscription status to Suspended (Isolir state)
  await subscriptionModel.update(subscriptionId, {
    status: SUBSCRIPTION_STATUS.SUSPENDED,
    activated_at: activationDate.toISOString().slice(0, 19).replace('T', ' '),
  });

  // Update customer status to ISOLIR
  const customerModel = require('../models/customer.model');
  const { CUSTOMER_STATUS } = require('../utils/constants');
  await customerModel.updateStatus(subscription.customer_id, CUSTOMER_STATUS.ISOLIR, actorId);

  // Generate prorated invoice for the new subscription
  const billingService = require('./billing.service');
  try {
    await billingService.generateInvoice(subscriptionId, {
      isFirstInvoice: true,
      activationDate: activationDate,
      applyDp: true, // deduct any down payments
    });
  } catch (err) {
    console.error(`[Subscription Service] Failed to generate first invoice: ${err.message}`);
    // We log but do not fail the activation
  }

  // Return updated subscription
  return subscriptionModel.findByIdWithDetails(subscriptionId);
}

/**
 * Record installation data for a subscription.
 * Accepts technician installation data (ODP, ONU, GPS coordinates).
 * @param {number} subscriptionId - Subscription ID
 * @param {object} installationData - Installation data from technician
 * @param {number} [installationData.odp_id] - ODP ID
 * @param {number} [installationData.odp_port] - ODP port number
 * @param {string} [installationData.onu_serial_number] - ONU serial number
 * @param {string} [installationData.onu_mac_address] - ONU MAC address
 * @param {number} [installationData.install_latitude] - Installation GPS latitude
 * @param {number} [installationData.install_longitude] - Installation GPS longitude
 * @returns {Promise<object>} Updated subscription
 * @throws {Error} If subscription not found
 */
async function install(subscriptionId, installationData) {
  const subscription = await subscriptionModel.findById(subscriptionId);

  if (!subscription) {
    throw Object.assign(new Error('Subscription not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // Validate GPS coordinates if provided
  if (installationData.install_latitude !== undefined && installationData.install_latitude !== null) {
    if (typeof installationData.install_latitude !== 'number' ||
        installationData.install_latitude < -90 || installationData.install_latitude > 90) {
      throw Object.assign(new Error('Invalid install latitude. Must be between -90 and 90.'), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }
  }

  if (installationData.install_longitude !== undefined && installationData.install_longitude !== null) {
    if (typeof installationData.install_longitude !== 'number' ||
        installationData.install_longitude < -180 || installationData.install_longitude > 180) {
      throw Object.assign(new Error('Invalid install longitude. Must be between -180 and 180.'), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }
  }

  // Update subscription with installation data
  const updateData = {};
  if (installationData.odp_id !== undefined) updateData.odp_id = installationData.odp_id;
  if (installationData.odp_port !== undefined) updateData.odp_port = installationData.odp_port;
  if (installationData.onu_serial_number !== undefined) updateData.onu_serial_number = installationData.onu_serial_number;
  if (installationData.onu_mac_address !== undefined) updateData.onu_mac_address = installationData.onu_mac_address;
  if (installationData.install_latitude !== undefined) updateData.install_latitude = installationData.install_latitude;
  if (installationData.install_longitude !== undefined) updateData.install_longitude = installationData.install_longitude;

  if (Object.keys(updateData).length === 0) {
    throw Object.assign(new Error('No installation data provided.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  await subscriptionModel.update(subscriptionId, updateData);

  return subscriptionModel.findByIdWithDetails(subscriptionId);
}

/**
 * Update a subscription (general update for Admin).
 * @param {number} id - Subscription ID
 * @param {object} data - Fields to update
 * @returns {Promise<object>} Updated subscription
 * @throws {Error} If subscription not found
 */
async function updateSubscription(id, data) {
  const subscription = await subscriptionModel.findById(id);

  if (!subscription) {
    throw Object.assign(new Error('Subscription not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // Only allow updating certain fields
  const allowedUpdates = {};
  if (data.package_id !== undefined) allowedUpdates.package_id = data.package_id;
  if (data.nas_id !== undefined) allowedUpdates.nas_id = data.nas_id;

  if (Object.keys(allowedUpdates).length === 0) {
    throw Object.assign(new Error('No valid fields to update.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Validate package if being changed
  if (allowedUpdates.package_id) {
    const pkg = await packageModel.findById(allowedUpdates.package_id);
    if (!pkg) {
      throw Object.assign(new Error('Package not found.'), {
        statusCode: 404,
        code: ERROR_CODE.RESOURCE_NOT_FOUND,
      });
    }
    if (pkg.status !== 'Active') {
      throw Object.assign(new Error('Cannot assign an inactive package.'), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }
  }

  await subscriptionModel.update(id, allowedUpdates);

  return subscriptionModel.findByIdWithDetails(id);
}

/**
 * Delete a subscription.
 * Removes the account from RADIUS and deletes the record from the app database.
 * @param {number} id - Subscription ID
 * @returns {Promise<boolean>} True if deleted
 * @throws {Error} If subscription not found
 */
async function deleteSubscription(id) {
  const subscription = await subscriptionModel.findById(id);

  if (!subscription) {
    throw Object.assign(new Error('Subscription not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // 1. Remove from RADIUS if username exists
  if (subscription.pppoe_username) {
    await radiusService.removeUser(subscription.pppoe_username);
  }

  // 2. Delete from App DB
  await subscriptionModel.remove(id);

  return true;
}

module.exports = {
  listSubscriptions,
  getSubscriptionById,
  create,
  activate,
  install,
  updateSubscription,
  deleteSubscription,
};
