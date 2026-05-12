/**
 * Ticket controller.
 * Handles HTTP requests for helpdesk ticketing endpoints including
 * ticket creation, assignment, progress updates, resolution, closure,
 * journal entries, overtime requests, and reports.
 *
 * Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 25.1, 25.2, 25.3, 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 27.1, 27.2, 27.3
 */

const ticketService = require('../services/ticket.service');
const { success, created, error, paginated } = require('../utils/responseHelper');
const { ERROR_CODE } = require('../utils/constants');

/**
 * GET /api/tickets
 * List tickets with optional filters and branch scoping.
 */
async function listTickets(req, res) {
  try {
    const filters = {
      status: req.query.status,
      priority: req.query.priority,
      assigned_teknisi_id: req.query.assigned_teknisi_id,
      customer_id: req.query.customer_id,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
    };

    // Apply branch scoping from middleware
    const user = {
      ...req.user,
      branch_id: req.branchFilter || req.user.branch_id,
    };

    const result = await ticketService.listTickets(filters, user);

    return paginated(res, result.tickets, {
      page: result.page,
      limit: result.limit,
      totalItems: result.total,
      totalPages: result.totalPages,
    }, 'Tickets retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/tickets/:id
 * Get ticket detail by ID.
 */
async function getTicketById(req, res) {
  try {
    const { id } = req.params;
    const ticket = await ticketService.getTicketById(Number(id));

    return success(res, ticket, 'Ticket retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/tickets
 * Create a new ticket.
 */
async function createTicket(req, res) {
  try {
    const data = {
      customer_id: req.body.customer_id,
      subscription_id: req.body.subscription_id || null,
      issue_description: req.body.issue_description,
      source: req.body.source,
    };

    const ticket = await ticketService.createTicket(data, req.user);

    return created(res, ticket, 'Ticket created successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PATCH /api/tickets/:id/assign
 * Assign/dispatch ticket to a technician.
 */
async function assignTicket(req, res) {
  try {
    const { id } = req.params;
    const { teknisi_id } = req.body;

    const ticket = await ticketService.assignTicket(Number(id), teknisi_id, req.user);

    return success(res, ticket, 'Ticket assigned successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PATCH /api/tickets/:id/progress
 * Update ticket progress (Teknisi).
 */
async function updateProgress(req, res) {
  try {
    const { id } = req.params;
    const progressData = {
      description: req.body.description,
      photo_urls: req.body.photo_urls || null,
      progress_status: req.body.progress_status,
      latitude: req.body.latitude || null,
      longitude: req.body.longitude || null,
    };

    const journal = await ticketService.updateProgress(Number(id), progressData, req.user);

    return success(res, journal, 'Ticket progress updated successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PATCH /api/tickets/:id/resolve
 * Resolve a ticket (Admin).
 */
async function resolveTicket(req, res) {
  try {
    const { id } = req.params;
    const resolutionData = {
      resolution_type: req.body.resolution_type || null,
      damage_classification: req.body.damage_classification || null,
    };

    const ticket = await ticketService.resolveTicket(Number(id), resolutionData, req.user);

    return success(res, ticket, 'Ticket resolved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PATCH /api/tickets/:id/close
 * Close a ticket (Admin).
 */
async function closeTicket(req, res) {
  try {
    const { id } = req.params;
    const closeData = {
      resolution_category: req.body.resolution_category || null,
    };

    const ticket = await ticketService.closeTicket(Number(id), req.user, closeData);

    return success(res, ticket, 'Ticket closed successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/tickets/:id/journal
 * Add a journal entry to a ticket (Teknisi).
 */
async function addJournalEntry(req, res) {
  try {
    const { id } = req.params;
    const progressData = {
      description: req.body.description,
      photo_urls: req.body.photo_urls || null,
      progress_status: req.body.progress_status,
      latitude: req.body.latitude || null,
      longitude: req.body.longitude || null,
    };

    const journal = await ticketService.updateProgress(Number(id), progressData, req.user);

    return created(res, journal, 'Journal entry added successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/tickets/:id/overtime
 * Request overtime for a ticket (Admin).
 */
async function requestOvertime(req, res) {
  try {
    const { id } = req.params;
    const dispatchData = {
      ticket_ids: [Number(id)],
      teknisi_id: req.body.teknisi_id,
      dispatch_time: req.body.dispatch_time || null,
    };

    const result = await ticketService.dispatchTickets(dispatchData, req.user);

    return created(res, result, 'Overtime request submitted successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PATCH /api/tickets/:id/overtime/approve
 * Approve overtime request (Superadmin, Admin).
 */
async function approveOvertime(req, res) {
  try {
    const { id } = req.params;
    const approvalData = {
      approved_hours: req.body.approved_hours || null,
      compensation_amount: req.body.compensation_amount || null,
    };

    // The id here is the overtime request ID (linked to the ticket)
    const result = await ticketService.approveOvertime(Number(id), approvalData, req.user);

    return success(res, result, 'Overtime approved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/tickets/reports
 * Get ticket reports (Admin, Superadmin).
 */
async function getTicketReports(req, res) {
  try {
    const { teknisi_id, period, start_date, end_date } = req.query;

    if (teknisi_id) {
      const metrics = await ticketService.getResolutionMetrics(Number(teknisi_id), {
        period,
        startDate: start_date,
        endDate: end_date,
      });
      return success(res, metrics, 'Ticket reports retrieved successfully.');
    }

    // If no teknisi_id, return general ticket stats
    const filters = { page: 1, limit: 1000 };
    const user = {
      ...req.user,
      branch_id: req.branchFilter || req.user.branch_id,
    };
    const result = await ticketService.listTickets(filters, user);

    const report = {
      total_tickets: result.total,
      period: period || null,
    };

    return success(res, report, 'Ticket reports retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/tickets/:id/remote-fix
 * Trigger remote fix for a ticket (Admin).
 */
async function triggerRemoteFix(req, res) {
  try {
    const { id } = req.params;
    const actionData = {
      action: req.body.action,
      params: req.body.params || {},
    };

    const result = await ticketService.triggerRemoteFix(Number(id), actionData, req.user);

    return success(res, result, 'Remote fix triggered successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

module.exports = {
  listTickets,
  getTicketById,
  createTicket,
  assignTicket,
  updateProgress,
  resolveTicket,
  closeTicket,
  addJournalEntry,
  requestOvertime,
  approveOvertime,
  getTicketReports,
  triggerRemoteFix,
};
