/**
 * Package model for App DB.
 * Provides data access methods for the `packages` table.
 * Stores QoS parameters (rate_limit, burst_limit, burst_threshold)
 * for upload and download, plus FUP and pricing configuration.
 */

const { appPool } = require('../config/database');

/**
 * Find all packages with optional filtering.
 * @param {object} [filters={}] - Optional filters (status)
 * @returns {Promise<Array>} List of package records
 */
async function findAll(filters = {}) {
  let query = 'SELECT * FROM packages';
  const params = [];

  if (filters.status) {
    query += ' WHERE status = ?';
    params.push(filters.status);
  }

  query += ' ORDER BY name ASC';

  const [rows] = await appPool.execute(query, params);
  return rows;
}

/**
 * Find a package by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Package record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    'SELECT * FROM packages WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find a package by name.
 * @param {string} name
 * @returns {Promise<object|null>} Package record or null
 */
async function findByName(name) {
  const [rows] = await appPool.execute(
    'SELECT * FROM packages WHERE name = ? LIMIT 1',
    [name]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Create a new package.
 * @param {object} data - Package data
 * @returns {Promise<object>} Created package with inserted ID
 */
async function create(data) {
  const {
    name,
    upload_rate_limit,
    download_rate_limit,
    upload_burst_limit,
    download_burst_limit,
    upload_burst_threshold,
    download_burst_threshold,
    monthly_price,
    ppn_enabled = false,
    fup_enabled = false,
    fup_quota_gb = null,
    fup_upload_speed = null,
    fup_download_speed = null,
    status = 'Active',
    ip_pool = null,
    service_type = 'PPPoE',
  } = data;

  const [result] = await appPool.execute(
    `INSERT INTO packages (name, service_type, upload_rate_limit, download_rate_limit, upload_burst_limit, download_burst_limit,
      upload_burst_threshold, download_burst_threshold, ip_pool, monthly_price, ppn_enabled, fup_enabled,
      fup_quota_gb, fup_upload_speed, fup_download_speed, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      name,
      service_type,
      upload_rate_limit,
      download_rate_limit,
      upload_burst_limit,
      download_burst_limit,
      upload_burst_threshold,
      download_burst_threshold,
      ip_pool,
      monthly_price,
      ppn_enabled ? 1 : 0,
      fup_enabled ? 1 : 0,
      fup_quota_gb,
      fup_upload_speed,
      fup_download_speed,
      status,
    ]
  );

  return { id: result.insertId, ...data, status };
}

/**
 * Update an existing package.
 * @param {number} id - Package ID
 * @param {object} data - Fields to update
 * @returns {Promise<object>} Query result
 */
async function update(id, data) {
  const fields = [];
  const params = [];

  const allowedFields = [
    'name',
    'upload_rate_limit',
    'download_rate_limit',
    'upload_burst_limit',
    'download_burst_limit',
    'upload_burst_threshold',
    'download_burst_threshold',
    'monthly_price',
    'ppn_enabled',
    'fup_enabled',
    'fup_quota_gb',
    'fup_upload_speed',
    'fup_download_speed',
    'status',
    'ip_pool',
    'service_type',
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      fields.push(`${field} = ?`);
      if (field === 'ppn_enabled' || field === 'fup_enabled') {
        params.push(data[field] ? 1 : 0);
      } else {
        params.push(data[field]);
      }
    }
  }

  if (fields.length === 0) {
    return { affectedRows: 0 };
  }

  fields.push('updated_at = NOW()');
  params.push(id);

  const [result] = await appPool.execute(
    `UPDATE packages SET ${fields.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Delete a package by ID.
 * @param {number} id - Package ID
 * @returns {Promise<object>} Query result
 */
async function deleteById(id) {
  const [result] = await appPool.execute(
    'DELETE FROM packages WHERE id = ?',
    [id]
  );
  return result;
}

/**
 * Count active subscriptions for a given package.
 * Active subscriptions are those with status 'Active' or 'Pending'.
 * @param {number} packageId - Package ID
 * @returns {Promise<number>} Count of active subscriptions
 */
async function countActiveSubscriptions(packageId) {
  const [rows] = await appPool.execute(
    `SELECT COUNT(*) AS count FROM subscriptions
     WHERE package_id = ? AND status IN ('Active', 'Pending')`,
    [packageId]
  );
  return rows[0].count;
}

module.exports = {
  findAll,
  findById,
  findByName,
  create,
  update,
  deleteById,
  countActiveSubscriptions,
};
