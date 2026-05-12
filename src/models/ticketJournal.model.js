/**
 * Ticket Journal model for App DB.
 * Provides data access methods for the `ticket_journals` table.
 * Stores progress entries for tickets including description,
 * photo evidence, GPS coordinates, and progress status.
 *
 * Requirements: 26.6
 */

const { appPool } = require('../config/database');

/**
 * Find a journal entry by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Journal record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    'SELECT * FROM ticket_journals WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find all journal entries for a ticket, ordered by creation time.
 * @param {number} ticketId
 * @returns {Promise<Array>} List of journal entries
 */
async function findByTicketId(ticketId) {
  const [rows] = await appPool.execute(
    `SELECT tj.*, u.full_name AS teknisi_name
     FROM ticket_journals tj
     LEFT JOIN users u ON tj.teknisi_id = u.id
     WHERE tj.ticket_id = ?
     ORDER BY tj.created_at ASC`,
    [ticketId]
  );
  return rows;
}

/**
 * Create a new journal entry for a ticket.
 * @param {object} data - Journal entry data
 * @param {number} data.ticket_id
 * @param {number} data.teknisi_id
 * @param {string} data.description
 * @param {string[]|null} [data.photo_urls] - Array of photo URLs
 * @param {string} data.progress_status - 'Selesai', 'BelumSelesai', or 'Progress'
 * @param {number|null} [data.latitude]
 * @param {number|null} [data.longitude]
 * @returns {Promise<object>} Created journal entry with insertId
 */
async function create(data) {
  const {
    ticket_id,
    teknisi_id,
    description,
    photo_urls = null,
    progress_status,
    latitude = null,
    longitude = null,
  } = data;

  const photoUrlsJson = photo_urls ? JSON.stringify(photo_urls) : null;

  const [result] = await appPool.execute(
    `INSERT INTO ticket_journals (ticket_id, teknisi_id, description, photo_urls, progress_status, latitude, longitude, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [ticket_id, teknisi_id, description, photoUrlsJson, progress_status, latitude, longitude]
  );

  return { id: result.insertId, ...data, photo_urls: photo_urls || [] };
}

/**
 * Count journal entries for a ticket.
 * @param {number} ticketId
 * @returns {Promise<number>} Count of journal entries
 */
async function countByTicketId(ticketId) {
  const [rows] = await appPool.execute(
    'SELECT COUNT(*) AS count FROM ticket_journals WHERE ticket_id = ?',
    [ticketId]
  );
  return rows[0].count;
}

module.exports = {
  findById,
  findByTicketId,
  create,
  countByTicketId,
};
