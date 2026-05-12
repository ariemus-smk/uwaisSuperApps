/**
 * Ticket model for App DB.
 * Provides data access methods for the `tickets` table.
 * Supports status tracking: Open, InProgress, Pending, Resolved, Closed.
 * Supports multiple open tickets per customer simultaneously.
 *
 * Requirements: 24.1, 24.3, 24.5
 */

const { appPool } = require('../config/database');
const { TICKET_STATUS } = require('../utils/constants');

/**
 * Find a ticket by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Ticket record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    'SELECT * FROM tickets WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find a ticket by ID with customer and subscription details joined.
 * @param {number} id
 * @returns {Promise<object|null>} Ticket record with joins or null
 */
async function findByIdWithDetails(id) {
  const [rows] = await appPool.execute(
    `SELECT t.*,
            c.full_name AS customer_name, c.whatsapp_number AS customer_whatsapp,
            s.pppoe_username, s.package_id,
            u.full_name AS assigned_teknisi_name
     FROM tickets t
     LEFT JOIN customers c ON t.customer_id = c.id
     LEFT JOIN subscriptions s ON t.subscription_id = s.id
     LEFT JOIN users u ON t.assigned_teknisi_id = u.id
     WHERE t.id = ? LIMIT 1`,
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find all tickets for a customer.
 * Supports multiple open tickets per customer (Req 24.3).
 * @param {number} customerId
 * @returns {Promise<Array>} List of ticket records
 */
async function findByCustomerId(customerId) {
  const [rows] = await appPool.execute(
    'SELECT * FROM tickets WHERE customer_id = ? ORDER BY created_at DESC',
    [customerId]
  );
  return rows;
}

/**
 * List tickets with optional filters and pagination.
 * Supports branch scoping.
 * @param {object} [filters={}] - Optional filters
 * @param {number} [filters.branch_id] - Filter by branch
 * @param {number} [filters.customer_id] - Filter by customer
 * @param {string} [filters.status] - Filter by ticket status
 * @param {string} [filters.priority] - Filter by priority
 * @param {number} [filters.assigned_teknisi_id] - Filter by assigned technician
 * @param {string} [filters.search] - Search by issue description
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @returns {Promise<{tickets: Array, total: number}>} Paginated ticket list
 */
async function findAll(filters = {}) {
  const { branch_id, customer_id, status, priority, assigned_teknisi_id, search, page = 1, limit = 20 } = filters;

  let countQuery = 'SELECT COUNT(*) as total FROM tickets WHERE 1=1';
  let dataQuery = `SELECT t.*, c.full_name AS customer_name, u.full_name AS assigned_teknisi_name
     FROM tickets t
     LEFT JOIN customers c ON t.customer_id = c.id
     LEFT JOIN users u ON t.assigned_teknisi_id = u.id
     WHERE 1=1`;
  const params = [];

  if (branch_id) {
    countQuery += ' AND branch_id = ?';
    dataQuery += ' AND t.branch_id = ?';
    params.push(branch_id);
  }

  if (customer_id) {
    countQuery += ' AND customer_id = ?';
    dataQuery += ' AND t.customer_id = ?';
    params.push(customer_id);
  }

  if (status) {
    countQuery += ' AND status = ?';
    dataQuery += ' AND t.status = ?';
    params.push(status);
  }

  if (priority) {
    countQuery += ' AND priority = ?';
    dataQuery += ' AND t.priority = ?';
    params.push(priority);
  }

  if (assigned_teknisi_id) {
    countQuery += ' AND assigned_teknisi_id = ?';
    dataQuery += ' AND t.assigned_teknisi_id = ?';
    params.push(assigned_teknisi_id);
  }

  if (search) {
    countQuery += ' AND issue_description LIKE ?';
    dataQuery += ' AND t.issue_description LIKE ?';
    params.push(`%${search}%`);
  }

  const [countRows] = await appPool.execute(countQuery, params);
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  dataQuery += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
  const dataParams = [...params, String(limit), String(offset)];

  const [rows] = await appPool.execute(dataQuery, dataParams);

  return { tickets: rows, total };
}

/**
 * Create a new ticket.
 * Initial status is always 'Open'.
 * @param {object} data - Ticket data
 * @param {number} data.customer_id
 * @param {number|null} [data.subscription_id]
 * @param {string} data.issue_description
 * @param {string} data.source - 'Pelanggan', 'Teknisi', or 'Admin'
 * @param {string} data.priority - 'VIP', 'High', 'Normal', or 'Low'
 * @param {number} data.branch_id
 * @returns {Promise<object>} Created ticket with insertId
 */
async function create(data) {
  const {
    customer_id,
    subscription_id = null,
    issue_description,
    source,
    priority,
    branch_id,
  } = data;

  const status = TICKET_STATUS.OPEN;

  const [result] = await appPool.execute(
    `INSERT INTO tickets (customer_id, subscription_id, issue_description, source, priority, status, branch_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [customer_id, subscription_id, issue_description, source, priority, status, branch_id]
  );

  return { id: result.insertId, ...data, status };
}

/**
 * Update a ticket record.
 * @param {number} id - Ticket ID
 * @param {object} updateData - Fields to update
 * @returns {Promise<object>} Query result
 */
async function update(id, updateData) {
  const allowedFields = [
    'status', 'assigned_teknisi_id', 'resolution_type',
    'damage_classification', 'resolution_category', 'resolved_at', 'closed_at', 'closed_by',
  ];
  const setClauses = [];
  const params = [];

  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      params.push(updateData[field]);
    }
  }

  if (setClauses.length === 0) {
    return { affectedRows: 0 };
  }

  params.push(id);

  const [result] = await appPool.execute(
    `UPDATE tickets SET ${setClauses.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Count open tickets for a customer.
 * Open tickets are those not in Closed status.
 * @param {number} customerId
 * @returns {Promise<number>} Count of open tickets
 */
async function countOpenByCustomer(customerId) {
  const [rows] = await appPool.execute(
    `SELECT COUNT(*) AS count FROM tickets
     WHERE customer_id = ? AND status NOT IN ('Resolved', 'Closed')`,
    [customerId]
  );
  return rows[0].count;
}

module.exports = {
  findById,
  findByIdWithDetails,
  findByCustomerId,
  findAll,
  create,
  update,
  countOpenByCustomer,
};
