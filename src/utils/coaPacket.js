/**
 * CoA/POD Packet Builder Utility
 * Builds radclient-compatible command strings for Change of Authorization (CoA)
 * and Packet of Disconnect (POD) operations via FreeRADIUS.
 *
 * The CoA engine works by SSH-ing into the FreeRADIUS server and executing
 * `radclient` commands that send CoA/POD packets to the target NAS device.
 *
 * Requirements: 13.1, 13.2
 */

const DEFAULT_COA_PORT = 3799;

/**
 * Build RADIUS attribute string for a CoA (Change of Authorization) request.
 * Supports common attributes used for speed changes and isolir management.
 *
 * @param {object} options - CoA attribute options
 * @param {string} options.username - PPPoE username (User-Name attribute)
 * @param {string} [options.rateLimit] - Mikrotik-Rate-Limit value (e.g., "10M/20M")
 * @param {string} [options.framedIpAddress] - Framed-IP-Address for the session
 * @param {string} [options.filterId] - Filter-Id attribute value
 * @param {string} [options.mikrotikAddressList] - Mikrotik-Address-List value (for isolir)
 * @param {object} [options.customAttributes] - Additional key-value attribute pairs
 * @returns {string} Newline-separated RADIUS attribute string for radclient
 */
function buildCoAAttributes(options) {
  if (!options || !options.username) {
    throw new Error('username is required for CoA attributes');
  }

  const attributes = [];

  attributes.push(`User-Name = "${options.username}"`);

  if (options.rateLimit) {
    attributes.push(`Mikrotik-Rate-Limit = "${options.rateLimit}"`);
  }

  if (options.framedIpAddress) {
    attributes.push(`Framed-IP-Address = ${options.framedIpAddress}`);
  }

  if (options.filterId) {
    attributes.push(`Filter-Id = "${options.filterId}"`);
  }

  if (options.mikrotikAddressList !== undefined && options.mikrotikAddressList !== null) {
    attributes.push(`Mikrotik-Address-List = "${options.mikrotikAddressList}"`);
  }

  if (options.customAttributes && typeof options.customAttributes === 'object') {
    for (const [key, value] of Object.entries(options.customAttributes)) {
      attributes.push(`${key} = "${value}"`);
    }
  }

  return attributes.join('\n');
}

/**
 * Build RADIUS attribute string for a POD (Packet of Disconnect) request.
 * POD requires at minimum the User-Name to identify the session to disconnect.
 *
 * @param {object} options - POD attribute options
 * @param {string} options.username - PPPoE username (User-Name attribute)
 * @param {string} [options.framedIpAddress] - Framed-IP-Address for session identification
 * @param {string} [options.acctSessionId] - Acct-Session-Id for precise session targeting
 * @returns {string} Newline-separated RADIUS attribute string for radclient
 */
function buildPODAttributes(options) {
  if (!options || !options.username) {
    throw new Error('username is required for POD attributes');
  }

  const attributes = [];

  attributes.push(`User-Name = "${options.username}"`);

  if (options.framedIpAddress) {
    attributes.push(`Framed-IP-Address = ${options.framedIpAddress}`);
  }

  if (options.acctSessionId) {
    attributes.push(`Acct-Session-Id = "${options.acctSessionId}"`);
  }

  return attributes.join('\n');
}

/**
 * Generate the full radclient command string for executing CoA or POD.
 * This command is intended to be executed on the FreeRADIUS server via SSH.
 *
 * @param {string} nasIp - Target NAS IP address
 * @param {number} [nasPort=3799] - Target NAS CoA port (default: 3799)
 * @param {string} secret - RADIUS shared secret for the NAS
 * @param {string} packetType - Packet type: 'coa' or 'disconnect'
 * @param {string} attributes - RADIUS attribute string (from buildCoAAttributes or buildPODAttributes)
 * @returns {string} Complete shell command string: echo "attributes" | radclient nasIp:port type secret
 */
