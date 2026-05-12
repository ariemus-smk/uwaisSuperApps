/**
 * ACS / TR-069 remote device management routes.
 * POST   /api/acs/:subscriptionId/reboot    - Reboot customer ONU (Admin)
 * POST   /api/acs/:subscriptionId/wifi      - Change WiFi SSID/password (Admin, Pelanggan)
 * POST   /api/acs/:subscriptionId/firmware  - Trigger firmware update (Admin)
 * GET    /api/acs/:subscriptionId/status    - Get device status (Admin)
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 3.4
 */

const { Router } = require('express');
const Joi = require('joi');
const acsController = require('../controllers/acs.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validator');
const { USER_ROLE } = require('../utils/constants');

const router = Router();

// Validation schemas

const subscriptionIdParamSchema = Joi.object({
  subscriptionId: Joi.number().integer().positive().required(),
});

const wifiChangeSchema = Joi.object({
  ssid: Joi.string().trim().min(1).max(32).optional(),
  password: Joi.string().trim().min(8).max(63).optional(),
}).or('ssid', 'password');

const firmwareUpdateSchema = Joi.object({
  firmware_url: Joi.string().uri().optional(),
});

// Routes

// POST /api/acs/:subscriptionId/reboot - Reboot customer ONU (Admin only)
router.post(
  '/:subscriptionId/reboot',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN),
  validate(subscriptionIdParamSchema, 'params'),
  acsController.rebootDevice
);

// POST /api/acs/:subscriptionId/wifi - Change WiFi SSID/password (Admin, Pelanggan)
router.post(
  '/:subscriptionId/wifi',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN, USER_ROLE.PELANGGAN),
  validate(subscriptionIdParamSchema, 'params'),
  validate(wifiChangeSchema, 'body'),
  acsController.changeWifi
);

// POST /api/acs/:subscriptionId/firmware - Trigger firmware update (Admin only)
router.post(
  '/:subscriptionId/firmware',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN),
  validate(subscriptionIdParamSchema, 'params'),
  validate(firmwareUpdateSchema, 'body'),
  acsController.triggerFirmwareUpdate
);

// GET /api/acs/:subscriptionId/status - Get device status (Admin only)
router.get(
  '/:subscriptionId/status',
  authenticate,
  authorize(USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN),
  validate(subscriptionIdParamSchema, 'params'),
  acsController.getDeviceStatus
);

module.exports = router;
