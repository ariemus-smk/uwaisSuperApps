/**
 * NAS model for RADIUS DB.
 * Provides CRUD operations for the `nas` table.
 * Stores NAS device registry used by FreeRADIUS to identify NAS clients.
 * Note: This is the FreeRADIUS NAS table, separate from the App DB nas_devices table.
 */

const { radiusPool } = require('../config/database');

/**
 * Find a NAS by its nasname (IP address or hostname).
 * @param {string} nasname - NAS IP address or hostname
 * @returns {Promise<object|null>} NAS record or null
 */
async function findByNasname(nasname) {
  const [rows] = await radiusPool.execute(
    'SELECT * FROM nas WHERE nasname = ? LIMIT 1',
    [nasname]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find a NAS by shortname.
 * @param {string} shortname - NAS short name
 * @returns {Promise<object|null>} NAS record or null
 */
async function findByShortname(shortname) {
  const [rows] = await radiusPool.execute(
    'SELECT * FROM nas WHERE shortname = ? LIMIT 1',
    [shortname]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find a NAS by ID.
 * @param {number} id
 * @returns {Promise<object|null>} NAS record or null
 */
async function findById(id) {
  const [rows] = await radiusPool.execute(
    'SELECT * FROM nas WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * List all NAS records with optional filters.
 * @param {object} [filters={}]
 * @param {string} [filters.type] - Filter by NAS type
 * @param {string} [filters.server] - Filter by server
 * @param {number} [filters.page=1]
 * @param {number} [filters.limit=50]
 * @returns {Promise<{records: Array, total: number}>}
 */
async function findAll(filters = {}) {
  const { type, server, page = 1, limit = 50 } = filters;

  let countQuery = 'SELECT COUNT(*) as total FROM nas WHERE 1=1';
  let dataQuery = 'SELECT * FROM nas WHERE 1=1';
  const params = [];

  if (type) {
    countQuery += ' AND type = ?';
    dataQuery += ' AND type = ?';
    params.push(type);
  }

  if (server) {
    countQuery += ' AND server = ?';
    dataQuery += ' AND server = ?';
    params.push(server);
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
 * Create a new NAS entry.
 * @param {object} data
 * @param {string} data.nasname - NAS IP address or hostname
 * @param {string} [data.shortname] - Short name for display
 * @param {string} [data.type='other'] - NAS type (e.g., 'mikrotik', 'other')
 * @param {number} [data.ports] - Number of ports
 * @param {string} data.secret - RADIUS shared secret
 * @param {string} [data.server] - Virtual server name
 * @param {string} [data.community] - SNMP community string
 * @param {string} [data.description='RADIUS Client'] - Description
 * @returns {Promise<object>} Created record with insertId
 */
async function create(data) {
  const {
    nasname,
    shortname = null,
    type = 'other',
    ports = null,
    secret,
    server = null,
    community = null,
    description = 'RADIUS Client',
  } = data;

  const [result] = await radiusPool.execute(
    'INSERT INTO nas (nasname, shortname, type, ports, secret, server, community, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [nasname, shortname, type, ports, secret, server, community, description]
  );

  return { id: result.insertId, nasname, shortname, type, ports, secret, server, community, description };
}

/**
 * Update a NAS entry by ID.
 * @param {number} id
 * @param {object} data - Fields to update
 * @param {string} [data.nasname]
 * @param {string} [data.shortname]
 * @param {string} [data.type]
 * @param {number} [data.ports]
 * @param {string} [data.secret]
 * @param {string} [data.server]
 * @param {string} [data.community]
 * @param {string} [data.description]
 * @returns {Promise<object>} Query result
 */
async function update(id, data) {
  const allowedFields = ['nasname', 'shortname', 'type', 'ports', 'secret', 'server', 'community', 'description'];
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
    `UPDATE nas SET ${setClauses.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Delete a NAS entry by ID.
 * @param {number} id
 * @returns {Promise<object>} Query result
 */
async function deleteById(id) {
  const [result] = await radiusPool.execute(
    'DELETE FROM nas WHERE id = ?',
    [id]
  );
  return result;
}

/**
 * Delete a NAS entry by nasname.
 * @param {string} nasname - NAS IP address or hostname
 * @returns {Promise<object>} Query result
 */
async function deleteByNasname(nasname) {
  const [result] = await radiusPool.execute(
    'DELETE FROM nas WHERE nasname = ?',
    [nasname]
  );
  return result;
}

module.exports = {
  findByNasname,
  findByShortname,
  findById,
  findAll,
  create,
  update,
  deleteById,
  deleteByNasname,
};
