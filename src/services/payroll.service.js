/**
 * Payroll service.
 * Handles business logic for payroll report generation, approval workflow,
 * and salary slip retrieval.
 *
 * - generateReport: consolidates KPI scores + overtime data for a given period
 * - approve: approves a payroll report (Superadmin only)
 * - revise: requests revision of a payroll report
 * - getReports: lists payroll reports with pagination
 * - getSlip: retrieves individual employee salary slip data
 *
 * Requirements: 40.1, 40.2, 40.3, 40.4, 40.5
 */

const payrollModel = require('../models/payroll.model');
const kpiModel = require('../models/kpi.model');
const overtimeModel = require('../models/overtime.model');
const { ERROR_CODE } = require('../utils/constants');
const { appPool } = require('../config/database');

/**
 * Generate a monthly payroll report consolidating KPI scores and overtime data.
 * Creates a new report or recalculates an existing revised report.
 *
 * Requirements: 40.1, 40.3
 *
 * @param {string} period - Period in YYYY-MM format
 * @returns {Promise<object>} Generated payroll report
 * @throws {Error} If report already exists and is not in Revised status
 */
async function generateReport(period) {
  // Validate period format
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw Object.assign(new Error('Period must be in YYYY-MM format.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Check if report already exists
  const existing = await payrollModel.findByPeriod(period);

  if (existing && existing.status !== payrollModel.PAYROLL_STATUS.REVISED) {
    throw Object.assign(new Error('Payroll report for this period already exists. Only revised reports can be regenerated.'), {
      statusCode: 409,
      code: ERROR_CODE.RESOURCE_CONFLICT,
    });
  }

  // Parse period into month and year
  const [yearStr, monthStr] = period.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  // Fetch all employees (users with roles that have KPI/overtime)
  const [employees] = await appPool.execute(
    `SELECT id, full_name, role, branch_id FROM users WHERE status = 'Active' AND role IN ('Sales', 'Teknisi', 'Admin', 'Accounting')`,
    []
  );

  // Consolidate data per employee
  const employeeData = [];

  for (const employee of employees) {
    // Get KPI score for this period
    const kpiScore = await kpiModel.findByUserAndPeriod(employee.id, period);

    // Get approved overtime for this period
    const overtime = await overtimeModel.getApprovedByMonth(employee.id, month, year);

    const kpiReward = kpiScore && kpiScore.reward_eligible ? parseFloat(kpiScore.reward_amount) || 0 : 0;
    const overtimeCompensation = overtime.total_compensation || 0;
    const totalCompensation = kpiReward + overtimeCompensation;

    employeeData.push({
      user_id: employee.id,
      full_name: employee.full_name,
      role: employee.role,
      branch_id: employee.branch_id,
      kpi_score: kpiScore ? parseFloat(kpiScore.score_percentage) || 0 : 0,
      kpi_reward_eligible: kpiScore ? Boolean(kpiScore.reward_eligible) : false,
      kpi_reward_amount: kpiReward,
      overtime_hours: overtime.total_hours,
      overtime_compensation: overtimeCompensation,
      total_additional_compensation: totalCompensation,
    });
  }

  // Build summary
  const summary = {
    period,
    generated_at: new Date().toISOString(),
    total_employees: employeeData.length,
    total_kpi_rewards: employeeData.reduce((sum, e) => sum + e.kpi_reward_amount, 0),
    total_overtime_compensation: employeeData.reduce((sum, e) => sum + e.overtime_compensation, 0),
    total_additional_compensation: employeeData.reduce((sum, e) => sum + e.total_additional_compensation, 0),
    employees: employeeData,
  };

  // Create or update report
  if (existing && existing.status === payrollModel.PAYROLL_STATUS.REVISED) {
    // Update existing revised report
    await payrollModel.updateSummary(existing.id, summary);
    // Submit for approval again
    await payrollModel.submitForApproval(existing.id);
    return await payrollModel.findById(existing.id);
  }

  // Create new report
  const report = await payrollModel.create({ period, summary });
  // Submit for approval
  await payrollModel.submitForApproval(report.id);
  return await payrollModel.findById(report.id);
}

/**
 * Get payroll reports with pagination and optional filters.
 *
 * Requirements: 40.4
 *
 * @param {object} [options={}] - Query options
 * @param {string} [options.period] - Filter by period (YYYY-MM)
 * @param {string} [options.status] - Filter by status
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=20] - Items per page
 * @returns {Promise<{reports: Array, pagination: object}>} Paginated payroll reports
 */
async function getReports(options = {}) {
  const { period, status, page = 1, limit = 20 } = options;

  const filters = { page, limit };

  if (period) {
    filters.period = period;
  }

  if (status) {
    filters.status = status;
  }

  const { reports, total } = await payrollModel.findAll(filters);

  const totalPages = Math.ceil(total / limit);

  return {
    reports,
    pagination: {
      page,
      limit,
      totalItems: total,
      totalPages,
    },
  };
}

/**
 * Approve a payroll report.
 * Only reports in PendingApproval status can be approved.
 *
 * Requirements: 40.2, 40.4
 *
 * @param {number} reportId - Payroll report ID
 * @param {number} approvedBy - Approver user ID (Superadmin)
 * @returns {Promise<object>} Updated payroll report
 * @throws {Error} If report not found or not in PendingApproval status
 */
async function approve(reportId, approvedBy) {
  const report = await payrollModel.findById(reportId);

  if (!report) {
    throw Object.assign(new Error('Payroll report not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (report.status !== payrollModel.PAYROLL_STATUS.PENDING_APPROVAL) {
    throw Object.assign(new Error(`Cannot approve report with status '${report.status}'. Only PendingApproval reports can be approved.`), {
      statusCode: 400,
      code: ERROR_CODE.INVALID_STATUS_TRANSITION,
    });
  }

  const result = await payrollModel.approve(reportId, approvedBy);

  if (result.affectedRows === 0) {
    throw Object.assign(new Error('Failed to approve payroll report.'), {
      statusCode: 500,
      code: ERROR_CODE.INTERNAL_ERROR,
    });
  }

  return await payrollModel.findById(reportId);
}

/**
 * Request revision of a payroll report.
 * Only reports in PendingApproval status can be revised.
 *
 * Requirements: 40.3
 *
 * @param {number} reportId - Payroll report ID
 * @returns {Promise<object>} Updated payroll report
 * @throws {Error} If report not found or not in PendingApproval status
 */
async function revise(reportId) {
  const report = await payrollModel.findById(reportId);

  if (!report) {
    throw Object.assign(new Error('Payroll report not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (report.status !== payrollModel.PAYROLL_STATUS.PENDING_APPROVAL) {
    throw Object.assign(new Error(`Cannot revise report with status '${report.status}'. Only PendingApproval reports can be revised.`), {
      statusCode: 400,
      code: ERROR_CODE.INVALID_STATUS_TRANSITION,
    });
  }

  const result = await payrollModel.revise(reportId);

  if (result.affectedRows === 0) {
    throw Object.assign(new Error('Failed to revise payroll report.'), {
      statusCode: 500,
      code: ERROR_CODE.INTERNAL_ERROR,
    });
  }

  return await payrollModel.findById(reportId);
}

/**
 * Get salary slip data for a specific employee.
 * Returns KPI and overtime data from the latest approved payroll report
 * or from a specific period.
 *
 * Requirements: 40.5
 *
 * @param {number} userId - Employee user ID
 * @param {object} [options={}] - Query options
 * @param {string} [options.period] - Specific period (YYYY-MM), defaults to latest approved
 * @returns {Promise<object>} Salary slip data
 * @throws {Error} If user not found or no approved payroll report exists
 */
async function getSlip(userId, options = {}) {
  const { period } = options;

  // Validate user exists
  const [userRows] = await appPool.execute(
    'SELECT id, full_name, role, branch_id FROM users WHERE id = ? LIMIT 1',
    [userId]
  );

  if (userRows.length === 0) {
    throw Object.assign(new Error('User not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  const user = userRows[0];

  // Find the payroll report
  let report;
  if (period) {
    report = await payrollModel.findByPeriod(period);
  } else {
    // Get latest approved report
    const { reports } = await payrollModel.findAll({ status: payrollModel.PAYROLL_STATUS.APPROVED, page: 1, limit: 1 });
    report = reports.length > 0 ? reports[0] : null;
  }

  if (!report) {
    throw Object.assign(new Error('No approved payroll report found for the specified period.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (report.status !== payrollModel.PAYROLL_STATUS.APPROVED) {
    throw Object.assign(new Error('Payroll report for this period has not been approved yet.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Parse summary and find employee data
  let summary;
  try {
    summary = typeof report.summary === 'string' ? JSON.parse(report.summary) : report.summary;
  } catch (e) {
    throw Object.assign(new Error('Failed to parse payroll report data.'), {
      statusCode: 500,
      code: ERROR_CODE.INTERNAL_ERROR,
    });
  }

  const employeeSlip = summary.employees
    ? summary.employees.find(e => e.user_id === userId)
    : null;

  if (!employeeSlip) {
    throw Object.assign(new Error('Employee data not found in payroll report for this period.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  return {
    user,
    period: report.period,
    report_id: report.id,
    approved_at: report.approved_at,
    slip: employeeSlip,
  };
}

module.exports = {
  generateReport,
  getReports,
  approve,
  revise,
  getSlip,
};
