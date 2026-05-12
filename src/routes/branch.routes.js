/**
 * Branch routes.
 * GET    /api/branches          - List all branches
 * GET    /api/branches/:id      - Get branch by ID
 * POST   /api/branches          - Create a new branch
 * PUT    /api/branches/:id      - Update a branch
 * PATCH  /api/branches/:id/status - Activate/deactivate a branch
 *
 * All routes require authentication and Superadmin role (except GET which also allows Admin).
 */

const { Router } = require('express');
const Joi = require('joi');
const branchController = require('../controllers/branch.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validator');
const { USER_ROLE, BRANCH_STATUS } = require('../utils/constants');

const router = Router();

// Validation schemas
const createBranchSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  address: Joi.string().trim().min(5).max(500).required(),
  contact_phone: Joi.string().trim().min(8).max(20).required(),
  contact_email: Joi.string().trim().email().required(),
});

const updateBranchSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100),
  address: Joi.string().trim().min(5).max(500),
  contact_phone: Joi.string().trim().min(8).max(20),
  contact_email: Joi.string().trim().email(),
}).min(1);

const updateStatusSchema = Joi.object({
  status: Joi.string().valid(BRANCH_STATUS.ACTIVE, BRANCH_STATUS.INACTIVE).required(),
});

const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

// Routes
router.get(
  '/',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN),
  branchController.list
);

router.get(
  '/:id',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN),
  validate(idParamSchema, 'params'),
  branchController.getById
);

router.post(
  '/',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(createBranchSchema, 'body'),
  branchController.create
);

router.put(
  '/:id',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(idParamSchema, 'params'),
  validate(updateBranchSchema, 'body'),
  branchController.update
);

router.patch(
  '/:id/status',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(idParamSchema, 'params'),
  validate(updateStatusSchema, 'body'),
  branchController.updateStatus
);

module.exports = router;
