/**
 * Stock Opname model for App DB.
 * Provides data access methods for the `stock_opnames` table.
 * Tracks physical inventory audit sessions and adjustment records.
 */

const { appPool } = require('../config/database');

/**
 * Find all stock opname records with optional filtering.
 * @param {object} [filters={}] - Optional filters (branch_id, status, conducted_by)
 * @param {object} [pagination={}] - Optional pagination (page, limit)
 * @returns {Promise<{data: Array, total: number}>} List of stock opname records with total count
 */
async function findAll(filters = {}, pagination = {}) {
  let countQuery = 'SELECT COUNT(*) as total FROM stock_opnames';
  let query = `SELECT so.*, 
    b.name as branch_name,
    u.full_name as conducted_by_name
    FROM stock_opnames so
    LEFT JOIN branches b ON so.branch_id = b.id
    LEFT JOIN users u ON so.conducted_by = u.id`;
  const conditions = [];
  const params = [];

  if (filters.branch_id) {
    conditions.push('so.branch_id = ?');
    params.push(filters.branch_id);
  }
  if (filters.status) {
    conditions.push('so.status = ?');
    params.push(filters.status);
  }
  if (filters.conducted_by) {
    conditions.push('so.conducted_by = ?');
    params.push(filters.conducted_by);
  }

  if (conditions.length > 0) {
    const whereClause = ' WHERE ' + conditions.join(' AND ');
    countQuery += whereClause.replace(/so\./g, '');
    query += whereClause;
  }

  query += ' ORDER BY so.started_at DESC';

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
 * Find a stock opname record by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Stock opname record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    `SELECT so.*, 
      b.name as branch_name,
      u.full_name as conducted_by_name
     FROM stock_opnames so
     LEFT JOIN branches b ON so.branch_id = b.id
     LEFT JOIN users u ON so.conducted_by = u.id
     WHERE so.id = ? LIMIT 1`,
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find an active (InProgress) stock opname session for a branch.
 * @param {number} branchId
 * @returns {Promise<object|null>} Active stock opname record or null
 */
async function findActiveByBranch(branchId) {
  const [rows] = await appPool.execute(
    `SELECT * FROM stock_opnames WHERE branch_id = ? AND status = 'InProgress' LIMIT 1`,
    [branchId]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Create a new stock opname record.
 * @param {object} data - Stock opname data
 * @param {number} data.branch_id - Branch ID
 * @param {number|null} data.conducted_by - User ID conducting the opname
 * @param {object} [connection] - Optional existing connection (for transactions)
 * @returns {Promise<object>} Created stock opname record with inserted ID
 */
async function create(data, connection = null) {
  const {
    branch_id,
    conducted_by = null,
  } = data;

  const conn = connection || appPool;

  const [result] = await conn.execute(
    `INSERT INTO stock_opnames (branch_id, conducted_by, status, started_at)
     VALUES (?, ?, 'InProgress', NOW())`,
    [branch_id, conducted_by]
  );

  return { id: result.insertId, branch_id, conducted_by, status: 'InProgress' };
}

/**
 * Update a stock opname record (adjustments, status, completed_at).
 * @param {number} id - Stock opname ID
 * @param {object} data - Fields to update
 * @param {object} [connection] - Optional existing connection (for transactions)
 * @returns {Promise<object>} Query result
 */
async function update(id, data, connection = null) {
  const fields = [];
  const params = [];

  if (data.status !== undefined) {
    fields.push('status = ?');
    params.push(data.status);
  }
  if (data.adjustments !== undefined) {
    fields.push('adjustments = ?');
    params.push(typeof data.adjustments === 'string' ? data.adjustments : JSON.stringify(data.adjustments));
  }
  if (data.completed_at !== undefined) {
    fields.push('completed_at = ?');
    params.push(data.completed_at);
  }

  if (fields.length === 0) {
    return { affectedRows: 0 };
  }

  params.push(id);

  const conn = connection || appPool;

  const [result] = await conn.execute(
    `UPDATE stock_opnames SET ${fields.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

module.exports = {
  findAll,
  findById,
  findActiveByBranch,
  create,
  update,
};
