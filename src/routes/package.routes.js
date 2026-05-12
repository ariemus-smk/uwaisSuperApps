/**
 * Package routes.
 * GET    /api/packages          - List all packages (all authenticated users)
 * GET    /api/packages/:id      - Get package by ID (all authenticated users)
 * POST   /api/packages          - Create a new package (Superadmin only)
 * PUT    /api/packages/:id      - Update a package (Superadmin only)
 * DELETE /api/packages/:id      - Delete a package (Superadmin only)
 *
 * All routes require authentication.
 * GET endpoints are accessible to all authenticated users.
 * POST/PUT/DELETE endpoints are restricted to Superadmin role.
 */

const { Router } = require('express');
const Joi = require('joi');
const packageController = require('../controllers/package.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validator');
const { USER_ROLE, PACKAGE_STATUS } = require('../utils/constants');

const router = Router();

// All authenticated roles
const ALL_ROLES = Object.values(USER_ROLE);

// Validation schemas
const createPackageSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  upload_rate_limit: Joi.number().integer().positive().required(),
  download_rate_limit: Joi.number().integer().positive().required(),
  upload_burst_limit: Joi.number().integer().positive().required(),
  download_burst_limit: Joi.number().integer().positive().required(),
  upload_burst_threshold: Joi.number().integer().positive().required(),
  download_burst_threshold: Joi.number().integer().positive().required(),
  monthly_price: Joi.number().positive().required(),
  ppn_enabled: Joi.boolean().default(false),
  fup_enabled: Joi.boolean().default(false),
  fup_quota_gb: Joi.number().integer().positive().allow(null).default(null),
  fup_upload_speed: Joi.number().integer().positive().allow(null).default(null),
  fup_download_speed: Joi.number().integer().positive().allow(null).default(null),
  status: Joi.string().valid(PACKAGE_STATUS.ACTIVE, PACKAGE_STATUS.INACTIVE).default(PACKAGE_STATUS.ACTIVE),
});

const updatePackageSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100),
  upload_rate_limit: Joi.number().integer().positive(),
  download_rate_limit: Joi.number().integer().positive(),
  upload_burst_limit: Joi.number().integer().positive(),
  download_burst_limit: Joi.number().integer().positive(),
  upload_burst_threshold: Joi.number().integer().positive(),
  download_burst_threshold: Joi.number().integer().positive(),
  monthly_price: Joi.number().positive(),
  ppn_enabled: Joi.boolean(),
  fup_enabled: Joi.boolean(),
  fup_quota_gb: Joi.number().integer().positive().allow(null),
  fup_upload_speed: Joi.number().integer().positive().allow(null),
  fup_download_speed: Joi.number().integer().positive().allow(null),
  status: Joi.string().valid(PACKAGE_STATUS.ACTIVE, PACKAGE_STATUS.INACTIVE),
}).min(1);

const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

// Routes

// GET /api/packages - All authenticated users
router.get(
  '/',
  authenticate,
  authorize(...ALL_ROLES),
  packageController.list
);

// GET /api/packages/:id - All authenticated users
router.get(
  '/:id',
  authenticate,
  authorize(...ALL_ROLES),
  validate(idParamSchema, 'params'),
  packageController.getById
);

// POST /api/packages - Superadmin only
router.post(
  '/',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(createPackageSchema, 'body'),
  packageController.create
);

// PUT /api/packages/:id - Superadmin only
router.put(
  '/:id',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(idParamSchema, 'params'),
  validate(updatePackageSchema, 'body'),
  packageController.update
);

// DELETE /api/packages/:id - Superadmin only
router.delete(
  '/:id',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(idParamSchema, 'params'),
  packageController.remove
);

module.exports = router;
