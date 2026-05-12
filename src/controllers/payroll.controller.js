/**
 * Payroll controller.
 * Handles HTTP requests for payroll report endpoints.
 *
 * Requirements: 40.1, 40.2, 40.3, 40.4, 40.5
 */

const payrollService = require('../services/payroll.service');
const { success, paginated, error } = require('../utils/responseHelper');
const { ERROR_CODE } = require('../utils/constants');

/**
 * GET /api/payroll/reports
 * Get payroll reports with pagination and optional filters.
 */
async function getReports(req, res) {
  try {
    const { period, status, page, limit } = req.query;

    const options = {
      period,
      status,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    };

    const result = await payrollService.getReports(options);

    return paginated(res, result.reports, result.pagination, 'Payroll reports retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/payroll/reports/generate
 * Generate a payroll report for a given period.
 */
async function generateReport(req, res) {
  try {
    const { period } = req.body;

    const report = await payrollService.generateReport(period);

    return success(res, report, 'Payroll report generated successfully.', 201);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PATCH /api/payroll/reports/:id/approve
 * Approve a payroll report.
 */
async function approveReport(req, res) {
  try {
    const { id } = req.params;
    const approvedBy = req.user.id;

    const report = await payrollService.approve(Number(id), approvedBy);

    return success(res, report, 'Payroll report approved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PATCH /api/payroll/reports/:id/revise
 * Request revision of a payroll report.
 */
async function reviseReport(req, res) {
  try {
    const { id } = req.params;

    const report = await payrollService.revise(Number(id));

    return success(res, report, 'Payroll report sent back for revision.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/payroll/slips/:userId
 * Get salary slip for a specific employee.
 */
async function getSlip(req, res) {
  try {
    const { userId } = req.params;
    const { period } = req.query;

    const options = {};
    if (period) {
      options.period = period;
    }

    const slip = await payrollService.getSlip(Number(userId), options);

    return success(res, slip, 'Salary slip retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

module.exports = {
  getReports,
  generateReport,
  approveReport,
  reviseReport,
  getSlip,
};
