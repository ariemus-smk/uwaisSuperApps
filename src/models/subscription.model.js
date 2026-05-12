/**
 * Subscription model for App DB.
 * Provides data access methods for the `subscriptions` table.
 * Implements one-to-many relationship with customers (a customer can have multiple subscriptions).
 *
 * Requirements: 3.1, 3.2, 3.3
 */

const { appPool } = require('../config/database');
const { SUBSCRIPTION_STATUS } = require('../utils/constants');

/**
 * Find a subscription by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Subscription record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    'SELECT * FROM subscriptions WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find a subscription by ID with customer and package details joined.
 * @param {number} id
 * @returns {Promise<object|null>} Subscription record with joins or null
 */
async function findByIdWithDetails(id) {
  const [rows] = await appPool.execute(
    `SELECT s.*, 
            c.full_name AS customer_name, c.ktp_number, c.branch_id,
            p.name AS package_name, p.monthly_price, p.upload_rate_limit, p.download_rate_limit
     FROM subscriptions s
     LEFT JOIN customers c ON s.customer_id = c.id
     LEFT JOIN packages p ON s.package_id = p.id
     WHERE s.id = ? LIMIT 1`,
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find a subscription by PPPoE username.
 * @param {string} pppoeUsername
 * @returns {Promise<object|null>} Subscription record or null
 */
async function findByPPPoEUsername(pppoeUsername) {
  const [rows] = await appPool.execute(
    'SELECT * FROM subscriptions WHERE pppoe_username = ? LIMIT 1',
    [pppoeUsername]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find all subscriptions for a customer.
 * @param {number} customerId
 * @returns {Promise<Array>} List of subscription records
 */
async function findByCustomerId(customerId) {
  const [rows] = await appPool.execute(
    'SELECT * FROM subscriptions WHERE customer_id = ? ORDER BY created_at DESC',
    [customerId]
  );
  return rows;
}

/**
 * List subscriptions with optional filters and pagination.
 * Supports branch scoping via customer's branch_id.
 * @param {object} [filters={}] - Optional filters
 * @param {number} [filters.branch_id] - Filter by customer's branch
 * @param {number} [filters.customer_id] - Filter by customer
 * @param {string} [filters.status] - Filter by subscription status
 * @param {string} [filters.search] - Search by PPPoE username
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @returns {Promise<{subscriptions: Array, total: number}>} Paginated subscription list
 */
async function findAll(filters = {}) {
  const { branch_id, customer_id, status, search, page = 1, limit = 20 } = filters;

  let countQuery = `SELECT COUNT(*) as total FROM subscriptions s
    LEFT JOIN customers c ON s.customer_id = c.id WHERE 1=1`;
  let dataQuery = `SELECT s.*, c.full_name AS customer_name, c.branch_id,
    p.name AS package_name
    FROM subscriptions s
    LEFT JOIN customers c ON s.customer_id = c.id
    LEFT JOIN packages p ON s.package_id = p.id
    WHERE 1=1`;
  const params = [];

  if (branch_id) {
    countQuery += ' AND c.branch_id = ?';
    dataQuery += ' AND c.branch_id = ?';
    params.push(branch_id);
  }

  if (customer_id) {
    countQuery += ' AND s.customer_id = ?';
    dataQuery += ' AND s.customer_id = ?';
    params.push(customer_id);
  }

  if (status) {
    countQuery += ' AND s.status = ?';
    dataQuery += ' AND s.status = ?';
    params.push(status);
  }

  if (search) {
    countQuery += ' AND s.pppoe_username LIKE ?';
    dataQuery += ' AND s.pppoe_username LIKE ?';
    params.push(`%${search}%`);
  }

  const [countRows] = await appPool.execute(countQuery, params);
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  dataQuery += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?';
  const dataParams = [...params, String(limit), String(offset)];

  const [rows] = await appPool.execute(dataQuery, dataParams);

  return { subscriptions: rows, total };
}

/**
 * Create a new subscription record.
 * Initial status is always set to 'Pending'.
 * @param {object} data - Subscription data
 * @param {number} data.customer_id
 * @param {number} data.package_id
 * @param {string} data.pppoe_username
 * @param {string} data.pppoe_password
 * @param {number} data.nas_id
 * @param {number|null} [data.odp_id]
 * @param {number|null} [data.odp_port]
 * @param {string|null} [data.onu_serial_number]
 * @param {string|null} [data.onu_mac_address]
 * @param {number|null} [data.install_latitude]
 * @param {number|null} [data.install_longitude]
 * @returns {Promise<object>} Created subscription with insertId
 */
async function create(data) {
  const {
    customer_id,
    package_id,
    pppoe_username,
    pppoe_password,
    nas_id,
    odp_id = null,
    odp_port = null,
    onu_serial_number = null,
    onu_mac_address = null,
    install_latitude = null,
    install_longitude = null,
  } = data;

  const status = SUBSCRIPTION_STATUS.PENDING;

  const [result] = await appPool.execute(
    `INSERT INTO subscriptions (customer_id, package_id, pppoe_username, pppoe_password, nas_id,
      odp_id, odp_port, onu_serial_number, onu_mac_address, install_latitude, install_longitude,
      status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      customer_id, package_id, pppoe_username, pppoe_password, nas_id,
      odp_id, odp_port, onu_serial_number, onu_mac_address,
      install_latitude, install_longitude, status,
    ]
  );

  return { id: result.insertId, ...data, status };
}

/**
 * Update a subscription record.
 * @param {number} id - Subscription ID
 * @param {object} updateData - Fields to update
 * @returns {Promise<object>} Query result
 */
async function update(id, updateData) {
  const allowedFields = [
    'package_id', 'pppoe_username', 'pppoe_password', 'nas_id',
    'odp_id', 'odp_port', 'onu_serial_number', 'onu_mac_address',
    'install_latitude', 'install_longitude', 'status', 'activated_at',
  ];
  const setClauses = [];
  const params = [];

  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      params.push(updateData[field]);
    }
  }

  if (setClauses.length === 0) {
    return { affectedRows: 0 };
  }

  setClauses.push('updated_at = NOW()');
  params.push(id);

  const [result] = await appPool.execute(
    `UPDATE subscriptions SET ${setClauses.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Count active subscriptions for a given package.
 * @param {number} packageId
 * @returns {Promise<number>} Count of active/pending subscriptions
 */
async function countByPackage(packageId) {
  const [rows] = await appPool.execute(
    `SELECT COUNT(*) AS count FROM subscriptions
     WHERE package_id = ? AND status IN ('Active', 'Pending')`,
    [packageId]
  );
  return rows[0].count;
}

/**
 * Count subscriptions for a given customer.
 * @param {number} customerId
 * @returns {Promise<number>} Count of subscriptions
 */
async function countByCustomer(customerId) {
  const [rows] = await appPool.execute(
    'SELECT COUNT(*) AS count FROM subscriptions WHERE customer_id = ?',
    [customerId]
  );
  return rows[0].count;
}

module.exports = {
  findById,
  findByIdWithDetails,
  findByPPPoEUsername,
  findByCustomerId,
  findAll,
  create,
  update,
  countByPackage,
  countByCustomer,
};
