/**
 * User management routes.
 * All endpoints require Superadmin role.
 *
 * GET    /api/users          - List users (with filters)
 * GET    /api/users/:id      - Get user by ID
 * POST   /api/users          - Create user
 * PUT    /api/users/:id      - Update user
 * PATCH  /api/users/:id/status - Activate/deactivate user
 */

const { Router } = require('express');
const Joi = require('joi');
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validator');
const { USER_ROLE } = require('../utils/constants');

const router = Router();

// All user management routes require authentication + Superadmin role
router.use(authenticate);
router.use(authorize(USER_ROLE.SUPERADMIN));

// Validation schemas
const createUserSchema = Joi.object({
  username: Joi.string().min(3).max(50).required(),
  password: Joi.string().min(6).max(100).required(),
  full_name: Joi.string().min(1).max(100).required(),
  role: Joi.string().valid(...Object.values(USER_ROLE)).required(),
  branch_id: Joi.number().integer().positive().allow(null).optional(),
  profit_sharing_pct: Joi.number().min(0).max(100).allow(null).optional(),
  commission_amount: Joi.number().min(0).allow(null).optional(),
});

const updateUserSchema = Joi.object({
  full_name: Joi.string().min(1).max(100).optional(),
  role: Joi.string().valid(...Object.values(USER_ROLE)).optional(),
  branch_id: Joi.number().integer().positive().allow(null).optional(),
  profit_sharing_pct: Joi.number().min(0).max(100).allow(null).optional(),
  commission_amount: Joi.number().min(0).allow(null).optional(),
}).min(1);

const updateStatusSchema = Joi.object({
  status: Joi.string().valid('Active', 'Inactive').required(),
});

const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

// Routes
router.get('/', userController.listUsers);
router.get('/:id', validate(idParamSchema, 'params'), userController.getUser);
router.post('/', validate(createUserSchema, 'body'), userController.createUser);
router.put('/:id', validate(idParamSchema, 'params'), validate(updateUserSchema, 'body'), userController.updateUser);
router.patch('/:id/status', validate(idParamSchema, 'params'), validate(updateStatusSchema, 'body'), userController.updateUserStatus);

module.exports = router;
