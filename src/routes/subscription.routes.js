/**
 * Subscription routes.
 * GET    /api/subscriptions              - List subscriptions (branch-scoped)
 * GET    /api/subscriptions/:id          - Get subscription by ID
 * POST   /api/subscriptions              - Create a new subscription
 * PUT    /api/subscriptions/:id          - Update subscription
 * POST   /api/subscriptions/:id/activate - Activate subscription (write to RADIUS)
 * POST   /api/subscriptions/:id/installation - Submit installation data (Teknisi)
 *
 * RBAC:
 * - GET list: Admin
 * - GET by ID: Admin, Teknisi
 * - POST create: Admin
 * - PUT update: Admin
 * - POST activate: Admin
 * - POST installation: Teknisi
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 16.4, 16.5
 */

const { Router } = require('express');
const Joi = require('joi');
const subscriptionController = require('../controllers/subscription.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validator');
const { USER_ROLE, SUBSCRIPTION_STATUS } = require('../utils/constants');

const router = Router();

// Validation schemas
const createSubscriptionSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  package_id: Joi.number().integer().positive().required(),
  nas_id: Joi.number().integer().positive().required(),
});

const updateSubscriptionSchema = Joi.object({
  package_id: Joi.number().integer().positive(),
  nas_id: Joi.number().integer().positive(),
}).min(1);

const installationSchema = Joi.object({
  odp_id: Joi.number().integer().positive().allow(null),
  odp_port: Joi.number().integer().positive().allow(null),
  onu_serial_number: Joi.string().trim().max(100).allow(null, ''),
  onu_mac_address: Joi.string().trim().max(17).allow(null, ''),
  install_latitude: Joi.number().min(-90).max(90).allow(null),
  install_longitude: Joi.number().min(-180).max(180).allow(null),
}).min(1);

const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const listQuerySchema = Joi.object({
  customer_id: Joi.number().integer().positive().optional(),
  status: Joi.string()
    .valid(
      SUBSCRIPTION_STATUS.PENDING,
      SUBSCRIPTION_STATUS.ACTIVE,
      SUBSCRIPTION_STATUS.SUSPENDED,
      SUBSCRIPTION_STATUS.TERMINATED
    )
    .optional(),
  search: Joi.string().trim().max(100).optional(),
  page: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().positive().max(100).optional(),
});

// Routes

// GET /api/subscriptions - List subscriptions (branch-scoped)
router.get(
  '/',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN),
  validate(listQuerySchema, 'query'),
  subscriptionController.list
);

// GET /api/subscriptions/:id - Get subscription by ID
router.get(
  '/:id',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN, USER_ROLE.TEKNISI),
  validate(idParamSchema, 'params'),
  subscriptionController.getById
);

// POST /api/subscriptions - Create a new subscription
router.post(
  '/',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN),
  validate(createSubscriptionSchema, 'body'),
  subscriptionController.create
);

// PUT /api/subscriptions/:id - Update subscription
router.put(
  '/:id',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN),
  validate(idParamSchema, 'params'),
  validate(updateSubscriptionSchema, 'body'),
  subscriptionController.update
);

// POST /api/subscriptions/:id/activate - Activate subscription
router.post(
  '/:id/activate',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN),
  validate(idParamSchema, 'params'),
  subscriptionController.activate
);

// POST /api/subscriptions/:id/installation - Submit installation data (Teknisi)
router.post(
  '/:id/installation',
  authenticate,
  authorize(USER_ROLE.TEKNISI, USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN),
  validate(idParamSchema, 'params'),
  validate(installationSchema, 'body'),
  subscriptionController.installation
);

module.exports = router;
