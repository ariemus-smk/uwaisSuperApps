/**
 * Mikrotik CHR (RouterOS 7) REST API connection configuration.
 * Reads VPN CHR connection settings from environment variables.
 *
 * Requirements: 12.2, 12.3
 */

const mikrotikChrConfig = {
  host: process.env.VPN_CHR_HOST || '',
  port: parseInt(process.env.VPN_CHR_PORT, 10) || 443,
  username: process.env.VPN_CHR_USERNAME || 'admin',
  password: process.env.VPN_CHR_PASSWORD || '',
  useSsl: process.env.VPN_CHR_USE_SSL !== 'false',
  vpnPorts: {
    pptp: parseInt(process.env.VPN_PPTP_PORT, 10) || 1723,
    l2tp: parseInt(process.env.VPN_L2TP_PORT, 10) || 1701,
    sstp: parseInt(process.env.VPN_SSTP_PORT, 10) || 443,
    ovpn: parseInt(process.env.VPN_OVPN_PORT, 10) || 1194,
  },
};

module.exports = mikrotikChrConfig;
