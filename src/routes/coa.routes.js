/**
 * CoA/POD engine routes.
 * POST   /api/coa/kick          - Disconnect PPPoE session (POD)
 * POST   /api/coa/speed-change  - Apply speed change via CoA
 * POST   /api/coa/isolir        - Manually isolir a customer
 * POST   /api/coa/unisolir      - Manually remove isolir
 * GET    /api/coa/logs          - Get CoA operation logs
 *
 * RBAC:
 * - POST kick, speed-change, isolir, unisolir: Admin only
 * - GET logs: Admin, Superadmin
 *
 * Requirements: 13.1, 13.2, 13.5
 */

const { Router } = require('express');
const Joi = require('joi');
const coaController = require('../controllers/coa.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validator');
const { USER_ROLE, COA_TRIGGER_TYPE, COA_RESPONSE_STATUS } = require('../utils/constants');

const router = Router();

// Validation schemas

const kickSchema = Joi.object({
  subscription_id: Joi.number().integer().positive().required(),
  nas_id: Joi.number().integer().positive().required(),
  username: Joi.string().trim().min(1).max(255).required(),
});

const speedChangeSchema = Joi.object({
  subscription_id: Joi.number().integer().positive().required(),
  nas_id: Joi.number().integer().positive().required(),
  username: Joi.string().trim().min(1).max(255).required(),
  rateLimit: Joi.string().trim().min(1).max(255).required(),
});

const isolirSchema = Joi.object({
  subscription_id: Joi.number().integer().positive().required(),
  nas_id: Joi.number().integer().positive().required(),
  username: Joi.string().trim().min(1).max(255).required(),
});

const unisolirSchema = Joi.object({
  subscription_id: Joi.number().integer().positive().required(),
  nas_id: Joi.number().integer().positive().required(),
  username: Joi.string().trim().min(1).max(255).required(),
});

const logsQuerySchema = Joi.object({
  subscription_id: Joi.number().integer().positive().optional(),
  nas_id: Joi.number().integer().positive().optional(),
  trigger_type: Joi.string()
    .valid(
      COA_TRIGGER_TYPE.SPEED_CHANGE,
      COA_TRIGGER_TYPE.ISOLIR,
      COA_TRIGGER_TYPE.UNISOLIR,
      COA_TRIGGER_TYPE.FUP,
      COA_TRIGGER_TYPE.KICK
    )
    .optional(),
  response_status: Joi.string()
    .valid(
      COA_RESPONSE_STATUS.ACK,
      COA_RESPONSE_STATUS.NAK,
      COA_RESPONSE_STATUS.TIMEOUT,
      COA_RESPONSE_STATUS.PENDING
    )
    .optional(),
  from_date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to_date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  page: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().positive().max(100).optional(),
});

// Routes

// POST /api/coa/kick - Disconnect PPPoE session (Admin only)
router.post(
  '/kick',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(kickSchema, 'body'),
  coaController.kick
);

// POST /api/coa/speed-change - Apply speed change via CoA (Admin only)
router.post(
  '/speed-change',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(speedChangeSchema, 'body'),
  coaController.speedChange
);

// POST /api/coa/isolir - Manually isolir a customer (Admin only)
router.post(
  '/isolir',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(isolirSchema, 'body'),
  coaController.isolir
);

// POST /api/coa/unisolir - Manually remove isolir (Admin only)
router.post(
  '/unisolir',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(unisolirSchema, 'body'),
  coaController.unisolir
);

// GET /api/coa/logs - Get CoA operation logs (Admin, Superadmin)
router.get(
  '/logs',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN),
  validate(logsQuerySchema, 'query'),
  coaController.getLogs
);

module.exports = router;
