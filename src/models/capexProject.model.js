/**
 * CAPEX Project model for App DB.
 * Provides data access methods for the `capex_projects` table.
 * Handles expansion project proposals with status workflow.
 *
 * Requirements: 37.1, 37.2, 37.3, 37.4, 37.5, 37.6
 */

const { appPool } = require('../config/database');

/**
 * Find all CAPEX projects with optional filtering and branch scoping.
 * @param {object} [filters={}] - Optional filters (branch_id, status, created_by)
 * @param {object} [pagination={}] - Optional pagination (page, limit)
 * @returns {Promise<{data: Array, total: number}>} List of project records with total count
 */
async function findAll(filters = {}, pagination = {}) {
  let countQuery = 'SELECT COUNT(*) as total FROM capex_projects';
  let query = `SELECT cp.*, u.full_name as created_by_name, ab.full_name as approved_by_name
     FROM capex_projects cp
     LEFT JOIN users u ON cp.created_by = u.id
     LEFT JOIN users ab ON cp.approved_by = ab.id`;
  const conditions = [];
  const params = [];

  if (filters.branch_id) {
    conditions.push('cp.branch_id = ?');
    params.push(filters.branch_id);
  }
  if (filters.status) {
    conditions.push('cp.status = ?');
    params.push(filters.status);
  }
  if (filters.created_by) {
    conditions.push('cp.created_by = ?');
    params.push(filters.created_by);
  }

  if (conditions.length > 0) {
    const whereClause = ' WHERE ' + conditions.join(' AND ');
    countQuery += whereClause.replace(/cp\./g, '');
    query += whereClause;
  }

  query += ' ORDER BY cp.created_at DESC';

  // Pagination
  const page = parseInt(pagination.page, 10) || 1;
  const limit = parseInt(pagination.limit, 10) || 20;
  const offset = (page - 1) * limit;

  query += ' LIMIT ? OFFSET ?';

  const countConditions = [];
  const countParams = [];
  if (filters.branch_id) {
    countConditions.push('branch_id = ?');
    countParams.push(filters.branch_id);
  }
  if (filters.status) {
    countConditions.push('status = ?');
    countParams.push(filters.status);
  }
  if (filters.created_by) {
    countConditions.push('created_by = ?');
    countParams.push(filters.created_by);
  }

  let countSql = 'SELECT COUNT(*) as total FROM capex_projects';
  if (countConditions.length > 0) {
    countSql += ' WHERE ' + countConditions.join(' AND ');
  }

  const [countRows] = await appPool.execute(countSql, countParams);
  const total = countRows[0].total;

  const [rows] = await appPool.execute(query, [...params, String(limit), String(offset)]);

  return { data: rows, total };
}

/**
 * Find a CAPEX project by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Project record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    `SELECT cp.*, u.full_name as created_by_name, ab.full_name as approved_by_name
     FROM capex_projects cp
     LEFT JOIN users u ON cp.created_by = u.id
     LEFT JOIN users ab ON cp.approved_by = ab.id
     WHERE cp.id = ? LIMIT 1`,
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Create a new CAPEX project record.
 * @param {object} data - Project data
 * @param {string} data.project_name - Project name
 * @param {string} data.target_area - Target expansion area
 * @param {number} data.target_customer_count - Target number of customers
 * @param {string} data.materials_list - JSON string of required materials
 * @param {number} data.calculated_rab - Calculated budget estimate
 * @param {string} data.status - Project status
 * @param {number} data.branch_id - Branch ID
 * @param {number} data.created_by - User ID who created the proposal
 * @returns {Promise<object>} Created project with inserted ID
 */
async function create(data) {
  const {
    project_name,
    target_area,
    target_customer_count,
    materials_list,
    calculated_rab = 0,
    status = 'Draft',
    branch_id,
    created_by,
    revision_notes = null,
  } = data;

  const [result] = await appPool.execute(
    `INSERT INTO capex_projects (project_name, target_area, target_customer_count, 
     materials_list, calculated_rab, status, branch_id, created_by, revision_notes,
     created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      project_name,
      target_area,
      target_customer_count,
      materials_list,
      calculated_rab,
      status,
      branch_id,
      created_by,
      revision_notes,
    ]
  );

  return { id: result.insertId, ...data, status, calculated_rab };
}

/**
 * Update a CAPEX project record.
 * @param {number} id - Project ID
 * @param {object} data - Fields to update
 * @returns {Promise<object>} Query result
 */
async function update(id, data) {
  const fields = [];
  const params = [];

  const allowedFields = [
    'project_name', 'target_area', 'target_customer_count',
    'materials_list', 'calculated_rab', 'status', 'approved_by',
    'revision_notes',
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
    `UPDATE capex_projects SET ${fields.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Update project status with optional approved_by.
 * @param {number} id - Project ID
 * @param {string} status - New status
 * @param {object} [extra={}] - Additional fields (approved_by, revision_notes)
 * @returns {Promise<object>} Query result
 */
async function updateStatus(id, status, extra = {}) {
  const fields = ['status = ?', 'updated_at = NOW()'];
  const params = [status];

  if (extra.approved_by !== undefined) {
    fields.push('approved_by = ?');
    params.push(extra.approved_by);
  }
  if (extra.revision_notes !== undefined) {
    fields.push('revision_notes = ?');
    params.push(extra.revision_notes);
  }

  params.push(id);

  const [result] = await appPool.execute(
    `UPDATE capex_projects SET ${fields.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Delete a CAPEX project by ID (only if in Draft status).
 * @param {number} id - Project ID
 * @returns {Promise<object>} Query result
 */
async function deleteById(id) {
  const [result] = await appPool.execute(
    "DELETE FROM capex_projects WHERE id = ? AND status = 'Draft'",
    [id]
  );
  return result;
}

module.exports = {
  findAll,
  findById,
  create,
  update,
  updateStatus,
  deleteById,
};
