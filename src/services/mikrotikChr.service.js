/**
 * Mikrotik CHR REST API client service.
 * Provides CRUD operations via RouterOS 7 REST API (HTTPS with basic auth).
 * Manages VPN secrets, PPP profiles, IP pools, firewall/NAT rules,
 * active connections, and system status.
 *
 * Requirements: 12.2, 12.3
 */

const axios = require('axios');
const mikrotikChrConfig = require('../config/mikrotikChr');
const { ERROR_CODE } = require('../utils/constants');

// --- Base HTTP Client ---

/**
 * Create an axios instance configured for the Mikrotik CHR REST API.
 * Uses HTTPS with basic authentication.
 */
function createClient() {
  const { host, port, username, password, useSsl } = mikrotikChrConfig;

  if (!host) {
    throw Object.assign(new Error('VPN_CHR_HOST is not configured.'), {
      statusCode: 503,
      code: ERROR_CODE.SERVICE_UNAVAILABLE,
    });
  }

  const protocol = useSsl ? 'https' : 'http';
  const baseURL = `${protocol}://${host}:${port}/rest`;

  return axios.create({
    baseURL,
    auth: { username, password },
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' },
    // RouterOS uses self-signed certs by default
    httpsAgent: useSsl
      ? new (require('https').Agent)({ rejectUnauthorized: false })
      : undefined,
  });
}

/**
 * Wrap API calls with consistent error handling.
 * @param {Function} fn - Async function to execute
 * @returns {Promise<*>} Result from the API call
 */
async function withErrorHandling(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.statusCode && err.code) {
      throw err;
    }

    const status = err.response?.status;
    const detail = err.response?.data?.detail || err.response?.data?.message || err.message;

    if (status === 401) {
      throw Object.assign(new Error('CHR authentication failed. Check VPN_CHR_USERNAME/PASSWORD.'), {
        statusCode: 401,
        code: ERROR_CODE.AUTH_INVALID_CREDENTIALS,
      });
    }

    if (status === 404) {
      throw Object.assign(new Error(`CHR resource not found: ${detail}`), {
        statusCode: 404,
        code: ERROR_CODE.RESOURCE_NOT_FOUND,
      });
    }

    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
      throw Object.assign(new Error(`CHR unreachable at ${mikrotikChrConfig.host}:${mikrotikChrConfig.port}: ${err.message}`), {
        statusCode: 503,
        code: ERROR_CODE.SERVICE_UNAVAILABLE,
      });
    }

    throw Object.assign(new Error(`CHR API error: ${detail}`), {
      statusCode: status || 500,
      code: ERROR_CODE.INTERNAL_ERROR,
    });
  }
}

// --- Generic CRUD Operations ---

/**
 * GET a resource list from CHR.
 * @param {string} resource - RouterOS resource path (e.g. 'ppp/secret')
 * @returns {Promise<Array>} List of resource items
 */
async function get(resource) {
  return withErrorHandling(async () => {
    const client = createClient();
    const response = await client.get(`/${resource}`);
    return response.data;
  });
}

/**
 * POST (create) a new resource on CHR.
 * @param {string} resource - RouterOS resource path
 * @param {object} data - Resource data to create
 * @returns {Promise<object>} Created resource
 */
async function post(resource, data) {
  return withErrorHandling(async () => {
    const client = createClient();
    const response = await client.put(`/${resource}`, data);
    return response.data;
  });
}

/**
 * PUT (update) an existing resource on CHR.
 * @param {string} resource - RouterOS resource path
 * @param {string} id - Resource ID (RouterOS .id)
 * @param {object} data - Updated resource data
 * @returns {Promise<object>} Updated resource
 */
async function put(resource, id, data) {
  return withErrorHandling(async () => {
    const client = createClient();
    const response = await client.patch(`/${resource}/${id}`, data);
    return response.data;
  });
}

/**
 * DELETE a resource from CHR.
 * @param {string} resource - RouterOS resource path
 * @param {string} id - Resource ID (RouterOS .id)
 * @returns {Promise<object>} Deletion result
 */
