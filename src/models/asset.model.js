/**
 * Asset model for App DB.
 * Provides data access methods for the `assets` table.
 * Handles status tracking and category-based queries.
 */

const { appPool } = require('../config/database');

/**
 * Find all assets with optional filtering and branch scoping.
 * @param {object} [filters={}] - Optional filters (branch_id, status, category, inbound_id)
 * @param {object} [pagination={}] - Optional pagination (page, limit)
 * @returns {Promise<{data: Array, total: number}>} List of asset records with total count
 */
async function findAll(filters = {}, pagination = {}) {
  let countQuery = 'SELECT COUNT(*) as total FROM assets';
  let query = 'SELECT * FROM assets';
  const conditions = [];
  const params = [];

  if (filters.branch_id) {
    conditions.push('branch_id = ?');
    params.push(filters.branch_id);
  }
  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.category) {
    conditions.push('category = ?');
    params.push(filters.category);
  }
  if (filters.inbound_id) {
    conditions.push('inbound_id = ?');
    params.push(filters.inbound_id);
  }
  if (filters.customer_id) {
    conditions.push('customer_id = ?');
    params.push(filters.customer_id);
  }
  if (filters.assigned_teknisi_id) {
    conditions.push('assigned_teknisi_id = ?');
    params.push(filters.assigned_teknisi_id);
  }

  if (conditions.length > 0) {
    const whereClause = ' WHERE ' + conditions.join(' AND ');
    countQuery += whereClause;
    query += whereClause;
  }

  query += ' ORDER BY created_at DESC';

  // Pagination
  const page = parseInt(pagination.page, 10) || 1;
  const limit = parseInt(pagination.limit, 10) || 20;
  const offset = (page - 1) * limit;

  query += ' LIMIT ? OFFSET ?';

  const [countRows] = await appPool.execute(countQuery, params);
  const total = countRows[0].total;

  const [rows] = await appPool.execute(query, [...params, String(limit), String(offset)]);

  return { data: rows, total };
}

/**
 * Find an asset by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Asset record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    'SELECT * FROM assets WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find an asset by serial number.
 * @param {string} serialNumber
 * @returns {Promise<object|null>} Asset record or null
 */
