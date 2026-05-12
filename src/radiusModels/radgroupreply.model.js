/**
 * Radgroupreply model for RADIUS DB.
 * Provides CRUD operations for the `radgroupreply` table.
 * Stores per-group reply attributes (package speed profiles).
 */

const { radiusPool } = require('../config/database');

/**
 * Find all reply attributes for a group.
 * @param {string} groupname - Group name (package profile)
 * @returns {Promise<Array>} List of radgroupreply records
 */
async function findByGroupname(groupname) {
  const [rows] = await radiusPool.execute(
    'SELECT * FROM radgroupreply WHERE groupname = ?',
    [groupname]
  );
  return rows;
}

/**
 * Find a specific attribute for a group.
 * @param {string} groupname - Group name
 * @param {string} attribute - Attribute name (e.g., 'Mikrotik-Rate-Limit')
 * @returns {Promise<object|null>} Record or null
 */
async function findByGroupnameAndAttribute(groupname, attribute) {
  const [rows] = await radiusPool.execute(
    'SELECT * FROM radgroupreply WHERE groupname = ? AND attribute = ? LIMIT 1',
    [groupname, attribute]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find a record by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Record or null
 */
async function findById(id) {
  const [rows] = await radiusPool.execute(
    'SELECT * FROM radgroupreply WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * List all radgroupreply records with optional filters.
 * @param {object} [filters={}]
 * @param {string} [filters.groupname] - Filter by groupname
 * @param {string} [filters.attribute] - Filter by attribute
 * @param {number} [filters.page=1]
 * @param {number} [filters.limit=50]
 * @returns {Promise<{records: Array, total: number}>}
 */
async function findAll(filters = {}) {
  const { groupname, attribute, page = 1, limit = 50 } = filters;

  let countQuery = 'SELECT COUNT(*) as total FROM radgroupreply WHERE 1=1';
  let dataQuery = 'SELECT * FROM radgroupreply WHERE 1=1';
  const params = [];

  if (groupname) {
    countQuery += ' AND groupname = ?';
    dataQuery += ' AND groupname = ?';
    params.push(groupname);
  }

  if (attribute) {
    countQuery += ' AND attribute = ?';
    dataQuery += ' AND attribute = ?';
    params.push(attribute);
  }

  const [countRows] = await radiusPool.execute(countQuery, params);
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  dataQuery += ' ORDER BY id ASC LIMIT ? OFFSET ?';
  const dataParams = [...params, String(limit), String(offset)];

  const [rows] = await radiusPool.execute(dataQuery, dataParams);

  return { records: rows, total };
}

/**
 * Create a new radgroupreply entry.
 * @param {object} data
 * @param {string} data.groupname - Group name
 * @param {string} data.attribute - Attribute name (e.g., 'Mikrotik-Rate-Limit')
 * @param {string} [data.op='='] - Operator
 * @param {string} data.value - Attribute value (e.g., '10M/20M')
 * @returns {Promise<object>} Created record with insertId
 */
async function create(data) {
  const { groupname, attribute, op = '=', value } = data;

  const [result] = await radiusPool.execute(
    'INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (?, ?, ?, ?)',
    [groupname, attribute, op, value]
  );

  return { id: result.insertId, groupname, attribute, op, value };
}

/**
 * Update a radgroupreply entry by ID.
 * @param {number} id
 * @param {object} data - Fields to update
 * @param {string} [data.groupname]
 * @param {string} [data.attribute]
 * @param {string} [data.op]
 * @param {string} [data.value]
 * @returns {Promise<object>} Query result
 */
async function update(id, data) {
  const allowedFields = ['groupname', 'attribute', 'op', 'value'];
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

  params.push(id);

  const [result] = await radiusPool.execute(
    `UPDATE radgroupreply SET ${setClauses.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Delete a radgroupreply entry by ID.
 * @param {number} id
 * @returns {Promise<object>} Query result
 */
async function deleteById(id) {
  const [result] = await radiusPool.execute(
    'DELETE FROM radgroupreply WHERE id = ?',
    [id]
  );
  return result;
}

/**
 * Delete all reply attributes for a group.
 * @param {string} groupname
 * @returns {Promise<object>} Query result
 */
async function deleteByGroupname(groupname) {
  const [result] = await radiusPool.execute(
    'DELETE FROM radgroupreply WHERE groupname = ?',
    [groupname]
  );
  return result;
}

module.exports = {
  findByGroupname,
  findByGroupnameAndAttribute,
  findById,
  findAll,
  create,
  update,
  deleteById,
  deleteByGroupname,
};
