/**
 * Overtime Request model for App DB.
 * Provides data access methods for the `overtime_requests` table.
 * Tracks overtime requests linked to tickets and technicians,
 * including approval workflow and compensation calculation.
 *
 * Requirements: 26.3, 26.4, 26.5, 39.1, 39.2, 39.3, 39.4
 */

const { appPool } = require('../config/database');

/**
 * Overtime request status values.
 */
const OVERTIME_STATUS = Object.freeze({
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
});

/**
 * Find an overtime request by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Overtime request record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    `SELECT o.*, 
            u.full_name AS teknisi_name,
            a.full_name AS approved_by_name
     FROM overtime_requests o
     LEFT JOIN users u ON o.teknisi_id = u.id
     LEFT JOIN users a ON o.approved_by = a.id
     WHERE o.id = ? LIMIT 1`,
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find overtime requests by ticket ID.
 * @param {number} ticketId
 * @returns {Promise<Array>} List of overtime requests for the ticket
 */
async function findByTicketId(ticketId) {
  const [rows] = await appPool.execute(
    `SELECT o.*, 
            u.full_name AS teknisi_name,
            a.full_name AS approved_by_name
     FROM overtime_requests o
     LEFT JOIN users u ON o.teknisi_id = u.id
     LEFT JOIN users a ON o.approved_by = a.id
     WHERE o.ticket_id = ?
     ORDER BY o.created_at DESC`,
    [ticketId]
  );
  return rows;
}

/**
 * Find overtime requests by technician ID.
 * @param {number} teknisiId
 * @param {object} [filters={}] - Optional filters (status, month, year)
 * @returns {Promise<Array>} List of overtime requests for the technician
 */
async function findByTeknisiId(teknisiId, filters = {}) {
  let query = `SELECT o.*, 
            u.full_name AS teknisi_name,
            a.full_name AS approved_by_name
     FROM overtime_requests o
     LEFT JOIN users u ON o.teknisi_id = u.id
     LEFT JOIN users a ON o.approved_by = a.id
     WHERE o.teknisi_id = ?`;
  const params = [teknisiId];

  if (filters.status) {
    query += ' AND o.status = ?';
    params.push(filters.status);
  }

  if (filters.month && filters.year) {
    query += ' AND MONTH(o.overtime_date) = ? AND YEAR(o.overtime_date) = ?';
    params.push(filters.month, filters.year);
  }

  query += ' ORDER BY o.created_at DESC';

  const [rows] = await appPool.execute(query, params);
  return rows;
}

/**
 * List overtime requests with optional filters and pagination.
 * Supports branch scoping via ticket's branch_id.
 * @param {object} [filters={}] - Optional filters
 * @param {number} [filters.branch_id] - Filter by branch (via ticket)
 * @param {string} [filters.status] - Filter by overtime status
 * @param {number} [filters.teknisi_id] - Filter by technician
 * @param {number} [filters.ticket_id] - Filter by ticket
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @returns {Promise<{data: Array, total: number}>} Paginated overtime request list
 */
async function findAll(filters = {}) {
  const { branch_id, status, teknisi_id, ticket_id, page = 1, limit = 20 } = filters;

  let countQuery = `SELECT COUNT(*) as total FROM overtime_requests o
     LEFT JOIN tickets t ON o.ticket_id = t.id
     WHERE 1=1`;
  let dataQuery = `SELECT o.*, 
     u.full_name AS teknisi_name,
     a.full_name AS approved_by_name,
     t.issue_description AS ticket_description,
     t.priority AS ticket_priority
     FROM overtime_requests o
     LEFT JOIN users u ON o.teknisi_id = u.id
     LEFT JOIN users a ON o.approved_by = a.id
     LEFT JOIN tickets t ON o.ticket_id = t.id
     WHERE 1=1`;
  const params = [];

  if (branch_id) {
    countQuery += ' AND t.branch_id = ?';
    dataQuery += ' AND t.branch_id = ?';
    params.push(branch_id);
  }

  if (status) {
    countQuery += ' AND o.status = ?';
    dataQuery += ' AND o.status = ?';
    params.push(status);
  }

  if (teknisi_id) {
    countQuery += ' AND o.teknisi_id = ?';
    dataQuery += ' AND o.teknisi_id = ?';
    params.push(teknisi_id);
  }

  if (ticket_id) {
    countQuery += ' AND o.ticket_id = ?';
    dataQuery += ' AND o.ticket_id = ?';
    params.push(ticket_id);
  }

  const [countRows] = await appPool.execute(countQuery, params);
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  dataQuery += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
  const dataParams = [...params, String(limit), String(offset)];

  const [rows] = await appPool.execute(dataQuery, dataParams);

  return { data: rows, total };
}

