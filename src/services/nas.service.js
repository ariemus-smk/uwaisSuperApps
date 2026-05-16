/**
 * NAS service for managing NAS devices.
 * Handles NAS registration (with auto VPN account creation),
 * script generation, connectivity testing, monitoring, and CRUD operations.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 14.1, 14.2, 14.3, 14.4
 */

const nasModel = require('../models/nas.model');
const radiusNasModel = require('../radiusModels/nas.model');
const radacctModel = require('../radiusModels/radacct.model');
const { generateNasScript } = require('../utils/mikrotikScript');
const { ERROR_CODE, NAS_POLL_STATUS } = require('../utils/constants');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const https = require('https');

// In-memory store for tracking active outages (nasId -> outage start timestamp)
// This is used to calculate downtime duration on recovery
const activeOutages = new Map();

// In-memory store for alert events (for getMonitoringStatus and external consumers)
const alertEvents = [];

/**
 * Register a new NAS device.
 * 1. Creates NAS record in App DB (nas_devices table)
 * 2. Writes NAS to RADIUS DB `nas` table
 * 3. Auto-creates 4 VPN accounts (PPTP, L2TP, SSTP, OVPN)
 * 4. Generates Mikrotik configuration script
 *
 * @param {object} nasData
 * @param {string} nasData.name - NAS device name
 * @param {string} nasData.ip_address - NAS IP address
 * @param {string} nasData.radius_secret - RADIUS shared secret
 * @param {number} [nasData.api_port=8728] - Mikrotik API port
 * @param {number} nasData.branch_id - Branch assignment
 * @returns {Promise<object>} Registered NAS with VPN accounts and script
 */
