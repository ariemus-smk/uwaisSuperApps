/**
 * VPN CHR management routes.
 * GET    /api/vpn-chr/status              - Get CHR system status (Superadmin, Admin)
 * GET    /api/vpn-chr/secrets             - List VPN secrets (Superadmin, Admin)
 * POST   /api/vpn-chr/secrets             - Create VPN secret (Superadmin)
 * DELETE /api/vpn-chr/secrets/:id         - Remove VPN secret (Superadmin)
 * GET    /api/vpn-chr/active-connections  - List active VPN connections (Superadmin, Admin)
 * POST   /api/vpn-chr/profiles            - Create/update PPP profile (Superadmin)
 * GET    /api/vpn-chr/profiles            - List PPP profiles (Superadmin, Admin)
 * GET    /api/vpn-chr/ip-pools            - List IP pools (Superadmin, Admin)
 * POST   /api/vpn-chr/ip-pools            - Create IP pool (Superadmin)
 * POST   /api/vpn-chr/disconnect/:id      - Disconnect active VPN session (Superadmin, Admin)
 *
 * Requirements: 12.2, 12.3
 */

const { Router } = require('express');
const Joi = require('joi');
const vpnChrController = require('../controllers/vpnChr.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validator');
const { USER_ROLE } = require('../utils/constants');

const router = Router();

// Validation schemas

const createSecretSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  password: Joi.string().trim().min(6).max(255).required(),
  service: Joi.string().valid('any', 'pptp', 'l2tp', 'sstp', 'ovpn').required(),
  profile: Joi.string().trim().min(1).max(100).optional().default('default'),
  remote_address: Joi.string().trim().max(100).optional().allow(''),
});

const createProfileSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  local_address: Joi.string().trim().ip({ version: ['ipv4'] }).optional(),
  remote_address: Joi.string().trim().min(1).max(100).optional(),
  rate_limit: Joi.string().trim().max(100).optional(),
});

const createIpPoolSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  ranges: Joi.string().trim().min(1).max(500).required(),
});

// Routes

// GET /api/vpn-chr/status - Get CHR system status (Superadmin, Admin)
router.get(
  '/status',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN),
  vpnChrController.getStatus
);

// GET /api/vpn-chr/secrets - List VPN secrets (Superadmin, Admin)
router.get(
  '/secrets',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN),
  vpnChrController.listSecrets
);

// POST /api/vpn-chr/secrets - Create VPN secret (Superadmin only)
router.post(
  '/secrets',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(createSecretSchema, 'body'),
  vpnChrController.createSecret
);

// DELETE /api/vpn-chr/secrets/:id - Remove VPN secret (Superadmin only)
router.delete(
  '/secrets/:id',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  vpnChrController.deleteSecret
);

// GET /api/vpn-chr/active-connections - List active VPN connections (Superadmin, Admin)
router.get(
  '/active-connections',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN),
  vpnChrController.getActiveConnections
);

// POST /api/vpn-chr/profiles - Create/update PPP profile (Superadmin only)
router.post(
  '/profiles',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(createProfileSchema, 'body'),
  vpnChrController.createProfile
);

// GET /api/vpn-chr/profiles - List PPP profiles (Superadmin, Admin)
router.get(
  '/profiles',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN),
  vpnChrController.listProfiles
);

// GET /api/vpn-chr/ip-pools - List IP pools (Superadmin, Admin)
router.get(
  '/ip-pools',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN),
  vpnChrController.listIpPools
);

// POST /api/vpn-chr/ip-pools - Create IP pool (Superadmin only)
router.post(
  '/ip-pools',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(createIpPoolSchema, 'body'),
  vpnChrController.createIpPool
);

// POST /api/vpn-chr/disconnect/:id - Disconnect active VPN session (Superadmin, Admin)
router.post(
  '/disconnect/:id',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN),
  vpnChrController.disconnectSession
);

module.exports = router;
