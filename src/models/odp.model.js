/**
 * ODP model for App DB.
 * Provides data access methods for the `odps` table.
 * Stores ODP (Optical Distribution Point) records with CRUD and port tracking.
 *
 * Requirements: 29.1
 */

const { appPool } = require('../config/database');

/**
 * Create a new ODP record.
 * @param {object} odpData
 * @param {string} odpData.name - ODP device name
 * @param {number} odpData.latitude - GPS latitude
 * @param {number} odpData.longitude - GPS longitude
 * @param {number} odpData.total_ports - Total port capacity
 * @param {number} [odpData.used_ports=0] - Currently used ports
 * @param {number} odpData.olt_id - Associated OLT ID
 * @param {number} odpData.olt_pon_port - OLT PON port number
 * @param {number} odpData.branch_id - Branch assignment
 * @param {string} [odpData.status='Active'] - Device status
 * @returns {Promise<object>} Created ODP record with insertId
 */
async function create(odpData) {
  const {
    name,
    latitude,
    longitude,
    total_ports,
    used_ports = 0,
    olt_id,
    olt_pon_port,
    branch_id,
    status = 'Active',
  } = odpData;

  const [result] = await appPool.execute(
    `INSERT INTO odps (name, latitude, longitude, total_ports, used_ports, olt_id, olt_pon_port, branch_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [name, latitude, longitude, total_ports, used_ports, olt_id, olt_pon_port, branch_id, status]
  );

  return {
    id: result.insertId,
    name,
    latitude,
    longitude,
    total_ports,
    used_ports,
    olt_id,
    olt_pon_port,
    branch_id,
    status,
  };
}

/**
 * Find an ODP by ID.
 * @param {number} id
 * @returns {Promise<object|null>} ODP record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    'SELECT * FROM odps WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length === 0 ? null : rows[0];
}

/**
 * List all ODPs with optional filters.
 * @param {object} [filters={}]
 * @param {number} [filters.branch_id] - Filter by branch
 * @param {number} [filters.olt_id] - Filter by OLT
 * @param {string} [filters.status] - Filter by status (Active/Inactive)
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @returns {Promise<{odps: Array, total: number}>} Paginated ODP list
 */
async function findAll(filters = {}) {
  const { branch_id, olt_id, status, page = 1, limit = 20 } = filters;

  let countQuery = 'SELECT COUNT(*) as total FROM odps WHERE 1=1';
  let dataQuery = 'SELECT * FROM odps WHERE 1=1';
  const params = [];

  if (branch_id) {
    countQuery += ' AND branch_id = ?';
    dataQuery += ' AND branch_id = ?';
    params.push(branch_id);
  }

  if (olt_id) {
    countQuery += ' AND olt_id = ?';
    dataQuery += ' AND olt_id = ?';
    params.push(olt_id);
  }

  if (status) {
    countQuery += ' AND status = ?';
    dataQuery += ' AND status = ?';
    params.push(status);
  }

  const [countRows] = await appPool.execute(countQuery, params);
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  dataQuery += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  const dataParams = [...params, String(limit), String(offset)];

  const [rows] = await appPool.execute(dataQuery, dataParams);

  return { odps: rows, total };
}

/**
 * Update an ODP record.
 * @param {number} id - ODP device ID
 * @param {object} data - Fields to update
 * @returns {Promise<object>} Query result
 */
async function update(id, data) {
  const allowedFields = ['name', 'latitude', 'longitude', 'total_ports', 'used_ports', 'olt_id', 'olt_pon_port', 'branch_id', 'status'];
  const setClauses = [];
  const params = [];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      params.push(data[field]);
    }
  }

  if (setClauses.length === 0) {
    return { affectedRows: 0 };
  }

  setClauses.push('updated_at = NOW()');
  params.push(id);

  const [result] = await appPool.execute(
    `UPDATE odps SET ${setClauses.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Find active ODPs within coverage area (all active ODPs with available ports).
 * Used by coverage check to find nearby ODPs.
 * Excludes full-capacity ODPs (used_ports >= total_ports).
 *
 * Requirements: 29.5
 *
 * @param {object} [filters={}]
 * @param {number} [filters.branch_id] - Optional branch filter
 * @returns {Promise<Array>} List of active ODPs with available ports
 */
async function findActiveWithAvailablePorts(filters = {}) {
  let query = 'SELECT * FROM odps WHERE status = ? AND used_ports < total_ports';
  const params = ['Active'];

  if (filters.branch_id) {
    query += ' AND branch_id = ?';
    params.push(filters.branch_id);
  }

  const [rows] = await appPool.execute(query, params);
  return rows;
}

/**
 * Find active ODPs near a GPS location (returns all active ODPs with coordinates).
 * Distance filtering is done in the service layer using Haversine formula.
 *
 * Requirements: 47.1
 *
 * @param {number} latitude - Center latitude
 * @param {number} longitude - Center longitude
 * @param {number} radiusMeters - Search radius in meters (used for documentation, filtering done in service)
 * @returns {Promise<Array>} List of active ODPs with GPS coordinates
 */
async function findNearby(latitude, longitude, radiusMeters) {
  const [rows] = await appPool.execute(
    'SELECT * FROM odps WHERE status = ? AND latitude IS NOT NULL AND longitude IS NOT NULL',
    ['Active']
  );
  return rows;
}

/**
 * Increment used_ports count for an ODP.
 * @param {number} id - ODP ID
 * @returns {Promise<object>} Query result
 */
async function incrementUsedPorts(id) {
  const [result] = await appPool.execute(
    'UPDATE odps SET used_ports = used_ports + 1, updated_at = NOW() WHERE id = ?',
    [id]
  );
  return result;
}

/**
 * Decrement used_ports count for an ODP.
 * @param {number} id - ODP ID
 * @returns {Promise<object>} Query result
 */
async function decrementUsedPorts(id) {
  const [result] = await appPool.execute(
    'UPDATE odps SET used_ports = GREATEST(used_ports - 1, 0), updated_at = NOW() WHERE id = ?',
    [id]
  );
  return result;
}

module.exports = {
  create,
  findById,
  findAll,
  update,
  findActiveWithAvailablePorts,
  findNearby,
  incrementUsedPorts,
  decrementUsedPorts,
};
