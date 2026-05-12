/**
 * Report controller.
 * Handles HTTP requests for Komdigi regulatory reports, financial reports,
 * customer growth reports, and report exports (Excel/PDF).
 *
 * Requirements: 34.1, 35.1, 36.4
 */

const reportService = require('../services/report.service');
const { createGrowthReportPdf } = require('../utils/pdfExport');
const { success, error } = require('../utils/responseHelper');
const { ERROR_CODE } = require('../utils/constants');

/**
 * GET /api/reports/komdigi/packages
 * Generate Komdigi package report listing all active service packages.
 */
async function getKomdigiPackages(req, res) {
  try {
    const data = await reportService.generateKomdigiPackages();
    return success(res, data, 'Komdigi package report generated.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/reports/komdigi/customers
 * Generate Komdigi customer report with subscriber distribution.
 */
async function getKomdigiCustomers(req, res) {
  try {
    const options = {
      period: req.query.period || undefined,
    };
    const data = await reportService.generateKomdigiCustomers(options);
    return success(res, data, 'Komdigi customer report generated.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/reports/komdigi/revenue
 * Generate Komdigi revenue report with payment breakdowns.
 */
async function getKomdigiRevenue(req, res) {
  try {
    const options = {
      period: req.query.period || undefined,
      start_date: req.query.start_date || undefined,
      end_date: req.query.end_date || undefined,
    };
    const data = await reportService.generateKomdigiRevenue(options);
    return success(res, data, 'Komdigi revenue report generated.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/reports/financial
 * Generate financial report (income, receivables, cash advances, reconciliation).
 */
async function getFinancialReport(req, res) {
  try {
    const filters = {
      reportType: req.query.reportType || undefined,
      startDate: req.query.startDate || undefined,
      endDate: req.query.endDate || undefined,
      branchId: req.query.branchId ? Number(req.query.branchId) : undefined,
      paymentMethod: req.query.paymentMethod || undefined,
      handler: req.query.handler || undefined,
    };
    const data = await reportService.generateFinancialReport(filters);
    return success(res, data, 'Financial report generated.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/reports/growth
 * Generate customer growth report with MoM/YoY metrics.
 */
async function getGrowthReport(req, res) {
  try {
    const options = {
      period: req.query.period || undefined,
      startDate: req.query.startDate || undefined,
      endDate: req.query.endDate || undefined,
      groupBy: req.query.groupBy || undefined,
      branchFilter: req.branchFilter || null,
    };
    const data = await reportService.calculateGrowth(options);
    return success(res, data, 'Growth report generated.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/reports/export/:type
 * Export report as Excel or PDF file download.
 * Supported types: komdigi-packages, komdigi-customers, komdigi-revenue, growth
 */
async function exportReport(req, res) {
  try {
    const { type } = req.params;

    switch (type) {
      case 'komdigi-packages': {
        const buffer = await reportService.exportKomdigiPackagesExcel();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="komdigi-packages.xlsx"');
        return res.send(buffer);
      }

      case 'komdigi-customers': {
        const options = {
          period: req.query.period || undefined,
        };
        const buffer = await reportService.exportKomdigiCustomersExcel(options);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="komdigi-customers.xlsx"');
        return res.send(buffer);
      }

      case 'komdigi-revenue': {
        const options = {
          period: req.query.period || undefined,
          start_date: req.query.start_date || undefined,
          end_date: req.query.end_date || undefined,
        };
        const buffer = await reportService.exportKomdigiRevenueExcel(options);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="komdigi-revenue.xlsx"');
        return res.send(buffer);
      }

      case 'growth': {
        const growthOptions = {
          period: req.query.period || undefined,
          startDate: req.query.startDate || undefined,
          endDate: req.query.endDate || undefined,
          groupBy: req.query.groupBy || undefined,
          branchFilter: req.branchFilter || null,
        };
        const growthData = await reportService.calculateGrowth(growthOptions);

        const dateRange = growthOptions.startDate && growthOptions.endDate
          ? `${growthOptions.startDate} - ${growthOptions.endDate}`
          : undefined;

        const buffer = await createGrowthReportPdf(growthData, { dateRange });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="growth-report.pdf"');
        return res.send(buffer);
      }

      default:
        return error(
          res,
          `Invalid export type '${type}'. Valid types: komdigi-packages, komdigi-customers, komdigi-revenue, growth`,
          400,
          null,
          ERROR_CODE.VALIDATION_ERROR
        );
    }
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

module.exports = {
  getKomdigiPackages,
  getKomdigiCustomers,
  getKomdigiRevenue,
  getFinancialReport,
  getGrowthReport,
  exportReport,
};
