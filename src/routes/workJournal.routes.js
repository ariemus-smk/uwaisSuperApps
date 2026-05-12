/**
 * Work Journal routes.
 * GET    /api/work-journals          - List work journals (Admin, Superadmin) with filters
 * GET    /api/work-journals/my       - List own journals (Teknisi)
 * GET    /api/work-journals/:id      - Get journal entry detail (Admin, Teknisi)
 * POST   /api/work-journals          - Create journal entry (Teknisi)
 * PUT    /api/work-journals/:id      - Update journal entry (Teknisi, own only)
 * DELETE /api/work-journals/:id      - Delete journal entry (Teknisi, own only)
 *
 * Requirements: 44.1, 44.2, 44.3
 */

const { Router } = require('express');
const Joi = require('joi');
const workJournalController = require('../controllers/workJournal.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { branchScope } = require('../middleware/branchScope');
const { validate } = require('../middleware/validator');
const { USER_ROLE } = require('../utils/constants');

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const journalListQuerySchema = Joi.object({
  teknisi_id: Joi.number().integer().positive().optional(),
  start_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ticket_id: Joi.number().integer().positive().optional(),
  page: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().positive().max(100).optional(),
});

const myJournalListQuerySchema = Joi.object({
  start_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().positive().max(100).optional(),
});

const journalIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const createJournalSchema = Joi.object({
  ticket_id: Joi.number().integer().positive().allow(null).optional(),
  journal_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  activity_description: Joi.string().trim().min(1).max(5000).required(),
  photo_urls: Joi.array().items(Joi.string().uri()).allow(null).optional(),
  latitude: Joi.number().min(-90).max(90).allow(null).optional(),
  longitude: Joi.number().min(-180).max(180).allow(null).optional(),
});

const updateJournalSchema = Joi.object({
  ticket_id: Joi.number().integer().positive().allow(null).optional(),
  journal_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  activity_description: Joi.string().trim().min(1).max(5000).optional(),
  photo_urls: Joi.array().items(Joi.string().uri()).allow(null).optional(),
  latitude: Joi.number().min(-90).max(90).allow(null).optional(),
  longitude: Joi.number().min(-180).max(180).allow(null).optional(),
});

// ============================================================================
// Routes
// ============================================================================

// GET /api/work-journals/my - List own journals (Teknisi)
// NOTE: Must be defined BEFORE /:id to avoid matching "my" as an id
router.get(
  '/my',
  authenticate,
  authorize(USER_ROLE.TEKNISI),
  validate(myJournalListQuerySchema, 'query'),
  workJournalController.listMyJournals
);

// GET /api/work-journals - List work journals (Admin, Superadmin)
router.get(
  '/',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN),
  branchScope,
  validate(journalListQuerySchema, 'query'),
  workJournalController.listJournals
);

// GET /api/work-journals/:id - Get journal entry detail (Admin, Superadmin, Teknisi)
router.get(
  '/:id',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN, USER_ROLE.TEKNISI),
  validate(journalIdParamSchema, 'params'),
  workJournalController.getJournalById
);

// POST /api/work-journals - Create journal entry (Teknisi)
router.post(
  '/',
  authenticate,
  authorize(USER_ROLE.TEKNISI),
  validate(createJournalSchema, 'body'),
  workJournalController.createJournal
);

// PUT /api/work-journals/:id - Update journal entry (Teknisi, own only)
router.put(
  '/:id',
  authenticate,
  authorize(USER_ROLE.TEKNISI),
  validate(journalIdParamSchema, 'params'),
  validate(updateJournalSchema, 'body'),
  workJournalController.updateJournal
);

// DELETE /api/work-journals/:id - Delete journal entry (Teknisi, own only)
router.delete(
  '/:id',
  authenticate,
  authorize(USER_ROLE.TEKNISI),
  validate(journalIdParamSchema, 'params'),
  workJournalController.deleteJournal
);

module.exports = router;
