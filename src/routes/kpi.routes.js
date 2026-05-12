/**
 * KPI routes.
 * GET    /api/kpi/scores           - Get KPI scores (Superadmin, Admin)
 * GET    /api/kpi/history/:userId  - Get KPI history per employee (Superadmin, Admin)
 *
 * All routes require authentication and Superadmin/Admin role.
 * Branch scoping is applied for Admin users.
 *
 * Requirements: 38.4, 38.5
 */

const { Router } = require('express');
const Joi = require('joi');
const kpiController = require('../controllers/kpi.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { branchScope } = require('../middleware/branchScope');
const { validate } = require('../middleware/validator');
const { USER_ROLE } = require('../utils/constants');

const router = Router();

// Validation schemas
const scoresQuerySchema = Joi.object({
  period: Joi.string().pattern(/^\d{4}-\d{2}$/).optional(),
  role_type: Joi.string().valid('Sales', 'Teknisi').optional(),
  user_id: Joi.number().integer().positive().optional(),
  reward_eligible: Joi.string().valid('true', 'false').optional(),
  page: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().positive().max(100).optional(),
});

const historyParamSchema = Joi.object({
  userId: Joi.number().integer().positive().required(),
});

const historyQuerySchema = Joi.object({
  period_from: Joi.string().pattern(/^\d{4}-\d{2}$/).optional(),
  period_to: Joi.string().pattern(/^\d{4}-\d{2}$/).optional(),
  page: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().positive().max(100).optional(),
});

// Routes
router.get(
  '/scores',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN),
  branchScope,
  validate(scoresQuerySchema, 'query'),
  kpiController.getScores
);

router.get(
  '/history/:userId',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN),
  branchScope,
  validate(historyParamSchema, 'params'),
  validate(historyQuerySchema, 'query'),
  kpiController.getHistory
);

module.exports = router;