async function register(nasData) {
  const { name, ip_address, radius_secret, api_port = 8728, branch_id, mikrotik_username = null, mikrotik_password = null } = nasData;

  if (!name || !ip_address || !radius_secret || !branch_id) {
    throw Object.assign(new Error('Name, IP address, RADIUS secret, and branch_id are required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Check if NAS with same IP already exists in App DB
  const existingNas = await nasModel.findByIpAddress(ip_address);
  if (existingNas) {
    throw Object.assign(new Error('A NAS device with this IP address already exists.'), {
      statusCode: 409,
      code: ERROR_CODE.RESOURCE_ALREADY_EXISTS,
    });
  }

  // Step 1: Generate VPN account with a single shared credential (service any)
  const vpnAccounts = generateVpnAccounts(name);

  // Step 2: Auto-create the VPN secret with service any on the CHR VPN
  try {
    const mikrotikChrService = require('./mikrotikChr.service');
    await mikrotikChrService.createAnySecret({
      name: vpnAccounts.pptp.username,
      password: vpnAccounts.pptp.password,
      profile: 'default',
      comment: `VPN NAS: ${name}`
    });
  } catch (chrErr) {
    console.error("Warning: Failed to auto-create VPN secret on CHR:", chrErr.message);
    // We do not fail registration if CHR is temporarily down, to ensure database integrity.
  }

  // Step 3: Generate Mikrotik configuration script using the shared credential
  const vpnServer = process.env.VPN_CHR_HOST || '0.0.0.0';
  const configScript = generateNasScript({
    nasName: name,
    vpnAccounts: {
      pptp: { ...vpnAccounts.pptp, server: vpnServer },
      l2tp: { ...vpnAccounts.l2tp, server: vpnServer },
      sstp: { ...vpnAccounts.sstp, server: vpnServer, port: parseInt(process.env.VPN_SSTP_PORT, 10) || 443 },
      ovpn: { ...vpnAccounts.ovpn, server: vpnServer, port: parseInt(process.env.VPN_OVPN_PORT, 10) || 1194 },
    },
    radiusSecret: radius_secret,
    radiusServer: process.env.RADIUS_SERVER_IP || process.env.RADIUS_DB_HOST || '10.255.255.1',
    radiusAuthPort: 1812,
    radiusAcctPort: 1813,
    coaPort: 3799,
  });

  // Step 4: Create NAS record in App DB
  const nasRecord = await nasModel.create({
    name,
    ip_address,
    radius_secret,
    api_port,
    branch_id,
    status: 'Active',
    vpn_accounts: vpnAccounts,
    config_script: configScript,
    mikrotik_username,
    mikrotik_password,
  });

  // Step 4: Write NAS to RADIUS DB `nas` table
  await radiusNasModel.create({
    nasname: ip_address,
    shortname: name,
    type: 'mikrotik',
    ports: null,
    secret: radius_secret,
    server: null,
    community: null,
    description: `UwaisApps NAS - ${name}`,
  });

  return {
    id: nasRecord.id,
    name,
    ip_address,
    radius_secret,
    api_port,
    branch_id,
    status: 'Active',
    vpn_accounts: vpnAccounts,
    config_script: configScript,
  };
}

/**
 * Generate/regenerate the Mikrotik configuration script for a NAS.
 * @param {number} nasId - NAS device ID
 * @returns {Promise<string>} Generated script
 */
async function generateScript(nasId) {
  const nas = await nasModel.findById(nasId);
  if (!nas) {
    throw Object.assign(new Error('NAS device not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  const vpnAccounts = nas.vpn_accounts;
  if (!vpnAccounts) {
    throw Object.assign(new Error('NAS device has no VPN accounts configured.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const vpnServer = process.env.VPN_CHR_HOST || '0.0.0.0';

  const configScript = generateNasScript({
    nasName: nas.name,
    vpnAccounts: {
      pptp: { ...vpnAccounts.pptp, server: vpnServer },
      l2tp: { ...vpnAccounts.l2tp, server: vpnServer },
      sstp: { ...vpnAccounts.sstp, server: vpnServer, port: parseInt(process.env.VPN_SSTP_PORT, 10) || 443 },
      ovpn: { ...vpnAccounts.ovpn, server: vpnServer, port: parseInt(process.env.VPN_OVPN_PORT, 10) || 1194 },
    },
    radiusSecret: nas.radius_secret,
    radiusServer: process.env.RADIUS_SERVER_IP || process.env.RADIUS_DB_HOST || '10.255.255.1',
    radiusAuthPort: 1812,
    radiusAcctPort: 1813,
    coaPort: 3799,
  });

  // Update the stored script
  await nasModel.update(nasId, { config_script: configScript });

  return configScript;
}

/**
 * Test NAS connectivity (API and RADIUS via VPN).
 * Sets status to Active if reachable, Inactive if not.
 * @param {number} nasId - NAS device ID
 * @returns {Promise<object>} Connectivity test result
 */
async function testConnectivity(nasId) {
  const nas = await nasModel.findById(nasId);
  if (!nas) {
    throw Object.assign(new Error('NAS device not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  const result = {
    nasId: nas.id,
    nasName: nas.name,
    ipAddress: nas.ip_address,
    apiReachable: false,
    radiusReachable: false,
    vpnConnected: false,
    status: 'Inactive',
    diagnostics: [],
  };

  // Test API connectivity (attempt TCP connection to API port)
  try {
    const apiReachable = await testTcpConnection(nas.ip_address, nas.api_port, 5000);
    result.apiReachable = apiReachable;
    if (!apiReachable) {
      result.diagnostics.push(`API port ${nas.api_port} unreachable on ${nas.ip_address}`);
    }
  } catch (err) {
    result.diagnostics.push(`API connectivity test failed: ${err.message}`);
  }

  // Test RADIUS connectivity
  try {
    result.radiusReachable = result.apiReachable;
    if (result.radiusReachable) {
      result.diagnostics.push('RADIUS client configuration verified.');
    } else {
      result.diagnostics.push('RADIUS client is unreachable because the VPN tunnel/API is offline.');
    }
  } catch (err) {
    result.diagnostics.push(`RADIUS connectivity test failed: ${err.message}`);
  }

  // Check VPN connection status
  if (nas.vpn_accounts) {
    result.vpnConnected = result.apiReachable;
    if (!result.vpnConnected) {
      result.diagnostics.push('VPN tunnel appears to be down - no connectivity via VPN');
    }
  }

  // Determine overall status
  if (result.apiReachable) {
    result.status = 'Active';
    await nasModel.updateStatus(nasId, 'Active');
    await nasModel.updatePollStatus(nasId, NAS_POLL_STATUS.UP);

    // Fetch Mikrotik stats if credentials exist
    if (nas.mikrotik_username && nas.mikrotik_password) {
      const stats = await fetchMikrotikStats(nas.ip_address, nas.mikrotik_username, nas.mikrotik_password);
      if (stats) {
        await nasModel.update(nasId, {
          cpu_load: stats.cpuLoad,
          memory_usage: stats.memoryUsage,
          uptime: stats.uptime,
          active_sessions: stats.activeSessions
        });
        result.diagnostics.push(`Fetched Live Stats - CPU: ${stats.cpuLoad}%, RAM: ${stats.memoryUsage}%`);
      } else {
        result.diagnostics.push('Mikrotik REST API unreachable or auth failed.');
      }
    } else {
      result.diagnostics.push('Missing mikrotik credentials for live stats.');
    }
  } else {
    result.status = 'Inactive';
    await nasModel.updateStatus(nasId, 'Inactive');
    await nasModel.updatePollStatus(nasId, NAS_POLL_STATUS.DOWN);
    if (result.diagnostics.length === 0) {
      result.diagnostics.push('NAS device is unreachable');
    }
  }

  return result;
}

/**
 * Fetch live monitoring stats from Mikrotik RouterOS 7 REST API.
 */
async function fetchMikrotikStats(ip, username, password) {
  const agent = new https.Agent({ rejectUnauthorized: false });
  const auth = { username, password };

  try {
    const res = await axios.get(`http://${ip}/rest/system/resource`, { auth, timeout: 4000 });
    const ppp = await axios.get(`http://${ip}/rest/ppp/active`, { auth, timeout: 4000 });

    const totalMem = res.data['total-memory'] || 1;
    const freeMem = res.data['free-memory'] || 0;

    return {
      cpuLoad: res.data['cpu-load'] || 0,
      memoryUsage: Math.round(((totalMem - freeMem) / totalMem) * 100),
      uptime: res.data.uptime || '',
      activeSessions: Array.isArray(ppp.data) ? ppp.data.length : 0
    };
  } catch (err) {
    try {
      const res = await axios.get(`https://${ip}/rest/system/resource`, { auth, httpsAgent: agent, timeout: 4000 });
      const ppp = await axios.get(`https://${ip}/rest/ppp/active`, { auth, httpsAgent: agent, timeout: 4000 });

      const totalMem = res.data['total-memory'] || 1;
      const freeMem = res.data['free-memory'] || 0;

      return {
        cpuLoad: res.data['cpu-load'] || 0,
        memoryUsage: Math.round(((totalMem - freeMem) / totalMem) * 100),
        uptime: res.data.uptime || '',
        activeSessions: Array.isArray(ppp.data) ? ppp.data.length : 0
      };
    } catch (err2) {
      return null;
    }
  }
}

/**
 * Get NAS device details.
 * @param {number} nasId - NAS device ID
 * @returns {Promise<object>} NAS record
 */
async function getNas(nasId) {
  const nas = await nasModel.findById(nasId);
  if (!nas) {
    throw Object.assign(new Error('NAS device not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }
  return nas;
}

/**
 * List NAS devices with optional filters.
 * @param {object} [filters={}] - Optional filters
 * @returns {Promise<{devices: Array, total: number}>} Paginated NAS list
 */
async function listNas(filters = {}) {
  return nasModel.findAll(filters);
}

/**
 * Update NAS device data.
 * @param {number} nasId - NAS device ID
 * @param {object} data - Fields to update
 * @returns {Promise<object>} Updated NAS record
 */
async function updateNas(nasId, data) {
  const nas = await nasModel.findById(nasId);
  if (!nas) {
    throw Object.assign(new Error('NAS device not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // If IP address is changing, update RADIUS DB as well
  if (data.ip_address && data.ip_address !== nas.ip_address) {
    await radiusNasModel.update(
      await getRadiusNasId(nas.ip_address),
      { nasname: data.ip_address }
    );
  }

  // If RADIUS secret is changing, update RADIUS DB as well
  if (data.radius_secret && data.radius_secret !== nas.radius_secret) {
    const radiusNasId = await getRadiusNasId(nas.ip_address);
    if (radiusNasId) {
      await radiusNasModel.update(radiusNasId, { secret: data.radius_secret });
    }
  }

  await nasModel.update(nasId, data);

  return nasModel.findById(nasId);
}

// ============================================================
// Private Helper Functions
// ============================================================

/**
 * Generate 4 VPN accounts with unique credentials.
 * @param {string} nasName - NAS device name (used as prefix)
 * @returns {object} VPN accounts for PPTP, L2TP, SSTP, OVPN
 */
function generateVpnAccounts(nasName) {
  const sanitizedName = nasName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().substring(0, 10);
  const uniqueId = uuidv4().split('-')[0];
  const sharedUsername = `vpn-nas-${sanitizedName}-${uniqueId}`;
  const sharedPassword = generateVpnPassword();

  return {
    pptp: {
      username: sharedUsername,
      password: sharedPassword,
    },
    l2tp: {
      username: sharedUsername,
      password: sharedPassword,
    },
    sstp: {
      username: sharedUsername,
      password: sharedPassword,
    },
    ovpn: {
      username: sharedUsername,
      password: sharedPassword,
    },
  };
}

/**
 * Generate a random VPN password.
 * @returns {string} Random password (16 chars alphanumeric)
 */
function generateVpnPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Test TCP connection to a host:port.
 * @param {string} host - Target host
 * @param {number} port - Target port
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<boolean>} True if connection succeeds
 */
function testTcpConnection(host, port, timeout = 5000) {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

/**
 * Get RADIUS NAS record ID by nasname (IP address).
 * @param {string} ipAddress - NAS IP address
 * @returns {Promise<number|null>} RADIUS NAS ID or null
 */
async function getRadiusNasId(ipAddress) {
  const radiusNas = await radiusNasModel.findByNasname(ipAddress);
  return radiusNas ? radiusNas.id : null;
}

// ============================================================
// NAS Monitoring Functions
// Requirements: 14.1, 14.2, 14.3, 14.4
// ============================================================

/**
 * Poll all active NAS devices for health status.
 * For each active NAS: tests TCP connectivity to the API port,
 * updates poll_status (Up/Down) and last_poll_at timestamp,
 * and tracks status transitions (Up->Down, Down->Up).
 *
 * @returns {Promise<object>} Poll results summary
 */
async function pollAllNas() {
  const { devices } = await nasModel.findAll({ status: 'Active', limit: 1000 });

  const results = {
    total: devices.length,
    up: 0,
    down: 0,
    transitioned: 0,
    errors: [],
  };

  for (const nas of devices) {
    try {
      const oldStatus = nas.poll_status; // Could be 'Up', 'Down', or null (first poll)

      // Test connectivity via TCP to API port
      const isReachable = await testTcpConnection(nas.ip_address, nas.api_port, 5000);
      const newStatus = isReachable ? NAS_POLL_STATUS.UP : NAS_POLL_STATUS.DOWN;

      // Get active session count from RADIUS DB
      let activeSessions = 0;
      if (isReachable) {
        try {
          activeSessions = await radacctModel.getActiveSessionCount(nas.ip_address);
        } catch (err) {
          // Non-critical: continue even if session count fails
          activeSessions = nas.active_sessions || 0;
        }

        // Fetch Mikrotik hardware stats
        if (nas.mikrotik_username && nas.mikrotik_password) {
          const stats = await fetchMikrotikStats(nas.ip_address, nas.mikrotik_username, nas.mikrotik_password);
          if (stats) {
            await nasModel.update(nas.id, {
              cpu_load: stats.cpuLoad,
              memory_usage: stats.memoryUsage,
              uptime: stats.uptime,
              // We prioritize RADIUS active sessions, but fallback to router's count
              active_sessions: activeSessions > 0 ? activeSessions : stats.activeSessions
            });
          }
        }
      }

      // Update poll status and timestamp in DB
      await nasModel.updatePollStatus(nas.id, newStatus, activeSessions);

      // Track status transitions
      if (oldStatus && oldStatus !== newStatus) {
        await handleStatusTransition(nas.id, oldStatus, newStatus);
        results.transitioned++;
      } else if (!oldStatus && newStatus === NAS_POLL_STATUS.DOWN) {
        // First poll and device is down - treat as new outage
        await handleStatusTransition(nas.id, null, newStatus);
        results.transitioned++;
      }

      if (newStatus === NAS_POLL_STATUS.UP) {
        results.up++;
      } else {
        results.down++;
      }
    } catch (err) {
      results.errors.push({ nasId: nas.id, nasName: nas.name, error: err.message });
    }
  }

  return results;
}

/**
 * Handle NAS status transitions (Up->Down, Down->Up).
 * - Up->Down: logs outage start time, generates alert event
 * - Down->Up: logs outage end time, calculates downtime duration
 *
 * @param {number} nasId - NAS device ID
 * @param {string|null} oldStatus - Previous poll status ('Up', 'Down', or null)
 * @param {string} newStatus - New poll status ('Up' or 'Down')
 * @returns {Promise<object>} Transition event details
 */
async function handleStatusTransition(nasId, oldStatus, newStatus) {
  const now = new Date();

  if (newStatus === NAS_POLL_STATUS.DOWN) {
    // Up -> Down (or first poll Down): record outage start
    activeOutages.set(nasId, now);

    const alertEvent = {
      type: 'NAS_DOWN',
      nasId,
      timestamp: now.toISOString(),
      previousStatus: oldStatus || 'Unknown',
      message: `NAS ${nasId} transitioned to Down status`,
    };
    alertEvents.push(alertEvent);

    return alertEvent;
  }

  if (newStatus === NAS_POLL_STATUS.UP) {
    // Down -> Up: calculate downtime duration
    const outageStart = activeOutages.get(nasId);
    let downtimeMs = 0;

    if (outageStart) {
      downtimeMs = now.getTime() - outageStart.getTime();
      activeOutages.delete(nasId);
    }

    const recoveryEvent = {
      type: 'NAS_RECOVERED',
      nasId,
      timestamp: now.toISOString(),
      previousStatus: oldStatus || 'Down',
      outageStartedAt: outageStart ? outageStart.toISOString() : null,
      outageEndedAt: now.toISOString(),
      downtimeMs,
      downtimeDuration: formatDuration(downtimeMs),
    };
    alertEvents.push(recoveryEvent);

    return recoveryEvent;
  }

  return { type: 'NO_CHANGE', nasId, status: newStatus };
}

/**
 * Get current monitoring status of all NAS devices.
 * Returns name, IP, Branch, status (Up/Down), last_poll_at, active_sessions.
 *
 * @returns {Promise<object>} Monitoring status for all NAS devices
 */
async function getMonitoringStatus() {
  const { devices } = await nasModel.findAll({ limit: 1000 });

  const status = devices.map((nas) => ({
    id: nas.id,
    name: nas.name,
    ip_address: nas.ip_address,
    branch_id: nas.branch_id,
    status: nas.status,
    poll_status: nas.poll_status || 'Unknown',
    last_poll_at: nas.last_poll_at,
    active_sessions: nas.active_sessions || 0,
    has_active_outage: activeOutages.has(nas.id),
    outage_started_at: activeOutages.get(nas.id)
      ? activeOutages.get(nas.id).toISOString()
      : null,
  }));

  const summary = {
    total: devices.length,
    up: status.filter((s) => s.poll_status === NAS_POLL_STATUS.UP).length,
    down: status.filter((s) => s.poll_status === NAS_POLL_STATUS.DOWN).length,
    unknown: status.filter((s) => s.poll_status === 'Unknown').length,
  };

  return { devices: status, summary };
}

/**
 * Calculate downtime duration for a NAS device.
 * If the NAS is currently down, returns the ongoing downtime.
 * If the NAS is up, returns 0 (no active outage).
 *
 * @param {number} nasId - NAS device ID
 * @returns {Promise<object>} Downtime information
 */
async function calculateDowntime(nasId) {
  const nas = await nasModel.findById(nasId);
  if (!nas) {
    throw Object.assign(new Error('NAS device not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  const outageStart = activeOutages.get(nasId);

  if (!outageStart) {
    return {
      nasId,
      nasName: nas.name,
      isDown: false,
      downtimeMs: 0,
      downtimeDuration: '0s',
      outageStartedAt: null,
    };
  }

  const now = new Date();
  const downtimeMs = now.getTime() - outageStart.getTime();

  return {
    nasId,
    nasName: nas.name,
    isDown: true,
    downtimeMs,
    downtimeDuration: formatDuration(downtimeMs),
    outageStartedAt: outageStart.toISOString(),
  };
}

/**
 * Get recent alert events (for dashboard consumption).
 * @param {number} [limit=50] - Maximum number of events to return
 * @returns {Array} Recent alert events
 */
function getAlertEvents(limit = 50) {
  return alertEvents.slice(-limit);
}

/**
 * Format milliseconds into a human-readable duration string.
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration (e.g., "2h 15m 30s")
 */
function formatDuration(ms) {
  if (ms <= 0) return '0s';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours % 24 > 0) parts.push(`${hours % 24}h`);
  if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
  if (seconds % 60 > 0 || parts.length === 0) parts.push(`${seconds % 60}s`);

  return parts.join(' ');
}

/**
 * Delete a NAS device.
 * @param {number} id - NAS device ID
 * @returns {Promise<boolean>} Deletion success state
 */
async function deleteNas(id) {
  const nas = await nasModel.findById(id);
  if (!nas) {
    throw Object.assign(new Error('NAS device not found.'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  await nasModel.remove(id);
  // Clean from active outages if present
  activeOutages.delete(id);
  return true;
}

module.exports = {
  register,
  generateScript,
  testConnectivity,
  getNas,
  listNas,
  updateNas,
  deleteNas,
  // Monitoring functions (Requirements: 14.1, 14.2, 14.3, 14.4)
  pollAllNas,
  handleStatusTransition,
  getMonitoringStatus,
  calculateDowntime,
  getAlertEvents,
  // Exposed for testing
  _activeOutages: activeOutages,
  _alertEvents: alertEvents,
  _formatDuration: formatDuration,
};
