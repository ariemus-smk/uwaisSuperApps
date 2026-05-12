/**
 * Tripay Payment Gateway configuration.
 * Reads API credentials and endpoint URLs from environment variables.
 *
 * Requirements: 8.1, 8.2, 8.5
 */

const tripayConfig = {
  apiUrl: process.env.TRIPAY_API_URL || 'https://tripay.co.id/api',
  apiKey: process.env.TRIPAY_API_KEY,
  privateKey: process.env.TRIPAY_PRIVATE_KEY,
  merchantCode: process.env.TRIPAY_MERCHANT_CODE,
  callbackUrl: process.env.TRIPAY_CALLBACK_URL,
};

module.exports = tripayConfig;
