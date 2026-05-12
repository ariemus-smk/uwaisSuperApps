/**
 * Work Journal service.
 * Handles business logic for Teknisi daily work journal entries.
 * Entries can be linked to tickets or standalone activities.
 *
 * Requirements: 44.1, 44.2, 44.3
 */

const workJournalModel = require('../models/workJournal.model');
const ticketModel = require('../models/ticket.model');
const { ERROR_CODE } = require('../utils/constants');

/**
 * Create a new work journal entry.
 * Validates that the linked ticket exists (if provided).
 *
 * Requirements: 44.1, 44.2
 *
 * @param {object} data - Journal entry data
 * @param {number|null} [data.ticket_id] - Linked ticket ID (optional)
 * @param {string} data.journal_date - Date of activity (YYYY-MM-DD)
 * @param {string} data.activity_description - Description of work activity
 * @param {string[]|null} [data.photo_urls] - Array of photo URLs
 * @param {number|null} [data.latitude] - GPS latitude
 * @param {number|null} [data.longitude] - GPS longitude
 * @param {object} user - Requesting user (from req.user)
 * @param {number} user.id - Teknisi user ID
 * @returns {Promise<object>} Created journal entry
 * @throws {Error} If validation fails or ticket not found
 */
async function createJournalEntry(data, user) {
  // Validate activity description
  if (!data.activity_description || data.activity_description.trim().length === 0) {
    throw Object.assign(new Error('Activity description is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Validate journal_date
  if (!data.journal_date) {
    throw Object.assign(new Error('Journal date is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Validate linked ticket exists (if provided)
  if (data.ticket_id) {
    const ticket = await ticketModel.findById(data.ticket_id);
    if (!ticket) {
      throw Object.assign(new Error('Linked ticket not found.'), {
        statusCode: 404,
        code: ERROR_CODE.RESOURCE_NOT_FOUND,
      });
    }
  }

  const journal = await workJournalModel.create({
    teknisi_id: user.id,
    ticket_id: data.ticket_id || null,
    journal_date: data.journal_date,
    activity_description: data.activity_description.trim(),
    photo_urls: data.photo_urls || null,
    latitude: data.latitude || null,
    longitude: data.longitude || null,
  });

  return journal;
}

/**
 * Get a work journal entry by ID.
 *
 * @param {number} id - Journal entry ID
 * @returns {Promise<object>} Journal entry
 * @throws {Error} If not found
 */
async function getJournalById(id) {
  const journal = await workJournalModel.findById(id);
  if (!journal) {
    throw Object.assign(new Error('Work journal entry not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }
  return journal;
}

/**
 * List work journal entries for the requesting Teknisi.
 *
 * @param {object} filters - Query filters
 * @param {string} [filters.startDate] - Filter start date (YYYY-MM-DD)
 * @param {string} [filters.endDate] - Filter end date (YYYY-MM-DD)
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @param {object} user - Requesting user (from req.user)
 * @param {number} user.id - Teknisi user ID
 * @returns {Promise<object>} Paginated journal entries
 */
async function listMyJournals(filters, user) {
  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 20;

  const { journals, total } = await workJournalModel.findByTeknisiId(user.id, {
    startDate: filters.startDate,
    endDate: filters.endDate,
    page,
    limit,
  });

  const totalPages = Math.ceil(total / limit);

  return { journals, total, page, limit, totalPages };
}

/**
 * List work journal entries for Admin view with filters.
 * Supports filtering by date range, Teknisi, and Branch.
 *
 * Requirements: 44.3
 *
 * @param {object} filters - Query filters
 * @param {number} [filters.teknisi_id] - Filter by Teknisi ID
 * @param {string} [filters.startDate] - Filter start date (YYYY-MM-DD)
 * @param {string} [filters.endDate] - Filter end date (YYYY-MM-DD)
 * @param {number} [filters.ticket_id] - Filter by linked ticket ID
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @param {object} user - Requesting user (from req.user)
 * @param {number|null} user.branch_id - Branch scoping
 * @returns {Promise<object>} Paginated journal entries
 */
async function listJournals(filters, user) {
  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 20;

  const queryFilters = {
    teknisi_id: filters.teknisi_id ? Number(filters.teknisi_id) : undefined,
    startDate: filters.startDate,
    endDate: filters.endDate,
    ticket_id: filters.ticket_id ? Number(filters.ticket_id) : undefined,
    page,
    limit,
  };

  // Apply branch scoping
  if (user.branch_id) {
    queryFilters.branch_id = user.branch_id;
  }

  const { journals, total } = await workJournalModel.findAll(queryFilters);
  const totalPages = Math.ceil(total / limit);

  return { journals, total, page, limit, totalPages };
}

/**
 * Update a work journal entry.
 * Only the owning Teknisi can update their own entries.
 *
 * @param {number} id - Journal entry ID
 * @param {object} data - Fields to update
 * @param {object} user - Requesting user (from req.user)
 * @param {number} user.id - Teknisi user ID
 * @returns {Promise<object>} Updated journal entry
 * @throws {Error} If not found or not owned by user
 */
async function updateJournalEntry(id, data, user) {
  const journal = await workJournalModel.findById(id);
  if (!journal) {
    throw Object.assign(new Error('Work journal entry not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // Only the owning Teknisi can update
  if (journal.teknisi_id !== user.id) {
    throw Object.assign(new Error('You can only update your own journal entries.'), {
      statusCode: 403,
      code: ERROR_CODE.AUTH_FORBIDDEN,
    });
  }

  // Validate linked ticket if being changed
  if (data.ticket_id) {
    const ticket = await ticketModel.findById(data.ticket_id);
    if (!ticket) {
      throw Object.assign(new Error('Linked ticket not found.'), {
        statusCode: 404,
        code: ERROR_CODE.RESOURCE_NOT_FOUND,
      });
    }
  }

  const updated = await workJournalModel.update(id, {
    activity_description: data.activity_description,
    photo_urls: data.photo_urls,
    latitude: data.latitude,
    longitude: data.longitude,
    ticket_id: data.ticket_id,
    journal_date: data.journal_date,
  });

  return updated;
}

/**
 * Delete a work journal entry.
 * Only the owning Teknisi can delete their own entries.
 *
 * @param {number} id - Journal entry ID
 * @param {object} user - Requesting user (from req.user)
 * @param {number} user.id - Teknisi user ID
 * @returns {Promise<void>}
 * @throws {Error} If not found or not owned by user
 */
async function deleteJournalEntry(id, user) {
  const journal = await workJournalModel.findById(id);
  if (!journal) {
    throw Object.assign(new Error('Work journal entry not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // Only the owning Teknisi can delete
  if (journal.teknisi_id !== user.id) {
    throw Object.assign(new Error('You can only delete your own journal entries.'), {
      statusCode: 403,
      code: ERROR_CODE.AUTH_FORBIDDEN,
    });
  }

  await workJournalModel.deleteById(id);
}

module.exports = {
  createJournalEntry,
  getJournalById,
  listMyJournals,
  listJournals,
  updateJournalEntry,
  deleteJournalEntry,
};
