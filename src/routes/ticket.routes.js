/**
 * Ticket routes.
 * GET    /api/tickets                         - List tickets (Admin, Teknisi)
 * GET    /api/tickets/reports                  - Ticket reports (Admin, Superadmin)
 * GET    /api/tickets/:id                     - Get ticket detail (Admin, Teknisi, Pelanggan)
 * POST   /api/tickets                         - Create ticket (Admin, Teknisi, Pelanggan)
 * PATCH  /api/tickets/:id/assign              - Assign/dispatch ticket (Admin)
 * PATCH  /api/tickets/:id/progress            - Update ticket progress (Teknisi)
 * PATCH  /api/tickets/:id/resolve             - Resolve ticket (Admin)
 * PATCH  /api/tickets/:id/close               - Close ticket (Admin)
 * POST   /api/tickets/:id/journal             - Add journal entry (Teknisi)
 * POST   /api/tickets/:id/overtime            - Request overtime for ticket (Admin)
 * PATCH  /api/tickets/:id/overtime/approve    - Approve overtime (Superadmin, Admin)
 * POST   /api/tickets/:id/remote-fix          - Trigger remote fix (Admin)
 *
 * Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 25.1, 25.2, 25.3, 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 27.1, 27.2, 27.3
 */

const { Router } = require('express');
const Joi = require('joi');
const ticketController = require('../controllers/ticket.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { branchScope } = require('../middleware/branchScope');
const { validate } = require('../middleware/validator');
const {
  USER_ROLE,
  TICKET_SOURCE,
  TICKET_JOURNAL_STATUS,
  TICKET_RESOLUTION_TYPE,
  REMOTE_FIX_ACTION,
} = require('../utils/constants');

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const ticketListQuerySchema = Joi.object({
  status: Joi.string().valid('Open', 'InProgress', 'Pending', 'Resolved', 'Closed').optional(),
  priority: Joi.string().valid('VIP', 'High', 'Normal', 'Low').optional(),
  assigned_teknisi_id: Joi.number().integer().positive().optional(),
  customer_id: Joi.number().integer().positive().optional(),
  search: Joi.string().trim().max(200).allow('').optional(),
  page: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().positive().max(100).optional(),
});

const ticketIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const createTicketSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  subscription_id: Joi.number().integer().positive().allow(null).optional(),
  issue_description: Joi.string().trim().min(1).max(2000).required(),
  source: Joi.string()
    .valid(TICKET_SOURCE.PELANGGAN, TICKET_SOURCE.TEKNISI, TICKET_SOURCE.ADMIN)
    .required(),
});

const assignTicketSchema = Joi.object({
  teknisi_id: Joi.number().integer().positive().required(),
});

const updateProgressSchema = Joi.object({
  description: Joi.string().trim().min(1).max(2000).required(),
  photo_urls: Joi.array().items(Joi.string().uri()).allow(null).optional(),
  progress_status: Joi.string()
    .valid(
      TICKET_JOURNAL_STATUS.SELESAI,
      TICKET_JOURNAL_STATUS.BELUM_SELESAI,
      TICKET_JOURNAL_STATUS.PROGRESS
    )
    .required(),
  latitude: Joi.number().min(-90).max(90).allow(null).optional(),
  longitude: Joi.number().min(-180).max(180).allow(null).optional(),
});

const resolveTicketSchema = Joi.object({
  resolution_type: Joi.string()
    .valid(TICKET_RESOLUTION_TYPE.REMOTE_FIX, TICKET_RESOLUTION_TYPE.FIELD_FIX)
    .allow(null)
    .optional(),
  damage_classification: Joi.string().trim().max(500).allow(null, '').optional(),
});

const closeTicketSchema = Joi.object({
  resolution_category: Joi.string().trim().max(200).allow(null, '').optional(),
});

const journalEntrySchema = Joi.object({
  description: Joi.string().trim().min(1).max(2000).required(),
  photo_urls: Joi.array().items(Joi.string().uri()).allow(null).optional(),
  progress_status: Joi.string()
    .valid(
      TICKET_JOURNAL_STATUS.SELESAI,
      TICKET_JOURNAL_STATUS.BELUM_SELESAI,
      TICKET_JOURNAL_STATUS.PROGRESS
    )
    .required(),
  latitude: Joi.number().min(-90).max(90).allow(null).optional(),
  longitude: Joi.number().min(-180).max(180).allow(null).optional(),
});

