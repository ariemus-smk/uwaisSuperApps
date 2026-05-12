/**
 * Package Change Request model for App DB.
 * Provides data access methods for the `package_change_requests` table.
 * Tracks customer package upgrade/downgrade requests with approval workflow.
 *
 * Requirements: 17.1, 17.2, 17.3, 17.4, 17.5
 */

const { appPool } = require('../config/database');

/**
 * Package change request status values.
 */
const PACKAGE_CHANGE_STATUS = Object.freeze({
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
});

/**
 * Find a package change request by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Package change request record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    'SELECT * FROM package_change_requests WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find a package change request by ID with related details (subscription, packages, requester).
 * @param {number} id
 * @returns {Promise<object|null>} Package change request with joined details or null
 */
async function findByIdWithDetails(id) {
  const [rows] = await appPool.execute(
    `SELECT pcr.*,
            s.pppoe_username, s.customer_id, s.nas_id,
            c.full_name AS customer_name, c.whatsapp_number AS customer_whatsapp,
            cp.name AS current_package_name, cp.monthly_price AS current_package_price,
            cp.upload_rate_limit AS current_upload_rate, cp.download_rate_limit AS current_download_rate,
            rp.name AS requested_package_name, rp.monthly_price AS requested_package_price,
            rp.upload_rate_limit AS requested_upload_rate, rp.download_rate_limit AS requested_download_rate,
            u.full_name AS requested_by_name
     FROM package_change_requests pcr
     LEFT JOIN subscriptions s ON pcr.subscription_id = s.id
     LEFT JOIN customers c ON s.customer_id = c.id
     LEFT JOIN packages cp ON pcr.current_package_id = cp.id
     LEFT JOIN packages rp ON pcr.requested_package_id = rp.id
     LEFT JOIN users u ON pcr.requested_by = u.id
     WHERE pcr.id = ? LIMIT 1`,
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Count approved package changes for a subscription in a given calendar month.
 * Used to enforce the 1-change-per-month limit.
 *
 * @param {number} subscriptionId - Subscription ID
 * @param {number} year - Year (e.g., 2024)
 * @param {number} month - Month (1-12)
 * @returns {Promise<number>} Count of approved changes in the specified month
 */
async function countApprovedInMonth(subscriptionId, year, month) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01 00:00:00`;
  // Calculate end of month
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01 00:00:00`;

  const [rows] = await appPool.execute(
    `SELECT COUNT(*) AS count FROM package_change_requests
     WHERE subscription_id = ? AND status = 'Approved'
     AND processed_at >= ? AND processed_at < ?`,
    [subscriptionId, startDate, endDate]
  );
  return rows[0].count;
}

/**
 * Create a new package change request.
 * @param {object} data - Request data
 * @param {number} data.subscription_id - Subscription ID
 * @param {number} data.current_package_id - Current package ID
 * @param {number} data.requested_package_id - Requested new package ID
 * @param {number} data.requested_by - User ID who submitted the request
 * @returns {Promise<object>} Created package change request with insertId
 */
async function create(data) {
  const {
    subscription_id,
    current_package_id,
    requested_package_id,
    requested_by,
  } = data;

  const [result] = await appPool.execute(
    `INSERT INTO package_change_requests (subscription_id, current_package_id, requested_package_id, requested_by, status, created_at)
     VALUES (?, ?, ?, ?, 'Pending', NOW())`,
    [subscription_id, current_package_id, requested_package_id, requested_by]
  );

  return {
    id: result.insertId,
    ...data,
    status: PACKAGE_CHANGE_STATUS.PENDING,
  };
}

/**
 * Update a package change request (approve or reject).
 * @param {number} id - Package change request ID
 * @param {object} updateData - Fields to update
 * @param {string} [updateData.status] - New status (Approved or Rejected)
 * @param {string} [updateData.rejection_reason] - Reason for rejection
 * @param {number} [updateData.approved_by] - Admin user ID who processed the request
 * @returns {Promise<object>} Query result
 */
async function update(id, updateData) {
  const allowedFields = ['status', 'rejection_reason', 'approved_by', 'processed_at'];
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

  params.push(id);

  const [result] = await appPool.execute(
    `UPDATE package_change_requests SET ${setClauses.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Find all package change requests with optional filters and pagination.
 * @param {object} [filters={}] - Optional filters
 * @param {number} [filters.subscription_id] - Filter by subscription
 * @param {string} [filters.status] - Filter by status (Pending, Approved, Rejected)
 * @param {number} [filters.branch_id] - Filter by customer's branch
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @returns {Promise<{requests: Array, total: number}>} Paginated request list
 */
async function findAll(filters = {}) {
  const { subscription_id, status, branch_id, page = 1, limit = 20 } = filters;

  let countQuery = `SELECT COUNT(*) as total FROM package_change_requests pcr
    LEFT JOIN subscriptions s ON pcr.subscription_id = s.id
    LEFT JOIN customers c ON s.customer_id = c.id
    WHERE 1=1`;
  let dataQuery = `SELECT pcr.*,
    s.pppoe_username, s.customer_id,
    c.full_name AS customer_name, c.branch_id,
    cp.name AS current_package_name, cp.monthly_price AS current_package_price,
    rp.name AS requested_package_name, rp.monthly_price AS requested_package_price,
    u.full_name AS requested_by_name
    FROM package_change_requests pcr
    LEFT JOIN subscriptions s ON pcr.subscription_id = s.id
    LEFT JOIN customers c ON s.customer_id = c.id
    LEFT JOIN packages cp ON pcr.current_package_id = cp.id
    LEFT JOIN packages rp ON pcr.requested_package_id = rp.id
    LEFT JOIN users u ON pcr.requested_by = u.id
    WHERE 1=1`;
  const params = [];

  if (subscription_id) {
    countQuery += ' AND pcr.subscription_id = ?';
    dataQuery += ' AND pcr.subscription_id = ?';
    params.push(subscription_id);
  }

  if (status) {
    countQuery += ' AND pcr.status = ?';
    dataQuery += ' AND pcr.status = ?';
    params.push(status);
  }

  if (branch_id) {
    countQuery += ' AND c.branch_id = ?';
    dataQuery += ' AND c.branch_id = ?';
    params.push(branch_id);
  }

  const [countRows] = await appPool.execute(countQuery, params);
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  dataQuery += ' ORDER BY pcr.created_at DESC LIMIT ? OFFSET ?';
  const dataParams = [...params, String(limit), String(offset)];

  const [rows] = await appPool.execute(dataQuery, dataParams);

  return { requests: rows, total };
}

module.exports = {
  PACKAGE_CHANGE_STATUS,
  findById,
  findByIdWithDetails,
  countApprovedInMonth,
  create,
  update,
  findAll,
};
