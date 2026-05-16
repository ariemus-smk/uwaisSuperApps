/**
 * Package service.
 * Handles business logic for service package management including
 * CRUD operations, QoS parameter validation, and deletion protection.
 */

const packageModel = require('../models/package.model');
const radgroupreplyModel = require('../radiusModels/radgroupreply.model');
const { PACKAGE_STATUS, ERROR_CODE } = require('../utils/constants');

/**
 * Validate QoS parameters for a package.
 * Rules:
 * - burst_limit >= rate_limit (for both upload and download)
 * - burst_threshold <= rate_limit (for both upload and download)
 *
 * @param {object} data - Package data containing QoS fields
 * @throws {Error} If validation fails
 */
function validateQoSParameters(data) {
  const errors = [];

  // Upload: burst_limit >= rate_limit
  if (data.upload_burst_limit < data.upload_rate_limit) {
    errors.push({
      field: 'upload_burst_limit',
      message: 'upload_burst_limit must be greater than or equal to upload_rate_limit',
    });
  }

  // Download: burst_limit >= rate_limit
  if (data.download_burst_limit < data.download_rate_limit) {
    errors.push({
      field: 'download_burst_limit',
      message: 'download_burst_limit must be greater than or equal to download_rate_limit',
    });
  }

  // Upload: burst_threshold <= rate_limit
  if (data.upload_burst_threshold > data.upload_rate_limit) {
    errors.push({
      field: 'upload_burst_threshold',
      message: 'upload_burst_threshold must be less than or equal to upload_rate_limit',
    });
  }

  // Download: burst_threshold <= rate_limit
  if (data.download_burst_threshold > data.download_rate_limit) {
    errors.push({
      field: 'download_burst_threshold',
      message: 'download_burst_threshold must be less than or equal to download_rate_limit',
    });
  }

  if (errors.length > 0) {
    throw Object.assign(new Error('QoS parameter validation failed.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
      errors,
    });
  }
}

/**
 * Get all packages with optional status filter.
 * @param {object} [filters={}] - Optional filters (status)
 * @returns {Promise<Array>} List of packages
 */
async function getAllPackages(filters = {}) {
  return packageModel.findAll(filters);
}

/**
 * Get a single package by ID.
 * @param {number} id - Package ID
 * @returns {Promise<object>} Package record
 * @throws {Error} If package not found
 */
