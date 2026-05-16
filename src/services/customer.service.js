/**
 * Customer service.
 * Handles business logic for customer management including
 * creation, updates, status changes, audit log retrieval,
 * branch-scoped listing, and the full customer activation flow.
 *
 * Activation flow (Requirements 16.1-16.8, 45.1-45.4):
 *   1. Coverage check (verify ODP availability)
 *   2. Record Down Payment (DP)
 *   3. Generate PPPoE credentials
 *   4. Accept installation data (ODP, port, ONU serial, MAC)
 *   5. Calculate first invoice (prorata + installation fee + add-ons - DP)
 *   6. Activate PPPoE on NAS via CoA when first invoice is paid
 */

const customerModel = require('../models/customer.model');
const customerAuditLog = require('../models/customerAuditLog.model');
const subscriptionModel = require('../models/subscription.model');
const downPaymentModel = require('../models/downPayment.model');
const odpModel = require('../models/odp.model');
const branchService = require('./branch.service');
const coverageService = require('./coverage.service');
const billingService = require('./billing.service');
const radiusService = require('./radius.service');
const coaService = require('./coa.service');
const notificationService = require('./notification.service');
const { generatePPPoECredentials, createRadcheckUniquenessChecker } = require('../utils/pppoeGenerator');
const { radiusPool } = require('../config/database');
const { isValidIndonesianPhone } = require('../utils/phoneValidator');
const {
  ERROR_CODE,
  USER_ROLE,
  CUSTOMER_STATUS,
  SUBSCRIPTION_STATUS,
  COA_TRIGGER_TYPE,
  NOTIFICATION_ENTITY_TYPE,
} = require('../utils/constants');

/**
 * Roles allowed to register customers.
 */
const REGISTERING_ROLES = [USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN, USER_ROLE.SALES, USER_ROLE.MITRA];

/**
 * List customers with branch scoping and optional filters.
 * If the requesting user has a branch_id, results are filtered to that branch.
 * @param {object} filters - Query filters
 * @param {string} [filters.lifecycle_status] - Filter by lifecycle status
 * @param {string} [filters.search] - Search by name or KTP
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @param {object} user - Requesting user (from req.user)
 * @param {number|null} user.branch_id - User's branch (null for Superadmin)
 * @returns {Promise<{customers: Array, total: number, page: number, limit: number, totalPages: number}>}
 */
async function listCustomers(filters = {}, user = {}) {
  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 20;

  // Apply branch scoping: if user has a branch_id, filter by it
  const queryFilters = {
    lifecycle_status: filters.lifecycle_status,
    search: filters.search,
    page,
    limit,
  };

  if (user.branch_id && user.role !== USER_ROLE.SUPERADMIN) {
    queryFilters.branch_id = user.branch_id;
  }

  const { customers, total } = await customerModel.findAll(queryFilters);
  const totalPages = Math.ceil(total / limit);

  return { customers, total, page, limit, totalPages };
}

/**
 * Get a single customer by ID.
 * @param {number} id - Customer ID
 * @returns {Promise<object>} Customer record
 * @throws {Error} If customer not found
 */
