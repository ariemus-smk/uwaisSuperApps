/**
 * Infrastructure routes.
 * GET    /api/infrastructure/olts          - List all OLTs
 * POST   /api/infrastructure/olts          - Register a new OLT
 * PUT    /api/infrastructure/olts/:id      - Update an OLT
 * POST   /api/infrastructure/olts/:id/test - Test OLT connectivity
 * GET    /api/infrastructure/odps          - List all ODPs
 * POST   /api/infrastructure/odps          - Register a new ODP
 * PUT    /api/infrastructure/odps/:id      - Update an ODP
 * GET    /api/infrastructure/coverage      - Check coverage at GPS coordinates
 *
 * Requirements: 28.1, 28.2, 28.3, 28.4, 29.1, 47.1
 */

const { Router } = require('express');
const Joi = require('joi');
const infrastructureController = require('../controllers/infrastructure.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validator');
const { USER_ROLE } = require('../utils/constants');

const router = Router();

// ============================================================
// OLT Validation Schemas
// ============================================================

const createOltSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  ip_address: Joi.string().trim().ip({ version: ['ipv4'] }).required(),
  total_pon_ports: Joi.number().integer().min(1).max(128).required(),
  branch_id: Joi.number().integer().positive().required(),
});

const updateOltSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100),
  ip_address: Joi.string().trim().ip({ version: ['ipv4'] }),
  total_pon_ports: Joi.number().integer().min(1).max(128),
  branch_id: Joi.number().integer().positive(),
  status: Joi.string().valid('Active', 'Inactive'),
}).min(1);

const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const listOltsQuerySchema = Joi.object({
  branch_id: Joi.number().integer().positive(),
  status: Joi.string().valid('Active', 'Inactive'),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
});

// ============================================================
// ODP Validation Schemas
// ============================================================

const createOdpSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  total_ports: Joi.number().integer().min(1).max(256).required(),
  olt_id: Joi.number().integer().positive().required(),
  olt_pon_port: Joi.number().integer().min(1).max(128).required(),
  branch_id: Joi.number().integer().positive().required(),
});

const updateOdpSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100),
  latitude: Joi.number().min(-90).max(90),
  longitude: Joi.number().min(-180).max(180),
  total_ports: Joi.number().integer().min(1).max(256),
  olt_id: Joi.number().integer().positive(),
  olt_pon_port: Joi.number().integer().min(1).max(128),
  branch_id: Joi.number().integer().positive(),
  status: Joi.string().valid('Active', 'Inactive'),
}).min(1);

const listOdpsQuerySchema = Joi.object({
  branch_id: Joi.number().integer().positive(),
  olt_id: Joi.number().integer().positive(),
  status: Joi.string().valid('Active', 'Inactive'),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
});

// ============================================================
// Coverage Validation Schema
// ============================================================

const coverageQuerySchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  radius_meters: Joi.number().integer().min(1).max(50000),
});

// ============================================================
// OLT Routes
// ============================================================

// GET /api/infrastructure/olts - Admin, Superadmin, Teknisi, Sales
router.get(
  '/olts',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN, USER_ROLE.TEKNISI, USER_ROLE.SALES),
  validate(listOltsQuerySchema, 'query'),
  infrastructureController.listOlts
);

// POST /api/infrastructure/olts - Superadmin only
router.post(
  '/olts',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(createOltSchema, 'body'),
  infrastructureController.registerOlt
);

// PUT /api/infrastructure/olts/:id - Superadmin only
router.put(
  '/olts/:id',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(idParamSchema, 'params'),
  validate(updateOltSchema, 'body'),
  infrastructureController.updateOlt
);

// POST /api/infrastructure/olts/:id/test - Superadmin only
router.post(
  '/olts/:id/test',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(idParamSchema, 'params'),
  infrastructureController.testOltConnectivity
);

// DELETE /api/infrastructure/olts/:id - Superadmin only
router.delete(
  '/olts/:id',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(idParamSchema, 'params'),
  infrastructureController.deleteOlt
);

// ============================================================
// ODP Routes
// ============================================================

// GET /api/infrastructure/odps - Admin, Teknisi, Sales
router.get(
  '/odps',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN, USER_ROLE.TEKNISI, USER_ROLE.SALES),
  validate(listOdpsQuerySchema, 'query'),
  infrastructureController.listOdps
);

// POST /api/infrastructure/odps - Admin, Teknisi
router.post(
  '/odps',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN, USER_ROLE.TEKNISI),
  validate(createOdpSchema, 'body'),
  infrastructureController.createOdp
);

// PUT /api/infrastructure/odps/:id - Admin
router.put(
  '/odps/:id',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN),
  validate(idParamSchema, 'params'),
  validate(updateOdpSchema, 'body'),
  infrastructureController.updateOdp
);

// DELETE /api/infrastructure/odps/:id - Admin, Superadmin, Teknisi
router.delete(
  '/odps/:id',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN, USER_ROLE.TEKNISI),
  validate(idParamSchema, 'params'),
  infrastructureController.deleteOdp
);

// ============================================================
// Coverage Routes
// ============================================================

// GET /api/infrastructure/coverage - Sales, Mitra, Teknisi, Admin
router.get(
  '/coverage',
  authenticate,
  authorize(USER_ROLE.SALES, USER_ROLE.MITRA, USER_ROLE.TEKNISI, USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN),
  validate(coverageQuerySchema, 'query'),
  infrastructureController.checkCoverage
);

module.exports = router;
