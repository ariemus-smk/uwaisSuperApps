/**
 * Notification routes.
 * GET    /api/notifications/queue      - View notification queue (Admin, Superadmin)
 * POST   /api/notifications/broadcast  - Send broadcast message (Admin, Superadmin)
 *
 * Requirements: 30.5
 */

const { Router } = require('express');
const Joi = require('joi');
const notificationController = require('../controllers/notification.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validator');
const { USER_ROLE, NOTIFICATION_STATUS, NOTIFICATION_CHANNEL } = require('../utils/constants');

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const queueQuerySchema = Joi.object({
  status: Joi.string()
    .valid(NOTIFICATION_STATUS.QUEUED, NOTIFICATION_STATUS.SENT, NOTIFICATION_STATUS.FAILED)
    .optional(),
  channel: Joi.string()
    .valid(NOTIFICATION_CHANNEL.WHATSAPP, NOTIFICATION_CHANNEL.EMAIL, NOTIFICATION_CHANNEL.PUSH_NOTIFICATION)
    .optional(),
  related_entity_type: Joi.string().trim().max(100).optional(),
  related_entity_id: Joi.number().integer().positive().optional(),
  page: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().positive().max(100).optional(),
});

const broadcastSchema = Joi.object({
  recipients: Joi.array()
    .items(Joi.string().trim().min(1))
    .min(1)
    .required(),
  template_name: Joi.string().trim().min(1).max(200).required(),
  parameters: Joi.object().optional(),
  channel: Joi.string()
    .valid(NOTIFICATION_CHANNEL.WHATSAPP, NOTIFICATION_CHANNEL.EMAIL, NOTIFICATION_CHANNEL.PUSH_NOTIFICATION)
    .optional(),
});

// ============================================================================
// Routes
// ============================================================================

// GET /api/notifications/queue - View notification queue (Admin, Superadmin)
router.get(
  '/queue',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN),
  validate(queueQuerySchema, 'query'),
  notificationController.getQueue
);

// POST /api/notifications/broadcast - Send broadcast message (Admin, Superadmin)
router.post(
  '/broadcast',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN),
  validate(broadcastSchema, 'body'),
  notificationController.broadcast
);

module.exports = router;
