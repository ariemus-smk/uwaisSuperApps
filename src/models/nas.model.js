/**
 * NAS model for App DB.
 * Provides data access methods for the `nas_devices` table.
 * Stores NAS device records with CRUD and status tracking.
 *
 * Requirements: 12.1
 */

const { appPool } = require('../config/database');

/**
 * Create a new NAS device record.
 * @param {object} nasData
 * @param {string} nasData.name - NAS device name
 * @param {string} nasData.ip_address - NAS IP address
 * @param {string} nasData.radius_secret - RADIUS shared secret
 * @param {number} [nasData.api_port=8728] - Mikrotik API port
 * @param {number} nasData.branch_id - Branch assignment
 * @param {string} [nasData.status='Active'] - Device status
 * @param {object|null} [nasData.vpn_accounts] - JSON VPN account configs
 * @param {string|null} [nasData.config_script] - Generated Mikrotik script
 * @returns {Promise<object>} Created NAS record with insertId
 */
async function create(nasData) {
  const {
    name,
    ip_address,
    radius_secret,
    api_port = 8728,
    branch_id,
    status = 'Active',
    vpn_accounts = null,
    config_script = null,
    mikrotik_username = null,
    mikrotik_password = null,
  } = nasData;

  const vpnAccountsJson = vpn_accounts ? JSON.stringify(vpn_accounts) : null;

  const [result] = await appPool.execute(
    `INSERT INTO nas_devices (name, ip_address, radius_secret, api_port, mikrotik_username, mikrotik_password, branch_id, status, vpn_accounts, config_script, active_sessions, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())`,
    [name, ip_address, radius_secret, api_port, mikrotik_username, mikrotik_password, branch_id, status, vpnAccountsJson, config_script]
  );

  return { id: result.insertId, ...nasData, status, vpn_accounts, config_script };
}

/**
 * Find a NAS device by ID.
 * @param {number} id
 * @returns {Promise<object|null>} NAS record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    'SELECT * FROM nas_devices WHERE id = ? LIMIT 1',
    [id]
  );
  if (rows.length === 0) return null;

  const record = rows[0];
  // Parse vpn_accounts JSON
  if (record.vpn_accounts) {
    try {
      record.vpn_accounts = JSON.parse(record.vpn_accounts);
    } catch (e) {
      // Keep as string if parse fails
    }
  }
  return record;
}

/**
 * List all NAS devices with optional filters.
 * @param {object} [filters={}]
 * @param {number} [filters.branch_id] - Filter by branch
 * @param {string} [filters.status] - Filter by status (Active/Inactive)
 * @param {string} [filters.poll_status] - Filter by poll status (Up/Down)
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @returns {Promise<{devices: Array, total: number}>} Paginated NAS list
 */
async function findAll(filters = {}) {
  const { branch_id, status, poll_status, page = 1, limit = 20 } = filters;

  let countQuery = 'SELECT COUNT(*) as total FROM nas_devices WHERE 1=1';
  let dataQuery = 'SELECT * FROM nas_devices WHERE 1=1';
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

  if (poll_status) {
    countQuery += ' AND poll_status = ?';
    dataQuery += ' AND poll_status = ?';
    params.push(poll_status);
  }

  const [countRows] = await appPool.execute(countQuery, params);
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  dataQuery += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  const dataParams = [...params, String(limit), String(offset)];

  const [rows] = await appPool.execute(dataQuery, dataParams);

  // Parse vpn_accounts JSON for each record
  const devices = rows.map((record) => {
    if (record.vpn_accounts) {
      try {
        record.vpn_accounts = JSON.parse(record.vpn_accounts);
      } catch (e) {
        // Keep as string if parse fails
      }
    }
    return record;
  });

  return { devices, total };
}

/**
 * Update a NAS device record.
 * @param {number} id - NAS device ID
 * @param {object} data - Fields to update
 * @returns {Promise<object>} Query result
 */
async function update(id, data) {
  const allowedFields = ['name', 'ip_address', 'radius_secret', 'api_port', 'mikrotik_username', 'mikrotik_password', 'branch_id', 'vpn_accounts', 'config_script', 'active_sessions', 'cpu_load', 'memory_usage', 'uptime'];
  const setClauses = [];
  const params = [];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      if (field === 'vpn_accounts' && typeof data[field] === 'object') {
        params.push(JSON.stringify(data[field]));
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
    `UPDATE nas_devices SET ${setClauses.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Update NAS device status (Active/Inactive).
 * @param {number} id - NAS device ID
 * @param {string} status - New status ('Active' or 'Inactive')
 * @returns {Promise<object>} Query result
 */
async function updateStatus(id, status) {
  const [result] = await appPool.execute(
    'UPDATE nas_devices SET status = ?, updated_at = NOW() WHERE id = ?',
    [status, id]
  );
  return result;
}

/**
 * Update NAS poll status and timestamp.
 * @param {number} id - NAS device ID
 * @param {string} pollStatus - Poll status ('Up' or 'Down')
 * @param {number} [activeSessions] - Current active session count
 * @returns {Promise<object>} Query result
 */
async function updatePollStatus(id, pollStatus, activeSessions) {
  let query = 'UPDATE nas_devices SET poll_status = ?, last_poll_at = NOW(), updated_at = NOW()';
  const params = [pollStatus];

  if (activeSessions !== undefined) {
    query += ', active_sessions = ?';
    params.push(activeSessions);
  }

  query += ' WHERE id = ?';
  params.push(id);

  const [result] = await appPool.execute(query, params);
  return result;
}

/**
 * Find NAS device by IP address.
 * @param {string} ipAddress
 * @returns {Promise<object|null>} NAS record or null
 */
async function findByIpAddress(ipAddress) {
  const [rows] = await appPool.execute(
    'SELECT * FROM nas_devices WHERE ip_address = ? LIMIT 1',
    [ipAddress]
  );
  if (rows.length === 0) return null;

  const record = rows[0];
  if (record.vpn_accounts) {
    try {
      record.vpn_accounts = JSON.parse(record.vpn_accounts);
    } catch (e) {
      // Keep as string if parse fails
    }
  }
  return record;
}

/**
 * Delete a NAS device record.
 * @param {number} id - NAS device ID
 * @returns {Promise<object>} Query result
 */
async function remove(id) {
  const [result] = await appPool.execute(
    'DELETE FROM nas_devices WHERE id = ?',
    [id]
  );
  return result;
}

module.exports = {
  create,
  findById,
  findAll,
  update,
  updateStatus,
  updatePollStatus,
  findByIpAddress,
  remove,
};
