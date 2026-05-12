/**
 * WhatsApp Gateway configuration.
 * Reads API credentials and endpoint URLs from environment variables.
 *
 * Requirements: 30.1
 */

const whatsappConfig = {
  apiUrl: process.env.WHATSAPP_API_URL || '',
  apiKey: process.env.WHATSAPP_API_KEY || '',
  senderNumber: process.env.WHATSAPP_SENDER_NUMBER || '',
  /** Maximum retries for failed sends */
  maxRetries: 3,
  /** Batch size for queue processing */
  batchSize: 10,
};

module.exports = whatsappConfig;
