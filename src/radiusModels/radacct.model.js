/**
 * Radacct model for RADIUS DB.
 * Provides read operations for the `radacct` table.
 * Stores accounting records (PPPoE session data, traffic usage).
 * Note: radacct is written by FreeRADIUS, so this model is read-only.
 */

const { radiusPool } = require('../config/database');

/**
 * Find all accounting records for a username.
 * @param {string} username - PPPoE username
 * @param {object} [options={}]
 * @param {number} [options.limit=50]
 * @param {number} [options.page=1]
 * @returns {Promise<{records: Array, total: number}>}
 */
async function findByUsername(username, options = {}) {
  const { limit = 50, page = 1 } = options;

  const [countRows] = await radiusPool.execute(
    'SELECT COUNT(*) as total FROM radacct WHERE username = ?',
    [username]
  );
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  const [rows] = await radiusPool.execute(
    'SELECT * FROM radacct WHERE username = ? ORDER BY acctstarttime DESC LIMIT ? OFFSET ?',
    [username, String(limit), String(offset)]
  );

  return { records: rows, total };
}

/**
 * Find the current active session for a username (no stop time).
 * @param {string} username - PPPoE username
 * @returns {Promise<object|null>} Active session record or null
 */
async function findActiveSession(username) {
  const [rows] = await radiusPool.execute(
    'SELECT * FROM radacct WHERE username = ? AND acctstoptime IS NULL ORDER BY acctstarttime DESC LIMIT 1',
    [username]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find a record by radacctid.
 * @param {number} radacctid
 * @returns {Promise<object|null>} Record or null
 */
async function findById(radacctid) {
  const [rows] = await radiusPool.execute(
    'SELECT * FROM radacct WHERE radacctid = ? LIMIT 1',
    [radacctid]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find a record by unique session ID.
 * @param {string} acctuniqueid
 * @returns {Promise<object|null>} Record or null
 */
async function findByAcctUniqueId(acctuniqueid) {
  const [rows] = await radiusPool.execute(
    'SELECT * FROM radacct WHERE acctuniqueid = ? LIMIT 1',
    [acctuniqueid]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * List all accounting records with optional filters.
 * @param {object} [filters={}]
 * @param {string} [filters.username] - Filter by username
 * @param {string} [filters.nasipaddress] - Filter by NAS IP
 * @param {string} [filters.startDate] - Filter sessions starting after this date (YYYY-MM-DD)
 * @param {string} [filters.endDate] - Filter sessions starting before this date (YYYY-MM-DD)
 * @param {boolean} [filters.activeOnly] - Only return active sessions (no stop time)
 * @param {number} [filters.page=1]
 * @param {number} [filters.limit=50]
 * @returns {Promise<{records: Array, total: number}>}
 */
async function findAll(filters = {}) {
  const { username, nasipaddress, startDate, endDate, activeOnly, page = 1, limit = 50 } = filters;

  let countQuery = 'SELECT COUNT(*) as total FROM radacct WHERE 1=1';
  let dataQuery = 'SELECT * FROM radacct WHERE 1=1';
  const params = [];

  if (username) {
    countQuery += ' AND username = ?';
    dataQuery += ' AND username = ?';
    params.push(username);
  }

  if (nasipaddress) {
    countQuery += ' AND nasipaddress = ?';
    dataQuery += ' AND nasipaddress = ?';
    params.push(nasipaddress);
  }

  if (startDate) {
    countQuery += ' AND acctstarttime >= ?';
    dataQuery += ' AND acctstarttime >= ?';
    params.push(startDate);
  }

  if (endDate) {
    countQuery += ' AND acctstarttime <= ?';
    dataQuery += ' AND acctstarttime <= ?';
    params.push(endDate);
  }

  if (activeOnly) {
    countQuery += ' AND acctstoptime IS NULL';
    dataQuery += ' AND acctstoptime IS NULL';
  }

  const [countRows] = await radiusPool.execute(countQuery, params);
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  dataQuery += ' ORDER BY acctstarttime DESC LIMIT ? OFFSET ?';
  const dataParams = [...params, String(limit), String(offset)];

  const [rows] = await radiusPool.execute(dataQuery, dataParams);

  return { records: rows, total };
}

/**
 * Get total traffic usage for a username within a date range.
 * @param {string} username - PPPoE username
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<{inputOctets: number, outputOctets: number, sessionTime: number}>}
 */
async function getUsageSummary(username, startDate, endDate) {
  const [rows] = await radiusPool.execute(
    `SELECT 
       COALESCE(SUM(acctinputoctets), 0) as inputOctets,
       COALESCE(SUM(acctoutputoctets), 0) as outputOctets,
       COALESCE(SUM(acctsessiontime), 0) as sessionTime
     FROM radacct 
     WHERE username = ? AND acctstarttime >= ? AND acctstarttime <= ?`,
    [username, startDate, endDate]
  );

  return rows[0];
}

/**
 * Get active session count for a NAS IP address.
 * @param {string} nasipaddress - NAS IP address
 * @returns {Promise<number>} Active session count
 */
async function getActiveSessionCount(nasipaddress) {
  const [rows] = await radiusPool.execute(
    'SELECT COUNT(*) as count FROM radacct WHERE nasipaddress = ? AND acctstoptime IS NULL',
    [nasipaddress]
  );
  return rows[0].count;
}

module.exports = {
  findByUsername,
  findActiveSession,
  findById,
  findByAcctUniqueId,
  findAll,
  getUsageSummary,
  getActiveSessionCount,
};