async function remove(resource, id) {
  return withErrorHandling(async () => {
    const client = createClient();
    const response = await client.delete(`/${resource}/${id}`);
    return response.data;
  });
}

// --- VPN Secret Management ---

/**
 * Create a PPTP VPN secret on CHR.
 * @param {object} data - Secret data
 * @param {string} data.name - Username
 * @param {string} data.password - Password
 * @param {string} [data.profile='default'] - PPP profile name
 * @returns {Promise<object>} Created secret
 */
async function createPPTPSecret(data) {
  const payload = {
    name: data.name,
    password: data.password,
    service: 'pptp',
    profile: data.profile || 'default',
  };
  if (data.remote_address) {
    payload['remote-address'] = data.remote_address;
  }
  return post('ppp/secret', payload);
}

/**
 * Create an L2TP VPN secret on CHR.
 * @param {object} data - Secret data
 * @param {string} data.name - Username
 * @param {string} data.password - Password
 * @param {string} [data.profile='default'] - PPP profile name
 * @returns {Promise<object>} Created secret
 */
async function createL2TPSecret(data) {
  const payload = {
    name: data.name,
    password: data.password,
    service: 'l2tp',
    profile: data.profile || 'default',
  };
  if (data.remote_address) {
    payload['remote-address'] = data.remote_address;
  }
  return post('ppp/secret', payload);
}

/**
 * Create an SSTP VPN secret on CHR.
 * @param {object} data - Secret data
 * @param {string} data.name - Username
 * @param {string} data.password - Password
 * @param {string} [data.profile='default'] - PPP profile name
 * @returns {Promise<object>} Created secret
 */
async function createSSTPSecret(data) {
  const payload = {
    name: data.name,
    password: data.password,
    service: 'sstp',
    profile: data.profile || 'default',
  };
  if (data.remote_address) {
    payload['remote-address'] = data.remote_address;
  }
  return post('ppp/secret', payload);
}

/**
 * Create an OpenVPN secret on CHR.
 * @param {object} data - Secret data
 * @param {string} data.name - Username
 * @param {string} data.password - Password
 * @param {string} [data.profile='default'] - PPP profile name
 * @returns {Promise<object>} Created secret
 */
async function createOVPNSecret(data) {
  const payload = {
    name: data.name,
    password: data.password,
    service: 'ovpn',
    profile: data.profile || 'default',
  };
  if (data.remote_address) {
    payload['remote-address'] = data.remote_address;
  }
  return post('ppp/secret', payload);
}

/**
 * Create a generic VPN secret (any service) on CHR.
 * @param {object} data - Secret data
 * @param {string} data.name - Username
 * @param {string} data.password - Password
 * @param {string} [data.profile='default'] - PPP profile name
 * @returns {Promise<object>} Created secret
 */
async function createAnySecret(data) {
  const payload = {
    name: data.name,
    password: data.password,
    service: 'any',
    profile: data.profile || 'default',
  };
  if (data.remote_address) {
    payload['remote-address'] = data.remote_address;
  }
  return post('ppp/secret', payload);
}

/**
 * Delete a VPN secret from CHR.
 * @param {string} id - Secret ID (RouterOS .id)
 * @returns {Promise<object>} Deletion result
 */
async function deleteSecret(id) {
  return remove('ppp/secret', id);
}

/**
 * List all VPN secrets on CHR.
 * @returns {Promise<Array>} List of PPP secrets
 */
async function listSecrets() {
  return get('ppp/secret');
}

// --- PPP Profile Management ---

/**
 * Create a PPP profile on CHR.
 * @param {object} data - Profile data
 * @param {string} data.name - Profile name
 * @param {string} [data.local_address] - Local IP address
 * @param {string} [data.remote_address] - Remote address pool name
 * @param {string} [data.rate_limit] - Rate limit (e.g. '10M/20M')
 * @returns {Promise<object>} Created profile
 */
