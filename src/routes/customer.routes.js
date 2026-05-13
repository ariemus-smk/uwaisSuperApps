/**
 * Customer routes.
 * GET    /api/customers              - List customers (branch-scoped)
 * GET    /api/customers/:id          - Get customer by ID
 * POST   /api/customers              - Create a new customer
 * PUT    /api/customers/:id          - Update customer data
 * PATCH  /api/customers/:id/status   - Change lifecycle status
 * GET    /api/customers/:id/audit-log - Get status change history
 *
 * RBAC:
 * - GET list: Admin, Accounting, Sales, Mitra
 * - GET by ID: Admin, Accounting, Sales, Mitra, Teknisi
 * - POST create: Admin, Sales, Mitra
 * - PUT update: Admin
 * - PATCH status: Admin
 * - GET audit-log: Admin, Superadmin
 */

const { Router } = require('express');
const Joi = require('joi');
const customerController = require('../controllers/customer.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validator');
const { USER_ROLE, CUSTOMER_STATUS } = require('../utils/constants');

const router = Router();

// Validation schemas
const createCustomerSchema = Joi.object({
  full_name: Joi.string().trim().min(2).max(200).required(),
  ktp_number: Joi.string().trim().min(16).max(16).required(),
  npwp_number: Joi.string().trim().max(20).allow(null, '').optional(),
  whatsapp_number: Joi.string().trim().min(10).max(15).required(),
  email: Joi.string().trim().email().allow(null, '').optional(),
  address: Joi.string().trim().min(5).max(500).required(),
  rt: Joi.string().trim().max(10).allow(null, '').optional(),
  rw: Joi.string().trim().max(10).allow(null, '').optional(),
  dusun: Joi.string().trim().max(100).allow(null, '').optional(),
  desa: Joi.string().trim().max(100).allow(null, '').optional(),
  kecamatan: Joi.string().trim().max(100).allow(null, '').optional(),
  kabupaten: Joi.string().trim().max(100).allow(null, '').optional(),
  provinsi: Joi.string().trim().max(100).allow(null, '').optional(),
  latitude: Joi.number().min(-90).max(90).allow(null).optional(),
  longitude: Joi.number().min(-180).max(180).allow(null).optional(),
  branch_id: Joi.number().integer().positive().optional(),
});

const updateCustomerSchema = Joi.object({
  full_name: Joi.string().trim().min(2).max(200),
  npwp_number: Joi.string().trim().max(20).allow(null, ''),
  whatsapp_number: Joi.string().trim().min(10).max(15),
  email: Joi.string().trim().email().allow(null, ''),
  address: Joi.string().trim().min(5).max(500),
  rt: Joi.string().trim().max(10).allow(null, ''),
  rw: Joi.string().trim().max(10).allow(null, ''),
  dusun: Joi.string().trim().max(100).allow(null, ''),
  desa: Joi.string().trim().max(100).allow(null, ''),
  kecamatan: Joi.string().trim().max(100).allow(null, ''),
  kabupaten: Joi.string().trim().max(100).allow(null, ''),
  provinsi: Joi.string().trim().max(100).allow(null, ''),
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
}).min(1);

const changeStatusSchema = Joi.object({
  status: Joi.string()
    .valid(
      CUSTOMER_STATUS.PROSPEK,
      CUSTOMER_STATUS.INSTALASI,
      CUSTOMER_STATUS.AKTIF,
      CUSTOMER_STATUS.ISOLIR,
      CUSTOMER_STATUS.TERMINATED
    )
    .required(),
});

const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const listQuerySchema = Joi.object({
  lifecycle_status: Joi.string()
    .valid(
      CUSTOMER_STATUS.PROSPEK,
      CUSTOMER_STATUS.INSTALASI,
      CUSTOMER_STATUS.AKTIF,
      CUSTOMER_STATUS.ISOLIR,
      CUSTOMER_STATUS.TERMINATED
    )
    .optional(),
  search: Joi.string().trim().max(100).optional(),
  page: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().positive().max(100).optional(),
});

const auditLogQuerySchema = Joi.object({
  page: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().positive().max(100).optional(),
});

// Routes

// GET /api/customers - List customers (branch-scoped)
router.get(
  '/',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN, USER_ROLE.ACCOUNTING, USER_ROLE.SALES, USER_ROLE.MITRA),
  validate(listQuerySchema, 'query'),
  customerController.list
);

// GET /api/customers/:id - Get customer by ID
router.get(
  '/:id',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN, USER_ROLE.ACCOUNTING, USER_ROLE.SALES, USER_ROLE.MITRA, USER_ROLE.TEKNISI),
  validate(idParamSchema, 'params'),
  customerController.getById
);

// POST /api/customers - Create a new customer
router.post(
  '/',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN, USER_ROLE.SALES, USER_ROLE.MITRA),
  validate(createCustomerSchema, 'body'),
  customerController.create
);

// PUT /api/customers/:id - Update customer data
router.put(
  '/:id',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN),
  validate(idParamSchema, 'params'),
  validate(updateCustomerSchema, 'body'),
  customerController.update
);

// PATCH /api/customers/:id/status - Change lifecycle status
router.patch(
  '/:id/status',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN),
  validate(idParamSchema, 'params'),
  validate(changeStatusSchema, 'body'),
  customerController.changeStatus
);

// GET /api/customers/:id/audit-log - Get status change history
router.get(
  '/:id/audit-log',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN),
  validate(idParamSchema, 'params'),
  validate(auditLogQuerySchema, 'query'),
  customerController.getAuditLog
);

module.exports = router;