function buildRadclientCommand(nasIp, nasPort, secret, packetType, attributes) {
  if (!nasIp) {
    throw new Error('nasIp is required');
  }
  if (!secret) {
    throw new Error('secret is required');
  }
  if (!packetType || !['coa', 'disconnect'].includes(packetType)) {
    throw new Error('packetType must be "coa" or "disconnect"');
  }
  if (!attributes) {
    throw new Error('attributes string is required');
  }

  const port = nasPort || DEFAULT_COA_PORT;
  const escapedAttributes = attributes.replace(/"/g, '\\"');

  return `echo "${escapedAttributes}" | radclient ${nasIp}:${port} ${packetType} ${secret}`;
}

/**
 * Convenience function to build a CoA command for isolir (adding to Address_List).
 * Adds the customer PPPoE session to the Mikrotik isolir Address_List.
 *
 * @param {string} username - PPPoE username
 * @param {string} nasIp - Target NAS IP address
 * @param {string} secret - RADIUS shared secret
 * @param {number} [nasPort=3799] - Target NAS CoA port
 * @returns {string} Complete radclient command string for isolir
 */
function buildIsolirCoA(username, nasIp, secret, nasPort = DEFAULT_COA_PORT) {
  const attributes = buildCoAAttributes({
    username,
    mikrotikAddressList: 'isolir',
  });

  return buildRadclientCommand(nasIp, nasPort, secret, 'coa', attributes);
}

/**
 * Convenience function to build a CoA command for removing isolir.
 * Removes the customer PPPoE session from the Mikrotik isolir Address_List.
 *
 * @param {string} username - PPPoE username
 * @param {string} nasIp - Target NAS IP address
 * @param {string} secret - RADIUS shared secret
 * @param {number} [nasPort=3799] - Target NAS CoA port
 * @returns {string} Complete radclient command string for unisolir
 */
function buildUnisolirCoA(username, nasIp, secret, nasPort = DEFAULT_COA_PORT) {
  const attributes = buildCoAAttributes({
    username,
    mikrotikAddressList: '',
  });

  return buildRadclientCommand(nasIp, nasPort, secret, 'coa', attributes);
}

/**
 * Convenience function to build a CoA command for speed change.
 * Updates the Mikrotik-Rate-Limit attribute for the customer session.
 *
 * @param {string} username - PPPoE username
 * @param {string} nasIp - Target NAS IP address
 * @param {string} secret - RADIUS shared secret
 * @param {string} rateLimit - Mikrotik rate limit string (e.g., "10M/20M" for upload/download)
 * @param {number} [nasPort=3799] - Target NAS CoA port
 * @returns {string} Complete radclient command string for speed change
 */
function buildSpeedChangeCoA(username, nasIp, secret, rateLimit, nasPort = DEFAULT_COA_PORT) {
  if (!rateLimit) {
    throw new Error('rateLimit is required for speed change CoA');
  }

  const attributes = buildCoAAttributes({
    username,
    rateLimit,
  });

  return buildRadclientCommand(nasIp, nasPort, secret, 'coa', attributes);
}

/**
 * Convenience function to build a POD command for session disconnect (kick).
 * Sends a Packet of Disconnect to forcefully terminate the customer PPPoE session.
 *
 * @param {string} username - PPPoE username
 * @param {string} nasIp - Target NAS IP address
 * @param {string} secret - RADIUS shared secret
 * @param {number} [nasPort=3799] - Target NAS CoA port
 * @returns {string} Complete radclient command string for session kick
 */
function buildKickPOD(username, nasIp, secret, nasPort = DEFAULT_COA_PORT) {
  const attributes = buildPODAttributes({ username });

  return buildRadclientCommand(nasIp, nasPort, secret, 'disconnect', attributes);
}

module.exports = {
  DEFAULT_COA_PORT,
  buildCoAAttributes,
  buildPODAttributes,
  buildRadclientCommand,
  buildIsolirCoA,
  buildUnisolirCoA,
  buildSpeedChangeCoA,
  buildKickPOD,
};
