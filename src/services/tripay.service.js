/**
 * Tripay Payment Gateway integration service.
 * Handles payment transaction creation, callback verification,
 * payment channel listing, and transaction status retrieval.
 *
 * Supports VA (Virtual Account), QRIS, and minimarket payment methods.
 *
 * Requirements: 8.1, 8.2, 8.5
 */

const crypto = require('crypto');
const axios = require('axios');
const tripayConfig = require('../config/tripay');
const { ERROR_CODE } = require('../utils/constants');

/**
 * Create an axios instance configured for Tripay API.
 * @returns {import('axios').AxiosInstance}
 */
function createHttpClient() {
  return axios.create({
    baseURL: tripayConfig.apiUrl,
    headers: {
      Authorization: `Bearer ${tripayConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
}

/**
 * Generate HMAC-SHA256 signature for Tripay transaction creation.
 *
 * Tripay requires: HMAC_SHA256(merchantCode + merchantRef + amount, privateKey)
 *
 * @param {string} merchantRef - Merchant reference (invoice ID)
 * @param {number} amount - Transaction amount
 * @returns {string} HMAC-SHA256 hex signature
 */
function generateSignature(merchantRef, amount) {
  const data = tripayConfig.merchantCode + merchantRef + amount;
  return crypto
    .createHmac('sha256', tripayConfig.privateKey)
    .update(data)
    .digest('hex');
}

/**
 * Create a payment transaction with Tripay API.
 *
 * @param {string} invoiceId - Invoice ID used as merchant reference
 * @param {number} amount - Payment amount in IDR
 * @param {string} customerName - Customer full name
 * @param {string} customerEmail - Customer email address
 * @param {string} paymentMethod - Payment channel code (e.g., 'BRIVA', 'QRIS', 'ALFAMART')
 * @returns {Promise<object>} Tripay transaction response with payment instructions
 * @throws {Error} If Tripay API returns an error
 */
async function createTransaction(invoiceId, amount, customerName, customerEmail, paymentMethod) {
  const merchantRef = String(invoiceId);
  const signature = generateSignature(merchantRef, amount);

  const payload = {
    method: paymentMethod,
    merchant_ref: merchantRef,
    amount: amount,
    customer_name: customerName,
    customer_email: customerEmail,
    order_items: [
      {
        name: `Invoice ${merchantRef}`,
        price: amount,
        quantity: 1,
      },
    ],
    callback_url: tripayConfig.callbackUrl,
    return_url: tripayConfig.callbackUrl,
    signature: signature,
  };

  const client = createHttpClient();

  try {
    const response = await client.post('/transaction/create', payload);

    if (!response.data || !response.data.success) {
      const message = response.data?.message || 'Failed to create Tripay transaction';
      throw Object.assign(new Error(message), {
        statusCode: 400,
        code: ERROR_CODE.TRIPAY_ERROR,
      });
    }

    return response.data.data;
  } catch (error) {
    if (error.code === ERROR_CODE.TRIPAY_ERROR) {
      throw error;
    }

    const message = error.response?.data?.message || error.message || 'Tripay API request failed';
    throw Object.assign(new Error(message), {
      statusCode: error.response?.status || 502,
      code: ERROR_CODE.TRIPAY_ERROR,
    });
  }
}

/**
 * Verify HMAC-SHA256 signature from Tripay callback.
 *
 * Tripay callback signature is computed as:
 *   HMAC_SHA256(callbackJsonBody, privateKey)
 *
 * @param {string|object} callbackData - Raw callback body (JSON string or object)
 * @param {string} signature - Signature from Tripay callback header
 * @returns {boolean} True if signature is valid, false otherwise
 */
function verifyCallback(callbackData, signature) {
  if (!signature || !callbackData) {
    return false;
  }

  const dataString = typeof callbackData === 'string'
    ? callbackData
    : JSON.stringify(callbackData);

  const computedSignature = crypto
    .createHmac('sha256', tripayConfig.privateKey)
    .update(dataString)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computedSignature, 'hex'),
      Buffer.from(signature, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Get available payment channels from Tripay.
 *
 * @returns {Promise<Array>} List of available payment channels with details
 * @throws {Error} If Tripay API returns an error
 */
async function getPaymentChannels() {
  const client = createHttpClient();

  try {
    const response = await client.get('/merchant/payment-channel');

    if (!response.data || !response.data.success) {
      const message = response.data?.message || 'Failed to fetch payment channels';
      throw Object.assign(new Error(message), {
        statusCode: 400,
        code: ERROR_CODE.TRIPAY_ERROR,
      });
    }

    return response.data.data;
  } catch (error) {
    if (error.code === ERROR_CODE.TRIPAY_ERROR) {
      throw error;
    }

    const message = error.response?.data?.message || error.message || 'Tripay API request failed';
    throw Object.assign(new Error(message), {
      statusCode: error.response?.status || 502,
      code: ERROR_CODE.TRIPAY_ERROR,
    });
  }
}

/**
 * Get transaction detail/status from Tripay.
 *
 * @param {string} reference - Tripay transaction reference
 * @returns {Promise<object>} Transaction detail including status
 * @throws {Error} If Tripay API returns an error or transaction not found
 */
async function getTransactionDetail(reference) {
  const client = createHttpClient();

  try {
    const response = await client.get('/transaction/detail', {
      params: { reference },
    });

    if (!response.data || !response.data.success) {
      const message = response.data?.message || 'Failed to fetch transaction detail';
      throw Object.assign(new Error(message), {
        statusCode: 400,
        code: ERROR_CODE.TRIPAY_ERROR,
      });
    }

    return response.data.data;
  } catch (error) {
    if (error.code === ERROR_CODE.TRIPAY_ERROR) {
      throw error;
    }

    if (error.response?.status === 404) {
      throw Object.assign(new Error('Tripay transaction not found'), {
        statusCode: 404,
        code: ERROR_CODE.RESOURCE_NOT_FOUND,
      });
    }

    const message = error.response?.data?.message || error.message || 'Tripay API request failed';
    throw Object.assign(new Error(message), {
      statusCode: error.response?.status || 502,
      code: ERROR_CODE.TRIPAY_ERROR,
    });
  }
}

module.exports = {
  createTransaction,
  verifyCallback,
  getPaymentChannels,
  getTransactionDetail,
  generateSignature,
};
