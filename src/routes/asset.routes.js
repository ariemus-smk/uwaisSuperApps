/**
 * Asset routes.
 * GET    /api/assets                          - List assets (branch-scoped)
 * POST   /api/assets/inbound                  - Record asset inbound (Admin)
 * POST   /api/assets/outbound                 - Approve asset outbound (Admin)
 * POST   /api/assets/outbound/request         - Request assets (Teknisi)
 * POST   /api/assets/return                   - Return assets (Teknisi)
 * POST   /api/assets/transfer                 - Initiate inter-branch transfer (Admin)
 * POST   /api/assets/transfer/:id/confirm     - Confirm transfer receipt (Admin)
 * POST   /api/assets/transfer/:id/return      - Return transfer (Admin)
 * POST   /api/assets/tools/borrow             - Request tool borrow (Teknisi)
 * POST   /api/assets/tools/:id/approve        - Approve tool borrow (Admin)
 * POST   /api/assets/tools/:id/return         - Return tool (Teknisi)
 * GET    /api/assets/tools/borrowed           - List borrowed tools (Admin)
 * POST   /api/assets/direct-sale              - Record direct sale (Admin, Sales)
 * POST   /api/assets/stock-opname             - Start stock opname (Admin)
 * PUT    /api/assets/stock-opname/:id         - Submit opname counts (Admin)
 * POST   /api/assets/stock-opname/:id/finalize - Finalize opname (Admin)
 *
 * Requirements: 18.1, 19.1, 20.5, 21.1, 22.1, 23.1
 */

const { Router } = require('express');
const Joi = require('joi');
const assetController = require('../controllers/asset.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { branchScope } = require('../middleware/branchScope');
const { validate } = require('../middleware/validator');
const { USER_ROLE, ASSET_CATEGORY, ASSET_STATUS } = require('../utils/constants');

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const assetListQuerySchema = Joi.object({
  branch_id: Joi.number().integer().positive().optional(),
  category: Joi.string()
    .valid(ASSET_CATEGORY.PERANGKAT_AKTIF, ASSET_CATEGORY.KABEL, ASSET_CATEGORY.AKSESORIS)
    .optional(),
  status: Joi.string()
    .valid(
      ASSET_STATUS.TERSEDIA,
      ASSET_STATUS.DIPINJAM,
      ASSET_STATUS.TERPASANG,
      ASSET_STATUS.RUSAK,
      ASSET_STATUS.DALAM_PENGIRIMAN,
      ASSET_STATUS.DIBAWA_TEKNISI
    )
    .optional(),
  page: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().positive().max(100).optional(),
});

const inboundSchema = Joi.object({
  invoice_number: Joi.string().trim().min(1).max(100).required(),
  purchase_date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .required(),
  invoice_file_url: Joi.string().uri().allow(null, '').optional(),
  supplier_name: Joi.string().trim().min(1).max(200).required(),
  branch_id: Joi.number().integer().positive().required(),
  items: Joi.array()
    .items(
      Joi.object({
        product_name: Joi.string().trim().min(1).max(200).required(),
        brand_model: Joi.string().trim().max(200).allow(null, '').optional(),
        category: Joi.string()
          .valid(ASSET_CATEGORY.PERANGKAT_AKTIF, ASSET_CATEGORY.KABEL, ASSET_CATEGORY.AKSESORIS)
          .required(),
        serial_number: Joi.string().trim().max(100).allow(null, '').optional(),
        mac_address: Joi.string().trim().max(50).allow(null, '').optional(),
        quantity: Joi.number().positive().optional(),
      })
    )
    .min(1)
    .required(),
});

const approveOutboundSchema = Joi.object({
  branch_id: Joi.number().integer().positive().required(),
  teknisi_id: Joi.number().integer().positive().required(),
  items: Joi.array()
    .items(
      Joi.object({
        category: Joi.string()
          .valid(ASSET_CATEGORY.PERANGKAT_AKTIF, ASSET_CATEGORY.KABEL, ASSET_CATEGORY.AKSESORIS)
          .required(),
        quantity: Joi.number().positive().required(),
        asset_id: Joi.number().integer().positive().optional(),
      })
    )
    .min(1)
    .required(),
});

const requestOutboundSchema = Joi.object({
  branch_id: Joi.number().integer().positive().required(),
  items: Joi.array()
    .items(
      Joi.object({
        category: Joi.string()
          .valid(ASSET_CATEGORY.PERANGKAT_AKTIF, ASSET_CATEGORY.KABEL, ASSET_CATEGORY.AKSESORIS)
          .required(),
        quantity: Joi.number().positive().required(),
        asset_id: Joi.number().integer().positive().optional(),
        product_name: Joi.string().trim().max(200).allow(null, '').optional(),
      })
    )
    .min(1)
    .required(),
  notes: Joi.string().trim().max(500).allow(null, '').optional(),
});

const returnAssetsSchema = Joi.object({
  branch_id: Joi.number().integer().positive().required(),
  items: Joi.array()
    .items(
      Joi.object({
        asset_id: Joi.number().integer().positive().required(),
        condition: Joi.string().valid(ASSET_STATUS.TERSEDIA, ASSET_STATUS.RUSAK).required(),
        remaining_quantity: Joi.number().min(0).optional(),
      })
    )
    .min(1)
    .required(),
});

const transferSchema = Joi.object({
  source_branch_id: Joi.number().integer().positive().required(),
  destination_branch_id: Joi.number().integer().positive().required(),
  items: Joi.array()
    .items(
      Joi.object({
        asset_id: Joi.number().integer().positive().required(),
        serial_number: Joi.string().trim().max(100).optional(),
      })
    )
    .min(1)
    .required(),
});

const transferIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const borrowToolSchema = Joi.object({
  asset_id: Joi.number().integer().positive().required(),
  branch_id: Joi.number().integer().positive().required(),
  borrow_date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .required(),
  expected_return_date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .required(),
});

const toolIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const returnToolSchema = Joi.object({
  condition_on_return: Joi.string().trim().min(1).max(500).required(),
});

const borrowedToolsQuerySchema = Joi.object({
  branch_id: Joi.number().integer().positive().optional(),
  page: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().positive().max(100).optional(),
});

const directSaleSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  branch_id: Joi.number().integer().positive().required(),
  payment_method: Joi.string().valid('Cash', 'Hutang').required(),
  total_amount: Joi.number().positive().required(),
  items: Joi.array()
    .items(
      Joi.object({
        asset_id: Joi.number().integer().positive().required(),
        serial_number: Joi.string().trim().max(100).optional(),
        quantity: Joi.number().positive().optional(),
      })
    )
    .min(1)
    .required(),
});

