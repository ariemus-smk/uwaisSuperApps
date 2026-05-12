/**
 * Asset controller.
 * Handles HTTP requests for asset/inventory management endpoints including
 * inbound, outbound, return, transfer, tools, direct-sale, and stock-opname.
 *
 * Requirements: 18.1, 19.1, 20.5, 21.1, 22.1, 23.1
 */

const assetService = require('../services/asset.service');
const { success, created, error } = require('../utils/responseHelper');
const { ERROR_CODE } = require('../utils/constants');

/**
 * GET /api/assets
 * List assets with optional filters and branch scoping.
 */
async function listAssets(req, res) {
  try {
    const filters = {
      branch_id: req.branchFilter || req.query.branch_id,
      category: req.query.category,
      status: req.query.status,
    };
    const pagination = {
      page: req.query.page,
      limit: req.query.limit,
    };

    const result = await assetService.getAssets(filters, pagination);

    return success(res, result, 'Assets retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/assets/inbound
 * Record asset inbound (inventory receiving).
 */
async function recordInbound(req, res) {
  try {
    const data = {
      invoice_number: req.body.invoice_number,
      purchase_date: req.body.purchase_date,
      invoice_file_url: req.body.invoice_file_url || null,
      supplier_name: req.body.supplier_name,
      branch_id: req.body.branch_id,
      recorded_by: req.user.id,
      items: req.body.items,
    };

    const result = await assetService.recordInbound(data);

    return created(res, result, 'Asset inbound recorded successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/assets/outbound
 * Approve asset outbound (Admin approves outbound request).
 */
async function approveOutbound(req, res) {
  try {
    const data = {
      branch_id: req.body.branch_id,
      teknisi_id: req.body.teknisi_id,
      items: req.body.items,
      approved_by: req.user.id,
    };

    const result = await assetService.approveOutbound(data);

    return success(res, result, 'Asset outbound approved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/assets/outbound/request
 * Request assets for outbound (Teknisi requests assets for installation).
 */
async function requestOutbound(req, res) {
  try {
    const data = {
      branch_id: req.body.branch_id,
      teknisi_id: req.user.id,
      items: req.body.items,
      notes: req.body.notes,
    };

    const result = await assetService.requestOutbound(data);

    return created(res, result, 'Asset outbound request submitted successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/assets/return
 * Return assets from Teknisi to branch warehouse.
 */
async function returnAssets(req, res) {
  try {
    const data = {
      teknisi_id: req.user.id,
      branch_id: req.body.branch_id,
      items: req.body.items,
    };

    const result = await assetService.processReturn(data);

    return success(res, result, 'Assets returned successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/assets/transfer
 * Initiate inter-branch asset transfer.
 */
async function initiateTransfer(req, res) {
  try {
    const data = {
      source_branch_id: req.body.source_branch_id,
      destination_branch_id: req.body.destination_branch_id,
      items: req.body.items,
      initiated_by: req.user.id,
    };

    const result = await assetService.initiateTransfer(data);

    return created(res, result, 'Asset transfer initiated successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/assets/transfer/:id/confirm
 * Confirm transfer receipt at destination branch.
 */
async function confirmTransfer(req, res) {
  try {
    const { id } = req.params;

    const result = await assetService.confirmReceipt(Number(id), req.user.id);

    return success(res, result, 'Transfer receipt confirmed successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/assets/transfer/:id/return
 * Return transfer (reverse stock movement back to source branch).
 */
async function returnTransfer(req, res) {
  try {
    const { id } = req.params;

    const result = await assetService.returnTransfer(Number(id), req.user.id);

    return success(res, result, 'Transfer return processed successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/assets/tools/borrow
 * Request tool borrow (Teknisi requests to borrow a tool).
 */
async function borrowTool(req, res) {
  try {
    const data = {
      asset_id: req.body.asset_id,
      teknisi_id: req.user.id,
      branch_id: req.body.branch_id,
      borrow_date: req.body.borrow_date,
      expected_return_date: req.body.expected_return_date,
    };

    const result = await assetService.borrowTool(data);

    return created(res, result, 'Tool borrow request submitted successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/assets/tools/:id/approve
 * Approve tool borrow request (Admin approves).
 */
async function approveToolBorrow(req, res) {
  try {
    const { id } = req.params;

    const result = await assetService.approveBorrow(Number(id), req.user.id);

    return success(res, result, 'Tool borrow approved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/assets/tools/:id/return
 * Return a borrowed tool (Teknisi returns tool).
 */
async function returnTool(req, res) {
  try {
    const { id } = req.params;
    const data = {
      condition_on_return: req.body.condition_on_return,
    };

    const result = await assetService.returnTool(Number(id), data);

    return success(res, result, 'Tool returned successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/assets/tools/borrowed
 * List all currently borrowed tools per branch.
 */
async function listBorrowedTools(req, res) {
  try {
    const branchId = req.branchFilter || req.query.branch_id;
    const pagination = {
      page: req.query.page,
      limit: req.query.limit,
    };

    const result = await assetService.getBorrowedTools(branchId, pagination);

    return success(res, result, 'Borrowed tools retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/assets/direct-sale
 * Record a direct sale (non-subscription hardware sale).
 */
async function recordDirectSale(req, res) {
  try {
    const data = {
      customer_id: req.body.customer_id,
      branch_id: req.body.branch_id,
      sold_by: req.user.id,
      payment_method: req.body.payment_method,
      total_amount: req.body.total_amount,
      items: req.body.items,
    };

    const result = await assetService.recordDirectSale(data);

    return created(res, result, 'Direct sale recorded successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/assets/stock-opname
 * Start a stock opname session for a branch.
 */
async function startStockOpname(req, res) {
  try {
    const data = {
      branch_id: req.body.branch_id,
      conducted_by: req.user.id,
    };

    const result = await assetService.startStockOpname(data);

    return created(res, result, 'Stock opname session started successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PUT /api/assets/stock-opname/:id
 * Submit physical count entries for a stock opname session.
 */
async function submitOpnameCounts(req, res) {
  try {
    const { id } = req.params;
    const data = {
      counts: req.body.counts,
    };

    const result = await assetService.submitOpnameCounts(Number(id), data);

    return success(res, result, 'Opname counts submitted successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/assets/stock-opname/:id/finalize
 * Finalize a stock opname session (update system stock to match physical count).
 */
async function finalizeOpname(req, res) {
  try {
    const { id } = req.params;

    const result = await assetService.finalizeOpname(Number(id), req.user.id);

    return success(res, result, 'Stock opname finalized successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

module.exports = {
  listAssets,
  recordInbound,
  approveOutbound,
  requestOutbound,
  returnAssets,
  initiateTransfer,
  confirmTransfer,
  returnTransfer,
  borrowTool,
  approveToolBorrow,
  returnTool,
  listBorrowedTools,
  recordDirectSale,
  startStockOpname,
  submitOpnameCounts,
  finalizeOpname,
};
