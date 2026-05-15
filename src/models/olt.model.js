/**
 * OLT model for App DB.
 * Provides data access methods for the `olts` table.
 * Stores OLT device records with CRUD and status tracking.
 *
 * Requirements: 28.1
 */

const { appPool } = require('../config/database');

/**
 * Create a new OLT record.
 * @param {object} oltData
 * @param {string} oltData.name - OLT device name
 * @param {string} oltData.ip_address - OLT IP address
 * @param {number} oltData.total_pon_ports - Total PON ports on the OLT
 * @param {number} oltData.branch_id - Branch assignment
 * @param {string} [oltData.status='Active'] - Device status
 * @returns {Promise<object>} Created OLT record with insertId
 */
async function create(oltData) {
  const {
    name,
    ip_address,
    total_pon_ports,
    branch_id,
    latitude = null,
    longitude = null,
    status = 'Active',
  } = oltData;

  const [result] = await appPool.execute(
    `INSERT INTO olts (name, ip_address, total_pon_ports, branch_id, latitude, longitude, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [name, ip_address, total_pon_ports, branch_id, latitude || null, longitude || null, status]
  );

  return { id: result.insertId, name, ip_address, total_pon_ports, branch_id, latitude, longitude, status };
}

/**
 * Find an OLT by ID.
 * @param {number} id
 * @returns {Promise<object|null>} OLT record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    'SELECT * FROM olts WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length === 0 ? null : rows[0];
}

/**
 * List all OLTs with optional filters.
 * @param {object} [filters={}]
 * @param {number} [filters.branch_id] - Filter by branch
 * @param {string} [filters.status] - Filter by status (Active/Inactive)
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @returns {Promise<{olts: Array, total: number}>} Paginated OLT list
 */
async function findAll(filters = {}) {
  const { branch_id, status, page = 1, limit = 20 } = filters;

  let countQuery = 'SELECT COUNT(*) as total FROM olts WHERE 1=1';
  let dataQuery = 'SELECT * FROM olts WHERE 1=1';
  const params = [];

  if (branch_id) {
    countQuery += ' AND branch_id = ?';
    dataQuery += ' AND branch_id = ?';
    params.push(branch_id);
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

  return { olts: rows, total };
}

/**
 * Update an OLT record.
 * @param {number} id - OLT device ID
 * @param {object} data - Fields to update
 * @returns {Promise<object>} Query result
 */
async function update(id, data) {
  const allowedFields = ['name', 'ip_address', 'total_pon_ports', 'branch_id', 'latitude', 'longitude', 'status'];
  const setClauses = [];
  const params = [];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      // Convert empty strings to null for coordinates
      if ((field === 'latitude' || field === 'longitude') && data[field] === '') {
        params.push(null);
      } else {
        params.push(data[field]);
      }
    }
  }

  if (setClauses.length === 0) {
    return { affectedRows: 0 };
  }

  setClauses.push('updated_at = NOW()');
  params.push(id);

  const [result] = await appPool.execute(
    `UPDATE olts SET ${setClauses.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Find OLT by IP address.
 * @param {string} ipAddress
 * @returns {Promise<object|null>} OLT record or null
 */
async function findByIpAddress(ipAddress) {
  const [rows] = await appPool.execute(
    'SELECT * FROM olts WHERE ip_address = ? LIMIT 1',
    [ipAddress]
  );
  return rows.length === 0 ? null : rows[0];
}

/**
 * Delete an OLT record.
 * @param {number} id - OLT ID
 * @returns {Promise<boolean>} True if deleted
 */
async function deleteById(id) {
  const [result] = await appPool.execute(
    'DELETE FROM olts WHERE id = ?',
    [id]
  );
  return result.affectedRows > 0;
}

module.exports = {
  create,
  findById,
  findAll,
  update,
  findByIpAddress,
  deleteById,
};
