/**
 * RADIUS service for provisioning.
 * Handles writing PPPoE accounts, user-group mappings, and profile attributes
 * to the RADIUS database for FreeRADIUS authentication and authorization.
 *
 * Requirements: 3.2, 7.2, 8.4, 13.1, 41.2
 */

const radcheckModel = require('../radiusModels/radcheck.model');
const raduserGroupModel = require('../radiusModels/radusergroup.model');
const radreplyModel = require('../radiusModels/radreply.model');
const { ERROR_CODE } = require('../utils/constants');

/**
 * Create a PPPoE account in the RADIUS database.
 * Writes the Cleartext-Password attribute to radcheck.
 * @param {string} username - PPPoE username
 * @param {string} password - PPPoE password
 * @returns {Promise<object>} Created radcheck record
 * @throws {Error} If username/password missing or account already exists
 */
async function createPPPoEAccount(username, password) {
  if (!username) {
    throw Object.assign(new Error('Username is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  if (!password) {
    throw Object.assign(new Error('Password is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Check if account already exists
  const existing = await radcheckModel.findByUsernameAndAttribute(username, 'Cleartext-Password');
  if (existing) {
    throw Object.assign(new Error('PPPoE account already exists for this username.'), {
      statusCode: 409,
      code: ERROR_CODE.RESOURCE_ALREADY_EXISTS,
    });
  }

  const record = await radcheckModel.create({
    username,
    attribute: 'Cleartext-Password',
    op: ':=',
    value: password,
  });
  return record;
}

/**
 * Assign a user to a package group in RADIUS.
 * Removes existing group mappings and creates a new one.
 * @param {string} username - PPPoE username
 * @param {string} groupname - Package group name
 * @param {number} [priority=1] - Group priority
 * @returns {Promise<object>} Created radusergroup record
 * @throws {Error} If username or groupname missing
 */
async function updateUserGroup(username, groupname, priority = 1) {
  if (!username) {
    throw Object.assign(new Error('Username is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  if (!groupname) {
    throw Object.assign(new Error('Group name is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Remove existing group mappings for this user
  await raduserGroupModel.deleteByUsername(username);

  // Create new group mapping
  const record = await raduserGroupModel.create({
    username,
    groupname,
    priority,
  });
  return record;
}

/**
 * Set isolir profile for a user.
 * Creates/updates a low rate limit in radreply and adds user to isolir group.
 * @param {string} username - PPPoE username
 * @returns {Promise<{replyRecord: object, groupRecord: object}>} Created/updated records
 * @throws {Error} If username missing
 */
async function setIsolirProfile(username) {
  if (!username) {
    throw Object.assign(new Error('Username is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const isolirRateLimit = '256k/256k';
  let replyRecord;

  // Check if rate limit attribute already exists
  const existingReply = await radreplyModel.findByUsernameAndAttribute(username, 'Mikrotik-Rate-Limit');
  if (existingReply) {
    // Update existing
    await radreplyModel.update(existingReply.id, { value: isolirRateLimit });
    replyRecord = { ...existingReply, value: isolirRateLimit };
  } else {
    // Create new
    replyRecord = await radreplyModel.create({
      username,
      attribute: 'Mikrotik-Rate-Limit',
      op: '=',
      value: isolirRateLimit,
    });
  }

  // Check if address list attribute exists
  const existingAddressList = await radreplyModel.findByUsernameAndAttribute(username, 'Mikrotik-Address-List');
  if (existingAddressList) {
    await radreplyModel.update(existingAddressList.id, { value: 'ISOLIR' });
  } else {
    await radreplyModel.create({
      username,
      attribute: 'Mikrotik-Address-List',
      op: '=',
      value: 'ISOLIR',
    });
  }

  // Add to isolir group if not already
  let groupRecord;
  const existingGroup = await raduserGroupModel.findByUsernameAndGroup(username, 'isolir');
  if (existingGroup) {
    groupRecord = existingGroup;
  } else {
    groupRecord = await raduserGroupModel.create({
      username,
      groupname: 'isolir',
      priority: 0,
    });
  }

  return { replyRecord, groupRecord };
}

/**
 * Set FUP (Fair Usage Policy) profile for a user.
 * Reduces speed when FUP threshold is exceeded.
 * @param {string} username - PPPoE username
 * @param {number} uploadSpeed - Reduced upload speed in kbps
 * @param {number} downloadSpeed - Reduced download speed in kbps
 * @returns {Promise<object>} Created/updated radreply record
 * @throws {Error} If username missing or speeds invalid
 */
async function setFUPProfile(username, uploadSpeed, downloadSpeed) {
  if (!username) {
    throw Object.assign(new Error('Username is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  if (!uploadSpeed || uploadSpeed <= 0) {
    throw Object.assign(new Error('Upload speed must be a positive number.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  if (!downloadSpeed || downloadSpeed <= 0) {
    throw Object.assign(new Error('Download speed must be a positive number.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const rateLimit = `${uploadSpeed}k/${downloadSpeed}k`;

  // Check if rate limit attribute already exists
  const existingReply = await radreplyModel.findByUsernameAndAttribute(username, 'Mikrotik-Rate-Limit');
  if (existingReply) {
    // Update existing
    await radreplyModel.update(existingReply.id, { value: rateLimit });
    return { ...existingReply, value: rateLimit };
  }

  // Create new
  const record = await radreplyModel.create({
    username,
    attribute: 'Mikrotik-Rate-Limit',
    op: '=',
    value: rateLimit,
  });
  return record;
}

/**
 * Remove isolir profile for a user (restore normal service).
 * Removes the rate limit attribute and isolir group assignment.
 * @param {string} username - PPPoE username
 * @returns {Promise<{replyRemoved: boolean, groupRemoved: boolean}>}
 * @throws {Error} If username missing
 */
async function removeIsolirProfile(username) {
  if (!username) {
    throw Object.assign(new Error('Username is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  let replyRemoved = false;
  let groupRemoved = false;

  // Remove rate limit attribute
  const existingReply = await radreplyModel.findByUsernameAndAttribute(username, 'Mikrotik-Rate-Limit');
  if (existingReply) {
    await radreplyModel.deleteById(existingReply.id);
    replyRemoved = true;
  }

  // Remove address list attribute
  const existingAddressList = await radreplyModel.findByUsernameAndAttribute(username, 'Mikrotik-Address-List');
  if (existingAddressList && existingAddressList.value === 'ISOLIR') {
    await radreplyModel.deleteById(existingAddressList.id);
  }

  // Remove from isolir group
  const existingGroup = await raduserGroupModel.findByUsernameAndGroup(username, 'isolir');
  if (existingGroup) {
    await raduserGroupModel.deleteById(existingGroup.id);
    groupRemoved = true;
  }

  return { replyRemoved, groupRemoved };
}

/**
 * Reset FUP profile for a user (restore normal speed).
 * Removes the Mikrotik-Rate-Limit attribute from radreply.
 * @param {string} username - PPPoE username
 * @returns {Promise<{removed: boolean}>}
 * @throws {Error} If username missing
 */
async function resetFUPProfile(username) {
  if (!username) {
    throw Object.assign(new Error('Username is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const existingReply = await radreplyModel.findByUsernameAndAttribute(username, 'Mikrotik-Rate-Limit');
  if (existingReply) {
    await radreplyModel.deleteById(existingReply.id);
    return { removed: true };
  }

  return { removed: false };
}

/**
 * Delete all RADIUS records for a PPPoE account (full cleanup).
 * Removes radcheck, radreply, and radusergroup entries.
 * @param {string} username - PPPoE username
 * @returns {Promise<{radcheckDeleted: number, radreplyDeleted: number, radusergroupDeleted: number}>}
 * @throws {Error} If username missing
 */
async function deletePPPoEAccount(username) {
  if (!username) {
    throw Object.assign(new Error('Username is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const radcheckResult = await radcheckModel.deleteByUsername(username);
  const radreplyResult = await radreplyModel.deleteByUsername(username);
  const radusergroupResult = await raduserGroupModel.deleteByUsername(username);

  return {
    radcheckDeleted: radcheckResult.affectedRows,
    radreplyDeleted: radreplyResult.affectedRows,
    radusergroupDeleted: radusergroupResult.affectedRows,
  };
}

/**
 * Remove a user from all RADIUS tables (radcheck, radusergroup, radreply).
 * @param {string} username - PPPoE username
 * @returns {Promise<boolean>} True if successful
 */
async function removeUser(username) {
  if (!username) return false;

  await Promise.all([
    radcheckModel.deleteByUsername(username),
    raduserGroupModel.deleteByUsername(username),
    radreplyModel.deleteByUsername(username),
  ]);

  return true;
}

module.exports = {
  createPPPoEAccount,
  updateUserGroup,
  setIsolirProfile,
  setFUPProfile,
  removeIsolirProfile,
  resetFUPProfile,
  deletePPPoEAccount,
  removeUser,
};
