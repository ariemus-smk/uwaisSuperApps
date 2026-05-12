/**
 * ACS controller.
 * Handles HTTP requests for ACS/TR-069 remote device management endpoints.
 * Provides device reboot, WiFi configuration, firmware update, and status retrieval.
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4
 */

const acsService = require('../services/acs.service');
const { success, error } = require('../utils/responseHelper');
const { ERROR_CODE } = require('../utils/constants');

/**
 * POST /api/acs/:subscriptionId/reboot
 * Reboot a customer ONU/ONT device via ACS.
 */
async function rebootDevice(req, res) {
  try {
    const subscriptionId = Number(req.params.subscriptionId);
    const result = await acsService.rebootDevice(subscriptionId);

    return success(res, result, 'Device reboot command sent successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/acs/:subscriptionId/wifi
 * Change WiFi SSID and/or password on a customer device via ACS.
 */
async function changeWifi(req, res) {
  try {
    const subscriptionId = Number(req.params.subscriptionId);
    const { ssid, password } = req.body;

    const result = await acsService.changeWifi(subscriptionId, { ssid, password });

    return success(res, result, 'WiFi configuration updated successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/acs/:subscriptionId/firmware
 * Trigger firmware update on a customer device via ACS.
 */
async function triggerFirmwareUpdate(req, res) {
  try {
    const subscriptionId = Number(req.params.subscriptionId);
    const { firmware_url } = req.body;

    const result = await acsService.triggerFirmwareUpdate(subscriptionId, { firmware_url });

    return success(res, result, 'Firmware update triggered successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/acs/:subscriptionId/status
 * Get device status and information from ACS.
 */
async function getDeviceStatus(req, res) {
  try {
    const subscriptionId = Number(req.params.subscriptionId);
    const result = await acsService.getDeviceStatus(subscriptionId);

    return success(res, result, 'Device status retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

module.exports = {
  rebootDevice,
  changeWifi,
  triggerFirmwareUpdate,
  getDeviceStatus,
};
