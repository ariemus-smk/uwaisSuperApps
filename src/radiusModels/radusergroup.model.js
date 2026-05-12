/**
 * Radusergroup model for RADIUS DB.
 * Provides CRUD operations for the `radusergroup` table.
 * Stores user-to-group mapping (PPPoE username to package speed profile group).
 */

const { radiusPool } = require('../config/database');

/**
 * Find all group mappings for a username.
 * @param {string} username - PPPoE username
 * @returns {Promise<Array>} List of radusergroup records
 */
async function findByUsername(username) {
  const [rows] = await radiusPool.execute(
    'SELECT * FROM radusergroup WHERE username = ? ORDER BY priority ASC',
    [username]
  );
  return rows;
}

/**
 * Find a specific user-group mapping.
 * @param {string} username - PPPoE username
 * @param {string} groupname - Group name (package profile)
 * @returns {Promise<object|null>} Record or null
 */
async function findByUsernameAndGroup(username, groupname) {
  const [rows] = await radiusPool.execute(
    'SELECT * FROM radusergroup WHERE username = ? AND groupname = ? LIMIT 1',
    [username, groupname]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find all users in a group.
 * @param {string} groupname - Group name
 * @returns {Promise<Array>} List of radusergroup records
 */
async function findByGroupname(groupname) {
  const [rows] = await radiusPool.execute(
    'SELECT * FROM radusergroup WHERE groupname = ? ORDER BY priority ASC',
    [groupname]
  );
  return rows;
}

/**
 * Find a record by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Record or null
 */
async function findById(id) {
  const [rows] = await radiusPool.execute(
    'SELECT * FROM radusergroup WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * List all radusergroup records with optional filters.
 * @param {object} [filters={}]
 * @param {string} [filters.username] - Filter by username
 * @param {string} [filters.groupname] - Filter by groupname
 * @param {number} [filters.page=1]
 * @param {number} [filters.limit=50]
 * @returns {Promise<{records: Array, total: number}>}
 */
async function findAll(filters = {}) {
  const { username, groupname, page = 1, limit = 50 } = filters;

  let countQuery = 'SELECT COUNT(*) as total FROM radusergroup WHERE 1=1';
  let dataQuery = 'SELECT * FROM radusergroup WHERE 1=1';
  const params = [];

  if (username) {
    countQuery += ' AND username = ?';
    dataQuery += ' AND username = ?';
    params.push(username);
  }

  if (groupname) {
    countQuery += ' AND groupname = ?';
    dataQuery += ' AND groupname = ?';
    params.push(groupname);
  }

  const [countRows] = await radiusPool.execute(countQuery, params);
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  dataQuery += ' ORDER BY priority ASC, id ASC LIMIT ? OFFSET ?';
  const dataParams = [...params, String(limit), String(offset)];

  const [rows] = await radiusPool.execute(dataQuery, dataParams);

  return { records: rows, total };
}

/**
 * Create a new radusergroup entry.
 * @param {object} data
 * @param {string} data.username - PPPoE username
 * @param {string} data.groupname - Group name (package profile)
 * @param {number} [data.priority=1] - Priority (lower = higher priority)
 * @returns {Promise<object>} Created record with insertId
 */
async function create(data) {
  const { username, groupname, priority = 1 } = data;

  const [result] = await radiusPool.execute(
    'INSERT INTO radusergroup (username, groupname, priority) VALUES (?, ?, ?)',
    [username, groupname, priority]
  );

  return { id: result.insertId, username, groupname, priority };
}

/**
 * Update a radusergroup entry by ID.
 * @param {number} id
 * @param {object} data - Fields to update
 * @param {string} [data.username]
 * @param {string} [data.groupname]
 * @param {number} [data.priority]
 * @returns {Promise<object>} Query result
 */
async function update(id, data) {
  const allowedFields = ['username', 'groupname', 'priority'];
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
    `UPDATE radusergroup SET ${setClauses.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Delete a radusergroup entry by ID.
 * @param {number} id
 * @returns {Promise<object>} Query result
 */
async function deleteById(id) {
  const [result] = await radiusPool.execute(
    'DELETE FROM radusergroup WHERE id = ?',
    [id]
  );
  return result;
}

/**
 * Delete all group mappings for a username.
 * @param {string} username
 * @returns {Promise<object>} Query result
 */
async function deleteByUsername(username) {
  const [result] = await radiusPool.execute(
    'DELETE FROM radusergroup WHERE username = ?',
    [username]
  );
  return result;
}

module.exports = {
  findByUsername,
  findByUsernameAndGroup,
  findByGroupname,
  findById,
  findAll,
  create,
  update,
  deleteById,
  deleteByUsername,
};
