/**
 * Direct Sale model for App DB.
 * Provides data access methods for the `direct_sales` table.
 * Tracks non-subscription hardware sales to customers.
 */

const { appPool } = require('../config/database');

/**
 * Find all direct sale records with optional filtering.
 * @param {object} [filters={}] - Optional filters (branch_id, customer_id, payment_status, sold_by)
 * @param {object} [pagination={}] - Optional pagination (page, limit)
 * @returns {Promise<{data: Array, total: number}>} List of direct sale records with total count
 */
async function findAll(filters = {}, pagination = {}) {
  let countQuery = 'SELECT COUNT(*) as total FROM direct_sales';
  let query = `SELECT ds.*, 
    c.full_name as customer_name, c.whatsapp_number as customer_phone,
    u.full_name as sold_by_name
    FROM direct_sales ds
    LEFT JOIN customers c ON ds.customer_id = c.id
    LEFT JOIN users u ON ds.sold_by = u.id`;
  const conditions = [];
  const params = [];

  if (filters.branch_id) {
    conditions.push('ds.branch_id = ?');
    params.push(filters.branch_id);
  }
  if (filters.customer_id) {
    conditions.push('ds.customer_id = ?');
    params.push(filters.customer_id);
  }
  if (filters.payment_status) {
    conditions.push('ds.payment_status = ?');
    params.push(filters.payment_status);
  }
  if (filters.sold_by) {
    conditions.push('ds.sold_by = ?');
    params.push(filters.sold_by);
  }

  if (conditions.length > 0) {
    const whereClause = ' WHERE ' + conditions.join(' AND ');
    countQuery += whereClause.replace(/ds\./g, '');
    query += whereClause;
  }

  query += ' ORDER BY ds.created_at DESC';

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
 * Find a direct sale record by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Direct sale record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    `SELECT ds.*, 
      c.full_name as customer_name, c.whatsapp_number as customer_phone,
      u.full_name as sold_by_name
     FROM direct_sales ds
     LEFT JOIN customers c ON ds.customer_id = c.id
     LEFT JOIN users u ON ds.sold_by = u.id
     WHERE ds.id = ? LIMIT 1`,
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find direct sales by customer ID (transaction history linked to customer profile).
 * @param {number} customerId
 * @param {object} [pagination={}] - Optional pagination (page, limit)
 * @returns {Promise<{data: Array, total: number}>} Customer's direct sale history
 */
async function findByCustomerId(customerId, pagination = {}) {
  const countQuery = 'SELECT COUNT(*) as total FROM direct_sales WHERE customer_id = ?';
  let query = `SELECT ds.*, u.full_name as sold_by_name
    FROM direct_sales ds
    LEFT JOIN users u ON ds.sold_by = u.id
    WHERE ds.customer_id = ?
    ORDER BY ds.created_at DESC`;

  const page = parseInt(pagination.page, 10) || 1;
  const limit = parseInt(pagination.limit, 10) || 20;
  const offset = (page - 1) * limit;

  query += ' LIMIT ? OFFSET ?';

  const [countRows] = await appPool.execute(countQuery, [customerId]);
  const total = countRows[0].total;

  const [rows] = await appPool.execute(query, [customerId, String(limit), String(offset)]);

  return { data: rows, total };
}

/**
 * Create a new direct sale record.
 * @param {object} data - Direct sale data
 * @param {number} data.customer_id - Customer ID
 * @param {number} data.branch_id - Branch ID
 * @param {number|null} data.sold_by - User ID who made the sale
 * @param {string} data.payment_method - Payment method: 'Cash' or 'Hutang'
 * @param {number} data.total_amount - Total sale amount
 * @param {string} data.items - JSON string of items with serial numbers
 * @param {string} data.payment_status - Payment status: 'Lunas' or 'Piutang'
 * @param {object} [connection] - Optional existing connection (for transactions)
 * @returns {Promise<object>} Created direct sale record with inserted ID
 */
async function create(data, connection = null) {
  const {
    customer_id,
    branch_id,
    sold_by = null,
    payment_method,
    total_amount,
    items,
    payment_status,
  } = data;

  const conn = connection || appPool;

  const [result] = await conn.execute(
    `INSERT INTO direct_sales (customer_id, branch_id, sold_by, payment_method, 
     total_amount, items, payment_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [customer_id, branch_id, sold_by, payment_method, total_amount, items, payment_status]
  );

  return { id: result.insertId, ...data };
}

module.exports = {
  findAll,
  findById,
  findByCustomerId,
  create,
};
