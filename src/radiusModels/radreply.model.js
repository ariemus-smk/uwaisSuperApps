/**
 * Radreply model for RADIUS DB.
 * Provides CRUD operations for the `radreply` table.
 * Stores per-user reply attributes (speed limits, isolir redirect, etc.).
 */

const { radiusPool } = require('../config/database');

/**
 * Find all reply attributes for a username.
 * @param {string} username - PPPoE username
 * @returns {Promise<Array>} List of radreply records
 */
async function findByUsername(username) {
  const [rows] = await radiusPool.execute(
    'SELECT * FROM radreply WHERE username = ?',
    [username]
  );
  return rows;
}

/**
 * Find a specific attribute for a username.
 * @param {string} username - PPPoE username
 * @param {string} attribute - Attribute name (e.g., 'Mikrotik-Rate-Limit')
 * @returns {Promise<object|null>} Record or null
 */
async function findByUsernameAndAttribute(username, attribute) {
  const [rows] = await radiusPool.execute(
    'SELECT * FROM radreply WHERE username = ? AND attribute = ? LIMIT 1',
    [username, attribute]
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
    'SELECT * FROM radreply WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * List all radreply records with optional filters.
 * @param {object} [filters={}]
 * @param {string} [filters.username] - Filter by username
 * @param {string} [filters.attribute] - Filter by attribute
 * @param {number} [filters.page=1]
 * @param {number} [filters.limit=50]
 * @returns {Promise<{records: Array, total: number}>}
 */
async function findAll(filters = {}) {
  const { username, attribute, page = 1, limit = 50 } = filters;

  let countQuery = 'SELECT COUNT(*) as total FROM radreply WHERE 1=1';
  let dataQuery = 'SELECT * FROM radreply WHERE 1=1';
  const params = [];

  if (username) {
    countQuery += ' AND username = ?';
    dataQuery += ' AND username = ?';
    params.push(username);
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
 * Create a new radreply entry.
 * @param {object} data
 * @param {string} data.username - PPPoE username
 * @param {string} data.attribute - Attribute name (e.g., 'Mikrotik-Rate-Limit')
 * @param {string} [data.op='='] - Operator
 * @param {string} data.value - Attribute value
 * @returns {Promise<object>} Created record with insertId
 */
async function create(data) {
  const { username, attribute, op = '=', value } = data;

  const [result] = await radiusPool.execute(
    'INSERT INTO radreply (username, attribute, op, value) VALUES (?, ?, ?, ?)',
    [username, attribute, op, value]
  );

  return { id: result.insertId, username, attribute, op, value };
}

/**
 * Update a radreply entry by ID.
 * @param {number} id
 * @param {object} data - Fields to update
 * @param {string} [data.username]
 * @param {string} [data.attribute]
 * @param {string} [data.op]
 * @param {string} [data.value]
 * @returns {Promise<object>} Query result
 */
async function update(id, data) {
  const allowedFields = ['username', 'attribute', 'op', 'value'];
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
    `UPDATE radreply SET ${setClauses.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Delete a radreply entry by ID.
 * @param {number} id
 * @returns {Promise<object>} Query result
 */
async function deleteById(id) {
  const [result] = await radiusPool.execute(
    'DELETE FROM radreply WHERE id = ?',
    [id]
  );
  return result;
}

/**
 * Delete all radreply entries for a username.
 * @param {string} username
 * @returns {Promise<object>} Query result
 */
async function deleteByUsername(username) {
  const [result] = await radiusPool.execute(
    'DELETE FROM radreply WHERE username = ?',
    [username]
  );
  return result;
}

/**
 * Delete a specific attribute for a username.
 * @param {string} username
 * @param {string} attribute - Attribute name to delete
 * @returns {Promise<object>} Query result
 */
async function deleteByUsernameAndAttribute(username, attribute) {
  const [result] = await radiusPool.execute(
    'DELETE FROM radreply WHERE username = ? AND attribute = ?',
    [username, attribute]
  );
  return result;
}

module.exports = {
  findByUsername,
  findByUsernameAndAttribute,
  findById,
  findAll,
  create,
  update,
  deleteById,
  deleteByUsername,
  deleteByUsernameAndAttribute,
};
