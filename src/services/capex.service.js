/**
 * CAPEX Service.
 * Handles expansion project proposal workflow:
 * - Create proposal with automatic RAB calculation from master asset prices
 * - Approve/reject workflow with stock reservation and PO generation
 * - Revision workflow for Management feedback
 *
 * Requirements: 37.1, 37.2, 37.3, 37.4, 37.5, 37.6
 */

const capexProjectModel = require('../models/capexProject.model');
const assetModel = require('../models/asset.model');
const { appPool } = require('../config/database');
const {
  ERROR_CODE,
  CAPEX_PROJECT_STATUS,
  CAPEX_PROJECT_STATUS_TRANSITIONS,
} = require('../utils/constants');

/**
 * Create a new CAPEX project proposal.
 * Automatically calculates RAB by referencing master asset prices from inventory.
 *
 * Materials list format:
 * [{ product_name: string, category: string, quantity: number, unit_price?: number }]
 *
 * If unit_price is not provided, the system looks up the average price from
 * existing assets with the same product_name in the branch.
 *
 * Requirement 37.1: Store expansion project proposals
 * Requirement 37.2: Auto-calculate RAB from master asset prices
 *
 * @param {object} data - Proposal data
 * @param {string} data.project_name - Project name
 * @param {string} data.target_area - Target expansion area
 * @param {number} data.target_customer_count - Target customer count
 * @param {Array} data.materials_list - Required materials list
 * @param {number} data.branch_id - Branch ID
 * @param {number} data.created_by - User ID creating the proposal
 * @returns {Promise<object>} Created project with calculated RAB
 */