const requestOvertimeSchema = Joi.object({
  teknisi_id: Joi.number().integer().positive().required(),
  dispatch_time: Joi.string().isoDate().allow(null).optional(),
});

const approveOvertimeSchema = Joi.object({
  approved_hours: Joi.number().positive().allow(null).optional(),
  compensation_amount: Joi.number().min(0).allow(null).optional(),
});

const reportsQuerySchema = Joi.object({
  teknisi_id: Joi.number().integer().positive().optional(),
  period: Joi.string().pattern(/^\d{4}-\d{2}$/).optional(),
  start_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const remoteFixActionValues = Object.values(REMOTE_FIX_ACTION);
const remoteFixSchema = Joi.object({
  action: Joi.string().valid(...remoteFixActionValues).required(),
  params: Joi.object().optional(),
});

// ============================================================================
// Routes
// ============================================================================

// GET /api/tickets/reports - Ticket reports (Admin, Superadmin)
// NOTE: This must be defined BEFORE the /:id route to avoid matching "reports" as an id
router.get(
  '/reports',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN),
  branchScope,
  validate(reportsQuerySchema, 'query'),
  ticketController.getTicketReports
);

// GET /api/tickets - List tickets (Admin, Teknisi)
router.get(
  '/',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.TEKNISI),
  branchScope,
  validate(ticketListQuerySchema, 'query'),
  ticketController.listTickets
);

// GET /api/tickets/:id - Get ticket detail (Admin, Teknisi, Pelanggan)
router.get(
  '/:id',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.TEKNISI, USER_ROLE.PELANGGAN),
  validate(ticketIdParamSchema, 'params'),
  ticketController.getTicketById
);

// POST /api/tickets - Create ticket (Admin, Teknisi, Pelanggan)
router.post(
  '/',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.TEKNISI, USER_ROLE.PELANGGAN),
  validate(createTicketSchema, 'body'),
  ticketController.createTicket
);

// PATCH /api/tickets/:id/assign - Assign/dispatch ticket (Admin)
router.patch(
  '/:id/assign',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(ticketIdParamSchema, 'params'),
  validate(assignTicketSchema, 'body'),
  ticketController.assignTicket
);

// PATCH /api/tickets/:id/progress - Update ticket progress (Teknisi)
router.patch(
  '/:id/progress',
  authenticate,
  authorize(USER_ROLE.TEKNISI),
  validate(ticketIdParamSchema, 'params'),
  validate(updateProgressSchema, 'body'),
  ticketController.updateProgress
);

// PATCH /api/tickets/:id/resolve - Resolve ticket (Admin)
router.patch(
  '/:id/resolve',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(ticketIdParamSchema, 'params'),
  validate(resolveTicketSchema, 'body'),
  ticketController.resolveTicket
);

// PATCH /api/tickets/:id/close - Close ticket (Admin)
router.patch(
  '/:id/close',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(ticketIdParamSchema, 'params'),
  validate(closeTicketSchema, 'body'),
  ticketController.closeTicket
);

// POST /api/tickets/:id/journal - Add journal entry (Teknisi)
router.post(
  '/:id/journal',
  authenticate,
  authorize(USER_ROLE.TEKNISI),
  validate(ticketIdParamSchema, 'params'),
  validate(journalEntrySchema, 'body'),
  ticketController.addJournalEntry
);

// POST /api/tickets/:id/overtime - Request overtime for ticket (Admin)
router.post(
  '/:id/overtime',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(ticketIdParamSchema, 'params'),
  validate(requestOvertimeSchema, 'body'),
  ticketController.requestOvertime
);

// PATCH /api/tickets/:id/overtime/approve - Approve overtime (Superadmin, Admin)
router.patch(
  '/:id/overtime/approve',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN),
  validate(ticketIdParamSchema, 'params'),
  validate(approveOvertimeSchema, 'body'),
  ticketController.approveOvertime
);

// POST /api/tickets/:id/remote-fix - Trigger remote fix (Admin)
router.post(
  '/:id/remote-fix',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(ticketIdParamSchema, 'params'),
  validate(remoteFixSchema, 'body'),
  ticketController.triggerRemoteFix
);

module.exports = router;
