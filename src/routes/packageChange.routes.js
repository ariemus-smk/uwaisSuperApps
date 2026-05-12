/**
 * Package Change routes.
 * POST   /api/package-change/request       - Submit a package change request
 * GET    /api/package-change               - List package change requests
 * PATCH  /api/package-change/:id/approve   - Approve a package change request
 * PATCH  /api/package-change/:id/reject    - Reject a package change request
 *
 * RBAC:
 * - POST request: Pelanggan, Sales, Mitra
 * - GET list: Admin
 * - PATCH approve: Admin
 * - PATCH reject: Admin
 *
 * Requirements: 17.3, 17.4, 17.5
 */

const { Router } = require('express');
const Joi = require('joi');
const packageChangeController = require('../controllers/packageChange.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validator');
const { USER_ROLE } = require('../utils/constants');

const router = Router();

// Validation schemas
const requestPackageChangeSchema = Joi.object({
  subscription_id: Joi.number().integer().positive().required(),
  requested_package_id: Joi.number().integer().positive().required(),
});

const packageChangeIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const rejectPackageChangeSchema = Joi.object({
  reason: Joi.string().trim().min(3).max(500).required(),
});

const listPackageChangeQuerySchema = Joi.object({
  status: Joi.string().valid('Pending', 'Approved', 'Rejected').optional(),
  subscription_id: Joi.number().integer().positive().optional(),
  page: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().positive().max(100).optional(),
});

// Routes

// POST /api/package-change/request - Submit a package change request
router.post(
  '/request',
  authenticate,
  authorize(USER_ROLE.PELANGGAN, USER_ROLE.SALES, USER_ROLE.MITRA),
  validate(requestPackageChangeSchema, 'body'),
  packageChangeController.requestPackageChange
);

// GET /api/package-change - List package change requests
router.get(
  '/',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(listPackageChangeQuerySchema, 'query'),
  packageChangeController.listPackageChangeRequests
);

// PATCH /api/package-change/:id/approve - Approve a package change request
router.patch(
  '/:id/approve',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(packageChangeIdParamSchema, 'params'),
  packageChangeController.approvePackageChange
);

// PATCH /api/package-change/:id/reject - Reject a package change request
router.patch(
  '/:id/reject',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(packageChangeIdParamSchema, 'params'),
  validate(rejectPackageChangeSchema, 'body'),
  packageChangeController.rejectPackageChange
);

module.exports = router;
