/**
 * Asset Transfer model for App DB.
 * Provides data access methods for the `asset_transfers` table.
 * Tracks inter-branch asset transfers including surat jalan, receipt confirmation,
 * and return transfers with complete history.
 */

const { appPool } = require('../config/database');

/**
 * Find all transfer records with optional filtering and pagination.
 * @param {object} [filters={}] - Optional filters (source_branch_id, destination_branch_id, status, type)
 * @param {object} [pagination={}] - Optional pagination (page, limit)
 * @returns {Promise<{data: Array, total: number}>} List of transfer records with total count
 */
async function findAll(filters = {}, pagination = {}) {
  let countQuery = 'SELECT COUNT(*) as total FROM asset_transfers';
  let query = `SELECT at_.*,
    sb.name as source_branch_name,
    db.name as destination_branch_name,
    ui.full_name as initiated_by_name,
    uc.full_name as confirmed_by_name
    FROM asset_transfers at_
    LEFT JOIN branches sb ON at_.source_branch_id = sb.id
    LEFT JOIN branches db ON at_.destination_branch_id = db.id
    LEFT JOIN users ui ON at_.initiated_by = ui.id
    LEFT JOIN users uc ON at_.confirmed_by = uc.id`;
  const conditions = [];
  const params = [];

  if (filters.source_branch_id) {
    conditions.push('at_.source_branch_id = ?');
    params.push(filters.source_branch_id);
  }
  if (filters.destination_branch_id) {
    conditions.push('at_.destination_branch_id = ?');
    params.push(filters.destination_branch_id);
  }
  if (filters.status) {
    conditions.push('at_.status = ?');
    params.push(filters.status);
  }
  if (filters.type) {
    conditions.push('at_.type = ?');
    params.push(filters.type);
  }
  // Allow filtering by either source or destination branch
  if (filters.branch_id) {
    conditions.push('(at_.source_branch_id = ? OR at_.destination_branch_id = ?)');
    params.push(filters.branch_id, filters.branch_id);
  }

  if (conditions.length > 0) {
    const whereClause = ' WHERE ' + conditions.join(' AND ');
    countQuery += whereClause.replace(/at_\./g, '');
    query += whereClause;
  }

  query += ' ORDER BY at_.initiated_at DESC';

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
 * Find a transfer record by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Transfer record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    `SELECT at_.*,
      sb.name as source_branch_name,
      db.name as destination_branch_name,
      ui.full_name as initiated_by_name,
      uc.full_name as confirmed_by_name
     FROM asset_transfers at_
     LEFT JOIN branches sb ON at_.source_branch_id = sb.id
     LEFT JOIN branches db ON at_.destination_branch_id = db.id
     LEFT JOIN users ui ON at_.initiated_by = ui.id
     LEFT JOIN users uc ON at_.confirmed_by = uc.id
     WHERE at_.id = ? LIMIT 1`,
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Create a new transfer record.
 * @param {object} data - Transfer data
 * @param {object} [connection] - Optional existing connection (for transactions)
 * @returns {Promise<object>} Created transfer record with inserted ID
 */
async function create(data, connection = null) {
  const {
    source_branch_id,
    destination_branch_id,
    type = 'Transfer',
    status = 'Pending',
    items,
    initiated_by,
  } = data;

  const conn = connection || appPool;
  const itemsJson = typeof items === 'string' ? items : JSON.stringify(items);

  const [result] = await conn.execute(
    `INSERT INTO asset_transfers (source_branch_id, destination_branch_id, type, status, 
     items, initiated_by, initiated_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [source_branch_id, destination_branch_id, type, status, itemsJson, initiated_by]
  );

  return {
    id: result.insertId,
    source_branch_id,
    destination_branch_id,
    type,
    status,
    items: typeof items === 'string' ? JSON.parse(items) : items,
    initiated_by,
    initiated_at: new Date().toISOString(),
  };
}

/**
 * Update a transfer record's status and optional fields.
 * @param {number} id - Transfer ID
 * @param {object} data - Fields to update (status, confirmed_by, confirmed_at)
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
  if (data.confirmed_by !== undefined) {
    fields.push('confirmed_by = ?');
    params.push(data.confirmed_by);
  }
  if (data.confirmed_at !== undefined) {
    fields.push('confirmed_at = ?');
    params.push(data.confirmed_at);
  }
  if (data.items !== undefined) {
    const itemsJson = typeof data.items === 'string' ? data.items : JSON.stringify(data.items);
    fields.push('items = ?');
    params.push(itemsJson);
  }

  if (fields.length === 0) {
    return { affectedRows: 0 };
  }

  params.push(id);

  const conn = connection || appPool;

  const [result] = await conn.execute(
    `UPDATE asset_transfers SET ${fields.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Get transfer history for a specific branch (as source or destination).
 * Returns all transfers ordered by most recent first.
 * @param {number} branchId - Branch ID
 * @param {object} [pagination={}] - Optional pagination (page, limit)
 * @returns {Promise<{data: Array, total: number}>} Transfer history
 */
async function getHistoryByBranch(branchId, pagination = {}) {
  const countQuery = `SELECT COUNT(*) as total FROM asset_transfers 
    WHERE source_branch_id = ? OR destination_branch_id = ?`;

  const query = `SELECT at_.*,
    sb.name as source_branch_name,
    db.name as destination_branch_name,
    ui.full_name as initiated_by_name,
    uc.full_name as confirmed_by_name
    FROM asset_transfers at_
    LEFT JOIN branches sb ON at_.source_branch_id = sb.id
    LEFT JOIN branches db ON at_.destination_branch_id = db.id
    LEFT JOIN users ui ON at_.initiated_by = ui.id
    LEFT JOIN users uc ON at_.confirmed_by = uc.id
    WHERE at_.source_branch_id = ? OR at_.destination_branch_id = ?
    ORDER BY at_.initiated_at DESC
    LIMIT ? OFFSET ?`;

  const page = parseInt(pagination.page, 10) || 1;
  const limit = parseInt(pagination.limit, 10) || 20;
  const offset = (page - 1) * limit;

  const [countRows] = await appPool.execute(countQuery, [branchId, branchId]);
  const total = countRows[0].total;

  const [rows] = await appPool.execute(query, [branchId, branchId, String(limit), String(offset)]);

  return { data: rows, total };
}

/**
 * Find pending/in-transit transfers for a destination branch (awaiting confirmation).
 * @param {number} destinationBranchId - Destination branch ID
 * @returns {Promise<Array>} List of pending transfers
 */
async function findPendingForBranch(destinationBranchId) {
  const [rows] = await appPool.execute(
    `SELECT at_.*,
      sb.name as source_branch_name,
      ui.full_name as initiated_by_name
     FROM asset_transfers at_
     LEFT JOIN branches sb ON at_.source_branch_id = sb.id
     LEFT JOIN users ui ON at_.initiated_by = ui.id
     WHERE at_.destination_branch_id = ? AND at_.status = 'InTransit'
     ORDER BY at_.initiated_at ASC`,
    [destinationBranchId]
  );
  return rows;
}

module.exports = {
  findAll,
  findById,
  create,
  update,
  getHistoryByBranch,
  findPendingForBranch,
};
