/**
 * Scheduler routes.
 * GET    /api/scheduler/jobs           - List all registered scheduled jobs
 * GET    /api/scheduler/logs           - Job execution history (paginated)
 * POST   /api/scheduler/jobs/:name/run - Manually trigger a job by name
 *
 * RBAC:
 * - All endpoints: Superadmin only
 *
 * Requirements: 42.4
 */

const { Router } = require('express');
const Joi = require('joi');
const schedulerController = require('../controllers/scheduler.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validator');
const { USER_ROLE } = require('../utils/constants');

const router = Router();

// Validation schemas
const logsQuerySchema = Joi.object({
  job_name: Joi.string().trim().optional(),
  status: Joi.string().valid('Running', 'Success', 'Partial', 'Failed').optional(),
  from_date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to_date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  page: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().positive().max(100).optional(),
});

const jobNameParamSchema = Joi.object({
  name: Joi.string().trim().required(),
});

// Routes

// GET /api/scheduler/jobs - List all registered scheduled jobs
router.get(
  '/jobs',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  schedulerController.getJobs
);

// GET /api/scheduler/logs - Job execution history (paginated)
router.get(
  '/logs',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(logsQuerySchema, 'query'),
  schedulerController.getLogs
);

// POST /api/scheduler/jobs/:name/run - Manually trigger a job by name
router.post(
  '/jobs/:name/run',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(jobNameParamSchema, 'params'),
  schedulerController.runJob
);

module.exports = router;
