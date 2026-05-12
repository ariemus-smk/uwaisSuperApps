/**
 * Tool Lending model for App DB.
 * Provides data access methods for the `tool_lendings` table.
 * Tracks tool borrow requests, approvals, returns, and accountability.
 */

const { appPool } = require('../config/database');

/**
 * Find all tool lending records with optional filtering.
 * @param {object} [filters={}] - Optional filters (branch_id, teknisi_id, status, asset_id)
 * @param {object} [pagination={}] - Optional pagination (page, limit)
 * @returns {Promise<{data: Array, total: number}>} List of lending records with total count
 */
async function findAll(filters = {}, pagination = {}) {
  let countQuery = 'SELECT COUNT(*) as total FROM tool_lendings';
  let query = `SELECT tl.*, 
    a.product_name, a.brand_model, a.serial_number, a.category,
    u.full_name as teknisi_name
    FROM tool_lendings tl
    LEFT JOIN assets a ON tl.asset_id = a.id
    LEFT JOIN users u ON tl.teknisi_id = u.id`;
  const conditions = [];
  const params = [];

  if (filters.branch_id) {
    conditions.push('tl.branch_id = ?');
    params.push(filters.branch_id);
  }
  if (filters.teknisi_id) {
    conditions.push('tl.teknisi_id = ?');
    params.push(filters.teknisi_id);
  }
  if (filters.status) {
    conditions.push('tl.status = ?');
    params.push(filters.status);
  }
  if (filters.asset_id) {
    conditions.push('tl.asset_id = ?');
    params.push(filters.asset_id);
  }

  if (conditions.length > 0) {
    const whereClause = ' WHERE ' + conditions.join(' AND ');
    countQuery += whereClause.replace(/tl\./g, '');
    query += whereClause;
  }

  query += ' ORDER BY tl.created_at DESC';

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
 * Find a tool lending record by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Lending record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    `SELECT tl.*, 
      a.product_name, a.brand_model, a.serial_number, a.category,
      u.full_name as teknisi_name
     FROM tool_lendings tl
     LEFT JOIN assets a ON tl.asset_id = a.id
     LEFT JOIN users u ON tl.teknisi_id = u.id
     WHERE tl.id = ? LIMIT 1`,
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find active lending for a specific asset (status = Approved or Active).
 * Used to check if a tool is currently borrowed.
 * @param {number} assetId
 * @returns {Promise<object|null>} Active lending record or null
 */
async function findActiveByAssetId(assetId) {
  const [rows] = await appPool.execute(
    `SELECT * FROM tool_lendings 
     WHERE asset_id = ? AND status IN ('Requested', 'Approved', 'Active') 
     LIMIT 1`,
    [assetId]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find all currently borrowed tools for a branch (status = Approved or Active).
 * Includes borrower information and borrow duration.
 * @param {number} branchId
 * @param {object} [pagination={}] - Optional pagination (page, limit)
 * @returns {Promise<{data: Array, total: number}>} Borrowed tools with details
 */
async function findBorrowedByBranch(branchId, pagination = {}) {
  const countQuery = `SELECT COUNT(*) as total FROM tool_lendings 
    WHERE branch_id = ? AND status IN ('Approved', 'Active')`;

  const query = `SELECT tl.*, 
    a.product_name, a.brand_model, a.serial_number, a.category,
    u.full_name as teknisi_name,
    DATEDIFF(CURDATE(), tl.borrow_date) as borrow_duration_days
    FROM tool_lendings tl
    LEFT JOIN assets a ON tl.asset_id = a.id
    LEFT JOIN users u ON tl.teknisi_id = u.id
    WHERE tl.branch_id = ? AND tl.status IN ('Approved', 'Active')
    ORDER BY tl.borrow_date ASC
    LIMIT ? OFFSET ?`;

  const page = parseInt(pagination.page, 10) || 1;
  const limit = parseInt(pagination.limit, 10) || 20;
  const offset = (page - 1) * limit;

  const [countRows] = await appPool.execute(countQuery, [branchId]);
  const total = countRows[0].total;

  const [rows] = await appPool.execute(query, [branchId, String(limit), String(offset)]);

  return { data: rows, total };
}

/**
 * Create a new tool lending record.
 * @param {object} data - Lending data
 * @param {object} [connection] - Optional existing connection (for transactions)
 * @returns {Promise<object>} Created lending record with inserted ID
 */
async function create(data, connection = null) {
  const {
    asset_id,
    teknisi_id,
    branch_id,
    borrow_date,
    expected_return_date,
    status = 'Requested',
  } = data;

  const conn = connection || appPool;

  const [result] = await conn.execute(
    `INSERT INTO tool_lendings (asset_id, teknisi_id, branch_id, borrow_date, 
     expected_return_date, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [asset_id, teknisi_id, branch_id, borrow_date, expected_return_date, status]
  );

  return { id: result.insertId, ...data, status };
}

/**
 * Update a tool lending record.
 * @param {number} id - Lending ID
 * @param {object} data - Fields to update
 * @param {object} [connection] - Optional existing connection (for transactions)
 * @returns {Promise<object>} Query result
 */
async function update(id, data, connection = null) {
  const fields = [];
  const params = [];

  const allowedFields = [
    'status', 'actual_return_date', 'condition_on_return', 'approved_by',
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

  params.push(id);

  const conn = connection || appPool;

  const [result] = await conn.execute(
    `UPDATE tool_lendings SET ${fields.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

module.exports = {
  findAll,
  findById,
  findActiveByAssetId,
  findBorrowedByBranch,
  create,
  update,
};
