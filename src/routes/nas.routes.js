/**
 * NAS management routes.
 * GET    /api/nas              - List NAS devices (Superadmin, Admin)
 * GET    /api/nas/monitoring   - NAS health status dashboard (Admin, Superadmin)
 * GET    /api/nas/:id          - Get NAS detail (Superadmin, Admin)
 * POST   /api/nas              - Register new NAS (Superadmin)
 * PUT    /api/nas/:id          - Update NAS (Superadmin)
 * GET    /api/nas/:id/script   - Download config script (Superadmin)
 * POST   /api/nas/:id/test     - Test NAS connectivity (Superadmin)
 *
 * Requirements: 12.4, 12.5, 14.2
 */

const { Router } = require('express');
const Joi = require('joi');
const nasController = require('../controllers/nas.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validator');
const { USER_ROLE, NAS_POLL_STATUS } = require('../utils/constants');

const router = Router();

// Validation schemas

const registerNasSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  ip_address: Joi.string()
    .trim()
    .ip({ version: ['ipv4'] })
    .required(),
  radius_secret: Joi.string().trim().min(6).max(255).required(),
  api_port: Joi.number().integer().min(1).max(65535).default(8728),
  branch_id: Joi.number().integer().positive().required(),
});

const updateNasSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).optional(),
  ip_address: Joi.string()
    .trim()
    .ip({ version: ['ipv4'] })
    .optional(),
  radius_secret: Joi.string().trim().min(6).max(255).optional(),
  api_port: Joi.number().integer().min(1).max(65535).optional(),
  branch_id: Joi.number().integer().positive().optional(),
  vpn_accounts: Joi.object().optional(),
}).min(1);

const listNasQuerySchema = Joi.object({
  branch_id: Joi.number().integer().positive().optional(),
  status: Joi.string().valid('Active', 'Inactive').optional(),
  poll_status: Joi.string().valid(NAS_POLL_STATUS.UP, NAS_POLL_STATUS.DOWN).optional(),
  page: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().positive().max(100).optional(),
});

const monitoringQuerySchema = Joi.object({
  branch_id: Joi.number().integer().positive().optional(),
});

// Routes

// GET /api/nas/monitoring - NAS health status dashboard (Admin, Superadmin)
// NOTE: This must be defined BEFORE /api/nas/:id to avoid "monitoring" being treated as an :id param
router.get(
  '/monitoring',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN),
  validate(monitoringQuerySchema, 'query'),
  nasController.getMonitoring
);

// GET /api/nas - List NAS devices (Superadmin, Admin)
router.get(
  '/',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN),
  validate(listNasQuerySchema, 'query'),
  nasController.listNas
);

// GET /api/nas/:id - Get NAS detail (Superadmin, Admin)
router.get(
  '/:id',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN),
  nasController.getNas
);

// POST /api/nas - Register new NAS (Superadmin only)
router.post(
  '/',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(registerNasSchema, 'body'),
  nasController.registerNas
);

// PUT /api/nas/:id - Update NAS (Superadmin only)
router.put(
  '/:id',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(updateNasSchema, 'body'),
  nasController.updateNas
);

// GET /api/nas/:id/script - Download config script (Superadmin only)
router.get(
  '/:id/script',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  nasController.getScript
);

// POST /api/nas/:id/test - Test NAS connectivity (Superadmin only)
router.post(
  '/:id/test',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  nasController.testConnectivity
);

module.exports = router;
