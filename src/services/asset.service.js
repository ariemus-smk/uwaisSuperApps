/**
 * Asset service.
 * Handles business logic for asset/inventory management including
 * inbound recording, categorization, serial number generation, and stock tracking.
 */

const { appPool } = require('../config/database');
const assetModel = require('../models/asset.model');
const assetInboundModel = require('../models/assetInbound.model');
const assetTransferModel = require('../models/assetTransfer.model');
const toolLendingModel = require('../models/toolLending.model');
const directSaleModel = require('../models/directSale.model');
const stockOpnameModel = require('../models/stockOpname.model');
const branchModel = require('../models/branch.model');
const { generateSerialNumber, getNextSequence, formatDate } = require('../utils/snGenerator');
const { ASSET_STATUS, ASSET_CATEGORY, TOOL_LENDING_STATUS, ASSET_TRANSFER_STATUS, ASSET_TRANSFER_TYPE, DIRECT_SALE_PAYMENT_METHOD, DIRECT_SALE_PAYMENT_STATUS, STOCK_OPNAME_STATUS, ERROR_CODE } = require('../utils/constants');

/**
 * Record an asset inbound (inventory receiving).
 * Creates the inbound record and all associated asset records.
 * Auto-generates serial numbers for items without manufacturer SN/MAC.
 * Updates branch stock counts.
 *
 * @param {object} data - Inbound data
 * @param {string} data.invoice_number - Purchase invoice number
 * @param {string} data.purchase_date - Purchase date (YYYY-MM-DD)
 * @param {string|null} data.invoice_file_url - Invoice file attachment URL
 * @param {string} data.supplier_name - Supplier name
 * @param {number} data.branch_id - Destination branch ID
 * @param {number} data.recorded_by - User ID recording the inbound
 * @param {Array<object>} data.items - Array of items to record
 * @param {string} data.items[].product_name - Product name
 * @param {string} [data.items[].brand_model] - Brand/model
 * @param {string} data.items[].category - Category: PerangkatAktif, Kabel, or Aksesoris
 * @param {string} [data.items[].serial_number] - Manufacturer serial number (optional)
 * @param {string} [data.items[].mac_address] - MAC address (optional)
 * @param {number} [data.items[].quantity] - Quantity (meters for Kabel, pcs for Aksesoris, 1 for PerangkatAktif)
 * @returns {Promise<object>} Created inbound record with associated assets
 * @throws {Error} If branch not found or inactive, or invalid category
 */