async function createProfile(data) {
  const payload = { name: data.name };
  if (data.local_address) payload['local-address'] = data.local_address;
  if (data.remote_address) payload['remote-address'] = data.remote_address;
  if (data.rate_limit) payload['rate-limit'] = data.rate_limit;
  return post('ppp/profile', payload);
}

/**
 * List all PPP profiles on CHR.
 * @returns {Promise<Array>} List of PPP profiles
 */
async function listProfiles() {
  return get('ppp/profile');
}

/**
 * Update a PPP profile on CHR.
 * @param {string} id - Profile ID (RouterOS .id)
 * @param {object} data - Updated profile data
 * @returns {Promise<object>} Updated profile
 */
async function updateProfile(id, data) {
  const payload = {};
  if (data.name) payload.name = data.name;
  if (data.local_address) payload['local-address'] = data.local_address;
  if (data.remote_address) payload['remote-address'] = data.remote_address;
  if (data.rate_limit) payload['rate-limit'] = data.rate_limit;
  return put('ppp/profile', id, payload);
}

// --- IP Pool Management ---

/**
 * Create an IP pool on CHR.
 * @param {object} data - Pool data
 * @param {string} data.name - Pool name
 * @param {string} data.ranges - IP ranges (e.g. '10.0.0.2-10.0.0.254')
 * @returns {Promise<object>} Created pool
 */
async function createIpPool(data) {
  return post('ip/pool', {
    name: data.name,
    ranges: data.ranges,
  });
}

/**
 * List all IP pools on CHR.
 * @returns {Promise<Array>} List of IP pools
 */
async function listIpPools() {
  return get('ip/pool');
}

// --- Firewall / NAT Rules ---

/**
 * Add a firewall filter rule on CHR.
 * @param {object} data - Firewall rule data (chain, action, src-address, dst-address, protocol, etc.)
 * @returns {Promise<object>} Created rule
 */
async function addFirewallRule(data) {
  return post('ip/firewall/filter', data);
}

/**
 * Add a NAT rule on CHR.
 * @param {object} data - NAT rule data (chain, action, src-address, out-interface, etc.)
 * @returns {Promise<object>} Created NAT rule
 */
async function addNatRule(data) {
  return post('ip/firewall/nat', data);
}

/**
 * List all firewall filter rules on CHR.
 * @returns {Promise<Array>} List of firewall rules
 */
async function listFirewallRules() {
  return get('ip/firewall/filter');
}

/**
 * List all NAT rules on CHR.
 * @returns {Promise<Array>} List of NAT rules
 */
async function listNatRules() {
  return get('ip/firewall/nat');
}

// --- Active Connections ---

/**
 * Get all active PPP connections on CHR.
 * @returns {Promise<Array>} List of active connections
 */
async function getActiveConnections() {
  return get('ppp/active');
}

/**
 * Disconnect an active VPN session on CHR.
 * @param {string} id - Active connection ID (RouterOS .id)
 * @returns {Promise<object>} Disconnection result
 */
async function disconnectSession(id) {
  return remove('ppp/active', id);
}

// --- System Status ---

/**
 * Get CHR system resource status (CPU, memory, uptime, version).
 * @returns {Promise<object>} System resource information
 */
async function getSystemStatus() {
  return withErrorHandling(async () => {
    const client = createClient();
    const response = await client.get('/system/resource');
    return response.data;
  });
}

module.exports = {
  // Generic CRUD
  get,
  post,
  put,
  remove,
  // VPN secrets
  createPPTPSecret,
  createL2TPSecret,
  createSSTPSecret,
  createOVPNSecret,
  createAnySecret,
  deleteSecret,
  listSecrets,
  // PPP profiles
  createProfile,
  listProfiles,
  updateProfile,
  // IP pools
  createIpPool,
  listIpPools,
  // Firewall / NAT
  addFirewallRule,
  addNatRule,
  listFirewallRules,
  listNatRules,
  // Active connections
  getActiveConnections,
  disconnectSession,
  // System
  getSystemStatus,
};
