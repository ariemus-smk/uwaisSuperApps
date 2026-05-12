/**
 * Branch service.
 * Handles business logic for branch management including
 * CRUD operations and deactivation rules.
 */

const branchModel = require('../models/branch.model');
const { BRANCH_STATUS, ERROR_CODE } = require('../utils/constants');

/**
 * Get all branches with optional status filter.
 * @param {object} [filters={}] - Optional filters (status)
 * @returns {Promise<Array>} List of branches
 */
async function getAllBranches(filters = {}) {
  return branchModel.findAll(filters);
}

/**
 * Get a single branch by ID.
 * @param {number} id - Branch ID
 * @returns {Promise<object>} Branch record
 * @throws {Error} If branch not found
 */
async function getBranchById(id) {
  const branch = await branchModel.findById(id);

  if (!branch) {
    throw Object.assign(new Error('Branch not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  return branch;
}

/**
 * Create a new branch.
 * Validates that branch name is unique.
 * @param {object} data - Branch data
 * @param {string} data.name
 * @param {string} data.address
 * @param {string} data.contact_phone
 * @param {string} data.contact_email
 * @returns {Promise<object>} Created branch
 * @throws {Error} If branch name already exists
 */
async function createBranch(data) {
  // Check for duplicate name
  const existing = await branchModel.findByName(data.name);
  if (existing) {
    throw Object.assign(new Error('Branch with this name already exists.'), {
      statusCode: 409,
      code: ERROR_CODE.RESOURCE_ALREADY_EXISTS,
    });
  }

  const branch = await branchModel.create({
    name: data.name,
    address: data.address,
    contact_phone: data.contact_phone,
    contact_email: data.contact_email,
  });

  return branch;
}

/**
 * Update an existing branch.
 * Validates that the branch exists and name uniqueness if name is changed.
 * @param {number} id - Branch ID
 * @param {object} data - Fields to update
 * @returns {Promise<object>} Updated branch
 * @throws {Error} If branch not found or name conflict
 */
async function updateBranch(id, data) {
  const branch = await branchModel.findById(id);

  if (!branch) {
    throw Object.assign(new Error('Branch not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // Check name uniqueness if name is being changed
  if (data.name && data.name !== branch.name) {
    const existing = await branchModel.findByName(data.name);
    if (existing) {
      throw Object.assign(new Error('Branch with this name already exists.'), {
        statusCode: 409,
        code: ERROR_CODE.RESOURCE_ALREADY_EXISTS,
      });
    }
  }

  await branchModel.update(id, data);

  return branchModel.findById(id);
}

/**
 * Update branch status (activate/deactivate).
 * When deactivating, the branch will prevent new customer registrations
 * and asset movements (enforced at service layer in respective modules).
 * @param {number} id - Branch ID
 * @param {string} status - New status ('Active' or 'Inactive')
 * @returns {Promise<object>} Updated branch
 * @throws {Error} If branch not found or invalid status
 */
async function updateBranchStatus(id, status) {
  const branch = await branchModel.findById(id);

  if (!branch) {
    throw Object.assign(new Error('Branch not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (!Object.values(BRANCH_STATUS).includes(status)) {
    throw Object.assign(new Error('Invalid status. Must be Active or Inactive.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  if (branch.status === status) {
    throw Object.assign(new Error(`Branch is already ${status}.`), {
      statusCode: 400,
      code: ERROR_CODE.RESOURCE_CONFLICT,
    });
  }

  await branchModel.updateStatus(id, status);

  return branchModel.findById(id);
}

/**
 * Check if a branch is active. Used by other services to enforce
 * the rule that inactive branches cannot accept new registrations.
 * @param {number} branchId - Branch ID
 * @returns {Promise<boolean>} True if branch is active
 */
async function isBranchActive(branchId) {
  const branch = await branchModel.findById(branchId);

  if (!branch) {
    return false;
  }

  return branch.status === BRANCH_STATUS.ACTIVE;
}

module.exports = {
  getAllBranches,
  getBranchById,
  createBranch,
  updateBranch,
  updateBranchStatus,
  isBranchActive,
};
