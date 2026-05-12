/**
 * Work Journal model for App DB.
 * Provides data access methods for the `work_journals` table.
 * Stores daily work activity entries for Teknisi, optionally linked to tickets.
 *
 * Requirements: 44.1, 44.2, 44.3
 */

const { appPool } = require('../config/database');

/**
 * Find a work journal entry by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Journal record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    `SELECT wj.*, u.full_name AS teknisi_name, u.branch_id
     FROM work_journals wj
     LEFT JOIN users u ON wj.teknisi_id = u.id
     WHERE wj.id = ?
     LIMIT 1`,
    [id]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  row.photo_urls = row.photo_urls ? JSON.parse(row.photo_urls) : [];
  return row;
}

/**
 * Find all work journal entries for a specific Teknisi.
 * @param {number} teknisiId
 * @param {object} [options={}] - Query options
 * @param {string} [options.startDate] - Filter start date (YYYY-MM-DD)
 * @param {string} [options.endDate] - Filter end date (YYYY-MM-DD)
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=20] - Items per page
 * @returns {Promise<{journals: Array, total: number}>}
 */
async function findByTeknisiId(teknisiId, options = {}) {
  const { startDate, endDate, page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE wj.teknisi_id = ?';
  const params = [teknisiId];

  if (startDate) {
    whereClause += ' AND wj.journal_date >= ?';
    params.push(startDate);
  }
  if (endDate) {
    whereClause += ' AND wj.journal_date <= ?';
    params.push(endDate);
  }

  // Count total
  const [countRows] = await appPool.execute(
    `SELECT COUNT(*) AS total FROM work_journals wj ${whereClause}`,
    params
  );
  const total = countRows[0].total;

  // Fetch paginated results
  const queryParams = [...params, String(limit), String(offset)];
  const [rows] = await appPool.execute(
    `SELECT wj.*, u.full_name AS teknisi_name
     FROM work_journals wj
     LEFT JOIN users u ON wj.teknisi_id = u.id
     ${whereClause}
     ORDER BY wj.journal_date DESC, wj.created_at DESC
     LIMIT ? OFFSET ?`,
    queryParams
  );

  const journals = rows.map((row) => ({
    ...row,
    photo_urls: row.photo_urls ? JSON.parse(row.photo_urls) : [],
  }));

  return { journals, total };
}

/**
 * Find all work journal entries with filters (for Admin view).
 * Supports filtering by date range, Teknisi, and Branch.
 *
 * @param {object} filters - Query filters
 * @param {number} [filters.teknisi_id] - Filter by Teknisi ID
 * @param {number} [filters.branch_id] - Filter by Branch ID (via user table)
 * @param {string} [filters.startDate] - Filter start date (YYYY-MM-DD)
 * @param {string} [filters.endDate] - Filter end date (YYYY-MM-DD)
 * @param {number} [filters.ticket_id] - Filter by linked ticket ID
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @returns {Promise<{journals: Array, total: number}>}
 */
async function findAll(filters = {}) {
  const { teknisi_id, branch_id, startDate, endDate, ticket_id, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params = [];

  if (teknisi_id) {
    whereClause += ' AND wj.teknisi_id = ?';
    params.push(teknisi_id);
  }
  if (branch_id) {
    whereClause += ' AND u.branch_id = ?';
    params.push(branch_id);
  }
  if (startDate) {
    whereClause += ' AND wj.journal_date >= ?';
    params.push(startDate);
  }
  if (endDate) {
    whereClause += ' AND wj.journal_date <= ?';
    params.push(endDate);
  }
  if (ticket_id) {
    whereClause += ' AND wj.ticket_id = ?';
    params.push(ticket_id);
  }

  // Count total
  const [countRows] = await appPool.execute(
    `SELECT COUNT(*) AS total
     FROM work_journals wj
     LEFT JOIN users u ON wj.teknisi_id = u.id
     ${whereClause}`,
    params
  );
  const total = countRows[0].total;

  // Fetch paginated results
  const queryParams = [...params, String(limit), String(offset)];
  const [rows] = await appPool.execute(
    `SELECT wj.*, u.full_name AS teknisi_name, u.branch_id
     FROM work_journals wj
     LEFT JOIN users u ON wj.teknisi_id = u.id
     ${whereClause}
     ORDER BY wj.journal_date DESC, wj.created_at DESC
     LIMIT ? OFFSET ?`,
    queryParams
  );

  const journals = rows.map((row) => ({
    ...row,
    photo_urls: row.photo_urls ? JSON.parse(row.photo_urls) : [],
  }));

  return { journals, total };
}

/**
 * Create a new work journal entry.
 * @param {object} data - Journal entry data
 * @param {number} data.teknisi_id - Teknisi user ID
 * @param {number|null} [data.ticket_id] - Linked ticket ID (optional)
 * @param {string} data.journal_date - Date of activity (YYYY-MM-DD)
 * @param {string} data.activity_description - Description of work activity
 * @param {string[]|null} [data.photo_urls] - Array of photo URLs
 * @param {number|null} [data.latitude] - GPS latitude
 * @param {number|null} [data.longitude] - GPS longitude
 * @returns {Promise<object>} Created journal entry with insertId
 */
async function create(data) {
  const {
    teknisi_id,
    ticket_id = null,
    journal_date,
    activity_description,
    photo_urls = null,
    latitude = null,
    longitude = null,
  } = data;

  const photoUrlsJson = photo_urls ? JSON.stringify(photo_urls) : null;

  const [result] = await appPool.execute(
    `INSERT INTO work_journals (teknisi_id, ticket_id, journal_date, activity_description, photo_urls, latitude, longitude, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [teknisi_id, ticket_id, journal_date, activity_description, photoUrlsJson, latitude, longitude]
  );

  return {
    id: result.insertId,
    teknisi_id,
    ticket_id,
    journal_date,
    activity_description,
    photo_urls: photo_urls || [],
    latitude,
    longitude,
  };
}

/**
 * Update a work journal entry.
 * @param {number} id - Journal entry ID
 * @param {object} data - Fields to update
 * @returns {Promise<object|null>} Updated journal entry or null if not found
 */
async function update(id, data) {
  const fields = [];
  const params = [];

  if (data.activity_description !== undefined) {
    fields.push('activity_description = ?');
    params.push(data.activity_description);
  }
  if (data.photo_urls !== undefined) {
    fields.push('photo_urls = ?');
    params.push(data.photo_urls ? JSON.stringify(data.photo_urls) : null);
  }
  if (data.latitude !== undefined) {
    fields.push('latitude = ?');
    params.push(data.latitude);
  }
  if (data.longitude !== undefined) {
    fields.push('longitude = ?');
    params.push(data.longitude);
  }
  if (data.ticket_id !== undefined) {
    fields.push('ticket_id = ?');
    params.push(data.ticket_id);
  }
  if (data.journal_date !== undefined) {
    fields.push('journal_date = ?');
    params.push(data.journal_date);
  }

  if (fields.length === 0) return findById(id);

  params.push(id);
  await appPool.execute(
    `UPDATE work_journals SET ${fields.join(', ')} WHERE id = ?`,
    params
  );

  return findById(id);
}

/**
 * Delete a work journal entry.
 * @param {number} id - Journal entry ID
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
async function deleteById(id) {
  const [result] = await appPool.execute(
    'DELETE FROM work_journals WHERE id = ?',
    [id]
  );
  return result.affectedRows > 0;
}

module.exports = {
  findById,
  findByTeknisiId,
  findAll,
  create,
  update,
  deleteById,
};
