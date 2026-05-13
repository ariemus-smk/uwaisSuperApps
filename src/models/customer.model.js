/**
 * Customer model for App DB.
 * Provides data access methods for the `customers` table.
 * Implements lifecycle state machine with transition validation.
 */

const { appPool } = require('../config/database');
const { CUSTOMER_STATUS, CUSTOMER_STATUS_TRANSITIONS } = require('../utils/constants');

/**
 * Find a customer by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Customer record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    'SELECT * FROM customers WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find a customer by KTP number.
 * @param {string} ktpNumber
 * @returns {Promise<object|null>} Customer record or null
 */
async function findByKtp(ktpNumber) {
  const [rows] = await appPool.execute(
    'SELECT * FROM customers WHERE ktp_number = ? LIMIT 1',
    [ktpNumber]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * List customers with optional filters and pagination.
 * @param {object} [filters={}] - Optional filters
 * @param {number} [filters.branch_id] - Filter by branch
 * @param {string} [filters.lifecycle_status] - Filter by status
 * @param {string} [filters.search] - Search by name or KTP
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @returns {Promise<{customers: Array, total: number}>} Paginated customer list
 */
async function findAll(filters = {}) {
  const { branch_id, lifecycle_status, search, page = 1, limit = 20 } = filters;

  let countQuery = 'SELECT COUNT(*) as total FROM customers c WHERE 1=1';
  let dataQuery = 'SELECT c.*, b.name as branch FROM customers c LEFT JOIN branches b ON c.branch_id = b.id WHERE 1=1';
  const params = [];

  if (branch_id) {
    countQuery += ' AND c.branch_id = ?';
    dataQuery += ' AND c.branch_id = ?';
    params.push(branch_id);
  }

  if (lifecycle_status) {
    countQuery += ' AND c.lifecycle_status = ?';
    dataQuery += ' AND c.lifecycle_status = ?';
    params.push(lifecycle_status);
  }

  if (search) {
    countQuery += ' AND (c.full_name LIKE ? OR c.ktp_number LIKE ?)';
    dataQuery += ' AND (c.full_name LIKE ? OR c.ktp_number LIKE ?)';
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern);
  }

  const [countRows] = await appPool.execute(countQuery, params);
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  dataQuery += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
  const dataParams = [...params, String(limit), String(offset)];

  const [rows] = await appPool.execute(dataQuery, dataParams);

  return { customers: rows, total };
}

/**
 * Create a new customer record.
 * Initial lifecycle_status is always set to 'Prospek'.
 * @param {object} data - Customer data
 * @param {string} data.full_name
 * @param {string} data.ktp_number
 * @param {string|null} [data.npwp_number]
 * @param {string} data.whatsapp_number
 * @param {string|null} [data.email]
 * @param {string} data.address
 * @param {number|null} [data.latitude]
 * @param {number|null} [data.longitude]
 * @param {number} data.branch_id
 * @param {number|null} [data.registered_by]
 * @returns {Promise<object>} Created customer with insertId
 */
async function create(data) {
  const {
    full_name,
    ktp_number,
    npwp_number = null,
    whatsapp_number,
    email = null,
    address,
    rt = null,
    rw = null,
    dusun = null,
    desa = null,
    kecamatan = null,
    kabupaten = null,
    provinsi = null,
    latitude = null,
    longitude = null,
    branch_id,
    registered_by = null,
  } = data;

  const lifecycle_status = CUSTOMER_STATUS.PROSPEK;

  const [result] = await appPool.execute(
    `INSERT INTO customers (full_name, ktp_number, npwp_number, whatsapp_number, email, address, rt, rw, dusun, desa, kecamatan, kabupaten, provinsi, latitude, longitude, lifecycle_status, branch_id, registered_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [full_name, ktp_number, npwp_number, whatsapp_number, email, address, rt, rw, dusun, desa, kecamatan, kabupaten, provinsi, latitude, longitude, lifecycle_status, branch_id, registered_by]
  );

  return { id: result.insertId, ...data, lifecycle_status };
}

/**
 * Update customer profile data (non-status fields).
 * @param {number} id - Customer ID
 * @param {object} updateData - Fields to update
 * @returns {Promise<object>} Query result
 */
async function update(id, updateData) {
  const allowedFields = [
    'full_name', 'npwp_number', 'whatsapp_number', 'email', 'address',
    'rt', 'rw', 'dusun', 'desa', 'kecamatan', 'kabupaten', 'provinsi',
    'latitude', 'longitude'
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
    `UPDATE customers SET ${setClauses.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Validate whether a status transition is allowed.
 * @param {string} currentStatus - Current lifecycle status
 * @param {string} newStatus - Desired new status
 * @returns {boolean} True if transition is valid
 */
function isValidTransition(currentStatus, newStatus) {
  const allowedTargets = CUSTOMER_STATUS_TRANSITIONS[currentStatus];
  if (!allowedTargets) {
    return false;
  }
  return allowedTargets.includes(newStatus);
}

/**
 * Get the list of allowed transitions from a given status.
 * @param {string} currentStatus - Current lifecycle status
 * @returns {string[]} Array of allowed target statuses
 */
function getAllowedTransitions(currentStatus) {
  return CUSTOMER_STATUS_TRANSITIONS[currentStatus] || [];
}

/**
 * Update customer lifecycle status with transition validation.
 * Rejects invalid transitions with a descriptive error.
 * @param {number} id - Customer ID
 * @param {string} newStatus - Desired new status
 * @param {number} actorId - ID of the user performing the change
 * @returns {Promise<object>} Result with success flag and details
 * @throws {Error} If customer not found or transition is invalid
 */
async function updateStatus(id, newStatus, actorId) {
  const customer = await findById(id);

  if (!customer) {
    const error = new Error('Customer not found');
    error.code = 'RESOURCE_NOT_FOUND';
    throw error;
  }

  const currentStatus = customer.lifecycle_status;

  if (!isValidTransition(currentStatus, newStatus)) {
    const allowed = getAllowedTransitions(currentStatus);
    const error = new Error(
      `Invalid status transition from '${currentStatus}' to '${newStatus}'. Allowed transitions from '${currentStatus}': [${allowed.join(', ')}]`
    );
    error.code = 'INVALID_STATUS_TRANSITION';
    error.details = {
      current_status: currentStatus,
      requested_status: newStatus,
      allowed_transitions: allowed,
    };
    throw error;
  }

  // Use a transaction to update status and record audit log atomically
  const connection = await appPool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.execute(
      'UPDATE customers SET lifecycle_status = ?, updated_at = NOW() WHERE id = ?',
      [newStatus, id]
    );

    await connection.execute(
      `INSERT INTO customer_audit_log (customer_id, previous_status, new_status, actor_id, changed_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [id, currentStatus, newStatus, actorId]
    );

    await connection.commit();
    connection.release();

    return {
      success: true,
      previous_status: currentStatus,
      new_status: newStatus,
      customer_id: id,
      actor_id: actorId,
    };
  } catch (err) {
    await connection.rollback();
    connection.release();
    throw err;
  }
}

module.exports = {
  findById,
  findByKtp,
  findAll,
  create,
  update,
  isValidTransition,
  getAllowedTransitions,
  updateStatus,
};
