/**
 * VPN CHR controller.
 * Handles HTTP requests for Mikrotik CHR VPN management endpoints.
 * Delegates to mikrotikChr.service.js for all CHR REST API operations.
 *
 * Requirements: 12.2, 12.3
 */

const { success, created, error } = require('../utils/responseHelper');
const { ERROR_CODE } = require('../utils/constants');
const mikrotikChrService = require('../services/mikrotikChr.service');

/**
 * GET /api/vpn-chr/status
 * Get CHR system status and resource usage.
 */
async function getStatus(req, res) {
  try {
    const data = await mikrotikChrService.getSystemStatus();
    return success(res, data, 'CHR status retrieved.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/vpn-chr/secrets
 * List all VPN secrets (PPTP/L2TP/SSTP/OVPN).
 */
async function listSecrets(req, res) {
  try {
    const data = await mikrotikChrService.listSecrets();
    return success(res, data, 'VPN secrets retrieved.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/vpn-chr/secrets
 * Create a VPN secret on CHR.
 */
async function createSecret(req, res) {
  try {
    const { name, password, service, profile } = req.body;

    let data;
    switch (service) {
      case 'pptp':
        data = await mikrotikChrService.createPPTPSecret({ name, password, profile });
        break;
      case 'l2tp':
        data = await mikrotikChrService.createL2TPSecret({ name, password, profile });
        break;
      case 'sstp':
        data = await mikrotikChrService.createSSTPSecret({ name, password, profile });
        break;
      case 'ovpn':
        data = await mikrotikChrService.createOVPNSecret({ name, password, profile });
        break;
      default:
        throw Object.assign(new Error(`Unsupported VPN service type: ${service}`), {
          statusCode: 400,
          code: ERROR_CODE.VALIDATION_ERROR,
        });
    }

    return created(res, data, 'VPN secret created.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * DELETE /api/vpn-chr/secrets/:id
 * Remove a VPN secret from CHR.
 */
async function deleteSecret(req, res) {
  try {
    const secretId = req.params.id;
    await mikrotikChrService.deleteSecret(secretId);
    return success(res, { id: secretId }, 'VPN secret removed.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/vpn-chr/active-connections
 * List active VPN connections.
 */
async function getActiveConnections(req, res) {
  try {
    const data = await mikrotikChrService.getActiveConnections();
    return success(res, data, 'Active VPN connections retrieved.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/vpn-chr/profiles
 * Create or update a PPP profile.
 */
async function createProfile(req, res) {
  try {
    const { name, local_address, remote_address, rate_limit } = req.body;
    const data = await mikrotikChrService.createProfile({ name, local_address, remote_address, rate_limit });
    return created(res, data, 'PPP profile created.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/vpn-chr/profiles
 * List PPP profiles.
 */
async function listProfiles(req, res) {
  try {
    const data = await mikrotikChrService.listProfiles();
    return success(res, data, 'PPP profiles retrieved.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/vpn-chr/ip-pools
 * List IP pools.
 */
async function listIpPools(req, res) {
  try {
    const data = await mikrotikChrService.listIpPools();
    return success(res, data, 'IP pools retrieved.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/vpn-chr/ip-pools
 * Create an IP pool.
 */
async function createIpPool(req, res) {
  try {
    const { name, ranges } = req.body;
    const data = await mikrotikChrService.createIpPool({ name, ranges });
    return created(res, data, 'IP pool created.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/vpn-chr/disconnect/:id
 * Disconnect an active VPN session.
 */
async function disconnectSession(req, res) {
  try {
    const sessionId = req.params.id;
    await mikrotikChrService.disconnectSession(sessionId);
    return success(res, { id: sessionId }, 'VPN session disconnected.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

module.exports = {
  getStatus,
  listSecrets,
  createSecret,
  deleteSecret,
  getActiveConnections,
  createProfile,
  listProfiles,
  listIpPools,
  createIpPool,
  disconnectSession,
};
