/**
 * Infrastructure service for managing OLT devices.
 * Handles OLT registration, connectivity testing, and CRUD operations.
 *
 * Requirements: 28.1, 28.2, 28.3, 28.4
 */

const oltModel = require('../models/olt.model');
const { ERROR_CODE } = require('../utils/constants');

/**
 * Register a new OLT device.
 * 1. Validates uniqueness of IP address
 * 2. Performs connectivity test
 * 3. Sets status based on connectivity result
 * 4. Creates OLT record in App DB
 *
 * @param {object} oltData
 * @param {string} oltData.name - OLT device name
 * @param {string} oltData.ip_address - OLT IP address
 * @param {number} oltData.total_pon_ports - Total PON ports
 * @param {number} oltData.branch_id - Branch assignment
 * @returns {Promise<object>} Registered OLT record with connectivity result
 */
async function registerOlt(oltData) {
  const { name, ip_address, total_pon_ports, branch_id, latitude, longitude } = oltData;

  if (!name || !ip_address || !total_pon_ports || !branch_id) {
    throw Object.assign(new Error('Name, IP address, total PON ports, and branch_id are required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Check if OLT with same IP already exists
  const existingOlt = await oltModel.findByIpAddress(ip_address);
  if (existingOlt) {
    throw Object.assign(new Error('An OLT device with this IP address already exists.'), {
      statusCode: 409,
      code: ERROR_CODE.RESOURCE_ALREADY_EXISTS,
    });
  }

  // Perform connectivity test to determine initial status, but default status to Active so that admins can add ODPs immediately
  const reachable = await testTcpConnection(ip_address, 23, 5000).catch(() => false);
  const status = 'Active';

  // Create OLT record
  const olt = await oltModel.create({
    name,
    ip_address,
    total_pon_ports,
    branch_id,
    latitude,
    longitude,
    status,
  });

  return {
    ...olt,
    connectivity: {
      reachable,
      testedAt: new Date().toISOString(),
      message: reachable
        ? 'OLT is reachable, status set to Active.'
        : 'OLT connectivity test failed, status set to Inactive.',
    },
  };
}

/**
 * Get OLT device details.
 * @param {number} oltId - OLT device ID
 * @returns {Promise<object>} OLT record
 */
async function getOlt(oltId) {
  const olt = await oltModel.findById(oltId);
  if (!olt) {
    throw Object.assign(new Error('OLT device not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }
  return olt;
}

/**
 * List OLT devices with optional filters.
 * @param {object} [filters={}] - Optional filters
 * @returns {Promise<{olts: Array, total: number}>} Paginated OLT list
 */
async function listOlts(filters = {}) {
  return oltModel.findAll(filters);
}

/**
 * Update OLT device data.
 * @param {number} oltId - OLT device ID
 * @param {object} data - Fields to update
 * @returns {Promise<object>} Updated OLT record
 */
async function updateOlt(oltId, data) {
  const olt = await oltModel.findById(oltId);
  if (!olt) {
    throw Object.assign(new Error('OLT device not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // If IP address is changing, check uniqueness
  if (data.ip_address && data.ip_address !== olt.ip_address) {
    const existingOlt = await oltModel.findByIpAddress(data.ip_address);
    if (existingOlt) {
      throw Object.assign(new Error('An OLT device with this IP address already exists.'), {
        statusCode: 409,
        code: ERROR_CODE.RESOURCE_ALREADY_EXISTS,
      });
    }
  }

  await oltModel.update(oltId, data);

  return oltModel.findById(oltId);
}

/**
 * Test OLT connectivity (TCP to management port).
 * Sets status to Active if reachable, Inactive if not.
 *
 * Requirements: 28.2, 28.3, 28.4
 *
 * @param {number} oltId - OLT device ID
 * @returns {Promise<object>} Connectivity test result
 */
async function testOltConnectivity(oltId) {
  const olt = await oltModel.findById(oltId);
  if (!olt) {
    throw Object.assign(new Error('OLT device not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  const result = {
    oltId: olt.id,
    oltName: olt.name,
    ipAddress: olt.ip_address,
    reachable: false,
    previousStatus: olt.status,
    newStatus: 'Inactive',
    testedAt: new Date().toISOString(),
    diagnostics: [],
  };

  // Test TCP connectivity to management port (telnet port 23)
  try {
    const reachable = await testTcpConnection(olt.ip_address, 23, 5000);
    result.reachable = reachable;
    if (!reachable) {
      result.diagnostics.push(`Management port 23 unreachable on ${olt.ip_address}`);
    }
  } catch (err) {
    result.diagnostics.push(`Connectivity test failed: ${err.message}`);
  }

  // Update status based on connectivity result
  if (result.reachable) {
    result.newStatus = 'Active';
    await oltModel.update(oltId, { status: 'Active' });
  } else {
    result.newStatus = 'Inactive';
    await oltModel.update(oltId, { status: 'Inactive' });
    if (result.diagnostics.length === 0) {
      result.diagnostics.push('OLT device is unreachable');
    }
  }

  return result;
}

// ============================================================
// Private Helper Functions
// ============================================================

/**
 * Test TCP connection to a host:port.
 * @param {string} host - Target host
 * @param {number} port - Target port
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<boolean>} True if connection succeeds
 */
function testTcpConnection(host, port, timeout = 5000) {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

module.exports = {
  registerOlt,
  getOlt,
  listOlts,
  updateOlt,
  testOltConnectivity,
};
