/**
 * JWT Authentication configuration.
 * Reads secrets and expiry settings from environment variables.
 */

const authConfig = {
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  refreshToken: {
    secret: process.env.JWT_REFRESH_SECRET,
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
};

module.exports = authConfig;