const startOpnameSchema = Joi.object({
  branch_id: Joi.number().integer().positive().required(),
});

const opnameIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const submitOpnameCountsSchema = Joi.object({
  counts: Joi.array()
    .items(
      Joi.object({
        category: Joi.string()
          .valid(ASSET_CATEGORY.PERANGKAT_AKTIF, ASSET_CATEGORY.KABEL, ASSET_CATEGORY.AKSESORIS)
          .required(),
        product_name: Joi.string().trim().max(200).optional(),
        system_quantity: Joi.number().min(0).required(),
        physical_quantity: Joi.number().min(0).required(),
        reason: Joi.string().trim().max(500).allow(null, '').optional(),
      })
    )
    .min(1)
    .required(),
});

// ============================================================================
// Routes
// ============================================================================

// GET /api/assets - List assets (Admin, Teknisi)
router.get(
  '/',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.TEKNISI),
  branchScope,
  validate(assetListQuerySchema, 'query'),
  assetController.listAssets
);

// POST /api/assets/inbound - Record asset inbound (Admin)
router.post(
  '/inbound',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(inboundSchema, 'body'),
  assetController.recordInbound
);

// POST /api/assets/outbound - Approve asset outbound (Admin)
router.post(
  '/outbound',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(approveOutboundSchema, 'body'),
  assetController.approveOutbound
);

// POST /api/assets/outbound/request - Request assets (Teknisi)
router.post(
  '/outbound/request',
  authenticate,
  authorize(USER_ROLE.TEKNISI),
  validate(requestOutboundSchema, 'body'),
  assetController.requestOutbound
);

// POST /api/assets/return - Return assets (Teknisi)
router.post(
  '/return',
  authenticate,
  authorize(USER_ROLE.TEKNISI),
  validate(returnAssetsSchema, 'body'),
  assetController.returnAssets
);

// POST /api/assets/transfer - Initiate inter-branch transfer (Admin)
router.post(
  '/transfer',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(transferSchema, 'body'),
  assetController.initiateTransfer
);

// POST /api/assets/transfer/:id/confirm - Confirm transfer receipt (Admin)
router.post(
  '/transfer/:id/confirm',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(transferIdParamSchema, 'params'),
  assetController.confirmTransfer
);

// POST /api/assets/transfer/:id/return - Return transfer (Admin)
router.post(
  '/transfer/:id/return',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(transferIdParamSchema, 'params'),
  assetController.returnTransfer
);

// POST /api/assets/tools/borrow - Request tool borrow (Teknisi)
router.post(
  '/tools/borrow',
  authenticate,
  authorize(USER_ROLE.TEKNISI),
  validate(borrowToolSchema, 'body'),
  assetController.borrowTool
);

// POST /api/assets/tools/:id/approve - Approve tool borrow (Admin)
router.post(
  '/tools/:id/approve',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(toolIdParamSchema, 'params'),
  assetController.approveToolBorrow
);

// POST /api/assets/tools/:id/return - Return tool (Teknisi)
router.post(
  '/tools/:id/return',
  authenticate,
  authorize(USER_ROLE.TEKNISI),
  validate(toolIdParamSchema, 'params'),
  validate(returnToolSchema, 'body'),
  assetController.returnTool
);

// GET /api/assets/tools/borrowed - List borrowed tools (Admin)
router.get(
  '/tools/borrowed',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  branchScope,
  validate(borrowedToolsQuerySchema, 'query'),
  assetController.listBorrowedTools
);

// POST /api/assets/direct-sale - Record direct sale (Admin, Sales)
router.post(
  '/direct-sale',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SALES),
  validate(directSaleSchema, 'body'),
  assetController.recordDirectSale
);

// POST /api/assets/stock-opname - Start stock opname (Admin)
router.post(
  '/stock-opname',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(startOpnameSchema, 'body'),
  assetController.startStockOpname
);

// PUT /api/assets/stock-opname/:id - Submit opname counts (Admin)
router.put(
  '/stock-opname/:id',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(opnameIdParamSchema, 'params'),
  validate(submitOpnameCountsSchema, 'body'),
  assetController.submitOpnameCounts
);

// POST /api/assets/stock-opname/:id/finalize - Finalize opname (Admin)
router.post(
  '/stock-opname/:id/finalize',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(opnameIdParamSchema, 'params'),
  assetController.finalizeOpname
);

module.exports = router;