async function getCustomerById(id) {
  const customer = await customerModel.findById(id);

  if (!customer) {
    throw Object.assign(new Error('Customer not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  return customer;
}

/**
 * Create a new customer.
 * Validates KTP uniqueness, WhatsApp format, branch is active,
 * and associates the customer with the registering user.
 * @param {object} data - Customer data
 * @param {string} data.full_name
 * @param {string} data.ktp_number
 * @param {string|null} [data.npwp_number]
 * @param {string} data.whatsapp_number
 * @param {string|null} [data.email]
 * @param {string} data.address
 * @param {number|null} [data.latitude]
 * @param {number|null} [data.longitude]
 * @param {number} data.branch_id
 * @param {object} user - Requesting user (from req.user)
 * @param {number} user.id - User ID (registered_by)
 * @param {string} user.role - User role
 * @param {number|null} user.branch_id - User's branch
 * @returns {Promise<object>} Created customer
 * @throws {Error} If validation fails
 */
async function createCustomer(data, user) {
  // Validate registering user role
  if (!REGISTERING_ROLES.includes(user.role)) {
    throw Object.assign(new Error('Only Superadmin, Admin, Sales, or Mitra can register customers.'), {
      statusCode: 403,
      code: ERROR_CODE.AUTH_FORBIDDEN,
    });
  }

  // Validate WhatsApp number format
  if (!isValidIndonesianPhone(data.whatsapp_number)) {
    throw Object.assign(new Error('Invalid WhatsApp number format. Must be Indonesian phone number (+62 or 08 prefix, 10-13 digits).'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Validate GPS coordinates if provided
  if (data.latitude !== undefined && data.latitude !== null) {
    if (typeof data.latitude !== 'number' || data.latitude < -90 || data.latitude > 90) {
      throw Object.assign(new Error('Invalid latitude. Must be between -90 and 90.'), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }
  }

  if (data.longitude !== undefined && data.longitude !== null) {
    if (typeof data.longitude !== 'number' || data.longitude < -180 || data.longitude > 180) {
      throw Object.assign(new Error('Invalid longitude. Must be between -180 and 180.'), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }
  }

  // Validate KTP uniqueness
  const existingCustomer = await customerModel.findByKtp(data.ktp_number);
  if (existingCustomer) {
    throw Object.assign(new Error('A customer with this KTP number already exists.'), {
      statusCode: 409,
      code: ERROR_CODE.RESOURCE_ALREADY_EXISTS,
    });
  }

  // Determine branch_id: use provided branch_id or fall back to user's branch
  const branchId = data.branch_id || user.branch_id;
  if (!branchId) {
    throw Object.assign(new Error('Branch ID is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Validate branch is active
  const branchActive = await branchService.isBranchActive(branchId);
  if (!branchActive) {
    throw Object.assign(new Error('Cannot register customer to an inactive or non-existent branch.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Create customer with registered_by from the requesting user
  const customer = await customerModel.create({
    full_name: data.full_name,
    ktp_number: data.ktp_number,
    npwp_number: data.npwp_number || null,
    whatsapp_number: data.whatsapp_number,
    email: data.email || null,
    address: data.address,
    rt: data.rt || null,
    rw: data.rw || null,
    dusun: data.dusun || null,
    desa: data.desa || null,
    kecamatan: data.kecamatan || null,
    kabupaten: data.kabupaten || null,
    provinsi: data.provinsi || null,
    latitude: data.latitude || null,
    longitude: data.longitude || null,
    branch_id: branchId,
    registered_by: user.id,
  });

  return customer;
}

/**
 * Update an existing customer.
 * Validates WhatsApp format if changed. Prevents KTP changes.
 * @param {number} id - Customer ID
 * @param {object} data - Fields to update
 * @param {string} [data.full_name]
 * @param {string} [data.npwp_number]
 * @param {string} [data.whatsapp_number]
 * @param {string} [data.email]
 * @param {string} [data.address]
 * @param {number} [data.latitude]
 * @param {number} [data.longitude]
 * @returns {Promise<object>} Updated customer
 * @throws {Error} If customer not found, KTP change attempted, or validation fails
 */
async function updateCustomer(id, data) {
  const customer = await customerModel.findById(id);

  if (!customer) {
    throw Object.assign(new Error('Customer not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // Prevent KTP changes
  if (data.ktp_number !== undefined) {
    throw Object.assign(new Error('KTP number cannot be changed after registration.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Validate WhatsApp format if being changed
  if (data.whatsapp_number !== undefined) {
    if (!isValidIndonesianPhone(data.whatsapp_number)) {
      throw Object.assign(new Error('Invalid WhatsApp number format. Must be Indonesian phone number (+62 or 08 prefix, 10-13 digits).'), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }
  }

  // Validate GPS coordinates if provided
  if (data.latitude !== undefined && data.latitude !== null) {
    if (typeof data.latitude !== 'number' || data.latitude < -90 || data.latitude > 90) {
      throw Object.assign(new Error('Invalid latitude. Must be between -90 and 90.'), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }
  }

  if (data.longitude !== undefined && data.longitude !== null) {
    if (typeof data.longitude !== 'number' || data.longitude < -180 || data.longitude > 180) {
      throw Object.assign(new Error('Invalid longitude. Must be between -180 and 180.'), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }
  }

  await customerModel.update(id, data);

  return customerModel.findById(id);
}

/**
 * Change customer lifecycle status.
 * Delegates to the customer model's updateStatus which handles
 * transition validation and audit log recording.
 * @param {number} id - Customer ID
 * @param {string} newStatus - Desired new lifecycle status
 * @param {object} user - Requesting user (from req.user)
 * @param {number} user.id - Actor ID for audit log
 * @returns {Promise<object>} Status change result
 * @throws {Error} If customer not found or transition is invalid
 */
async function changeStatus(id, newStatus, user) {
  try {
    const result = await customerModel.updateStatus(id, newStatus, user.id);
    return result;
  } catch (err) {
    // Re-throw with appropriate HTTP status codes
    if (err.code === 'RESOURCE_NOT_FOUND') {
      throw Object.assign(new Error(err.message), {
        statusCode: 404,
        code: ERROR_CODE.RESOURCE_NOT_FOUND,
      });
    }
    if (err.code === 'INVALID_STATUS_TRANSITION') {
      throw Object.assign(new Error(err.message), {
        statusCode: 400,
        code: ERROR_CODE.INVALID_STATUS_TRANSITION,
        details: err.details,
      });
    }
    throw err;
  }
}

/**
 * Get audit log for a customer.
 * Delegates to the customerAuditLog model.
 * @param {number} customerId - Customer ID
 * @param {object} [options={}] - Pagination options
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=50] - Items per page
 * @returns {Promise<{logs: Array, total: number, page: number, limit: number, totalPages: number}>}
 * @throws {Error} If customer not found
 */
async function getAuditLog(customerId, options = {}) {
  // Verify customer exists
  const customer = await customerModel.findById(customerId);
  if (!customer) {
    throw Object.assign(new Error('Customer not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  const page = parseInt(options.page, 10) || 1;
  const limit = parseInt(options.limit, 10) || 50;

  const { logs, total } = await customerAuditLog.findByCustomerId(customerId, { page, limit });
  const totalPages = Math.ceil(total / limit);

  return { logs, total, page, limit, totalPages };
}

/**
 * Step 1: Check coverage for a customer's GPS location.
 * Verifies that an active ODP with available ports exists within the coverage radius.
 * Auto-maps customer to Branch/Mitra based on coverage area.
 *
 * Requirements: 16.1, 16.2
 *
 * @param {number} customerId - Customer ID
 * @returns {Promise<object>} Coverage check result with nearby ODPs
 * @throws {Error} If customer not found, no GPS coordinates, or no coverage
 */
async function checkActivationCoverage(customerId) {
  const customer = await customerModel.findById(customerId);
  if (!customer) {
    throw Object.assign(new Error('Customer not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (customer.latitude == null || customer.longitude == null) {
    throw Object.assign(new Error('Customer GPS coordinates are required for coverage check.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const coverageResult = await coverageService.checkCoverage(
    customer.latitude,
    customer.longitude,
    undefined,
    { branch_id: customer.branch_id }
  );

  if (!coverageResult.covered) {
    throw Object.assign(new Error('No active ODP with available ports found within coverage area.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
      details: coverageResult,
    });
  }

  // Auto-map customer to the branch of the nearest ODP if not already assigned (Req 16.1)
  const nearestOdp = coverageResult.odps[0];
  if (nearestOdp.branch_id && nearestOdp.branch_id !== customer.branch_id) {
    await customerModel.update(customerId, { branch_id: nearestOdp.branch_id });
  }

  return {
    customer_id: customerId,
    covered: true,
    nearest_odp: nearestOdp,
    available_odps: coverageResult.odps,
    radius_meters: coverageResult.radius_meters,
  };
}

/**
 * Step 2: Record a Down Payment (DP) for a customer.
 *
 * Requirements: 16.3
 *
 * @param {number} customerId - Customer ID
 * @param {object} dpData - Down payment data
 * @param {number} dpData.amount - DP amount
 * @param {string} dpData.payment_date - Payment date (YYYY-MM-DD)
 * @param {object} user - Requesting user (from req.user)
 * @param {number} user.id - User ID (receiving agent)
 * @returns {Promise<object>} Created down payment record
 * @throws {Error} If customer not found or amount invalid
 */
async function recordDownPayment(customerId, dpData, user) {
  const customer = await customerModel.findById(customerId);
  if (!customer) {
    throw Object.assign(new Error('Customer not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (!dpData.amount || dpData.amount <= 0) {
    throw Object.assign(new Error('Down payment amount must be a positive number.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  if (!dpData.payment_date) {
    throw Object.assign(new Error('Payment date is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const dp = await downPaymentModel.create({
    customer_id: customerId,
    amount: dpData.amount,
    payment_date: dpData.payment_date,
    received_by: user.id,
  });

  return dp;
}

/**
 * Step 3: Generate PPPoE credentials for a customer subscription.
 * Creates a subscription record with unique PPPoE username/password.
 *
 * Requirements: 16.4
 *
 * @param {number} customerId - Customer ID
 * @param {object} subscriptionData - Subscription setup data
 * @param {number} subscriptionData.package_id - Package ID
 * @param {number} subscriptionData.nas_id - NAS device ID
 * @returns {Promise<object>} Created subscription with PPPoE credentials
 * @throws {Error} If customer not found or credential generation fails
 */
async function generatePPPoEAccount(customerId, subscriptionData) {
  const customer = await customerModel.findById(customerId);
  if (!customer) {
    throw Object.assign(new Error('Customer not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (!subscriptionData.package_id) {
    throw Object.assign(new Error('Package ID is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  if (!subscriptionData.nas_id) {
    throw Object.assign(new Error('NAS ID is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Generate unique PPPoE credentials
  const isUsernameUnique = createRadcheckUniquenessChecker(radiusPool);
  const credentials = await generatePPPoECredentials({ isUsernameUnique });

  // Create subscription record in Pending status
  const subscription = await subscriptionModel.create({
    customer_id: customerId,
    package_id: subscriptionData.package_id,
    pppoe_username: credentials.username,
    pppoe_password: credentials.password,
    nas_id: subscriptionData.nas_id,
  });

  // Write PPPoE credentials to RADIUS DB
  await radiusService.createPPPoEAccount(credentials.username, credentials.password);

  // Transition customer to Instalasi status if currently Prospek
  if (customer.lifecycle_status === CUSTOMER_STATUS.PROSPEK) {
    await customerModel.updateStatus(customerId, CUSTOMER_STATUS.INSTALASI, null);
  }

  return {
    subscription_id: subscription.id,
    pppoe_username: credentials.username,
    pppoe_password: credentials.password,
    package_id: subscriptionData.package_id,
    nas_id: subscriptionData.nas_id,
    status: SUBSCRIPTION_STATUS.PENDING,
  };
}

/**
 * Step 4: Submit installation data from Teknisi.
 * Records ODP number, port, ONU serial, MAC address, and updates ODP used ports.
 *
 * Requirements: 16.5
 *
 * @param {number} subscriptionId - Subscription ID
 * @param {object} installData - Installation data
 * @param {number} installData.odp_id - ODP ID
 * @param {number} installData.odp_port - ODP port number used
 * @param {string} installData.onu_serial_number - ONU serial number
 * @param {string} [installData.onu_mac_address] - ONU MAC address
 * @param {number} [installData.install_latitude] - Installation GPS latitude
 * @param {number} [installData.install_longitude] - Installation GPS longitude
 * @returns {Promise<object>} Updated subscription with installation data
 * @throws {Error} If subscription not found or ODP port unavailable
 */
async function submitInstallationData(subscriptionId, installData) {
  const subscription = await subscriptionModel.findById(subscriptionId);
  if (!subscription) {
    throw Object.assign(new Error('Subscription not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (!installData.odp_id) {
    throw Object.assign(new Error('ODP ID is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  if (!installData.odp_port) {
    throw Object.assign(new Error('ODP port number is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  if (!installData.onu_serial_number) {
    throw Object.assign(new Error('ONU serial number is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Verify ODP exists and has available ports
  const odp = await odpModel.findById(installData.odp_id);
  if (!odp) {
    throw Object.assign(new Error('ODP not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (odp.used_ports >= odp.total_ports) {
    throw Object.assign(new Error('ODP has no available ports.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Update subscription with installation data
  await subscriptionModel.update(subscriptionId, {
    odp_id: installData.odp_id,
    odp_port: installData.odp_port,
    onu_serial_number: installData.onu_serial_number,
    onu_mac_address: installData.onu_mac_address || null,
    install_latitude: installData.install_latitude || null,
    install_longitude: installData.install_longitude || null,
  });

  // Increment ODP used ports
  await odpModel.incrementUsedPorts(installData.odp_id);

  return subscriptionModel.findById(subscriptionId);
}

/**
 * Step 5: Calculate and generate the first invoice for a new customer.
 * Includes prorata (if enabled), installation fee, add-on charges, and DP deduction.
 *
 * Requirements: 16.6, 45.1, 45.2, 45.3, 45.4
 *
 * @param {number} subscriptionId - Subscription ID
 * @param {object} [options={}] - Invoice options
 * @param {number} [options.installationFee=0] - Installation fee amount
 * @param {number} [options.addonCharges=0] - Add-on service charges
 * @param {Date|string} [options.activationDate] - Activation date for prorata (defaults to today)
 * @returns {Promise<object>} Generated first invoice
 * @throws {Error} If subscription not found
 */
async function calculateFirstInvoice(subscriptionId, options = {}) {
  const subscription = await subscriptionModel.findById(subscriptionId);
  if (!subscription) {
    throw Object.assign(new Error('Subscription not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  const activationDate = options.activationDate || new Date();
  const installationFee = options.installationFee || 0;
  const addonCharges = options.addonCharges || 0;

  // Generate first invoice with prorata, installation fee, add-ons, and DP deduction
  const invoice = await billingService.generateInvoice(subscriptionId, {
    isFirstInvoice: true,
    activationDate,
    installationFee,
    addonCharges,
    applyDp: true,
  });

  return invoice;
}

/**
 * Step 6: Activate customer PPPoE on NAS via CoA after first invoice is paid.
 * Sets subscription to Active, assigns RADIUS user group, sends CoA to NAS,
 * and transitions customer status to Aktif.
 *
 * Requirements: 16.8
 *
 * @param {number} subscriptionId - Subscription ID
 * @param {object} user - Requesting user (from req.user)
 * @param {number} user.id - Actor ID for audit log
 * @returns {Promise<object>} Activation result with CoA status
 * @throws {Error} If subscription not found or CoA fails
 */
async function activateCustomer(subscriptionId, user) {
  const subscription = await subscriptionModel.findByIdWithDetails(subscriptionId);
  if (!subscription) {
    throw Object.assign(new Error('Subscription not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (subscription.status === SUBSCRIPTION_STATUS.ACTIVE) {
    throw Object.assign(new Error('Subscription is already active.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Assign user to package group in RADIUS
  const packageGroupName = `package-${subscription.package_id}`;
  await radiusService.updateUserGroup(subscription.pppoe_username, packageGroupName);

  // Send CoA to NAS to activate the PPPoE session with the correct speed profile
  const rateLimit = `${subscription.upload_rate_limit}k/${subscription.download_rate_limit}k`;
  const coaResult = await coaService.sendCoA(
    subscriptionId,
    subscription.nas_id,
    COA_TRIGGER_TYPE.SPEED_CHANGE,
    {
      username: subscription.pppoe_username,
      rateLimit,
    }
  );

  // Update subscription status to Active
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await subscriptionModel.update(subscriptionId, {
    status: SUBSCRIPTION_STATUS.ACTIVE,
    activated_at: now,
  });

  // Transition customer status to Aktif
  const customer = await customerModel.findById(subscription.customer_id);
  if (customer && customer.lifecycle_status === CUSTOMER_STATUS.INSTALASI) {
    await customerModel.updateStatus(subscription.customer_id, CUSTOMER_STATUS.AKTIF, user.id);
  }

  // Queue service activation notification (Requirement 16.7)
  try {
    const customerData = customer || await customerModel.findById(subscription.customer_id);
    if (customerData && customerData.whatsapp_number) {
      // Newly activated customer: subscription months is 0 (just activated)
      // This means WA+email channel will be used (<=2 months)
      await notificationService.queueBySubscriptionAge({
        recipient: customerData.whatsapp_number,
        templateName: 'service_activated',
        parameters: {
          customer_name: customerData.full_name,
          pppoe_username: subscription.pppoe_username,
          package_name: subscription.package_name || '',
        },
        subscriptionMonths: 0,
        relatedEntityId: subscriptionId,
        relatedEntityType: NOTIFICATION_ENTITY_TYPE.SUBSCRIPTION,
      });
    }
  } catch (notifError) {
    // Log but don't fail activation if notification queuing fails
    console.error('[Customer] Error queuing service activation notification:', notifError.message);
  }

  return {
    subscription_id: subscriptionId,
    customer_id: subscription.customer_id,
    pppoe_username: subscription.pppoe_username,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    activated_at: now,
    coa_result: {
      success: coaResult.success,
      response_status: coaResult.responseStatus,
      retry_count: coaResult.retryCount,
    },
  };
}

module.exports = {
  listCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  changeStatus,
  getAuditLog,
  // Activation flow methods
  checkActivationCoverage,
  recordDownPayment,
  generatePPPoEAccount,
  submitInstallationData,
  calculateFirstInvoice,
  activateCustomer,
};