async function getPackageById(id) {
  const pkg = await packageModel.findById(id);

  if (!pkg) {
    throw Object.assign(new Error('Package not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  return pkg;
}

/**
 * Create a new package.
 * Validates QoS parameters and name uniqueness.
 * @param {object} data - Package data
 * @returns {Promise<object>} Created package
 * @throws {Error} If validation fails or name already exists
 */
async function createPackage(data) {
  // Validate QoS parameters
  validateQoSParameters(data);

  // Check for duplicate name
  const existing = await packageModel.findByName(data.name);
  if (existing) {
    throw Object.assign(new Error('Package with this name already exists.'), {
      statusCode: 409,
      code: ERROR_CODE.RESOURCE_ALREADY_EXISTS,
    });
  }

  const pkg = await packageModel.create(data);

  // Sync with RADIUS radgroupreply
  const groupname = `pkg-${pkg.id}`;
  const rateLimit = `${data.upload_rate_limit}k/${data.download_rate_limit}k ${data.upload_burst_limit}k/${data.download_burst_limit}k ${data.upload_burst_threshold}k/${data.download_burst_threshold}k 60/60 8`;
  
  await radgroupreplyModel.create({
    groupname,
    attribute: 'Mikrotik-Rate-Limit',
    op: '=',
    value: rateLimit,
  });

  if (data.ip_pool) {
    await radgroupreplyModel.create({
      groupname,
      attribute: 'Framed-Pool',
      op: '=',
      value: data.ip_pool,
    });
  }

  return pkg;
}

/**
 * Update an existing package.
 * Validates QoS parameters if speed fields are being changed.
 * @param {number} id - Package ID
 * @param {object} data - Fields to update
 * @returns {Promise<object>} Updated package
 * @throws {Error} If package not found, validation fails, or name conflict
 */
async function updatePackage(id, data) {
  const pkg = await packageModel.findById(id);

  if (!pkg) {
    throw Object.assign(new Error('Package not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // Check name uniqueness if name is being changed
  if (data.name && data.name !== pkg.name) {
    const existing = await packageModel.findByName(data.name);
    if (existing) {
      throw Object.assign(new Error('Package with this name already exists.'), {
        statusCode: 409,
        code: ERROR_CODE.RESOURCE_ALREADY_EXISTS,
      });
    }
  }

  // Merge existing values with updates for QoS validation
  const merged = {
    upload_rate_limit: data.upload_rate_limit !== undefined ? data.upload_rate_limit : pkg.upload_rate_limit,
    download_rate_limit: data.download_rate_limit !== undefined ? data.download_rate_limit : pkg.download_rate_limit,
    upload_burst_limit: data.upload_burst_limit !== undefined ? data.upload_burst_limit : pkg.upload_burst_limit,
    download_burst_limit: data.download_burst_limit !== undefined ? data.download_burst_limit : pkg.download_burst_limit,
    upload_burst_threshold: data.upload_burst_threshold !== undefined ? data.upload_burst_threshold : pkg.upload_burst_threshold,
    download_burst_threshold: data.download_burst_threshold !== undefined ? data.download_burst_threshold : pkg.download_burst_threshold,
  };

  // Validate QoS parameters with merged values
  validateQoSParameters(merged);

  await packageModel.update(id, data);

  // Sync with RADIUS radgroupreply
  const targetGroupName = `pkg-${id}`;
  const rateLimit = `${merged.upload_rate_limit}k/${merged.download_rate_limit}k ${merged.upload_burst_limit}k/${merged.download_burst_limit}k ${merged.upload_burst_threshold}k/${merged.download_burst_threshold}k 60/60 8`;

  const existingRateLimit = await radgroupreplyModel.findByGroupnameAndAttribute(targetGroupName, 'Mikrotik-Rate-Limit');
  if (existingRateLimit) {
    await radgroupreplyModel.update(existingRateLimit.id, { value: rateLimit });
  } else {
    await radgroupreplyModel.create({
      groupname: targetGroupName,
      attribute: 'Mikrotik-Rate-Limit',
      op: '=',
      value: rateLimit,
    });
  }

  const currentIpPool = data.ip_pool !== undefined ? data.ip_pool : pkg.ip_pool;
  const existingPool = await radgroupreplyModel.findByGroupnameAndAttribute(targetGroupName, 'Framed-Pool');
  
  if (currentIpPool) {
    if (existingPool) {
      await radgroupreplyModel.update(existingPool.id, { value: currentIpPool });
    } else {
      await radgroupreplyModel.create({
        groupname: targetGroupName,
        attribute: 'Framed-Pool',
        op: '=',
        value: currentIpPool,
      });
    }
  } else if (existingPool) {
    await radgroupreplyModel.deleteById(existingPool.id);
  }

  return packageModel.findById(id);
}

/**
 * Delete a package.
 * Prevents deletion if the package has active subscriptions.
 * @param {number} id - Package ID
 * @returns {Promise<void>}
 * @throws {Error} If package not found or has active subscriptions
 */
async function deletePackage(id) {
  const pkg = await packageModel.findById(id);

  if (!pkg) {
    throw Object.assign(new Error('Package not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // Check for active subscriptions
  const activeSubCount = await packageModel.countActiveSubscriptions(id);
  if (activeSubCount > 0) {
    throw Object.assign(
      new Error('Cannot delete package with active subscriptions.'),
      {
        statusCode: 409,
        code: ERROR_CODE.PACKAGE_HAS_ACTIVE_SUBS,
      }
    );
  }

  await packageModel.deleteById(id);

  // Remove from RADIUS
  await radgroupreplyModel.deleteByGroupname(`pkg-${id}`);
}

module.exports = {
  getAllPackages,
  getPackageById,
  createPackage,
  updatePackage,
  deletePackage,
  validateQoSParameters,
};
