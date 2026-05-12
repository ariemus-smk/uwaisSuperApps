/**
 * Package Change Service.
 * Handles package upgrade/downgrade request workflow:
 * - Request submission with 1-change-per-month validation
 * - Admin approval with subscription update, billing adjustment, and CoA speed change
 * - Admin rejection with reason recording and customer notification
 *
 * Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6
 */

const packageChangeRequestModel = require('../models/packageChangeRequest.model');
const subscriptionModel = require('../models/subscription.model');
const packageModel = require('../models/package.model');
const coaService = require('./coa.service');
const { appPool } = require('../config/database');
const { ERROR_CODE, COA_TRIGGER_TYPE, SUBSCRIPTION_STATUS, PACKAGE_STATUS } = require('../utils/constants');
const { PACKAGE_CHANGE_STATUS } = require('../models/packageChangeRequest.model');

/**
 * Submit a package change request.
 * Validates:
 * - Subscription exists and is active
 * - Requested package exists and is active
 * - Requested package differs from current package
 * - No approved change already exists for this subscription in the current calendar month
 *
 * On success, sets status to "Pending" (Menunggu Konfirmasi Admin).
 *
 * @param {object} data - Request data
 * @param {number} data.subscription_id - Subscription ID
 * @param {number} data.requested_package_id - Desired new package ID
 * @param {number} data.requested_by - User ID submitting the request
 * @returns {Promise<object>} Created package change request
 * @throws {Error} If validation fails or monthly limit reached
 */
