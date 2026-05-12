/**
 * Asset Inbound model for App DB.
 * Provides data access methods for the `asset_inbounds` table.
 * Tracks incoming inventory records with invoice and supplier details.
 */

const { appPool } = require('../config/database');

/**
 * Find all asset inbound records with optional filtering.
 * @param {object} [filters={}] - Optional filters (branch_id, supplier_name)
 * @param {object} [pagination={}] - Optional pagination (page, limit)
 * @returns {Promise<{data: Array, total: number}>} List of inbound records with total count
 */
async function findAll(filters = {}, pagination = {}) {
  let countQuery = 'SELECT COUNT(*) as total FROM asset_inbounds';
  let query = 'SELECT * FROM asset_inbounds';
  const conditions = [];
  const params = [];

  if (filters.branch_id) {
    conditions.push('branch_id = ?');
    params.push(filters.branch_id);
  }
  if (filters.supplier_name) {
    conditions.push('supplier_name LIKE ?');
    params.push(`%${filters.supplier_name}%`);
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
 * Find an asset inbound record by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Inbound record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    'SELECT * FROM asset_inbounds WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Create a new asset inbound record.
 * @param {object} data - Inbound data
 * @param {string} data.invoice_number - Purchase invoice number
 * @param {string} data.purchase_date - Purchase date (YYYY-MM-DD)
 * @param {string|null} data.invoice_file_url - URL to invoice file attachment
 * @param {string} data.supplier_name - Supplier name
 * @param {number} data.branch_id - Destination branch ID
 * @param {number|null} data.recorded_by - User ID who recorded the inbound
 * @param {object} [connection] - Optional existing connection (for transactions)
 * @returns {Promise<object>} Created inbound record with inserted ID
 */
async function create(data, connection = null) {
  const {
    invoice_number,
    purchase_date,
    invoice_file_url = null,
    supplier_name,
    branch_id,
    recorded_by = null,
  } = data;

  const conn = connection || appPool;

  const [result] = await conn.execute(
    `INSERT INTO asset_inbounds (invoice_number, purchase_date, invoice_file_url, 
     supplier_name, branch_id, recorded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [invoice_number, purchase_date, invoice_file_url, supplier_name, branch_id, recorded_by]
  );

  return { id: result.insertId, ...data };
}

/**
 * Update an asset inbound record.
 * @param {number} id - Inbound ID
 * @param {object} data - Fields to update
 * @returns {Promise<object>} Query result
 */
async function update(id, data) {
  const fields = [];
  const params = [];

  const allowedFields = [
    'invoice_number', 'purchase_date', 'invoice_file_url', 'supplier_name',
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

  const [result] = await appPool.execute(
    `UPDATE asset_inbounds SET ${fields.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Delete an asset inbound record by ID.
 * @param {number} id - Inbound ID
 * @returns {Promise<object>} Query result
 */
async function deleteById(id) {
  const [result] = await appPool.execute(
    'DELETE FROM asset_inbounds WHERE id = ?',
    [id]
  );
  return result;
}

module.exports = {
  findAll,
  findById,
  create,
  update,
  deleteById,
};
