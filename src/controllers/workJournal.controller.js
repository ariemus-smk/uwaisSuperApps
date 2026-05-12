/**
 * Work Journal controller.
 * Handles HTTP requests for Teknisi work journal endpoints.
 *
 * Requirements: 44.1, 44.2, 44.3
 */

const workJournalService = require('../services/workJournal.service');
const { success, created, error, paginated, noContent } = require('../utils/responseHelper');
const { ERROR_CODE } = require('../utils/constants');

/**
 * POST /api/work-journals
 * Create a new work journal entry (Teknisi).
 */
async function createJournal(req, res) {
  try {
    const data = {
      ticket_id: req.body.ticket_id || null,
      journal_date: req.body.journal_date,
      activity_description: req.body.activity_description,
      photo_urls: req.body.photo_urls || null,
      latitude: req.body.latitude || null,
      longitude: req.body.longitude || null,
    };

    const journal = await workJournalService.createJournalEntry(data, req.user);

    return created(res, journal, 'Work journal entry created successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/work-journals
 * List work journal entries (Admin view with filters).
 */
async function listJournals(req, res) {
  try {
    const filters = {
      teknisi_id: req.query.teknisi_id,
      startDate: req.query.start_date,
      endDate: req.query.end_date,
      ticket_id: req.query.ticket_id,
      page: req.query.page,
      limit: req.query.limit,
    };

    // Apply branch scoping from middleware
    const user = {
      ...req.user,
      branch_id: req.branchFilter || req.user.branch_id,
    };

    const result = await workJournalService.listJournals(filters, user);

    return paginated(res, result.journals, {
      page: result.page,
      limit: result.limit,
      totalItems: result.total,
      totalPages: result.totalPages,
    }, 'Work journals retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/work-journals/my
 * List own work journal entries (Teknisi).
 */
async function listMyJournals(req, res) {
  try {
    const filters = {
      startDate: req.query.start_date,
      endDate: req.query.end_date,
      page: req.query.page,
      limit: req.query.limit,
    };

    const result = await workJournalService.listMyJournals(filters, req.user);

    return paginated(res, result.journals, {
      page: result.page,
      limit: result.limit,
      totalItems: result.total,
      totalPages: result.totalPages,
    }, 'Work journals retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/work-journals/:id
 * Get a work journal entry by ID.
 */
async function getJournalById(req, res) {
  try {
    const { id } = req.params;
    const journal = await workJournalService.getJournalById(Number(id));

    return success(res, journal, 'Work journal entry retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PUT /api/work-journals/:id
 * Update a work journal entry (Teknisi, own entries only).
 */
async function updateJournal(req, res) {
  try {
    const { id } = req.params;
    const data = {
      ticket_id: req.body.ticket_id,
      journal_date: req.body.journal_date,
      activity_description: req.body.activity_description,
      photo_urls: req.body.photo_urls,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
    };

    const journal = await workJournalService.updateJournalEntry(Number(id), data, req.user);

    return success(res, journal, 'Work journal entry updated successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * DELETE /api/work-journals/:id
 * Delete a work journal entry (Teknisi, own entries only).
 */
async function deleteJournal(req, res) {
  try {
    const { id } = req.params;
    await workJournalService.deleteJournalEntry(Number(id), req.user);

    return noContent(res);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

module.exports = {
  createJournal,
  listJournals,
  listMyJournals,
  getJournalById,
  updateJournal,
  deleteJournal,
};
