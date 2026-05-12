/**
 * ACS (Auto Configuration Server) service.
 * Provides TR-069 remote device management operations including:
 * device reboot, WiFi configuration changes, firmware updates, and device status retrieval.
 *
 * Links subscriptions to ACS using PPPoE username as the device identifier.
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 3.4
 */

const axios = require('axios');
const acsConfig = require('../config/acs');
const subscriptionModel = require('../models/subscription.model');
const { ERROR_CODE } = require('../utils/constants');

/**
 * Create an axios instance configured for the ACS API.
 * Uses HTTP Basic Auth with configured credentials.
 * @returns {import('axios').AxiosInstance}
 */
function createHttpClient() {
  return axios.create({
    baseURL: acsConfig.apiUrl,
    auth: {
      username: acsConfig.username,
      password: acsConfig.password,
    },
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
}

/**
 * Resolve a subscription and its PPPoE username (ACS device identifier).
 * @param {number} subscriptionId - Subscription ID
 * @returns {Promise<object>} Subscription record with pppoe_username
 * @throws {Error} If subscription not found
 */
async function resolveSubscription(subscriptionId) {
  const subscription = await subscriptionModel.findById(subscriptionId);

  if (!subscription) {
    throw Object.assign(new Error('Subscription not found'), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  if (!subscription.pppoe_username) {
    throw Object.assign(new Error('Subscription does not have a PPPoE username assigned'), {
      statusCode: 400,
      code: ERROR_CODE.INVALID_INPUT,
    });
  }

  return subscription;
}

/**
 * Reboot a customer ONU/ONT device via ACS TR-069.
 *
 * @param {number} subscriptionId - Subscription ID
 * @returns {Promise<object>} Operation result with status
 * @throws {Error} If subscription not found or ACS request fails
 */
async function rebootDevice(subscriptionId) {
  const subscription = await resolveSubscription(subscriptionId);
  const deviceId = subscription.pppoe_username;
  const client = createHttpClient();

  try {
    const response = await client.post(`/devices/${encodeURIComponent(deviceId)}/reboot`);

    return {
      subscriptionId,
      deviceId,
      operation: 'reboot',
      status: response.data?.status || 'success',
      message: response.data?.message || 'Device reboot command sent successfully',
    };
  } catch (error) {
    if (error.code === ERROR_CODE.ACS_ERROR) {
      throw error;
    }

    const message = error.response?.data?.message || error.message || 'ACS reboot request failed';
    throw Object.assign(new Error(message), {
      statusCode: error.response?.status || 502,
      code: ERROR_CODE.ACS_ERROR,
    });
  }
}

/**
 * Change WiFi SSID and/or password on a customer ONU/ONT device via ACS TR-069.
 *
 * @param {number} subscriptionId - Subscription ID
 * @param {object} wifiData - WiFi configuration data
 * @param {string} [wifiData.ssid] - New WiFi SSID
 * @param {string} [wifiData.password] - New WiFi password
 * @returns {Promise<object>} Operation result with status
 * @throws {Error} If subscription not found or ACS request fails
 */
async function changeWifi(subscriptionId, wifiData) {
  const subscription = await resolveSubscription(subscriptionId);
  const deviceId = subscription.pppoe_username;
  const client = createHttpClient();

  const payload = {};
  if (wifiData.ssid) {
    payload.ssid = wifiData.ssid;
  }
  if (wifiData.password) {
    payload.password = wifiData.password;
  }

  if (Object.keys(payload).length === 0) {
    throw Object.assign(new Error('At least one of ssid or password must be provided'), {
      statusCode: 400,
      code: ERROR_CODE.INVALID_INPUT,
    });
  }

  try {
    const response = await client.post(`/devices/${encodeURIComponent(deviceId)}/wifi`, payload);

    return {
      subscriptionId,
      deviceId,
      operation: 'wifi_change',
      status: response.data?.status || 'success',
      message: response.data?.message || 'WiFi configuration updated successfully',
      changes: payload,
    };
  } catch (error) {
    if (error.code === ERROR_CODE.ACS_ERROR) {
      throw error;
    }

    const message = error.response?.data?.message || error.message || 'ACS WiFi change request failed';
    throw Object.assign(new Error(message), {
      statusCode: error.response?.status || 502,
      code: ERROR_CODE.ACS_ERROR,
    });
  }
}

/**
 * Trigger a firmware update on a customer ONU/ONT device via ACS TR-069.
 *
 * @param {number} subscriptionId - Subscription ID
 * @param {object} [firmwareData={}] - Optional firmware data
 * @param {string} [firmwareData.firmware_url] - URL of the firmware file
 * @returns {Promise<object>} Operation result with status
 * @throws {Error} If subscription not found or ACS request fails
 */
async function triggerFirmwareUpdate(subscriptionId, firmwareData = {}) {
  const subscription = await resolveSubscription(subscriptionId);
  const deviceId = subscription.pppoe_username;
  const client = createHttpClient();

  const payload = {};
  if (firmwareData.firmware_url) {
    payload.firmware_url = firmwareData.firmware_url;
  }

  try {
    const response = await client.post(`/devices/${encodeURIComponent(deviceId)}/firmware`, payload);

    return {
      subscriptionId,
      deviceId,
      operation: 'firmware_update',
      status: response.data?.status || 'success',
      message: response.data?.message || 'Firmware update triggered successfully',
    };
  } catch (error) {
    if (error.code === ERROR_CODE.ACS_ERROR) {
      throw error;
    }

    const message = error.response?.data?.message || error.message || 'ACS firmware update request failed';
    throw Object.assign(new Error(message), {
      statusCode: error.response?.status || 502,
      code: ERROR_CODE.ACS_ERROR,
    });
  }
}

/**
 * Get device status and information from ACS for a customer subscription.
 * Returns device model, firmware version, last contact timestamp, and connection status.
 *
 * @param {number} subscriptionId - Subscription ID
 * @returns {Promise<object>} Device status information
 * @throws {Error} If subscription not found or ACS request fails
 */
async function getDeviceStatus(subscriptionId) {
  const subscription = await resolveSubscription(subscriptionId);
  const deviceId = subscription.pppoe_username;
  const client = createHttpClient();

  try {
    const response = await client.get(`/devices/${encodeURIComponent(deviceId)}/status`);

    return {
      subscriptionId,
      deviceId,
      device_model: response.data?.device_model || null,
      firmware_version: response.data?.firmware_version || null,
      last_contact: response.data?.last_contact || null,
      connection_status: response.data?.connection_status || 'unknown',
      ...response.data,
    };
  } catch (error) {
    if (error.code === ERROR_CODE.ACS_ERROR) {
      throw error;
    }

    if (error.response?.status === 404) {
      throw Object.assign(new Error('Device not found in ACS system'), {
        statusCode: 404,
        code: ERROR_CODE.RESOURCE_NOT_FOUND,
      });
    }

    const message = error.response?.data?.message || error.message || 'ACS status request failed';
    throw Object.assign(new Error(message), {
      statusCode: error.response?.status || 502,
      code: ERROR_CODE.ACS_ERROR,
    });
  }
}

module.exports = {
  rebootDevice,
  changeWifi,
  triggerFirmwareUpdate,
  getDeviceStatus,
};
