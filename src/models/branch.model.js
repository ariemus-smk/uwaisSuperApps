/**
 * Branch model for App DB.
 * Provides data access methods for the `branches` table.
 */

const { appPool } = require('../config/database');

/**
 * Find all branches with optional filtering.
 * @param {object} [filters={}] - Optional filters (status)
 * @returns {Promise<Array>} List of branch records
 */
async function findAll(filters = {}) {
  let query = 'SELECT * FROM branches';
  const params = [];

  if (filters.status) {
    query += ' WHERE status = ?';
    params.push(filters.status);
  }

  query += ' ORDER BY name ASC';

  const [rows] = await appPool.execute(query, params);
  return rows;
}

/**
 * Find a branch by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Branch record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    'SELECT * FROM branches WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find a branch by name.
 * @param {string} name
 * @returns {Promise<object|null>} Branch record or null
 */
async function findByName(name) {
  const [rows] = await appPool.execute(
    'SELECT * FROM branches WHERE name = ? LIMIT 1',
    [name]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Create a new branch.
 * @param {object} data - Branch data
 * @param {string} data.name
 * @param {string} data.address
 * @param {string} data.contact_phone
 * @param {string} data.contact_email
 * @param {string} [data.status='Active']
 * @returns {Promise<object>} Created branch with inserted ID
 */
async function create(data) {
  const { name, address, contact_phone, contact_email, status = 'Active' } = data;

  const [result] = await appPool.execute(
    `INSERT INTO branches (name, address, contact_phone, contact_email, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
    [name, address, contact_phone, contact_email, status]
  );

  return { id: result.insertId, ...data, status };
}

/**
 * Update an existing branch.
 * @param {number} id - Branch ID
 * @param {object} data - Fields to update
 * @returns {Promise<object>} Query result
 */
async function update(id, data) {
  const fields = [];
  const params = [];

  if (data.name !== undefined) {
    fields.push('name = ?');
    params.push(data.name);
  }
  if (data.address !== undefined) {
    fields.push('address = ?');
    params.push(data.address);
  }
  if (data.contact_phone !== undefined) {
    fields.push('contact_phone = ?');
    params.push(data.contact_phone);
  }
  if (data.contact_email !== undefined) {
    fields.push('contact_email = ?');
    params.push(data.contact_email);
  }

  if (fields.length === 0) {
    return { affectedRows: 0 };
  }

  fields.push('updated_at = NOW()');
  params.push(id);

  const [result] = await appPool.execute(
    `UPDATE branches SET ${fields.join(', ')} WHERE id = ?`,
    params
  );

  return result;
}

/**
 * Update branch status (Active/Inactive).
 * @param {number} id - Branch ID
 * @param {string} status - New status ('Active' or 'Inactive')
 * @returns {Promise<object>} Query result
 */
async function updateStatus(id, status) {
  const [result] = await appPool.execute(
    'UPDATE branches SET status = ?, updated_at = NOW() WHERE id = ?',
    [status, id]
  );
  return result;
}

module.exports = {
  findAll,
  findById,
  findByName,
  create,
  update,
  updateStatus,
};
