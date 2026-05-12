/**
 * Billing routes.
 * GET    /api/billing/invoices           - List invoices (branch-scoped)
 * GET    /api/billing/invoices/:id       - Get invoice by ID
 * POST   /api/billing/invoices/:id/waive - Waive an invoice (extended isolir)
 * GET    /api/billing/dp                 - List down payments for a customer
 * POST   /api/billing/dp                 - Record a new down payment
 *
 * RBAC:
 * - GET invoices list: Admin, Accounting, Mitra
 * - GET invoice by ID: Admin, Accounting, Mitra, Pelanggan
 * - POST waive: Accounting
 * - GET dp: Admin, Sales
 * - POST dp: Admin, Sales
 *
 * Requirements: 6.4, 11.1, 11.2, 46.1
 */

const { Router } = require('express');
const Joi = require('joi');
const billingController = require('../controllers/billing.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { branchScope } = require('../middleware/branchScope');
const { validate } = require('../middleware/validator');
const { USER_ROLE, INVOICE_STATUS } = require('../utils/constants');

const router = Router();

// Validation schemas
const invoiceListQuerySchema = Joi.object({
  customer_id: Joi.number().integer().positive().optional(),
  subscription_id: Joi.number().integer().positive().optional(),
  status: Joi.string()
    .valid(INVOICE_STATUS.UNPAID, INVOICE_STATUS.LUNAS, INVOICE_STATUS.WAIVED, INVOICE_STATUS.CANCELLED)
    .optional(),
  billing_period: Joi.string()
    .pattern(/^\d{4}-\d{2}$/)
    .optional(),
  page: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().positive().max(100).optional(),
});

const invoiceIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const waiveInvoiceSchema = Joi.object({
  reason: Joi.string().trim().min(3).max(500).required(),
});

const dpListQuerySchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
});

const createDpSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  amount: Joi.number().positive().required(),
  payment_date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .required(),
});

// Routes

// GET /api/billing/invoices - List invoices (branch-scoped)
router.get(
  '/invoices',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.ACCOUNTING, USER_ROLE.MITRA),
  branchScope,
  validate(invoiceListQuerySchema, 'query'),
  billingController.listInvoices
);

// GET /api/billing/invoices/:id - Get invoice by ID
router.get(
  '/invoices/:id',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.ACCOUNTING, USER_ROLE.MITRA, USER_ROLE.PELANGGAN),
  validate(invoiceIdParamSchema, 'params'),
  billingController.getInvoice
);

// POST /api/billing/invoices/:id/waive - Waive an invoice
router.post(
  '/invoices/:id/waive',
  authenticate,
  authorize(USER_ROLE.ACCOUNTING),
  validate(invoiceIdParamSchema, 'params'),
  validate(waiveInvoiceSchema, 'body'),
  billingController.waiveInvoice
);

// GET /api/billing/dp - List down payments
router.get(
  '/dp',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SALES),
  validate(dpListQuerySchema, 'query'),
  billingController.listDownPayments
);

// POST /api/billing/dp - Record a new down payment
router.post(
  '/dp',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SALES),
  validate(createDpSchema, 'body'),
  billingController.createDownPayment
);

module.exports = router;