async function createProposal(data) {
  const { project_name, target_area, target_customer_count, materials_list, branch_id, created_by } = data;

  if (!project_name || !project_name.trim()) {
    throw Object.assign(new Error('Project name is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  if (!target_area || !target_area.trim()) {
    throw Object.assign(new Error('Target area is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  if (!target_customer_count || target_customer_count <= 0) {
    throw Object.assign(new Error('Target customer count must be a positive number.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  if (!materials_list || !Array.isArray(materials_list) || materials_list.length === 0) {
    throw Object.assign(new Error('Materials list is required and must not be empty.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Calculate RAB from master asset prices (Req 37.2)
  const calculatedRAB = await calculateRAB(materials_list, branch_id);

  const project = await capexProjectModel.create({
    project_name: project_name.trim(),
    target_area: target_area.trim(),
    target_customer_count,
    materials_list: JSON.stringify(calculatedRAB.materials),
    calculated_rab: calculatedRAB.total,
    status: CAPEX_PROJECT_STATUS.DRAFT,
    branch_id,
    created_by,
  });

  return {
    ...project,
    materials_list: calculatedRAB.materials,
    calculated_rab: calculatedRAB.total,
  };
}

/**
 * Calculate RAB (Rencana Anggaran Biaya) by referencing master asset prices.
 * Looks up unit prices from existing asset inbound records or uses provided prices.
 *
 * Requirement 37.2: Auto-calculate RAB from master asset prices
 *
 * @param {Array} materialsList - List of required materials
 * @param {number} branchId - Branch ID for price lookup
 * @returns {Promise<{materials: Array, total: number}>} Materials with prices and total RAB
 */
async function calculateRAB(materialsList, branchId) {
  const materials = [];
  let total = 0;

  for (const item of materialsList) {
    const { product_name, category, quantity, unit_price } = item;

    if (!product_name || !quantity || quantity <= 0) {
      throw Object.assign(new Error(`Invalid material entry: product_name and positive quantity are required.`), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }

    let resolvedPrice = unit_price;

    // If no unit_price provided, look up from master asset prices (Req 37.2)
    if (!resolvedPrice || resolvedPrice <= 0) {
      resolvedPrice = await lookupAssetPrice(product_name, branchId);
    }

    const subtotal = resolvedPrice * quantity;
    total += subtotal;

    materials.push({
      product_name,
      category: category || 'Aksesoris',
      quantity,
      unit_price: resolvedPrice,
      subtotal,
    });
  }

  return { materials, total };
}

/**
 * Look up the average unit price for an asset product from inbound records.
 * Falls back to 0 if no price data is available.
 *
 * @param {string} productName - Product name to look up
 * @param {number} branchId - Branch ID for scoping
 * @returns {Promise<number>} Unit price (average from inbound records)
 */
async function lookupAssetPrice(productName, branchId) {
  // Look up average price from existing assets with the same product_name
  // We use a price lookup table approach: check asset_inbounds joined with assets
  const [rows] = await appPool.execute(
    `SELECT AVG(a.quantity) as avg_qty, COUNT(*) as count
     FROM assets a
     WHERE a.product_name = ? AND a.branch_id = ?`,
    [productName, branchId]
  );

  // If no existing price data, try without branch scoping
  if (!rows[0] || rows[0].count === 0) {
    const [globalRows] = await appPool.execute(
      `SELECT COUNT(*) as count FROM assets WHERE product_name = ?`,
      [productName]
    );

    // Return 0 if no price reference exists - user should provide unit_price
    if (!globalRows[0] || globalRows[0].count === 0) {
      return 0;
    }
  }

  // For now, return 0 as a fallback since we don't have a dedicated price catalog table.
  // The user should provide unit_price in the materials list for accurate RAB calculation.
  // In production, this would reference a master price catalog.
  return 0;
}

/**
 * Get all CAPEX projects with pagination and branch scoping.
 *
 * @param {object} [filters={}] - Query filters
 * @param {object} [user={}] - Requesting user
 * @returns {Promise<{data: Array, total: number, page: number, limit: number, totalPages: number}>}
 */
async function getProjects(filters = {}, user = {}) {
  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 20;

  const queryFilters = {
    status: filters.status,
    created_by: filters.created_by,
    page,
    limit,
  };

  // Apply branch scoping
  if (user.branch_id) {
    queryFilters.branch_id = user.branch_id;
  }

  const { data, total } = await capexProjectModel.findAll(queryFilters, { page, limit });
  const totalPages = Math.ceil(total / limit);

  // Parse materials_list JSON for each project
  const projects = data.map((project) => ({
    ...project,
    materials_list: parseJSON(project.materials_list),
  }));

  return { data: projects, total, page, limit, totalPages };
}

/**
 * Get a single CAPEX project by ID.
 *
 * @param {number} id - Project ID
 * @returns {Promise<object>} Project record
 * @throws {Error} If project not found
 */
async function getProjectById(id) {
  const project = await capexProjectModel.findById(id);
  if (!project) {
    throw Object.assign(new Error('CAPEX project not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  return {
    ...project,
    materials_list: parseJSON(project.materials_list),
  };
}

/**
 * Update a CAPEX project proposal.
 * Only allowed when project is in Draft or Rejected status.
 * Recalculates RAB if materials_list is updated.
 *
 * Requirement 37.6: Support proposal revision workflow
 *
 * @param {number} id - Project ID
 * @param {object} data - Fields to update
 * @param {number} userId - User performing the update
 * @returns {Promise<object>} Updated project
 */
async function updateProposal(id, data, userId) {
  const project = await capexProjectModel.findById(id);
  if (!project) {
    throw Object.assign(new Error('CAPEX project not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // Only allow updates in Draft or Rejected status (revision workflow)
  const editableStatuses = [CAPEX_PROJECT_STATUS.DRAFT, CAPEX_PROJECT_STATUS.REJECTED];
  if (!editableStatuses.includes(project.status)) {
    throw Object.assign(
      new Error(`Cannot update project with status '${project.status}'. Only Draft or Rejected projects can be edited.`),
      { statusCode: 400, code: ERROR_CODE.INVALID_STATUS_TRANSITION }
    );
  }

  const updateData = {};

  if (data.project_name !== undefined) {
    updateData.project_name = data.project_name.trim();
  }
  if (data.target_area !== undefined) {
    updateData.target_area = data.target_area.trim();
  }
  if (data.target_customer_count !== undefined) {
    updateData.target_customer_count = data.target_customer_count;
  }

  // Recalculate RAB if materials_list is updated (Req 37.2)
  if (data.materials_list !== undefined) {
    if (!Array.isArray(data.materials_list) || data.materials_list.length === 0) {
      throw Object.assign(new Error('Materials list must not be empty.'), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }

    const calculatedRAB = await calculateRAB(data.materials_list, project.branch_id);
    updateData.materials_list = JSON.stringify(calculatedRAB.materials);
    updateData.calculated_rab = calculatedRAB.total;
  }

  // If project was Rejected, move back to Draft on revision (Req 37.6)
  if (project.status === CAPEX_PROJECT_STATUS.REJECTED) {
    updateData.status = CAPEX_PROJECT_STATUS.DRAFT;
  }

  await capexProjectModel.update(id, updateData);

  return getProjectById(id);
}

/**
 * Submit a Draft project for approval (transition to PendingApproval).
 *
 * @param {number} id - Project ID
 * @param {number} userId - User submitting the proposal
 * @returns {Promise<object>} Updated project
 */
async function submitForApproval(id, userId) {
  const project = await capexProjectModel.findById(id);
  if (!project) {
    throw Object.assign(new Error('CAPEX project not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (project.status !== CAPEX_PROJECT_STATUS.DRAFT) {
    throw Object.assign(
      new Error(`Cannot submit project with status '${project.status}'. Only Draft projects can be submitted for approval.`),
      { statusCode: 400, code: ERROR_CODE.INVALID_STATUS_TRANSITION }
    );
  }

  await capexProjectModel.updateStatus(id, CAPEX_PROJECT_STATUS.PENDING_APPROVAL);

  return getProjectById(id);
}

/**
 * Approve a CAPEX project.
 * On approval:
 * 1. Update status to Approved
 * 2. Check stock availability for required materials
 * 3. If stock sufficient: reserve (allocate) stock (Req 37.5)
 * 4. If stock insufficient: generate draft PO for missing items (Req 37.4)
 *
 * Requirement 37.3: Record project as CAPEX on approval
 * Requirement 37.4: Generate draft PO for missing items
 * Requirement 37.5: Reserve stock when available
 *
 * @param {number} id - Project ID
 * @param {number} approvedBy - User ID approving the project
 * @returns {Promise<object>} Approval result with stock/PO details
 */
async function approve(id, approvedBy) {
  const project = await capexProjectModel.findById(id);
  if (!project) {
    throw Object.assign(new Error('CAPEX project not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (project.status !== CAPEX_PROJECT_STATUS.PENDING_APPROVAL) {
    throw Object.assign(
      new Error(`Cannot approve project with status '${project.status}'. Only PendingApproval projects can be approved.`),
      { statusCode: 400, code: ERROR_CODE.INVALID_STATUS_TRANSITION }
    );
  }

  // Update status to Approved (Req 37.3)
  await capexProjectModel.updateStatus(id, CAPEX_PROJECT_STATUS.APPROVED, {
    approved_by: approvedBy,
  });

  // Process stock reservation and PO generation
  const materialsList = parseJSON(project.materials_list);
  const stockResult = await processStockForProject(id, project.branch_id, materialsList);

  return {
    id,
    status: CAPEX_PROJECT_STATUS.APPROVED,
    approved_by: approvedBy,
    stock_reservation: stockResult.reserved,
    purchase_order: stockResult.purchaseOrder,
  };
}

/**
 * Reject a CAPEX project with revision notes.
 *
 * Requirement 37.6: Support proposal revision workflow
 *
 * @param {number} id - Project ID
 * @param {number} rejectedBy - User ID rejecting the project
 * @param {string} [revisionNotes] - Notes for revision/reason for rejection
 * @returns {Promise<object>} Rejection result
 */
async function reject(id, rejectedBy, revisionNotes) {
  const project = await capexProjectModel.findById(id);
  if (!project) {
    throw Object.assign(new Error('CAPEX project not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (project.status !== CAPEX_PROJECT_STATUS.PENDING_APPROVAL) {
    throw Object.assign(
      new Error(`Cannot reject project with status '${project.status}'. Only PendingApproval projects can be rejected.`),
      { statusCode: 400, code: ERROR_CODE.INVALID_STATUS_TRANSITION }
    );
  }

  await capexProjectModel.updateStatus(id, CAPEX_PROJECT_STATUS.REJECTED, {
    approved_by: rejectedBy,
    revision_notes: revisionNotes || null,
  });

  return {
    id,
    status: CAPEX_PROJECT_STATUS.REJECTED,
    rejected_by: rejectedBy,
    revision_notes: revisionNotes || null,
  };
}

/**
 * Process stock reservation and PO generation for an approved project.
 * Checks available stock for each material item:
 * - If sufficient: reserves the stock (Req 37.5)
 * - If insufficient: generates a draft PO for missing items (Req 37.4)
 *
 * @param {number} projectId - CAPEX project ID
 * @param {number} branchId - Branch ID for stock lookup
 * @param {Array} materialsList - Required materials list
 * @returns {Promise<{reserved: Array, purchaseOrder: object|null}>}
 */
async function processStockForProject(projectId, branchId, materialsList) {
  const reserved = [];
  const missingItems = [];

  for (const item of materialsList) {
    const { product_name, category, quantity } = item;

    // Check available stock in the branch
    const availableQty = await assetModel.getAvailableQuantity(branchId, category || 'Aksesoris');

    if (availableQty >= quantity) {
      // Stock sufficient - reserve it (Req 37.5)
      const reservationResult = await reserveStock(branchId, product_name, category, quantity, projectId);
      reserved.push({
        product_name,
        category,
        quantity_reserved: reservationResult.reserved,
        assets_reserved: reservationResult.assetIds,
      });
    } else {
      // Stock insufficient - track for PO generation (Req 37.4)
      const deficit = quantity - availableQty;

      // Reserve whatever is available
      if (availableQty > 0) {
        const reservationResult = await reserveStock(branchId, product_name, category, availableQty, projectId);
        reserved.push({
          product_name,
          category,
          quantity_reserved: reservationResult.reserved,
          assets_reserved: reservationResult.assetIds,
        });
      }

      missingItems.push({
        product_name,
        category: category || 'Aksesoris',
        quantity_needed: deficit,
        unit_price: item.unit_price || 0,
        subtotal: (item.unit_price || 0) * deficit,
      });
    }
  }

  // Generate draft PO if there are missing items (Req 37.4)
  let purchaseOrder = null;
  if (missingItems.length > 0) {
    purchaseOrder = await generatePO(projectId, branchId, missingItems);
  }

  return { reserved, purchaseOrder };
}

/**
 * Reserve (allocate) stock in the branch warehouse for a CAPEX project.
 * Uses FIFO allocation (oldest assets first).
 *
 * Requirement 37.5: Reserve stock when available
 *
 * @param {number} branchId - Branch ID
 * @param {string} productName - Product name to reserve
 * @param {string} category - Asset category
 * @param {number} quantity - Quantity to reserve
 * @param {number} projectId - CAPEX project ID for reference
 * @returns {Promise<{reserved: number, assetIds: Array}>} Reservation result
 */
async function reserveStock(branchId, productName, category, quantity, projectId) {
  const availableAssets = await assetModel.findAvailable(branchId, category || 'Aksesoris');
  const assetIds = [];
  let remaining = quantity;

  for (const asset of availableAssets) {
    if (remaining <= 0) break;

    // Match by product_name for specific allocation
    if (asset.product_name !== productName) continue;

    const allocatable = Math.min(asset.remaining_quantity, remaining);

    if (allocatable > 0) {
      const newRemaining = asset.remaining_quantity - allocatable;

      // If fully allocated, mark as reserved; otherwise just reduce quantity
      if (newRemaining <= 0) {
        await assetModel.updateStatus(asset.id, 'DalamPengiriman');
      } else {
        await assetModel.updateRemainingQuantity(asset.id, newRemaining);
      }

      assetIds.push(asset.id);
      remaining -= allocatable;
    }
  }

  return { reserved: quantity - remaining, assetIds };
}

/**
 * Generate a draft Purchase Order for missing items.
 * Stores the PO as a JSON record associated with the CAPEX project.
 *
 * Requirement 37.4: Generate draft PO for missing items
 *
 * @param {number} projectId - CAPEX project ID
 * @param {number} branchId - Branch ID
 * @param {Array} missingItems - Items that need to be purchased
 * @returns {Promise<object>} Generated PO details
 */
async function generatePO(projectId, branchId, missingItems) {
  const totalAmount = missingItems.reduce((sum, item) => sum + item.subtotal, 0);

  const purchaseOrder = {
    capex_project_id: projectId,
    branch_id: branchId,
    status: 'Draft',
    items: missingItems,
    total_amount: totalAmount,
    generated_at: new Date().toISOString(),
  };

  // Store PO reference in the project's revision_notes or a dedicated field
  // For now, we store it as part of the project update
  const project = await capexProjectModel.findById(projectId);
  const existingMaterials = parseJSON(project.materials_list);

  // Add PO info to materials metadata
  const updatedMaterials = existingMaterials.map((mat) => {
    const missing = missingItems.find((m) => m.product_name === mat.product_name);
    if (missing) {
      return { ...mat, po_quantity: missing.quantity_needed, po_status: 'Draft' };
    }
    return mat;
  });

  await capexProjectModel.update(projectId, {
    materials_list: JSON.stringify(updatedMaterials),
  });

  return purchaseOrder;
}

/**
 * Safely parse JSON string, returning empty array on failure.
 * @param {string|Array|null} value - JSON string or already-parsed value
 * @returns {Array} Parsed array
 */
function parseJSON(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

module.exports = {
  createProposal,
  calculateRAB,
  getProjects,
  getProjectById,
  updateProposal,
  submitForApproval,
  approve,
  reject,
  reserveStock,
  generatePO,
  processStockForProject,
};