async function findBySerialNumber(serialNumber) {
  const [rows] = await appPool.execute(
    'SELECT * FROM assets WHERE serial_number = ? LIMIT 1',
    [serialNumber]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find assets by inbound ID.
 * @param {number} inboundId
 * @returns {Promise<Array>} List of assets for the given inbound
 */
async function findByInboundId(inboundId) {
  const [rows] = await appPool.execute(
    'SELECT * FROM assets WHERE inbound_id = ? ORDER BY id ASC',
    [inboundId]
  );
  return rows;
}

/**
 * Get stock count for a branch, grouped by category and status.
 * @param {number} branchId
 * @returns {Promise<Array>} Stock summary rows
 */
async function getStockSummary(branchId) {
  const [rows] = await appPool.execute(
    `SELECT category, status, COUNT(*) as count, 
            SUM(remaining_quantity) as total_quantity
     FROM assets 
     WHERE branch_id = ?
     GROUP BY category, status
     ORDER BY category, status`,
    [branchId]
  );
  return rows;
}

/**
 * Get the count of available assets for a branch by category.
 * @param {number} branchId
 * @param {string} category - Asset category
 * @returns {Promise<number>} Count of available assets
 */
async function getAvailableCount(branchId, category) {
  const [rows] = await appPool.execute(
    `SELECT COUNT(*) as count FROM assets 
     WHERE branch_id = ? AND category = ? AND status = 'Tersedia'`,
    [branchId, category]
  );
  return rows[0].count;
}

/**
 * Get total available quantity for a branch by category.
 * For Kabel: sum of remaining_quantity in meters.
 * For Aksesoris: sum of remaining_quantity in pieces.
 * For PerangkatAktif: count of available units.
 * @param {number} branchId
 * @param {string} category - Asset category
 * @returns {Promise<number>} Total available quantity
 */
async function getAvailableQuantity(branchId, category) {
  const [rows] = await appPool.execute(
    `SELECT COALESCE(SUM(remaining_quantity), 0) as total_quantity FROM assets 
     WHERE branch_id = ? AND category = ? AND status = 'Tersedia'`,
    [branchId, category]
  );
  return Number(rows[0].total_quantity);
}

/**
 * Find available assets for a branch by category with sufficient remaining quantity.
 * Returns assets ordered by oldest first (FIFO).
 * @param {number} branchId
 * @param {string} category - Asset category
 * @returns {Promise<Array>} List of available assets
 */
async function findAvailable(branchId, category) {
  const [rows] = await appPool.execute(
    `SELECT * FROM assets 
     WHERE branch_id = ? AND category = ? AND status = 'Tersedia' AND remaining_quantity > 0
     ORDER BY created_at ASC`,
    [branchId, category]
  );
  return rows;
}

/**
 * Update remaining quantity for an asset.
 * @param {number} id - Asset ID
 * @param {number} remainingQuantity - New remaining quantity
 * @param {object} [connection] - Optional connection for transactions
 * @returns {Promise<object>} Query result
 */
async function updateRemainingQuantity(id, remainingQuantity, connection = null) {
  const conn = connection || appPool;
  const [result] = await conn.execute(
    `UPDATE assets SET remaining_quantity = ?, updated_at = NOW() WHERE id = ?`,
    [remainingQuantity, id]
  );
  return result;
}

/**
 * Update asset status with optional extra fields (supports transactions).
 * @param {number} id - Asset ID
 * @param {string} status - New status
 * @param {object} [extra={}] - Additional fields to update
 * @param {object} [connection] - Optional connection for transactions
 * @returns {Promise<object>} Query result
 */
async function updateStatusTx(id, status, extra = {}, connection = null) {
  const conn = connection || appPool;
  const fields = ['status = ?', 'updated_at = NOW()'];
  const params = [status];

  if (extra.customer_id !== undefined) {
    fields.push('customer_id = ?');
    params.push(extra.customer_id);
  }
  if (extra.assigned_teknisi_id !== undefined) {
    fields.push('assigned_teknisi_id = ?');
    params.push(extra.assigned_teknisi_id);
  }
  if (extra.branch_id !== undefined) {
    fields.push('branch_id = ?');
    params.push(extra.branch_id);
  }
  if (extra.remaining_quantity !== undefined) {
    fields.push('remaining_quantity = ?');
    params.push(extra.remaining_quantity);
  }

  params.push(id);

  const [result] = await conn.execute(
    `UPDATE assets SET ${fields.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Create a new asset record.
 * @param {object} data - Asset data
 * @returns {Promise<object>} Created asset with inserted ID
 */
async function create(data) {
  const {
    product_name,
    brand_model = null,
    category,
    serial_number,
    mac_address = null,
    status = 'Tersedia',
    branch_id,
    customer_id = null,
    assigned_teknisi_id = null,
    quantity = 1,
    remaining_quantity = null,
    inbound_id = null,
  } = data;

  const finalRemainingQuantity = remaining_quantity !== null ? remaining_quantity : quantity;

  const [result] = await appPool.execute(
    `INSERT INTO assets (product_name, brand_model, category, serial_number, mac_address, 
     status, branch_id, customer_id, assigned_teknisi_id, quantity, remaining_quantity, 
     inbound_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      product_name,
      brand_model,
      category,
      serial_number,
      mac_address,
      status,
      branch_id,
      customer_id,
      assigned_teknisi_id,
      quantity,
      finalRemainingQuantity,
      inbound_id,
    ]
  );

  return { id: result.insertId, ...data, status, quantity, remaining_quantity: finalRemainingQuantity };
}

/**
 * Create multiple asset records in a batch (within a transaction).
 * @param {Array<object>} assets - Array of asset data objects
 * @param {object} [connection] - Optional existing connection (for transactions)
 * @returns {Promise<Array<number>>} Array of inserted IDs
 */
async function createBatch(assets, connection = null) {
  const conn = connection || await appPool.getConnection();
  const insertedIds = [];

  try {
    if (!connection) await conn.beginTransaction();

    for (const asset of assets) {
      const {
        product_name,
        brand_model = null,
        category,
        serial_number,
        mac_address = null,
        status = 'Tersedia',
        branch_id,
        customer_id = null,
        assigned_teknisi_id = null,
        quantity = 1,
        remaining_quantity = null,
        inbound_id = null,
      } = asset;

      const finalRemainingQuantity = remaining_quantity !== null ? remaining_quantity : quantity;

      const [result] = await conn.execute(
        `INSERT INTO assets (product_name, brand_model, category, serial_number, mac_address, 
         status, branch_id, customer_id, assigned_teknisi_id, quantity, remaining_quantity, 
         inbound_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          product_name,
          brand_model,
          category,
          serial_number,
          mac_address,
          status,
          branch_id,
          customer_id,
          assigned_teknisi_id,
          quantity,
          finalRemainingQuantity,
          inbound_id,
        ]
      );

      insertedIds.push(result.insertId);
    }

    if (!connection) await conn.commit();
    return insertedIds;
  } catch (err) {
    if (!connection) await conn.rollback();
    throw err;
  } finally {
    if (!connection) conn.release();
  }
}

/**
 * Update an asset record.
 * @param {number} id - Asset ID
 * @param {object} data - Fields to update
 * @returns {Promise<object>} Query result
 */
async function update(id, data) {
  const fields = [];
  const params = [];

  const allowedFields = [
    'product_name', 'brand_model', 'category', 'serial_number', 'mac_address',
    'status', 'branch_id', 'customer_id', 'assigned_teknisi_id',
    'quantity', 'remaining_quantity', 'inbound_id',
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      fields.push(`${field} = ?`);
      params.push(data[field]);
    }
  }

  if (fields.length === 0) {
    return { affectedRows: 0 };
  }

  fields.push('updated_at = NOW()');
  params.push(id);

  const [result] = await appPool.execute(
    `UPDATE assets SET ${fields.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Update asset status.
 * @param {number} id - Asset ID
 * @param {string} status - New status
 * @param {object} [extra={}] - Additional fields to update (customer_id, assigned_teknisi_id, branch_id)
 * @returns {Promise<object>} Query result
 */
async function updateStatus(id, status, extra = {}) {
  const fields = ['status = ?', 'updated_at = NOW()'];
  const params = [status];

  if (extra.customer_id !== undefined) {
    fields.push('customer_id = ?');
    params.push(extra.customer_id);
  }
  if (extra.assigned_teknisi_id !== undefined) {
    fields.push('assigned_teknisi_id = ?');
    params.push(extra.assigned_teknisi_id);
  }
  if (extra.branch_id !== undefined) {
    fields.push('branch_id = ?');
    params.push(extra.branch_id);
  }

  params.push(id);

  const [result] = await appPool.execute(
    `UPDATE assets SET ${fields.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Get all existing serial numbers for a given date (for SN generation).
 * @param {string} dateStr - Date string in YYYYMMDD format
 * @returns {Promise<Set<string>>} Set of existing serial numbers matching the date
 */
async function getExistingSerialsByDate(dateStr) {
  const [rows] = await appPool.execute(
    `SELECT serial_number FROM assets WHERE serial_number LIKE ?`,
    [`UBG-${dateStr}-%`]
  );
  return new Set(rows.map(r => r.serial_number));
}

/**
 * Delete an asset by ID.
 * @param {number} id - Asset ID
 * @returns {Promise<object>} Query result
 */
async function deleteById(id) {
  const [result] = await appPool.execute(
    'DELETE FROM assets WHERE id = ?',
    [id]
  );
  return result;
}

module.exports = {
  findAll,
  findById,
  findBySerialNumber,
  findByInboundId,
  getStockSummary,
  getAvailableCount,
  getAvailableQuantity,
  findAvailable,
  updateRemainingQuantity,
  updateStatusTx,
  create,
  createBatch,
  update,
  updateStatus,
  getExistingSerialsByDate,
  deleteById,
};