/**
 * Create a new overtime request.
 * Initial status is always 'Requested'.
 *
 * Requirements: 26.3, 39.1, 39.2
 *
 * @param {object} data - Overtime request data
 * @param {number} data.ticket_id - Linked ticket ID
 * @param {number} data.teknisi_id - Technician user ID
 * @param {string} data.overtime_date - Date of overtime (YYYY-MM-DD)
 * @param {object} [connection] - Optional existing connection (for transactions)
 * @returns {Promise<object>} Created overtime request with insertId
 */
async function create(data, connection = null) {
  const { ticket_id, teknisi_id, overtime_date } = data;

  const conn = connection || appPool;

  const [result] = await conn.execute(
    `INSERT INTO overtime_requests (ticket_id, teknisi_id, overtime_date, status, created_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [ticket_id, teknisi_id, overtime_date, OVERTIME_STATUS.REQUESTED]
  );

  return { id: result.insertId, ticket_id, teknisi_id, overtime_date, status: OVERTIME_STATUS.REQUESTED };
}

/**
 * Approve an overtime request.
 * Sets status to Approved, records approver, hours, and compensation.
 *
 * Requirements: 26.4, 39.3
 *
 * @param {number} id - Overtime request ID
 * @param {object} approvalData - Approval data
 * @param {number} approvalData.approved_by - Approver user ID
 * @param {number} approvalData.approved_hours - Number of approved overtime hours
 * @param {number} [approvalData.compensation_amount] - Calculated compensation amount
 * @param {object} [connection] - Optional existing connection (for transactions)
 * @returns {Promise<object>} Query result
 */
async function approve(id, approvalData, connection = null) {
  const { approved_by, approved_hours, compensation_amount = null } = approvalData;

  const conn = connection || appPool;

  const [result] = await conn.execute(
    `UPDATE overtime_requests 
     SET status = ?, approved_by = ?, approved_hours = ?, compensation_amount = ?
     WHERE id = ? AND status = ?`,
    [OVERTIME_STATUS.APPROVED, approved_by, approved_hours, compensation_amount, id, OVERTIME_STATUS.REQUESTED]
  );

  return result;
}

/**
 * Reject an overtime request.
 * Sets status to Rejected and records the rejector.
 *
 * Requirements: 26.5
 *
 * @param {number} id - Overtime request ID
 * @param {number} rejectedBy - Rejector user ID
 * @param {object} [connection] - Optional existing connection (for transactions)
 * @returns {Promise<object>} Query result
 */
async function reject(id, rejectedBy, connection = null) {
  const conn = connection || appPool;

  const [result] = await conn.execute(
    `UPDATE overtime_requests 
     SET status = ?, approved_by = ?
     WHERE id = ? AND status = ?`,
    [OVERTIME_STATUS.REJECTED, rejectedBy, id, OVERTIME_STATUS.REQUESTED]
  );

  return result;
}

/**
 * Get approved overtime hours for a technician in a given month.
 * Used for payroll report integration.
 *
 * Requirements: 39.4
 *
 * @param {number} teknisiId - Technician user ID
 * @param {number} month - Month (1-12)
 * @param {number} year - Year (e.g. 2024)
 * @returns {Promise<{total_hours: number, total_compensation: number, records: Array}>}
 */
async function getApprovedByMonth(teknisiId, month, year) {
  const [rows] = await appPool.execute(
    `SELECT o.*, t.issue_description AS ticket_description
     FROM overtime_requests o
     LEFT JOIN tickets t ON o.ticket_id = t.id
     WHERE o.teknisi_id = ? AND o.status = ? 
       AND MONTH(o.overtime_date) = ? AND YEAR(o.overtime_date) = ?
     ORDER BY o.overtime_date ASC`,
    [teknisiId, OVERTIME_STATUS.APPROVED, month, year]
  );

  const totalHours = rows.reduce((sum, r) => sum + (parseFloat(r.approved_hours) || 0), 0);
  const totalCompensation = rows.reduce((sum, r) => sum + (parseFloat(r.compensation_amount) || 0), 0);

  return { total_hours: totalHours, total_compensation: totalCompensation, records: rows };
}

/**
 * Find a pending overtime request for a specific ticket and technician.
 * Used to prevent duplicate overtime requests.
 * @param {number} ticketId
 * @param {number} teknisiId
 * @returns {Promise<object|null>} Existing pending request or null
 */
async function findPendingByTicketAndTeknisi(ticketId, teknisiId) {
  const [rows] = await appPool.execute(
    `SELECT * FROM overtime_requests 
     WHERE ticket_id = ? AND teknisi_id = ? AND status = ?
     LIMIT 1`,
    [ticketId, teknisiId, OVERTIME_STATUS.REQUESTED]
  );
  return rows.length > 0 ? rows[0] : null;
}

module.exports = {
  OVERTIME_STATUS,
  findById,
  findByTicketId,
  findByTeknisiId,
  findAll,
  create,
  approve,
  reject,
  getApprovedByMonth,
  findPendingByTicketAndTeknisi,
};
