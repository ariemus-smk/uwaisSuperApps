/**
 * Payment routes.
 * POST   /api/payments/tripay/create     - Create Tripay payment (Pelanggan, Admin)
 * POST   /api/payments/tripay/callback   - Tripay webhook callback (Public, signature verified internally)
 * POST   /api/payments/cash              - Process direct cash payment (Superadmin, Admin)
 * POST   /api/payments/mitra             - Process payment via Mitra (Mitra)
 * POST   /api/payments/merchant          - Process payment via Merchant (Merchant)
 * POST   /api/payments/mitra/topup       - Top up Mitra balance (Mitra)
 * POST   /api/payments/merchant/topup    - Top up Merchant balance (Merchant)
 * GET    /api/payments/mitra/balance     - Get Mitra balance (Mitra)
 * GET    /api/payments/merchant/balance  - Get Merchant balance (Merchant)
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 9.3, 10.3
 */

const { Router } = require('express');
const Joi = require('joi');
const paymentController = require('../controllers/payment.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validator');
const { USER_ROLE } = require('../utils/constants');

const router = Router();

// Validation schemas
const createTripaySchema = Joi.object({
  invoice_id: Joi.number().integer().positive().required(),
  payment_method: Joi.string().trim().min(1).max(50).required(),
});

const mitraPaymentSchema = Joi.object({
  invoice_id: Joi.number().integer().positive().required(),
});

const merchantPaymentSchema = Joi.object({
  invoice_id: Joi.number().integer().positive().required(),
});

const mitraTopupSchema = Joi.object({
  amount: Joi.number().positive().required(),
  reference: Joi.string().trim().min(1).max(255).required(),
});

const merchantTopupSchema = Joi.object({
  amount: Joi.number().positive().required(),
  reference: Joi.string().trim().max(255).optional().allow('', null),
});

// Routes

// POST /api/payments/tripay/create - Create Tripay payment (Pelanggan, Admin)
router.post(
  '/tripay/create',
  authenticate,
  authorize(USER_ROLE.PELANGGAN, USER_ROLE.ADMIN),
  validate(createTripaySchema, 'body'),
  paymentController.createTripayPayment
);

// POST /api/payments/tripay/callback - Tripay webhook (Public, signature verified internally)
router.post(
  '/tripay/callback',
  paymentController.handleTripayCallback
);

// POST /api/payments/cash - Process direct cash payment
router.post(
  '/cash',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN),
  validate(mitraPaymentSchema, 'body'), // Reuse schema since it only requires invoice_id
  paymentController.processCashPayment
);

// POST /api/payments/mitra - Process payment via Mitra
router.post(
  '/mitra',
  authenticate,
  authorize(USER_ROLE.MITRA),
  validate(mitraPaymentSchema, 'body'),
  paymentController.processMitraPayment
);

// POST /api/payments/merchant - Process payment via Merchant
router.post(
  '/merchant',
  authenticate,
  authorize(USER_ROLE.MERCHANT),
  validate(merchantPaymentSchema, 'body'),
  paymentController.processMerchantPayment
);

// POST /api/payments/mitra/topup - Top up Mitra balance
router.post(
  '/mitra/topup',
  authenticate,
  authorize(USER_ROLE.MITRA),
  validate(mitraTopupSchema, 'body'),
  paymentController.topupMitra
);

// POST /api/payments/merchant/topup - Top up Merchant balance
router.post(
  '/merchant/topup',
  authenticate,
  authorize(USER_ROLE.MERCHANT),
  validate(merchantTopupSchema, 'body'),
  paymentController.topupMerchant
);

// GET /api/payments/mitra/balance - Get Mitra balance
router.get(
  '/mitra/balance',
  authenticate,
  authorize(USER_ROLE.MITRA),
  paymentController.getMitraBalance
);

// GET /api/payments/merchant/balance - Get Merchant balance
router.get(
  '/merchant/balance',
  authenticate,
  authorize(USER_ROLE.MERCHANT),
  paymentController.getMerchantBalance
);

module.exports = router;