async function recordInbound(data) {
  const { invoice_number, purchase_date, invoice_file_url, supplier_name, branch_id, recorded_by, items } = data;

  // Validate branch exists and is active
  const branch = await branchModel.findById(branch_id);
  if (!branch) {
    throw Object.assign(new Error('Branch not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }
  if (branch.status !== 'Active') {
    throw Object.assign(new Error('Cannot record inbound to an inactive branch.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Validate items
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error('At least one item is required for inbound.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const validCategories = Object.values(ASSET_CATEGORY);
  for (const item of items) {
    if (!validCategories.includes(item.category)) {
      throw Object.assign(
        new Error(`Invalid category "${item.category}". Must be one of: ${validCategories.join(', ')}`),
        { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
      );
    }

    if (!item.product_name) {
      throw Object.assign(new Error('Product name is required for each item.'), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }

    // Validate quantity based on category
    const quantity = _getItemQuantity(item);
    if (quantity <= 0) {
      throw Object.assign(new Error('Quantity must be greater than 0.'), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }
  }

  // Use a transaction for atomicity
  const connection = await appPool.getConnection();

  try {
    await connection.beginTransaction();

    // Create the inbound record
    const inbound = await assetInboundModel.create({
      invoice_number,
      purchase_date,
      invoice_file_url: invoice_file_url || null,
      supplier_name,
      branch_id,
      recorded_by,
    }, connection);

    // Determine serial numbers for items that need auto-generation
    const today = new Date();
    const dateStr = formatDate(today);
    const existingSerials = await assetModel.getExistingSerialsByDate(dateStr);
    let nextSequence = getNextSequence(today, existingSerials);

    // Create asset records
    const createdAssets = [];
    for (const item of items) {
      const serialNumber = _resolveSerialNumber(item, today, nextSequence, existingSerials);

      // If we auto-generated, increment the sequence
      if (!item.serial_number && !item.mac_address) {
        existingSerials.add(serialNumber);
        nextSequence++;
      }

      const quantity = _getItemQuantity(item);

      const assetData = {
        product_name: item.product_name,
        brand_model: item.brand_model || null,
        category: item.category,
        serial_number: serialNumber,
        mac_address: item.mac_address || null,
        status: ASSET_STATUS.TERSEDIA,
        branch_id,
        quantity,
        remaining_quantity: quantity,
        inbound_id: inbound.id,
      };

      const [result] = await connection.execute(
        `INSERT INTO assets (product_name, brand_model, category, serial_number, mac_address, 
         status, branch_id, customer_id, assigned_teknisi_id, quantity, remaining_quantity, 
         inbound_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          assetData.product_name,
          assetData.brand_model,
          assetData.category,
          assetData.serial_number,
          assetData.mac_address,
          assetData.status,
          assetData.branch_id,
          null, // customer_id
          null, // assigned_teknisi_id
          assetData.quantity,
          assetData.remaining_quantity,
          assetData.inbound_id,
        ]
      );

      createdAssets.push({ id: result.insertId, ...assetData });
    }

    await connection.commit();

    return {
      inbound,
      assets: createdAssets,
      totalItems: createdAssets.length,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Get asset inbound records with optional filtering.
 * @param {object} filters - Filters (branch_id, supplier_name)
 * @param {object} pagination - Pagination (page, limit)
 * @returns {Promise<object>} Paginated inbound records
 */
async function getInbounds(filters = {}, pagination = {}) {
  return assetInboundModel.findAll(filters, pagination);
}

/**
 * Get a single inbound record by ID with its associated assets.
 * @param {number} id - Inbound ID
 * @returns {Promise<object>} Inbound record with assets
 * @throws {Error} If inbound not found
 */
async function getInboundById(id) {
  const inbound = await assetInboundModel.findById(id);
  if (!inbound) {
    throw Object.assign(new Error('Asset inbound record not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  const assets = await assetModel.findByInboundId(id);

  return { ...inbound, assets };
}

/**
 * Get assets with optional filtering and pagination.
 * @param {object} filters - Filters (branch_id, status, category)
 * @param {object} pagination - Pagination (page, limit)
 * @returns {Promise<object>} Paginated asset records
 */
async function getAssets(filters = {}, pagination = {}) {
  return assetModel.findAll(filters, pagination);
}

/**
 * Get a single asset by ID.
 * @param {number} id - Asset ID
 * @returns {Promise<object>} Asset record
 * @throws {Error} If asset not found
 */
async function getAssetById(id) {
  const asset = await assetModel.findById(id);
  if (!asset) {
    throw Object.assign(new Error('Asset not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }
  return asset;
}

/**
 * Get stock summary for a branch.
 * @param {number} branchId - Branch ID
 * @returns {Promise<object>} Stock summary grouped by category and status
 */
async function getStockSummary(branchId) {
  const branch = await branchModel.findById(branchId);
  if (!branch) {
    throw Object.assign(new Error('Branch not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  const summary = await assetModel.getStockSummary(branchId);

  return {
    branch_id: branchId,
    branch_name: branch.name,
    stock: summary,
  };
}

// ============================================================================
// Tool Lending Methods
// ============================================================================

/**
 * Request to borrow a tool.
 * Records the borrow request with tool ID, Teknisi ID, borrow date, and expected return date.
 *
 * @param {object} data - Borrow request data
 * @param {number} data.asset_id - Tool/asset ID to borrow
 * @param {number} data.teknisi_id - Teknisi user ID requesting the borrow
 * @param {number} data.branch_id - Branch ID
 * @param {string} data.borrow_date - Borrow date (YYYY-MM-DD)
 * @param {string} data.expected_return_date - Expected return date (YYYY-MM-DD)
 * @returns {Promise<object>} Created tool lending record
 * @throws {Error} If asset not found, not available, or already borrowed
 */
async function borrowTool(data) {
  const { asset_id, teknisi_id, branch_id, borrow_date, expected_return_date } = data;

  // Validate the asset exists
  const asset = await assetModel.findById(asset_id);
  if (!asset) {
    throw Object.assign(new Error('Asset not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // Validate the asset is available for borrowing
  if (asset.status !== ASSET_STATUS.TERSEDIA) {
    throw Object.assign(
      new Error(`Tool is not available for borrowing. Current status: ${asset.status}`),
      { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
    );
  }

  // Check if the tool is already in an active lending
  const activeLending = await toolLendingModel.findActiveByAssetId(asset_id);
  if (activeLending) {
    throw Object.assign(
      new Error('Tool is already in an active borrow request or currently borrowed.'),
      { statusCode: 409, code: ERROR_CODE.RESOURCE_CONFLICT }
    );
  }

  // Validate expected_return_date is after borrow_date
  if (new Date(expected_return_date) <= new Date(borrow_date)) {
    throw Object.assign(
      new Error('Expected return date must be after borrow date.'),
      { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
    );
  }

  // Create the lending record
  const lending = await toolLendingModel.create({
    asset_id,
    teknisi_id,
    branch_id,
    borrow_date,
    expected_return_date,
    status: TOOL_LENDING_STATUS.REQUESTED,
  });

  return lending;
}

/**
 * Approve a tool borrow request.
 * Updates the tool status to "Dipinjam" with the assigned Teknisi identifier.
 *
 * @param {number} lendingId - Tool lending record ID
 * @param {number} approvedBy - Admin user ID approving the request
 * @returns {Promise<object>} Updated lending record
 * @throws {Error} If lending not found or not in Requested status
 */
async function approveBorrow(lendingId, approvedBy) {
  const lending = await toolLendingModel.findById(lendingId);
  if (!lending) {
    throw Object.assign(new Error('Tool lending record not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (lending.status !== TOOL_LENDING_STATUS.REQUESTED) {
    throw Object.assign(
      new Error(`Cannot approve lending with status "${lending.status}". Only "Requested" can be approved.`),
      { statusCode: 400, code: ERROR_CODE.INVALID_STATUS_TRANSITION }
    );
  }

  // Use a transaction to update both lending and asset status atomically
  const connection = await appPool.getConnection();
  try {
    await connection.beginTransaction();

    // Update lending status to Active and record approver
    await toolLendingModel.update(lendingId, {
      status: TOOL_LENDING_STATUS.ACTIVE,
      approved_by: approvedBy,
    }, connection);

    // Update asset status to Dipinjam with assigned teknisi
    await connection.execute(
      `UPDATE assets SET status = ?, assigned_teknisi_id = ?, updated_at = NOW() WHERE id = ?`,
      [ASSET_STATUS.DIPINJAM, lending.teknisi_id, lending.asset_id]
    );

    await connection.commit();

    return {
      ...lending,
      status: TOOL_LENDING_STATUS.ACTIVE,
      approved_by: approvedBy,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Return a borrowed tool.
 * Records the return date and physical condition assessment.
 * If damaged or lost, updates status accordingly and records responsible Teknisi.
 *
 * @param {number} lendingId - Tool lending record ID
 * @param {object} data - Return data
 * @param {string} data.condition_on_return - Physical condition assessment (e.g., "Baik", "Rusak", "Hilang")
 * @param {string} [data.actual_return_date] - Actual return date (defaults to today)
 * @returns {Promise<object>} Updated lending record
 * @throws {Error} If lending not found or not in Active/Approved status
 */
async function returnTool(lendingId, data) {
  const { condition_on_return, actual_return_date } = data;

  const lending = await toolLendingModel.findById(lendingId);
  if (!lending) {
    throw Object.assign(new Error('Tool lending record not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (lending.status !== TOOL_LENDING_STATUS.ACTIVE && lending.status !== TOOL_LENDING_STATUS.APPROVED) {
    throw Object.assign(
      new Error(`Cannot return tool with lending status "${lending.status}". Only "Active" or "Approved" lendings can be returned.`),
      { statusCode: 400, code: ERROR_CODE.INVALID_STATUS_TRANSITION }
    );
  }

  const returnDate = actual_return_date || new Date().toISOString().split('T')[0];
  const conditionLower = condition_on_return.toLowerCase();
  const isDamagedOrLost = conditionLower === 'rusak' || conditionLower === 'hilang';

  // Determine new statuses
  const newLendingStatus = isDamagedOrLost && conditionLower === 'hilang'
    ? TOOL_LENDING_STATUS.LOST
    : TOOL_LENDING_STATUS.RETURNED;

  // Determine new asset status based on condition
  let newAssetStatus;
  if (conditionLower === 'hilang') {
    newAssetStatus = 'Rusak'; // Rusak/Hilang maps to Rusak in the ENUM
  } else if (conditionLower === 'rusak') {
    newAssetStatus = ASSET_STATUS.RUSAK;
  } else {
    newAssetStatus = ASSET_STATUS.TERSEDIA;
  }

  // Use a transaction to update both lending and asset status atomically
  const connection = await appPool.getConnection();
  try {
    await connection.beginTransaction();

    // Update lending record
    await toolLendingModel.update(lendingId, {
      status: newLendingStatus,
      actual_return_date: returnDate,
      condition_on_return,
    }, connection);

    // Update asset status and clear assigned teknisi
    await connection.execute(
      `UPDATE assets SET status = ?, assigned_teknisi_id = NULL, updated_at = NOW() WHERE id = ?`,
      [newAssetStatus, lending.asset_id]
    );

    await connection.commit();

    return {
      ...lending,
      status: newLendingStatus,
      actual_return_date: returnDate,
      condition_on_return,
      asset_status: newAssetStatus,
      responsible_teknisi_id: isDamagedOrLost ? lending.teknisi_id : null,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Get all currently borrowed tools for a branch.
 * Includes borrower information and borrow duration.
 *
 * @param {number} branchId - Branch ID
 * @param {object} [pagination={}] - Optional pagination (page, limit)
 * @returns {Promise<object>} Paginated list of borrowed tools
 * @throws {Error} If branch not found
 */
async function getBorrowedTools(branchId, pagination = {}) {
  const branch = await branchModel.findById(branchId);
  if (!branch) {
    throw Object.assign(new Error('Branch not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  return toolLendingModel.findBorrowedByBranch(branchId, pagination);
}

// ============================================================================
// Inter-Branch Transfer Methods
// ============================================================================

/**
 * Initiate an inter-branch asset transfer (surat jalan).
 * Creates a transfer record, deducts stock from source branch,
 * and sets item status to "DalamPengiriman".
 *
 * @param {object} data - Transfer data
 * @param {number} data.source_branch_id - Source branch ID
 * @param {number} data.destination_branch_id - Destination branch ID
 * @param {Array<object>} data.items - Items to transfer
 * @param {number} data.items[].asset_id - Asset ID to transfer
 * @param {number} data.initiated_by - User ID initiating the transfer
 * @returns {Promise<object>} Created transfer record with affected assets
 * @throws {Error} If branches invalid, same branch, or assets not available
 */
async function initiateTransfer(data) {
  const { source_branch_id, destination_branch_id, items, initiated_by } = data;

  // Validate source and destination are different
  if (source_branch_id === destination_branch_id) {
    throw Object.assign(new Error('Source and destination branches must be different.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Validate source branch exists and is active
  const sourceBranch = await branchModel.findById(source_branch_id);
  if (!sourceBranch) {
    throw Object.assign(new Error('Source branch not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }
  if (sourceBranch.status !== 'Active') {
    throw Object.assign(new Error('Source branch is not active.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Validate destination branch exists and is active
  const destBranch = await branchModel.findById(destination_branch_id);
  if (!destBranch) {
    throw Object.assign(new Error('Destination branch not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }
  if (destBranch.status !== 'Active') {
    throw Object.assign(new Error('Destination branch is not active.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Validate items
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error('At least one item is required for transfer.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Validate each asset exists, belongs to source branch, and is available
  const assetsToTransfer = [];
  for (const item of items) {
    if (!item.asset_id) {
      throw Object.assign(new Error('Each item must have an asset_id.'), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }

    const asset = await assetModel.findById(item.asset_id);
    if (!asset) {
      throw Object.assign(new Error(`Asset with ID ${item.asset_id} not found.`), {
        statusCode: 404,
        code: ERROR_CODE.RESOURCE_NOT_FOUND,
      });
    }

    if (asset.branch_id !== source_branch_id) {
      throw Object.assign(
        new Error(`Asset ID ${item.asset_id} does not belong to source branch ${source_branch_id}.`),
        { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
      );
    }

    if (asset.status !== ASSET_STATUS.TERSEDIA) {
      throw Object.assign(
        new Error(`Asset ID ${item.asset_id} is not available for transfer (status: ${asset.status}).`),
        { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
      );
    }

    assetsToTransfer.push(asset);
  }

  // Use a transaction for atomicity
  const connection = await appPool.getConnection();

  try {
    await connection.beginTransaction();

    // Update each asset status to DalamPengiriman
    const transferItems = [];
    for (const asset of assetsToTransfer) {
      await assetModel.updateStatusTx(
        asset.id,
        ASSET_STATUS.DALAM_PENGIRIMAN,
        {},
        connection
      );

      transferItems.push({
        asset_id: asset.id,
        serial_number: asset.serial_number,
        product_name: asset.product_name,
        category: asset.category,
        quantity: asset.remaining_quantity,
      });
    }

    // Create the transfer record
    const transfer = await assetTransferModel.create({
      source_branch_id,
      destination_branch_id,
      type: ASSET_TRANSFER_TYPE.TRANSFER,
      status: ASSET_TRANSFER_STATUS.IN_TRANSIT,
      items: transferItems,
      initiated_by,
    }, connection);

    await connection.commit();

    return {
      ...transfer,
      source_branch_name: sourceBranch.name,
      destination_branch_name: destBranch.name,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Confirm receipt of a transfer at the destination branch.
 * Adds stock to the destination branch and sets item status to "Tersedia".
 *
 * @param {number} transferId - Transfer record ID
 * @param {number} confirmedBy - User ID confirming receipt
 * @returns {Promise<object>} Updated transfer record
 * @throws {Error} If transfer not found or not in InTransit status
 */
async function confirmReceipt(transferId, confirmedBy) {
  const transfer = await assetTransferModel.findById(transferId);
  if (!transfer) {
    throw Object.assign(new Error('Transfer record not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (transfer.status !== ASSET_TRANSFER_STATUS.IN_TRANSIT) {
    throw Object.assign(
      new Error(`Cannot confirm transfer with status "${transfer.status}". Only "InTransit" transfers can be confirmed.`),
      { statusCode: 400, code: ERROR_CODE.INVALID_STATUS_TRANSITION }
    );
  }

  // Parse items from the transfer record
  const transferItems = typeof transfer.items === 'string'
    ? JSON.parse(transfer.items)
    : transfer.items;

  // Use a transaction for atomicity
  const connection = await appPool.getConnection();

  try {
    await connection.beginTransaction();

    // Update each asset: set status to Tersedia and move to destination branch
    for (const item of transferItems) {
      await assetModel.updateStatusTx(
        item.asset_id,
        ASSET_STATUS.TERSEDIA,
        { branch_id: transfer.destination_branch_id },
        connection
      );
    }

    // Update transfer record status to Received
    await assetTransferModel.update(transferId, {
      status: ASSET_TRANSFER_STATUS.RECEIVED,
      confirmed_by: confirmedBy,
      confirmed_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    }, connection);

    await connection.commit();

    return {
      ...transfer,
      status: ASSET_TRANSFER_STATUS.RECEIVED,
      confirmed_by: confirmedBy,
      confirmed_at: new Date().toISOString(),
      items: transferItems,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Create a return transfer that reverses stock movement back to the source branch.
 * Used when wrong items were sent or surplus needs to be returned.
 *
 * @param {number} originalTransferId - Original transfer record ID to return from
 * @param {object} data - Return data
 * @param {Array<object>} data.items - Items to return (subset of original transfer items)
 * @param {number} data.items[].asset_id - Asset ID to return
 * @param {number} data.initiated_by - User ID initiating the return
 * @returns {Promise<object>} Created return transfer record
 * @throws {Error} If original transfer not found, not received, or assets not at destination
 */
async function returnTransfer(originalTransferId, data) {
  const { items, initiated_by } = data;

  // Validate original transfer exists and is in Received status
  const originalTransfer = await assetTransferModel.findById(originalTransferId);
  if (!originalTransfer) {
    throw Object.assign(new Error('Original transfer record not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (originalTransfer.status !== ASSET_TRANSFER_STATUS.RECEIVED) {
    throw Object.assign(
      new Error(`Cannot return from transfer with status "${originalTransfer.status}". Only "Received" transfers can be returned.`),
      { statusCode: 400, code: ERROR_CODE.INVALID_STATUS_TRANSITION }
    );
  }

  // Validate items
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error('At least one item is required for return transfer.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Parse original transfer items
  const originalItems = typeof originalTransfer.items === 'string'
    ? JSON.parse(originalTransfer.items)
    : originalTransfer.items;

  const originalAssetIds = new Set(originalItems.map(i => i.asset_id));

  // Validate each return item was part of the original transfer and is at destination branch
  const assetsToReturn = [];
  for (const item of items) {
    if (!item.asset_id) {
      throw Object.assign(new Error('Each item must have an asset_id.'), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }

    if (!originalAssetIds.has(item.asset_id)) {
      throw Object.assign(
        new Error(`Asset ID ${item.asset_id} was not part of the original transfer.`),
        { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
      );
    }

    const asset = await assetModel.findById(item.asset_id);
    if (!asset) {
      throw Object.assign(new Error(`Asset with ID ${item.asset_id} not found.`), {
        statusCode: 404,
        code: ERROR_CODE.RESOURCE_NOT_FOUND,
      });
    }

    if (asset.branch_id !== originalTransfer.destination_branch_id) {
      throw Object.assign(
        new Error(`Asset ID ${item.asset_id} is not at the destination branch.`),
        { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
      );
    }

    if (asset.status !== ASSET_STATUS.TERSEDIA) {
      throw Object.assign(
        new Error(`Asset ID ${item.asset_id} is not available for return (status: ${asset.status}).`),
        { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
      );
    }

    assetsToReturn.push(asset);
  }

  // The return transfer reverses direction: destination -> source
  const returnSourceBranchId = originalTransfer.destination_branch_id;
  const returnDestBranchId = originalTransfer.source_branch_id;

  // Use a transaction for atomicity
  const connection = await appPool.getConnection();

  try {
    await connection.beginTransaction();

    // Update each asset status to DalamPengiriman
    const returnItems = [];
    for (const asset of assetsToReturn) {
      await assetModel.updateStatusTx(
        asset.id,
        ASSET_STATUS.DALAM_PENGIRIMAN,
        {},
        connection
      );

      returnItems.push({
        asset_id: asset.id,
        serial_number: asset.serial_number,
        product_name: asset.product_name,
        category: asset.category,
        quantity: asset.remaining_quantity,
      });
    }

    // Create the return transfer record (reversed direction)
    const returnTransferRecord = await assetTransferModel.create({
      source_branch_id: returnSourceBranchId,
      destination_branch_id: returnDestBranchId,
      type: ASSET_TRANSFER_TYPE.RETURN,
      status: ASSET_TRANSFER_STATUS.IN_TRANSIT,
      items: returnItems,
      initiated_by,
    }, connection);

    // Update original transfer status to Returned
    await assetTransferModel.update(originalTransferId, {
      status: ASSET_TRANSFER_STATUS.RETURNED,
    }, connection);

    await connection.commit();

    return {
      ...returnTransferRecord,
      original_transfer_id: originalTransferId,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Get transfer records with optional filtering and pagination.
 * @param {object} filters - Filters (source_branch_id, destination_branch_id, status, type, branch_id)
 * @param {object} pagination - Pagination (page, limit)
 * @returns {Promise<object>} Paginated transfer records
 */
async function getTransfers(filters = {}, pagination = {}) {
  return assetTransferModel.findAll(filters, pagination);
}

/**
 * Get a single transfer record by ID.
 * @param {number} id - Transfer ID
 * @returns {Promise<object>} Transfer record
 * @throws {Error} If transfer not found
 */
async function getTransferById(id) {
  const transfer = await assetTransferModel.findById(id);
  if (!transfer) {
    throw Object.assign(new Error('Transfer record not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // Parse items JSON
  if (typeof transfer.items === 'string') {
    transfer.items = JSON.parse(transfer.items);
  }

  return transfer;
}

/**
 * Get transfer history for a specific branch.
 * @param {number} branchId - Branch ID
 * @param {object} [pagination={}] - Optional pagination (page, limit)
 * @returns {Promise<object>} Transfer history
 * @throws {Error} If branch not found
 */
async function getTransferHistory(branchId, pagination = {}) {
  const branch = await branchModel.findById(branchId);
  if (!branch) {
    throw Object.assign(new Error('Branch not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  return assetTransferModel.getHistoryByBranch(branchId, pagination);
}

// ============================================================================
// Private helper functions
// ============================================================================

/**
 * Determine the quantity for an item based on its category.
 * - PerangkatAktif: always 1 unit/pcs
 * - Kabel: total meters per SN (from item.quantity)
 * - Aksesoris: total pieces per pack (from item.quantity)
 * @param {object} item - Item data
 * @returns {number} Quantity value
 */
function _getItemQuantity(item) {
  if (item.category === ASSET_CATEGORY.PERANGKAT_AKTIF) {
    return 1;
  }
  // Kabel and Aksesoris use the provided quantity
  return item.quantity || 1;
}

/**
 * Resolve the serial number for an item.
 * If the item has a manufacturer serial_number or MAC address, use the serial_number
 * (or generate from MAC if no SN provided but MAC exists).
 * Otherwise, auto-generate using the UBG-YYYYMMDD-XXXXXX format.
 *
 * @param {object} item - Item data
 * @param {Date} date - Current date for SN generation
 * @param {number} nextSequence - Next available sequence number
 * @param {Set<string>} existingSerials - Set of existing serial numbers
 * @returns {string} Resolved serial number
 */
function _resolveSerialNumber(item, date, nextSequence, existingSerials) {
  // If manufacturer serial number is provided, use it
  if (item.serial_number && item.serial_number.trim()) {
    return item.serial_number.trim();
  }

  // If MAC address is provided but no SN, use MAC as the serial number identifier
  // but still auto-generate a proper SN for tracking
  // Per requirement 18.3: auto-generate when no manufacturer SN or MAC exists
  if (item.mac_address && item.mac_address.trim()) {
    return item.mac_address.trim();
  }

  // Auto-generate serial number
  return generateSerialNumber(nextSequence, date);
}

// ============================================================================
// Outbound and Installation Tracking
// ============================================================================

/**
 * Request assets for outbound (Teknisi requests assets for installation).
 * Validates that sufficient stock exists in the Branch warehouse.
 *
 * @param {object} data - Outbound request data
 * @param {number} data.branch_id - Branch ID to request from
 * @param {number} data.teknisi_id - Teknisi user ID making the request
 * @param {Array<object>} data.items - Items requested
 * @param {string} data.items[].category - Asset category (PerangkatAktif, Kabel, Aksesoris)
 * @param {number} data.items[].quantity - Quantity requested (meters for Kabel, pcs for Aksesoris, units for PerangkatAktif)
 * @param {number} [data.items[].asset_id] - Specific asset ID (for PerangkatAktif)
 * @param {string} [data.notes] - Optional notes for the request
 * @returns {Promise<object>} Outbound request details with stock validation
 * @throws {Error} If insufficient stock or invalid data
 */
async function requestOutbound(data) {
  const { branch_id, teknisi_id, items, notes } = data;

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error('At least one item is required for outbound request.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const validCategories = Object.values(ASSET_CATEGORY);

  // Validate each item and check stock availability
  const validatedItems = [];
  for (const item of items) {
    if (!validCategories.includes(item.category)) {
      throw Object.assign(
        new Error(`Invalid category "${item.category}". Must be one of: ${validCategories.join(', ')}`),
        { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
      );
    }

    const requestedQty = item.quantity || 1;
    if (requestedQty <= 0) {
      throw Object.assign(new Error('Quantity must be greater than 0.'), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }

    // Validate stock availability
    const availableQty = await assetModel.getAvailableQuantity(branch_id, item.category);
    if (availableQty < requestedQty) {
      throw Object.assign(
        new Error(`Insufficient stock for ${item.category}. Available: ${availableQty}, Requested: ${requestedQty}`),
        { statusCode: 400, code: ERROR_CODE.INSUFFICIENT_STOCK }
      );
    }

    // For PerangkatAktif with specific asset_id, validate the asset exists and is available
    if (item.asset_id) {
      const asset = await assetModel.findById(item.asset_id);
      if (!asset) {
        throw Object.assign(new Error(`Asset with ID ${item.asset_id} not found.`), {
          statusCode: 404,
          code: ERROR_CODE.RESOURCE_NOT_FOUND,
        });
      }
      if (asset.status !== ASSET_STATUS.TERSEDIA) {
        throw Object.assign(new Error(`Asset with ID ${item.asset_id} is not available (status: ${asset.status}).`), {
          statusCode: 400,
          code: ERROR_CODE.VALIDATION_ERROR,
        });
      }
      if (asset.branch_id !== branch_id) {
        throw Object.assign(new Error(`Asset with ID ${item.asset_id} does not belong to branch ${branch_id}.`), {
          statusCode: 400,
          code: ERROR_CODE.VALIDATION_ERROR,
        });
      }
    }

    validatedItems.push({
      category: item.category,
      quantity: requestedQty,
      asset_id: item.asset_id || null,
      product_name: item.product_name || null,
    });
  }

  return {
    branch_id,
    teknisi_id,
    items: validatedItems,
    notes: notes || null,
    status: 'Pending',
    requested_at: new Date().toISOString(),
  };
}

/**
 * Approve an asset outbound request.
 * Updates asset status to "DibawaTeknisi" and deducts from Branch stock.
 * - Kabel: deducts per meter from remaining_quantity
 * - Aksesoris: deducts per piece from remaining_quantity
 * - PerangkatAktif: deducts per unit (whole asset)
 *
 * @param {object} data - Approval data
 * @param {number} data.branch_id - Branch ID
 * @param {number} data.teknisi_id - Teknisi user ID receiving the assets
 * @param {Array<object>} data.items - Items to approve
 * @param {string} data.items[].category - Asset category
 * @param {number} data.items[].quantity - Quantity to approve
 * @param {number} [data.items[].asset_id] - Specific asset ID (for PerangkatAktif)
 * @param {number} data.approved_by - Admin user ID approving the request
 * @returns {Promise<object>} Approved outbound details with affected assets
 * @throws {Error} If insufficient stock at approval time
 */
async function approveOutbound(data) {
  const { branch_id, teknisi_id, items, approved_by } = data;

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error('At least one item is required for outbound approval.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const connection = await appPool.getConnection();

  try {
    await connection.beginTransaction();

    const affectedAssets = [];

    for (const item of items) {
      const requestedQty = item.quantity || 1;

      if (item.category === ASSET_CATEGORY.PERANGKAT_AKTIF) {
        // For PerangkatAktif: assign whole unit(s)
        if (item.asset_id) {
          // Specific asset requested
          const asset = await assetModel.findById(item.asset_id);
          if (!asset || asset.status !== ASSET_STATUS.TERSEDIA) {
            throw Object.assign(new Error(`Asset ID ${item.asset_id} is not available.`), {
              statusCode: 400,
              code: ERROR_CODE.INSUFFICIENT_STOCK,
            });
          }
          await assetModel.updateStatusTx(
            asset.id,
            ASSET_STATUS.DIBAWA_TEKNISI,
            { assigned_teknisi_id: teknisi_id, remaining_quantity: 0 },
            connection
          );
          affectedAssets.push({ id: asset.id, serial_number: asset.serial_number, category: item.category, quantity: 1 });
        } else {
          // Pick available units (FIFO)
          const available = await assetModel.findAvailable(branch_id, ASSET_CATEGORY.PERANGKAT_AKTIF);
          if (available.length < requestedQty) {
            throw Object.assign(
              new Error(`Insufficient PerangkatAktif stock. Available: ${available.length}, Requested: ${requestedQty}`),
              { statusCode: 400, code: ERROR_CODE.INSUFFICIENT_STOCK }
            );
          }
          for (let i = 0; i < requestedQty; i++) {
            const asset = available[i];
            await assetModel.updateStatusTx(
              asset.id,
              ASSET_STATUS.DIBAWA_TEKNISI,
              { assigned_teknisi_id: teknisi_id, remaining_quantity: 0 },
              connection
            );
            affectedAssets.push({ id: asset.id, serial_number: asset.serial_number, category: item.category, quantity: 1 });
          }
        }
      } else {
        // For Kabel (meters) and Aksesoris (pieces): deduct from remaining_quantity
        const available = await assetModel.findAvailable(branch_id, item.category);
        let remainingToDeduct = requestedQty;

        for (const asset of available) {
          if (remainingToDeduct <= 0) break;

          const deductAmount = Math.min(asset.remaining_quantity, remainingToDeduct);
          const newRemaining = asset.remaining_quantity - deductAmount;
          remainingToDeduct -= deductAmount;

          if (newRemaining <= 0) {
            // Entire asset consumed - mark as DibawaTeknisi
            await assetModel.updateStatusTx(
              asset.id,
              ASSET_STATUS.DIBAWA_TEKNISI,
              { assigned_teknisi_id: teknisi_id, remaining_quantity: 0 },
              connection
            );
          } else {
            // Partial deduction - keep as Tersedia with reduced quantity
            await assetModel.updateRemainingQuantity(asset.id, newRemaining, connection);
          }

          affectedAssets.push({
            id: asset.id,
            serial_number: asset.serial_number,
            category: item.category,
            quantity: deductAmount,
          });
        }

        if (remainingToDeduct > 0) {
          throw Object.assign(
            new Error(`Insufficient ${item.category} stock. Short by ${remainingToDeduct}.`),
            { statusCode: 400, code: ERROR_CODE.INSUFFICIENT_STOCK }
          );
        }
      }
    }

    await connection.commit();

    return {
      branch_id,
      teknisi_id,
      approved_by,
      items: affectedAssets,
      status: 'Approved',
      approved_at: new Date().toISOString(),
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Record asset installation at a customer location.
 * Accepts actual usage data (cable meters used, accessories count) and
 * updates asset status to "Terpasang" linked to the customer ID.
 *
 * @param {object} data - Installation data
 * @param {number} data.teknisi_id - Teknisi performing the installation
 * @param {number} data.customer_id - Customer ID where assets are installed
 * @param {number} data.branch_id - Branch ID
 * @param {Array<object>} data.items - Items installed
 * @param {number} data.items[].asset_id - Asset ID being installed
 * @param {number} data.items[].quantity_used - Actual quantity used (meters for Kabel, pcs for Aksesoris, 1 for PerangkatAktif)
 * @returns {Promise<object>} Installation record with updated assets
 * @throws {Error} If asset not found or not assigned to teknisi
 */
async function recordInstallation(data) {
  const { teknisi_id, customer_id, branch_id, items } = data;

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error('At least one item is required for installation record.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  if (!customer_id) {
    throw Object.assign(new Error('Customer ID is required for installation.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const connection = await appPool.getConnection();

  try {
    await connection.beginTransaction();

    const installedAssets = [];

    for (const item of items) {
      const asset = await assetModel.findById(item.asset_id);
      if (!asset) {
        throw Object.assign(new Error(`Asset with ID ${item.asset_id} not found.`), {
          statusCode: 404,
          code: ERROR_CODE.RESOURCE_NOT_FOUND,
        });
      }

      // Asset must be in DibawaTeknisi status (assigned to this teknisi)
      if (asset.status !== ASSET_STATUS.DIBAWA_TEKNISI) {
        throw Object.assign(
          new Error(`Asset ID ${item.asset_id} is not in "DibawaTeknisi" status (current: ${asset.status}).`),
          { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
        );
      }

      if (asset.assigned_teknisi_id !== teknisi_id) {
        throw Object.assign(
          new Error(`Asset ID ${item.asset_id} is not assigned to teknisi ${teknisi_id}.`),
          { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
        );
      }

      const quantityUsed = item.quantity_used || 1;

      // Update asset to Terpasang linked to customer
      await assetModel.updateStatusTx(
        asset.id,
        ASSET_STATUS.TERPASANG,
        {
          customer_id,
          assigned_teknisi_id: null,
          remaining_quantity: quantityUsed,
        },
        connection
      );

      installedAssets.push({
        id: asset.id,
        serial_number: asset.serial_number,
        category: asset.category,
        quantity_used: quantityUsed,
        customer_id,
      });
    }

    await connection.commit();

    return {
      teknisi_id,
      customer_id,
      branch_id,
      items: installedAssets,
      status: 'Installed',
      installed_at: new Date().toISOString(),
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Process return of assets to Branch warehouse after installation.
 * Handles return inspection: updates status to "Tersedia" (functional) or "Rusak" (damaged/RMA).
 *
 * @param {object} data - Return data
 * @param {number} data.teknisi_id - Teknisi returning the assets
 * @param {number} data.branch_id - Branch ID to return to
 * @param {Array<object>} data.items - Items being returned
 * @param {number} data.items[].asset_id - Asset ID being returned
 * @param {string} data.items[].condition - Inspection result: "Tersedia" (functional) or "Rusak" (damaged)
 * @param {number} [data.items[].remaining_quantity] - Remaining quantity being returned (for Kabel/Aksesoris)
 * @returns {Promise<object>} Return record with updated assets
 * @throws {Error} If asset not found or invalid condition
 */
async function processReturn(data) {
  const { teknisi_id, branch_id, items } = data;

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error('At least one item is required for return processing.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const validConditions = [ASSET_STATUS.TERSEDIA, ASSET_STATUS.RUSAK];

  const connection = await appPool.getConnection();

  try {
    await connection.beginTransaction();

    const returnedAssets = [];

    for (const item of items) {
      if (!validConditions.includes(item.condition)) {
        throw Object.assign(
          new Error(`Invalid condition "${item.condition}". Must be "Tersedia" or "Rusak".`),
          { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
        );
      }

      const asset = await assetModel.findById(item.asset_id);
      if (!asset) {
        throw Object.assign(new Error(`Asset with ID ${item.asset_id} not found.`), {
          statusCode: 404,
          code: ERROR_CODE.RESOURCE_NOT_FOUND,
        });
      }

      // Asset must be in DibawaTeknisi status to be returned
      if (asset.status !== ASSET_STATUS.DIBAWA_TEKNISI) {
        throw Object.assign(
          new Error(`Asset ID ${item.asset_id} is not in "DibawaTeknisi" status (current: ${asset.status}).`),
          { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
        );
      }

      if (asset.assigned_teknisi_id !== teknisi_id) {
        throw Object.assign(
          new Error(`Asset ID ${item.asset_id} is not assigned to teknisi ${teknisi_id}.`),
          { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
        );
      }

      // Determine remaining quantity for the return
      const returnQuantity = item.remaining_quantity !== undefined
        ? item.remaining_quantity
        : asset.quantity;

      // Update asset status and return to branch stock
      await assetModel.updateStatusTx(
        asset.id,
        item.condition,
        {
          assigned_teknisi_id: null,
          branch_id,
          remaining_quantity: returnQuantity,
        },
        connection
      );

      returnedAssets.push({
        id: asset.id,
        serial_number: asset.serial_number,
        category: asset.category,
        condition: item.condition,
        remaining_quantity: returnQuantity,
      });
    }

    await connection.commit();

    return {
      teknisi_id,
      branch_id,
      items: returnedAssets,
      status: 'Returned',
      returned_at: new Date().toISOString(),
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// ============================================================================
// Direct Sales Methods
// ============================================================================

/**
 * Record a direct sale (non-subscription hardware sale to customer).
 * Deducts sold items from Branch stock based on category:
 * - Kabel: per meter
 * - Aksesoris: per piece
 * - PerangkatAktif: per unit
 *
 * @param {object} data - Direct sale data
 * @param {number} data.customer_id - Customer ID
 * @param {number} data.branch_id - Branch ID
 * @param {number} data.sold_by - User ID making the sale
 * @param {string} data.payment_method - Payment method: 'Cash' or 'Hutang'
 * @param {number} data.total_amount - Total sale amount
 * @param {Array<object>} data.items - Items being sold
 * @param {number} [data.items[].asset_id] - Specific asset ID (for PerangkatAktif with serial number)
 * @param {string} data.items[].category - Asset category
 * @param {number} data.items[].quantity - Quantity (meters for Kabel, pcs for Aksesoris, 1 for PerangkatAktif)
 * @param {string} [data.items[].serial_number] - Serial number (for PerangkatAktif)
 * @param {string} [data.items[].product_name] - Product name
 * @param {number} [data.items[].unit_price] - Unit price
 * @returns {Promise<object>} Created direct sale record with stock deduction details
 * @throws {Error} If insufficient stock, invalid payment method, or customer not found
 */
async function recordDirectSale(data) {
  const { customer_id, branch_id, sold_by, payment_method, total_amount, items } = data;

  // Validate payment method
  const validPaymentMethods = Object.values(DIRECT_SALE_PAYMENT_METHOD);
  if (!validPaymentMethods.includes(payment_method)) {
    throw Object.assign(
      new Error(`Invalid payment method "${payment_method}". Must be one of: ${validPaymentMethods.join(', ')}`),
      { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
    );
  }

  // Validate items
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error('At least one item is required for direct sale.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const validCategories = Object.values(ASSET_CATEGORY);
  for (const item of items) {
    if (!validCategories.includes(item.category)) {
      throw Object.assign(
        new Error(`Invalid category "${item.category}". Must be one of: ${validCategories.join(', ')}`),
        { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
      );
    }
    const qty = item.quantity || 1;
    if (qty <= 0) {
      throw Object.assign(new Error('Quantity must be greater than 0.'), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }
  }

  // Validate stock availability before proceeding
  for (const item of items) {
    const requestedQty = item.quantity || 1;

    if (item.asset_id) {
      // Specific asset requested
      const asset = await assetModel.findById(item.asset_id);
      if (!asset) {
        throw Object.assign(new Error(`Asset with ID ${item.asset_id} not found.`), {
          statusCode: 404,
          code: ERROR_CODE.RESOURCE_NOT_FOUND,
        });
      }
      if (asset.status !== ASSET_STATUS.TERSEDIA) {
        throw Object.assign(
          new Error(`Asset ID ${item.asset_id} is not available (status: ${asset.status}).`),
          { statusCode: 400, code: ERROR_CODE.INSUFFICIENT_STOCK }
        );
      }
      if (asset.branch_id !== branch_id) {
        throw Object.assign(
          new Error(`Asset ID ${item.asset_id} does not belong to branch ${branch_id}.`),
          { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
        );
      }
    } else {
      // Check general stock availability
      const availableQty = await assetModel.getAvailableQuantity(branch_id, item.category);
      if (availableQty < requestedQty) {
        throw Object.assign(
          new Error(`Insufficient stock for ${item.category}. Available: ${availableQty}, Requested: ${requestedQty}`),
          { statusCode: 400, code: ERROR_CODE.INSUFFICIENT_STOCK }
        );
      }
    }
  }

  // Determine payment status based on payment method
  const payment_status = payment_method === DIRECT_SALE_PAYMENT_METHOD.CASH
    ? DIRECT_SALE_PAYMENT_STATUS.LUNAS
    : DIRECT_SALE_PAYMENT_STATUS.PIUTANG;

  // Use a transaction for atomicity
  const connection = await appPool.getConnection();

  try {
    await connection.beginTransaction();

    const soldItems = [];

    for (const item of items) {
      const requestedQty = item.quantity || 1;

      if (item.category === ASSET_CATEGORY.PERANGKAT_AKTIF) {
        // For PerangkatAktif: sell whole unit(s)
        if (item.asset_id) {
          // Specific asset
          const asset = await assetModel.findById(item.asset_id);
          await assetModel.updateStatusTx(
            asset.id,
            ASSET_STATUS.TERPASANG,
            { customer_id, remaining_quantity: 0 },
            connection
          );
          soldItems.push({
            asset_id: asset.id,
            serial_number: asset.serial_number,
            product_name: asset.product_name,
            category: item.category,
            quantity: 1,
            unit_price: item.unit_price || 0,
          });
        } else {
          // Pick available units (FIFO)
          const available = await assetModel.findAvailable(branch_id, ASSET_CATEGORY.PERANGKAT_AKTIF);
          if (available.length < requestedQty) {
            throw Object.assign(
              new Error(`Insufficient PerangkatAktif stock. Available: ${available.length}, Requested: ${requestedQty}`),
              { statusCode: 400, code: ERROR_CODE.INSUFFICIENT_STOCK }
            );
          }
          for (let i = 0; i < requestedQty; i++) {
            const asset = available[i];
            await assetModel.updateStatusTx(
              asset.id,
              ASSET_STATUS.TERPASANG,
              { customer_id, remaining_quantity: 0 },
              connection
            );
            soldItems.push({
              asset_id: asset.id,
              serial_number: asset.serial_number,
              product_name: asset.product_name,
              category: item.category,
              quantity: 1,
              unit_price: item.unit_price || 0,
            });
          }
        }
      } else {
        // For Kabel (meters) and Aksesoris (pieces): deduct from remaining_quantity
        const available = await assetModel.findAvailable(branch_id, item.category);
        let remainingToDeduct = requestedQty;

        for (const asset of available) {
          if (remainingToDeduct <= 0) break;

          const deductAmount = Math.min(asset.remaining_quantity, remainingToDeduct);
          const newRemaining = asset.remaining_quantity - deductAmount;
          remainingToDeduct -= deductAmount;

          if (newRemaining <= 0) {
            // Entire asset consumed
            await assetModel.updateStatusTx(
              asset.id,
              ASSET_STATUS.TERPASANG,
              { customer_id, remaining_quantity: 0 },
              connection
            );
          } else {
            // Partial deduction - keep as Tersedia with reduced quantity
            await assetModel.updateRemainingQuantity(asset.id, newRemaining, connection);
          }

          soldItems.push({
            asset_id: asset.id,
            serial_number: asset.serial_number,
            product_name: asset.product_name,
            category: item.category,
            quantity: deductAmount,
            unit_price: item.unit_price || 0,
          });
        }

        if (remainingToDeduct > 0) {
          throw Object.assign(
            new Error(`Insufficient ${item.category} stock. Short by ${remainingToDeduct}.`),
            { statusCode: 400, code: ERROR_CODE.INSUFFICIENT_STOCK }
          );
        }
      }
    }

    // Create the direct sale record
    const sale = await directSaleModel.create({
      customer_id,
      branch_id,
      sold_by,
      payment_method,
      total_amount,
      items: JSON.stringify(soldItems),
      payment_status,
    }, connection);

    await connection.commit();

    return {
      ...sale,
      items: soldItems,
      payment_status,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Get direct sale records with optional filtering.
 * @param {object} filters - Filters (branch_id, customer_id, payment_status, sold_by)
 * @param {object} pagination - Pagination (page, limit)
 * @returns {Promise<object>} Paginated direct sale records
 */
async function getDirectSales(filters = {}, pagination = {}) {
  return directSaleModel.findAll(filters, pagination);
}

/**
 * Get a single direct sale record by ID.
 * @param {number} id - Direct sale ID
 * @returns {Promise<object>} Direct sale record
 * @throws {Error} If direct sale not found
 */
async function getDirectSaleById(id) {
  const sale = await directSaleModel.findById(id);
  if (!sale) {
    throw Object.assign(new Error('Direct sale record not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // Parse items JSON
  if (typeof sale.items === 'string') {
    sale.items = JSON.parse(sale.items);
  }

  return sale;
}

/**
 * Get direct sale history for a customer (transaction history linked to customer profile).
 * @param {number} customerId - Customer ID
 * @param {object} [pagination={}] - Optional pagination (page, limit)
 * @returns {Promise<object>} Customer's direct sale history
 */
async function getCustomerSaleHistory(customerId, pagination = {}) {
  return directSaleModel.findByCustomerId(customerId, pagination);
}

// ============================================================================
// Stock Opname Methods
// ============================================================================

/**
 * Initiate a stock opname session for a specific Branch.
 * Only one active (InProgress) session is allowed per branch at a time.
 *
 * @param {object} data - Stock opname initiation data
 * @param {number} data.branch_id - Branch ID to audit
 * @param {number} data.conducted_by - User ID conducting the opname
 * @returns {Promise<object>} Created stock opname session with current system stock
 * @throws {Error} If branch not found, inactive, or already has an active session
 */
async function initiateStockOpname(data) {
  const { branch_id, conducted_by } = data;

  // Validate branch exists and is active
  const branch = await branchModel.findById(branch_id);
  if (!branch) {
    throw Object.assign(new Error('Branch not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }
  if (branch.status !== 'Active') {
    throw Object.assign(new Error('Cannot initiate stock opname for an inactive branch.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Check for existing active session
  const activeSession = await stockOpnameModel.findActiveByBranch(branch_id);
  if (activeSession) {
    throw Object.assign(
      new Error('An active stock opname session already exists for this branch.'),
      { statusCode: 409, code: ERROR_CODE.RESOURCE_CONFLICT }
    );
  }

  // Get current system stock for the branch
  const systemStock = await assetModel.getStockSummary(branch_id);

  // Create the stock opname session
  const opname = await stockOpnameModel.create({
    branch_id,
    conducted_by,
  });

  return {
    ...opname,
    branch_name: branch.name,
    system_stock: systemStock,
  };
}

/**
 * Submit physical count entries and compare against system records.
 * Generates an adjustment journal with discrepancies.
 *
 * @param {number} opnameId - Stock opname session ID
 * @param {object} data - Physical count data
 * @param {Array<object>} data.counts - Physical count entries per item category
 * @param {string} data.counts[].category - Asset category (PerangkatAktif, Kabel, Aksesoris)
 * @param {number} data.counts[].physical_quantity - Physical count quantity
 * @param {string} [data.counts[].reason] - Reason for discrepancy (if any)
 * @param {string} [data.counts[].product_name] - Product name filter (optional, for more granular counting)
 * @returns {Promise<object>} Comparison result with adjustment journal
 * @throws {Error} If opname not found or not in InProgress status
 */
async function submitOpnameCounts(opnameId, data) {
  const { counts } = data;

  const opname = await stockOpnameModel.findById(opnameId);
  if (!opname) {
    throw Object.assign(new Error('Stock opname session not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (opname.status !== STOCK_OPNAME_STATUS.IN_PROGRESS) {
    throw Object.assign(
      new Error('Stock opname session is not in progress. Cannot submit counts.'),
      { statusCode: 400, code: ERROR_CODE.INVALID_STATUS_TRANSITION }
    );
  }

  if (!counts || !Array.isArray(counts) || counts.length === 0) {
    throw Object.assign(new Error('At least one count entry is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const validCategories = Object.values(ASSET_CATEGORY);

  // Build adjustment journal by comparing physical counts to system records
  const adjustments = [];

  for (const count of counts) {
    if (!validCategories.includes(count.category)) {
      throw Object.assign(
        new Error(`Invalid category "${count.category}". Must be one of: ${validCategories.join(', ')}`),
        { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
      );
    }

    if (count.physical_quantity === undefined || count.physical_quantity < 0) {
      throw Object.assign(new Error('Physical quantity must be a non-negative number.'), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }

    // Get system quantity for this category in the branch
    const systemQuantity = await assetModel.getAvailableQuantity(opname.branch_id, count.category);

    const difference = count.physical_quantity - systemQuantity;

    adjustments.push({
      category: count.category,
      product_name: count.product_name || null,
      system_quantity: systemQuantity,
      physical_quantity: count.physical_quantity,
      difference,
      reason: count.reason || (difference === 0 ? 'Match' : 'Unspecified'),
    });
  }

  // Store adjustments in the opname record
  await stockOpnameModel.update(opnameId, {
    adjustments: JSON.stringify(adjustments),
  });

  return {
    opname_id: opnameId,
    branch_id: opname.branch_id,
    adjustments,
    has_discrepancies: adjustments.some(a => a.difference !== 0),
  };
}

/**
 * Finalize a stock opname session.
 * Updates system stock to match physical count and records the adjustment audit trail.
 *
 * @param {number} opnameId - Stock opname session ID
 * @returns {Promise<object>} Finalized opname record with applied adjustments
 * @throws {Error} If opname not found, not in InProgress status, or no adjustments submitted
 */
async function finalizeStockOpname(opnameId) {
  const opname = await stockOpnameModel.findById(opnameId);
  if (!opname) {
    throw Object.assign(new Error('Stock opname session not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (opname.status !== STOCK_OPNAME_STATUS.IN_PROGRESS) {
    throw Object.assign(
      new Error('Stock opname session is not in progress. Cannot finalize.'),
      { statusCode: 400, code: ERROR_CODE.INVALID_STATUS_TRANSITION }
    );
  }

  if (!opname.adjustments) {
    throw Object.assign(
      new Error('No counts have been submitted. Submit physical counts before finalizing.'),
      { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
    );
  }

  // Parse adjustments
  const adjustments = typeof opname.adjustments === 'string'
    ? JSON.parse(opname.adjustments)
    : opname.adjustments;

  // Use a transaction for atomicity
  const connection = await appPool.getConnection();

  try {
    await connection.beginTransaction();

    // Apply adjustments: update system stock to match physical count
    for (const adjustment of adjustments) {
      if (adjustment.difference === 0) continue; // No adjustment needed

      if (adjustment.difference > 0) {
        // Physical count is higher than system - need to add stock
        // This is unusual but can happen (e.g., items found that weren't recorded)
        // We don't create new asset records here, just note the surplus in the audit trail
        // The adjustment is recorded but no new assets are created without inbound
      } else {
        // Physical count is lower than system - need to reduce stock
        // Deduct from available assets (FIFO)
        const deficit = Math.abs(adjustment.difference);
        const available = await assetModel.findAvailable(opname.branch_id, adjustment.category);
        let remainingToDeduct = deficit;

        for (const asset of available) {
          if (remainingToDeduct <= 0) break;

          if (adjustment.category === ASSET_CATEGORY.PERANGKAT_AKTIF) {
            // For PerangkatAktif: mark as Rusak (lost/unaccounted)
            await assetModel.updateStatusTx(
              asset.id,
              ASSET_STATUS.RUSAK,
              { remaining_quantity: 0 },
              connection
            );
            remainingToDeduct -= 1;
          } else {
            // For Kabel/Aksesoris: reduce remaining_quantity
            const deductAmount = Math.min(asset.remaining_quantity, remainingToDeduct);
            const newRemaining = asset.remaining_quantity - deductAmount;
            remainingToDeduct -= deductAmount;

            if (newRemaining <= 0) {
              await assetModel.updateStatusTx(
                asset.id,
                ASSET_STATUS.RUSAK,
                { remaining_quantity: 0 },
                connection
              );
            } else {
              await assetModel.updateRemainingQuantity(asset.id, newRemaining, connection);
            }
          }
        }
      }
    }

    // Mark the opname session as completed
    const completedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await stockOpnameModel.update(opnameId, {
      status: STOCK_OPNAME_STATUS.COMPLETED,
      completed_at: completedAt,
    }, connection);

    await connection.commit();

    return {
      id: opnameId,
      branch_id: opname.branch_id,
      status: STOCK_OPNAME_STATUS.COMPLETED,
      adjustments,
      completed_at: completedAt,
      conducted_by: opname.conducted_by,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Get stock opname records with optional filtering.
 * @param {object} filters - Filters (branch_id, status, conducted_by)
 * @param {object} pagination - Pagination (page, limit)
 * @returns {Promise<object>} Paginated stock opname records
 */
async function getStockOpnames(filters = {}, pagination = {}) {
  return stockOpnameModel.findAll(filters, pagination);
}

/**
 * Get a single stock opname record by ID.
 * @param {number} id - Stock opname ID
 * @returns {Promise<object>} Stock opname record
 * @throws {Error} If stock opname not found
 */
async function getStockOpnameById(id) {
  const opname = await stockOpnameModel.findById(id);
  if (!opname) {
    throw Object.assign(new Error('Stock opname session not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // Parse adjustments JSON
  if (typeof opname.adjustments === 'string') {
    opname.adjustments = JSON.parse(opname.adjustments);
  }

  return opname;
}

module.exports = {
  recordInbound,
  getInbounds,
  getInboundById,
  getAssets,
  getAssetById,
  getStockSummary,
  requestOutbound,
  approveOutbound,
  recordInstallation,
  processReturn,
  borrowTool,
  approveBorrow,
  returnTool,
  getBorrowedTools,
  initiateTransfer,
  confirmReceipt,
  returnTransfer,
  getTransfers,
  getTransferById,
  getTransferHistory,
  recordDirectSale,
  getDirectSales,
  getDirectSaleById,
  getCustomerSaleHistory,
  initiateStockOpname,
  submitOpnameCounts,
  finalizeStockOpname,
  getStockOpnames,
  getStockOpnameById,
};
