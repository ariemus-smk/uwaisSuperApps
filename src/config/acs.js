/**
 * ACS (Auto Configuration Server) / TR-069 configuration.
 * Reads ACS server URL and credentials from environment variables.
 *
 * Requirements: 15.1, 15.2, 15.3
 */

const acsConfig = {
  apiUrl: process.env.ACS_API_URL || 'http://localhost:7547',
  username: process.env.ACS_API_USERNAME || '',
  password: process.env.ACS_API_PASSWORD || '',
};

module.exports = acsConfig;