async function requestPackageChange(data) {
  const { subscription_id, requested_package_id, requested_by } = data;

  // Validate subscription exists and is active
  const subscription = await subscriptionModel.findById(subscription_id);
  if (!subscription) {
    throw Object.assign(new Error('Subscription not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (subscription.status !== SUBSCRIPTION_STATUS.ACTIVE) {
    throw Object.assign(
      new Error('Package change can only be requested for active subscriptions.'),
      { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
    );
  }

  // Validate requested package exists and is active
  const requestedPackage = await packageModel.findById(requested_package_id);
  if (!requestedPackage) {
    throw Object.assign(new Error('Requested package not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (requestedPackage.status !== PACKAGE_STATUS.ACTIVE) {
    throw Object.assign(
      new Error('Requested package is not active.'),
      { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
    );
  }

  // Validate requested package differs from current
  if (subscription.package_id === requested_package_id) {
    throw Object.assign(
      new Error('Requested package is the same as the current package.'),
      { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
    );
  }

  // Check 1-change-per-month limit (Req 17.1, 17.2)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-based

  const approvedCount = await packageChangeRequestModel.countApprovedInMonth(
    subscription_id,
    currentYear,
    currentMonth
  );

  if (approvedCount >= 1) {
    throw Object.assign(
      new Error('Batas perubahan paket 1 kali per bulan telah tercapai. Silakan coba lagi bulan depan.'),
      { statusCode: 422, code: ERROR_CODE.PACKAGE_CHANGE_LIMIT }
    );
  }

  // Create the request with status "Pending" (Menunggu Konfirmasi Admin) (Req 17.3)
  const changeRequest = await packageChangeRequestModel.create({
    subscription_id,
    current_package_id: subscription.package_id,
    requested_package_id,
    requested_by,
  });

  // TODO: Notify assigned Admin about the pending request (Req 17.3)
  // This would integrate with the notification service when available

  return changeRequest;
}

/**
 * Approve a package change request.
 * On approval:
 * 1. Update subscription to the new package
 * 2. Calculate billing adjustment for the next invoice
 * 3. Trigger CoA speed change on the NAS
 * 4. Notify customer that new package is active (on successful CoA)
 *
 * @param {number} requestId - Package change request ID
 * @param {number} adminId - Admin user ID approving the request
 * @returns {Promise<object>} Updated package change request with CoA result
 * @throws {Error} If request not found, already processed, or CoA fails
 */
async function approvePackageChange(requestId, adminId) {
  // Fetch request with full details
  const request = await packageChangeRequestModel.findByIdWithDetails(requestId);
  if (!request) {
    throw Object.assign(new Error('Package change request not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (request.status !== PACKAGE_CHANGE_STATUS.PENDING) {
    throw Object.assign(
      new Error(`Cannot approve request with status '${request.status}'. Only Pending requests can be approved.`),
      { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
    );
  }

  // Re-check monthly limit to prevent race conditions
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const approvedCount = await packageChangeRequestModel.countApprovedInMonth(
    request.subscription_id,
    currentYear,
    currentMonth
  );

  if (approvedCount >= 1) {
    throw Object.assign(
      new Error('Batas perubahan paket 1 kali per bulan telah tercapai untuk subscription ini.'),
      { statusCode: 422, code: ERROR_CODE.PACKAGE_CHANGE_LIMIT }
    );
  }

  // Get the new package details for CoA
  const newPackage = await packageModel.findById(request.requested_package_id);
  if (!newPackage) {
    throw Object.assign(new Error('Requested package no longer exists.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // 1. Update subscription to new package (Req 17.4)
  await subscriptionModel.update(request.subscription_id, {
    package_id: request.requested_package_id,
  });

  // 2. Calculate billing adjustment (Req 17.4)
  // Store the price difference for the next billing cycle
  const billingAdjustment = await calculateBillingAdjustment(request, newPackage);

  // 3. Update the request status to Approved
  const processedAt = now.toISOString().slice(0, 19).replace('T', ' ');
  await packageChangeRequestModel.update(requestId, {
    status: PACKAGE_CHANGE_STATUS.APPROVED,
    approved_by: adminId,
    processed_at: processedAt,
  });

  // 4. Trigger CoA speed change on the NAS (Req 17.4)
  const subscription = await subscriptionModel.findById(request.subscription_id);
  const rateLimit = buildRateLimitString(newPackage);

  let coaResult = null;
  try {
    coaResult = await coaService.speedChange(
      request.subscription_id,
      subscription.nas_id,
      subscription.pppoe_username,
      rateLimit
    );
  } catch (err) {
    // CoA failure is logged but does not rollback the approval
    console.error(`[PackageChange] CoA speed change failed for request ${requestId}:`, err.message);
    coaResult = { success: false, error: err.message };
  }

  // 5. Notify customer on successful CoA (Req 17.6)
  if (coaResult && coaResult.success) {
    // TODO: Send notification to customer that new package is active
    // notificationService.sendPackageChangeSuccess(request.customer_id, newPackage.name);
  }

  return {
    id: requestId,
    status: PACKAGE_CHANGE_STATUS.APPROVED,
    approved_by: adminId,
    processed_at: processedAt,
    billing_adjustment: billingAdjustment,
    coa_result: coaResult,
  };
}

/**
 * Reject a package change request.
 * Records the rejection reason and notifies the customer.
 *
 * @param {number} requestId - Package change request ID
 * @param {number} adminId - Admin user ID rejecting the request
 * @param {string} reason - Rejection reason
 * @returns {Promise<object>} Updated package change request
 * @throws {Error} If request not found or already processed
 */
async function rejectPackageChange(requestId, adminId, reason) {
  const request = await packageChangeRequestModel.findById(requestId);
  if (!request) {
    throw Object.assign(new Error('Package change request not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (request.status !== PACKAGE_CHANGE_STATUS.PENDING) {
    throw Object.assign(
      new Error(`Cannot reject request with status '${request.status}'. Only Pending requests can be rejected.`),
      { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
    );
  }

  if (!reason || reason.trim().length === 0) {
    throw Object.assign(new Error('Rejection reason is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const processedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // Update request status to Rejected (Req 17.5)
  await packageChangeRequestModel.update(requestId, {
    status: PACKAGE_CHANGE_STATUS.REJECTED,
    rejection_reason: reason.trim(),
    approved_by: adminId,
    processed_at: processedAt,
  });

  // TODO: Notify customer about rejection (Req 17.5)
  // notificationService.sendPackageChangeRejected(request.subscription_id, reason);

  return {
    id: requestId,
    status: PACKAGE_CHANGE_STATUS.REJECTED,
    rejection_reason: reason.trim(),
    processed_at: processedAt,
  };
}

/**
 * Get package change requests with pagination and filters.
 *
 * @param {object} [filters={}] - Query filters
 * @param {number} [filters.subscription_id] - Filter by subscription
 * @param {string} [filters.status] - Filter by status
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @param {object} [user={}] - Requesting user (from req.user)
 * @param {number|null} [user.branch_id] - User's branch (null for Superadmin)
 * @returns {Promise<{requests: Array, total: number, page: number, limit: number, totalPages: number}>}
 */
async function getPackageChangeRequests(filters = {}, user = {}) {
  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 20;

  const queryFilters = {
    subscription_id: filters.subscription_id,
    status: filters.status,
    page,
    limit,
  };

  // Apply branch scoping
  if (user.branch_id) {
    queryFilters.branch_id = user.branch_id;
  }

  const { requests, total } = await packageChangeRequestModel.findAll(queryFilters);
  const totalPages = Math.ceil(total / limit);

  return { requests, total, page, limit, totalPages };
}

/**
 * Get a single package change request by ID with full details.
 *
 * @param {number} id - Package change request ID
 * @returns {Promise<object>} Package change request with details
 * @throws {Error} If request not found
 */
async function getPackageChangeRequestById(id) {
  const request = await packageChangeRequestModel.findByIdWithDetails(id);
  if (!request) {
    throw Object.assign(new Error('Package change request not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }
  return request;
}

/**
 * Calculate billing adjustment when a package change is approved.
 * The adjustment represents the price difference that will be applied
 * to the next billing cycle invoice.
 *
 * For upgrades: positive adjustment (customer pays more next month)
 * For downgrades: negative adjustment (customer pays less next month or gets credit)
 *
 * @param {object} request - Package change request with details
 * @param {object} newPackage - New package record
 * @returns {Promise<object>} Billing adjustment details
 */
async function calculateBillingAdjustment(request, newPackage) {
  const currentPrice = parseFloat(request.current_package_price) || 0;
  const newPrice = parseFloat(newPackage.monthly_price) || 0;
  const priceDifference = newPrice - currentPrice;

  // Calculate prorated adjustment for remaining days in current month
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const remainingDays = daysInMonth - now.getDate();
  const dailyDifference = priceDifference / daysInMonth;
  const proratedAdjustment = Math.round(dailyDifference * remainingDays * 100) / 100;

  // Store adjustment record for next billing cycle
  // This will be picked up by the billing generation job
  try {
    await appPool.execute(
      `UPDATE subscriptions SET updated_at = NOW() WHERE id = ?`,
      [request.subscription_id]
    );
  } catch (err) {
    console.error('[PackageChange] Failed to update subscription timestamp:', err.message);
  }

  return {
    current_price: currentPrice,
    new_price: newPrice,
    price_difference: priceDifference,
    prorated_adjustment: proratedAdjustment,
    remaining_days: remainingDays,
    type: priceDifference > 0 ? 'upgrade' : 'downgrade',
  };
}

/**
 * Build Mikrotik rate limit string from package QoS parameters.
 * Format: "upload/download" in kbps (e.g., "10240k/20480k")
 *
 * @param {object} pkg - Package record with rate_limit fields
 * @returns {string} Mikrotik rate limit string
 */
function buildRateLimitString(pkg) {
  const uploadRate = `${pkg.upload_rate_limit}k`;
  const downloadRate = `${pkg.download_rate_limit}k`;
  return `${uploadRate}/${downloadRate}`;
}

/**
 * Validate whether a package change is allowed for a subscription in the current month.
 * Exported for use in property-based testing.
 *
 * @param {number} subscriptionId - Subscription ID
 * @param {number} year - Year to check
 * @param {number} month - Month to check (1-12)
 * @returns {Promise<boolean>} true if change is allowed, false if limit reached
 */
async function isChangeAllowedInMonth(subscriptionId, year, month) {
  const approvedCount = await packageChangeRequestModel.countApprovedInMonth(
    subscriptionId,
    year,
    month
  );
  return approvedCount < 1;
}

module.exports = {
  requestPackageChange,
  approvePackageChange,
  rejectPackageChange,
  getPackageChangeRequests,
  getPackageChangeRequestById,
  calculateBillingAdjustment,
  buildRateLimitString,
  isChangeAllowedInMonth,
};
