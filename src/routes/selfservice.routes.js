/**
 * Self-service routes for Pelanggan (customer) self-service portal.
 * GET    /api/selfservice/profile          - View own customer profile
 * GET    /api/selfservice/subscriptions    - View own subscriptions
 * GET    /api/selfservice/billing          - View own billing/invoice history
 * GET    /api/selfservice/payments         - View own payment history
 * GET    /api/selfservice/tickets          - View own ticket history
 * POST   /api/selfservice/tickets          - Submit a new trouble ticket
 * POST   /api/selfservice/wifi             - Change WiFi SSID/password (triggers ACS)
 * POST   /api/selfservice/package-change   - Request package upgrade/downgrade
 *
 * All endpoints are restricted to the Pelanggan role and enforce
 * data isolation (own data only, 403 for other customers).
 *
 * Requirements: 43.1, 43.2, 43.3, 43.4, 43.5
 */

const { Router } = require('express');
const Joi = require('joi');
const selfserviceController = require('../controllers/selfservice.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validator');
const { USER_ROLE } = require('../utils/constants');

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const paginationQuerySchema = Joi.object({
  page: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().positive().max(100).optional(),
});

const billingQuerySchema = Joi.object({
  status: Joi.string().valid('UNPAID', 'LUNAS', 'WAIVED', 'CANCELLED').optional(),
  billing_period: Joi.string().pattern(/^\d{4}-\d{2}$/).optional(),
  page: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().positive().max(100).optional(),
});

const submitTicketSchema = Joi.object({
  subscription_id: Joi.number().integer().positive().allow(null).optional(),
  issue_description: Joi.string().trim().min(1).max(2000).required(),
});

const changeWifiSchema = Joi.object({
  subscription_id: Joi.number().integer().positive().required(),
  ssid: Joi.string().trim().min(1).max(32).optional(),
  password: Joi.string().trim().min(8).max(63).optional(),
}).or('ssid', 'password');

const packageChangeSchema = Joi.object({
  subscription_id: Joi.number().integer().positive().required(),
  requested_package_id: Joi.number().integer().positive().required(),
});

// ============================================================================
// Routes - All require Pelanggan role
// ============================================================================

// GET /api/selfservice/profile - View own customer profile
router.get(
  '/profile',
  authenticate,
  authorize(USER_ROLE.PELANGGAN),
  selfserviceController.getProfile
);

// GET /api/selfservice/subscriptions - View own subscriptions
router.get(
  '/subscriptions',
  authenticate,
  authorize(USER_ROLE.PELANGGAN),
  validate(paginationQuerySchema, 'query'),
  selfserviceController.getSubscriptions
);

// GET /api/selfservice/billing - View own billing/invoice history
router.get(
  '/billing',
  authenticate,
  authorize(USER_ROLE.PELANGGAN),
  validate(billingQuerySchema, 'query'),
  selfserviceController.getBillingHistory
);

// GET /api/selfservice/payments - View own payment history
router.get(
  '/payments',
  authenticate,
  authorize(USER_ROLE.PELANGGAN),
  validate(paginationQuerySchema, 'query'),
  selfserviceController.getPaymentHistory
);

// GET /api/selfservice/tickets - View own ticket history
router.get(
  '/tickets',
  authenticate,
  authorize(USER_ROLE.PELANGGAN),
  validate(paginationQuerySchema, 'query'),
  selfserviceController.getTicketHistory
);

// POST /api/selfservice/tickets - Submit a new trouble ticket
router.post(
  '/tickets',
  authenticate,
  authorize(USER_ROLE.PELANGGAN),
  validate(submitTicketSchema, 'body'),
  selfserviceController.submitTicket
);

// POST /api/selfservice/wifi - Change WiFi SSID/password (triggers ACS)
router.post(
  '/wifi',
  authenticate,
  authorize(USER_ROLE.PELANGGAN),
  validate(changeWifiSchema, 'body'),
  selfserviceController.changeWifi
);

// POST /api/selfservice/package-change - Request package upgrade/downgrade
router.post(
  '/package-change',
  authenticate,
  authorize(USER_ROLE.PELANGGAN),
  validate(packageChangeSchema, 'body'),
  selfserviceController.requestPackageChange
);

module.exports = router;
