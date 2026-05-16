/**
 * Region model for App DB.
 * Provides data access methods for the `regions` table.
 *
 * Requirements: CRUD operations with hierarchy mapping (Provinsi, Kabupaten, Kecamatan, Desa).
 */

const { appPool } = require('../config/database');

/**
 * Create a new region record.
 * @param {object} regionData
 * @param {string} regionData.region_name - Name of region
 * @param {string} regionData.region_type - 'Provinsi', 'Kabupaten', 'Kecamatan', 'Desa'
 * @param {number|null} [regionData.region_ref=null] - ID of parent region
 * @returns {Promise<object>} Created region with insertId
 */
async function create(regionData) {
  const {
    region_name,
    region_type,
    region_ref = null,
  } = regionData;

  const [result] = await appPool.execute(
    `INSERT INTO regions (region_name, region_type, region_ref, created_at, updated_at)
     VALUES (?, ?, ?, NOW(), NOW())`,
    [region_name, region_type, region_ref]
  );

  return { id: result.insertId, region_name, region_type, region_ref };
}

/**
 * Find a region by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Region record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    'SELECT * FROM regions WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length === 0 ? null : rows[0];
}

/**
 * List all regions with filters.
 * @param {object} [filters={}]
 * @param {string} [filters.region_type] - 'Provinsi', 'Kabupaten', 'Kecamatan', 'Desa'
 * @param {number} [filters.region_ref] - Parent region ID
 * @param {number} [filters.page=1]
 * @param {number} [filters.limit=100]
 * @returns {Promise<{regions: Array, total: number}>} Paginated regions
 */
async function findAll(filters = {}) {
  const { region_type, region_ref, page = 1, limit = 100 } = filters;

  let countQuery = 'SELECT COUNT(*) as total FROM regions WHERE 1=1';
  let dataQuery = 'SELECT r.*, p.region_name as parent_name FROM regions r LEFT JOIN regions p ON r.region_ref = p.id WHERE 1=1';
  const params = [];

  if (region_type) {
    countQuery += ' AND r.region_type = ?';
    dataQuery += ' AND r.region_type = ?';
    params.push(region_type);
  }

  if (region_ref !== undefined) {
    countQuery += ' AND r.region_ref = ?';
    dataQuery += ' AND r.region_ref = ?';
    params.push(region_ref);
  }

  // Adjust count query alias if joins are needed or just do plain select
  const countParams = [...params];
  const [countRows] = await appPool.execute(countQuery.replace('r.', ''), countParams);
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  dataQuery += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
  const dataParams = [...params, String(limit), String(offset)];

  const [rows] = await appPool.execute(dataQuery, dataParams);

  return { regions: rows, total };
}

/**
 * Update a region record.
 * @param {number} id
 * @param {object} data - Fields to update
 * @returns {Promise<object>} Query result
 */
async function update(id, data) {
  const allowedFields = ['region_name', 'region_type', 'region_ref'];
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
    `UPDATE regions SET ${setClauses.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Delete a region by ID.
 * @param {number} id
 * @returns {Promise<boolean>} True if deleted
 */
async function deleteById(id) {
  const [result] = await appPool.execute(
    'DELETE FROM regions WHERE id = ?',
    [id]
  );
  return result.affectedRows > 0;
}

/**
 * Find a region by name and type.
 * @param {string} name
 * @param {string} type
 * @returns {Promise<object|null>} Region record or null
 */
async function findByNameAndType(name, type) {
  const [rows] = await appPool.execute(
    'SELECT * FROM regions WHERE region_name = ? AND region_type = ? LIMIT 1',
    [name, type]
  );
  return rows.length === 0 ? null : rows[0];
}

/**
 * Find all regions without pagination limit.
 * @returns {Promise<Array>} List of all regions
 */
async function findAllNoLimit() {
  const [rows] = await appPool.execute(
    'SELECT r.*, p.region_name as parent_name FROM regions r LEFT JOIN regions p ON r.region_ref = p.id'
  );
  return rows;
}

module.exports = {
  create,
  findById,
  findByNameAndType,
  findAll,
  findAllNoLimit,
  update,
  deleteById,
};
