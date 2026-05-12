/**
 * Payroll Report model for App DB.
 * Provides data access methods for the `payroll_reports` table.
 * Supports approval workflow: Draft → PendingApproval → Approved | Revised
 *
 * Requirements: 40.1, 40.2, 40.3, 40.4, 40.5
 */

const { appPool } = require('../config/database');

/**
 * Payroll report status values.
 */
const PAYROLL_STATUS = Object.freeze({
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'PendingApproval',
  APPROVED: 'Approved',
  REVISED: 'Revised',
});

/**
 * Find a payroll report by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Payroll report record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    `SELECT pr.*, u.full_name AS approved_by_name
     FROM payroll_reports pr
     LEFT JOIN users u ON pr.approved_by = u.id
     WHERE pr.id = ? LIMIT 1`,
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find a payroll report by period.
 * Used to prevent duplicate reports for the same period.
 * @param {string} period - YYYY-MM
 * @returns {Promise<object|null>} Payroll report record or null
 */
async function findByPeriod(period) {
  const [rows] = await appPool.execute(
    'SELECT * FROM payroll_reports WHERE period = ? LIMIT 1',
    [period]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * List payroll reports with optional filters and pagination.
 * @param {object} [filters={}] - Optional filters
 * @param {string} [filters.period] - Filter by period (YYYY-MM)
 * @param {string} [filters.status] - Filter by status
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @returns {Promise<{reports: Array, total: number}>} Paginated payroll reports
 */
async function findAll(filters = {}) {
  const { period, status, page = 1, limit = 20 } = filters;

  let countQuery = 'SELECT COUNT(*) as total FROM payroll_reports WHERE 1=1';
  let dataQuery = `SELECT pr.*, u.full_name AS approved_by_name
     FROM payroll_reports pr
     LEFT JOIN users u ON pr.approved_by = u.id
     WHERE 1=1`;
  const params = [];

  if (period) {
    countQuery += ' AND period = ?';
    dataQuery += ' AND pr.period = ?';
    params.push(period);
  }

  if (status) {
    countQuery += ' AND status = ?';
    dataQuery += ' AND pr.status = ?';
    params.push(status);
  }

  const [countRows] = await appPool.execute(countQuery, params);
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  dataQuery += ' ORDER BY pr.created_at DESC LIMIT ? OFFSET ?';
  const dataParams = [...params, String(limit), String(offset)];

  const [rows] = await appPool.execute(dataQuery, dataParams);

  return { reports: rows, total };
}

/**
 * Create a new payroll report.
 * Initial status is always 'Draft'.
 * @param {object} data - Payroll report data
 * @param {string} data.period - YYYY-MM
 * @param {object|string} data.summary - JSON summary of consolidated data
 * @returns {Promise<object>} Created payroll report with insertId
 */
async function create(data) {
  const { period, summary } = data;
  const summaryStr = typeof summary === 'string' ? summary : JSON.stringify(summary);

  const [result] = await appPool.execute(
    `INSERT INTO payroll_reports (period, status, summary, created_at)
     VALUES (?, ?, ?, NOW())`,
    [period, PAYROLL_STATUS.DRAFT, summaryStr]
  );

  return { id: result.insertId, period, status: PAYROLL_STATUS.DRAFT, summary: summaryStr };
}

/**
 * Update payroll report status to PendingApproval.
 * @param {number} id - Payroll report ID
 * @returns {Promise<object>} Query result
 */
async function submitForApproval(id) {
  const [result] = await appPool.execute(
    `UPDATE payroll_reports SET status = ? WHERE id = ? AND status IN (?, ?)`,
    [PAYROLL_STATUS.PENDING_APPROVAL, id, PAYROLL_STATUS.DRAFT, PAYROLL_STATUS.REVISED]
  );
  return result;
}

/**
 * Approve a payroll report.
 * Sets status to Approved, records approver and timestamp.
 * @param {number} id - Payroll report ID
 * @param {number} approvedBy - Approver user ID
 * @returns {Promise<object>} Query result
 */
async function approve(id, approvedBy) {
  const [result] = await appPool.execute(
    `UPDATE payroll_reports 
     SET status = ?, approved_by = ?, approved_at = NOW()
     WHERE id = ? AND status = ?`,
    [PAYROLL_STATUS.APPROVED, approvedBy, id, PAYROLL_STATUS.PENDING_APPROVAL]
  );
  return result;
}

/**
 * Revise a payroll report (request revision).
 * Sets status back to Revised for recalculation.
 * @param {number} id - Payroll report ID
 * @returns {Promise<object>} Query result
 */
async function revise(id) {
  const [result] = await appPool.execute(
    `UPDATE payroll_reports 
     SET status = ?, approved_by = NULL, approved_at = NULL
     WHERE id = ? AND status = ?`,
    [PAYROLL_STATUS.REVISED, id, PAYROLL_STATUS.PENDING_APPROVAL]
  );
  return result;
}

/**
 * Update the summary data of a payroll report.
 * Used when recalculating after revision.
 * @param {number} id - Payroll report ID
 * @param {object|string} summary - Updated JSON summary
 * @returns {Promise<object>} Query result
 */
async function updateSummary(id, summary) {
  const summaryStr = typeof summary === 'string' ? summary : JSON.stringify(summary);

  const [result] = await appPool.execute(
    `UPDATE payroll_reports SET summary = ? WHERE id = ? AND status IN (?, ?)`,
    [summaryStr, id, PAYROLL_STATUS.DRAFT, PAYROLL_STATUS.REVISED]
  );
  return result;
}

module.exports = {
  PAYROLL_STATUS,
  findById,
  findByPeriod,
  findAll,
  create,
  submitForApproval,
  approve,
  revise,
  updateSummary,
};
