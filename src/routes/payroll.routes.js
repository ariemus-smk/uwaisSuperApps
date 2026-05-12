/**
 * Payroll routes.
 * GET    /api/payroll/reports              - Get payroll reports (Superadmin)
 * POST   /api/payroll/reports/generate     - Generate payroll report (Superadmin)
 * PATCH  /api/payroll/reports/:id/approve  - Approve payroll report (Superadmin)
 * PATCH  /api/payroll/reports/:id/revise   - Request revision (Superadmin)
 * GET    /api/payroll/slips/:userId        - Get salary slip (Superadmin, Admin)
 *
 * Requirements: 40.1, 40.2, 40.3, 40.4, 40.5
 */

const { Router } = require('express');
const Joi = require('joi');
const payrollController = require('../controllers/payroll.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validator');
const { USER_ROLE } = require('../utils/constants');

const router = Router();

// Validation schemas
const reportsQuerySchema = Joi.object({
  period: Joi.string().pattern(/^\d{4}-\d{2}$/).optional(),
  status: Joi.string().valid('Draft', 'PendingApproval', 'Approved', 'Revised').optional(),
  page: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().positive().max(100).optional(),
});

const generateBodySchema = Joi.object({
  period: Joi.string().pattern(/^\d{4}-\d{2}$/).required(),
});

const reportIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const slipParamSchema = Joi.object({
  userId: Joi.number().integer().positive().required(),
});

const slipQuerySchema = Joi.object({
  period: Joi.string().pattern(/^\d{4}-\d{2}$/).optional(),
});

// Routes

// GET /api/payroll/reports - List payroll reports
router.get(
  '/reports',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(reportsQuerySchema, 'query'),
  payrollController.getReports
);

// POST /api/payroll/reports/generate - Generate payroll report
router.post(
  '/reports/generate',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(generateBodySchema, 'body'),
  payrollController.generateReport
);

// PATCH /api/payroll/reports/:id/approve - Approve payroll report
router.patch(
  '/reports/:id/approve',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(reportIdParamSchema, 'params'),
  payrollController.approveReport
);

// PATCH /api/payroll/reports/:id/revise - Request revision
router.patch(
  '/reports/:id/revise',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(reportIdParamSchema, 'params'),
  payrollController.reviseReport
);

// GET /api/payroll/slips/:userId - Get salary slip
router.get(
  '/slips/:userId',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN),
  validate(slipParamSchema, 'params'),
  validate(slipQuerySchema, 'query'),
  payrollController.getSlip
);

module.exports = router;
