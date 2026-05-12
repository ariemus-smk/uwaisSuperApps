/**
 * Coverage service for checking network availability at GPS coordinates.
 * Uses Haversine distance calculation to find nearby active ODPs with available ports.
 * Also provides ODP CRUD operations.
 *
 * Requirements: 47.1, 47.2, 47.3, 47.4, 29.1, 29.2, 29.3, 29.4, 29.5
 */

const odpModel = require('../models/odp.model');
const oltModel = require('../models/olt.model');
const { calculateDistance } = require('../utils/gpsDistance');
const { ERROR_CODE } = require('../utils/constants');

/**
 * Default coverage radius in meters (from env or fallback).
 */
const DEFAULT_COVERAGE_RADIUS = Number(process.env.COVERAGE_RADIUS_METERS) || 500;

/**
 * Check network coverage at given GPS coordinates.
 * Returns active ODPs with available ports within the specified radius,
 * sorted by distance (nearest first).
 *
 * Requirements: 47.1, 47.2, 47.3
 *
 * @param {number} latitude - Customer location latitude
 * @param {number} longitude - Customer location longitude
 * @param {number} [radiusMeters] - Search radius in meters (defaults to COVERAGE_RADIUS_METERS env)
 * @param {object} [options={}] - Additional options
 * @param {number} [options.branch_id] - Optional branch filter
 * @returns {Promise<object>} Coverage check result
 */
async function checkCoverage(latitude, longitude, radiusMeters, options = {}) {
  const radius = radiusMeters || DEFAULT_COVERAGE_RADIUS;

  // Get all active ODPs with available ports
  const activeOdps = await odpModel.findActiveWithAvailablePorts({
    branch_id: options.branch_id,
  });

  // Calculate distance for each ODP and filter by radius
  const nearbyOdps = [];
  for (const odp of activeOdps) {
    const distance = calculateDistance(latitude, longitude, odp.latitude, odp.longitude);
    if (distance <= radius) {
      nearbyOdps.push({
        id: odp.id,
        name: odp.name,
        latitude: odp.latitude,
        longitude: odp.longitude,
        total_ports: odp.total_ports,
        used_ports: odp.used_ports,
        available_ports: odp.total_ports - odp.used_ports,
        olt_id: odp.olt_id,
        olt_pon_port: odp.olt_pon_port,
        branch_id: odp.branch_id,
        distance_meters: Math.round(distance),
      });
    }
  }

  // Sort by distance (nearest first)
  nearbyOdps.sort((a, b) => a.distance_meters - b.distance_meters);

  const covered = nearbyOdps.length > 0;

  return {
    covered,
    latitude,
    longitude,
    radius_meters: radius,
    odps: nearbyOdps,
    message: covered
      ? `${nearbyOdps.length} ODP(s) found within ${radius}m radius.`
      : `No active ODP with available ports found within ${radius}m radius.`,
  };
}

/**
 * Get ODP details by ID.
 *
 * Requirements: 29.1
 *
 * @param {number} odpId - ODP ID
 * @returns {Promise<object>} ODP record
 */
async function getOdp(odpId) {
  const odp = await odpModel.findById(odpId);
  if (!odp) {
    throw Object.assign(new Error('ODP not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }
  return odp;
}

/**
 * List ODPs with optional filters.
 *
 * Requirements: 29.1
 *
 * @param {object} [filters={}] - Optional filters (branch_id, olt_id, status, page, limit)
 * @returns {Promise<{odps: Array, total: number}>} Paginated ODP list
 */
async function listOdps(filters = {}) {
  return odpModel.findAll(filters);
}

/**
 * Create a new ODP.
 * Validates that the mapped OLT PON port exists and belongs to an active OLT.
 *
 * Requirements: 29.1, 29.2
 *
 * @param {object} odpData - ODP data
 * @returns {Promise<object>} Created ODP record
 */
async function createOdp(odpData) {
  const { name, latitude, longitude, total_ports, olt_id, olt_pon_port, branch_id } = odpData;

  if (!name || !total_ports || !branch_id) {
    throw Object.assign(new Error('Name, total_ports, and branch_id are required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Validate OLT mapping if provided (Requirement 29.2)
  if (olt_id) {
    const olt = await oltModel.findById(olt_id);
    if (!olt) {
      throw Object.assign(new Error('The specified OLT does not exist.'), {
        statusCode: 404,
        code: ERROR_CODE.RESOURCE_NOT_FOUND,
      });
    }
    if (olt.status !== 'Active') {
      throw Object.assign(new Error('The specified OLT is not active.'), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }
    if (olt_pon_port && olt_pon_port > olt.total_pon_ports) {
      throw Object.assign(new Error(`OLT PON port ${olt_pon_port} exceeds the OLT total PON ports (${olt.total_pon_ports}).`), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }
  }

  const odp = await odpModel.create({
    name,
    latitude: latitude || null,
    longitude: longitude || null,
    total_ports,
    used_ports: 0,
    olt_id: olt_id || null,
    olt_pon_port: olt_pon_port || null,
    branch_id,
    status: odpData.status || 'Active',
  });

  return odp;
}

/**
 * Update an existing ODP.
 *
 * Requirements: 29.1, 29.2
 *
 * @param {number} odpId - ODP ID
 * @param {object} data - Fields to update
 * @returns {Promise<object>} Updated ODP record
 */
async function updateOdp(odpId, data) {
  const odp = await odpModel.findById(odpId);
  if (!odp) {
    throw Object.assign(new Error('ODP not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // Validate OLT mapping if changing (Requirement 29.2)
  if (data.olt_id !== undefined && data.olt_id !== odp.olt_id) {
    if (data.olt_id !== null) {
      const olt = await oltModel.findById(data.olt_id);
      if (!olt) {
        throw Object.assign(new Error('The specified OLT does not exist.'), {
          statusCode: 404,
          code: ERROR_CODE.RESOURCE_NOT_FOUND,
        });
      }
      if (olt.status !== 'Active') {
        throw Object.assign(new Error('The specified OLT is not active.'), {
          statusCode: 400,
          code: ERROR_CODE.VALIDATION_ERROR,
        });
      }
      const ponPort = data.olt_pon_port || odp.olt_pon_port;
      if (ponPort && ponPort > olt.total_pon_ports) {
        throw Object.assign(new Error(`OLT PON port ${ponPort} exceeds the OLT total PON ports (${olt.total_pon_ports}).`), {
          statusCode: 400,
          code: ERROR_CODE.VALIDATION_ERROR,
        });
      }
    }
  }

  await odpModel.update(odpId, data);

  return odpModel.findById(odpId);
}

module.exports = {
  checkCoverage,
  getOdp,
  listOdps,
  createOdp,
  updateOdp,
  DEFAULT_COVERAGE_RADIUS,
};
