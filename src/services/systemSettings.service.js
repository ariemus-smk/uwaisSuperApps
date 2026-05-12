/**
 * System Settings service.
 * Handles business logic for system-level configuration settings
 * that Superadmin can manage.
 */

const systemSettingsModel = require('../models/systemSettings.model');
const { ERROR_CODE, SYSTEM_SETTING_KEY } = require('../utils/constants');

/**
 * Get all system settings.
 * @returns {Promise<Array>} List of all settings
 */
async function getAllSettings() {
  return systemSettingsModel.findAll();
}

/**
 * Get a single setting by key.
 * @param {string} key - Setting key
 * @returns {Promise<object>} Setting record
 * @throws {Error} If setting not found
 */
async function getSettingByKey(key) {
  const setting = await systemSettingsModel.findByKey(key);

  if (!setting) {
    throw Object.assign(new Error(`Setting '${key}' not found.`), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  return setting;
}

/**
 * Get the value of a setting, with an optional default.
 * @param {string} key - Setting key
 * @param {string} [defaultValue=null] - Default value if setting not found
 * @returns {Promise<string|null>} Setting value or default
 */
async function getSettingValue(key, defaultValue = null) {
  const value = await systemSettingsModel.getValue(key);
  return value !== null ? value : defaultValue;
}

/**
 * Get multiple settings as a key-value map.
 * @param {Array<string>} keys - Array of setting keys
 * @returns {Promise<object>} Map of key -> value
 */
async function getSettingsMap(keys) {
  const settings = await systemSettingsModel.findByKeys(keys);
  const map = {};
  for (const setting of settings) {
    map[setting.setting_key] = setting.setting_value;
  }
  return map;
}

/**
 * Update a setting value. Creates the setting if it doesn't exist.
 * @param {string} key - Setting key
 * @param {string} value - New value
 * @param {string} [description] - Optional description
 * @returns {Promise<object>} Updated setting record
 * @throws {Error} If key is invalid
 */
async function updateSetting(key, value, description) {
  if (!key || typeof key !== 'string' || key.trim().length === 0) {
    throw Object.assign(new Error('Setting key is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  if (value === undefined || value === null) {
    throw Object.assign(new Error('Setting value is required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const setting = await systemSettingsModel.upsert(key, String(value), description);
  return setting;
}

/**
 * Update multiple settings at once.
 * @param {Array<{key: string, value: string, description?: string}>} settings - Array of settings to update
 * @returns {Promise<Array>} Updated settings
 * @throws {Error} If input is invalid
 */
async function updateMultipleSettings(settings) {
  if (!Array.isArray(settings) || settings.length === 0) {
    throw Object.assign(new Error('Settings array is required and must not be empty.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  const results = [];
  for (const { key, value, description } of settings) {
    const result = await systemSettingsModel.upsert(key, String(value), description);
    results.push(result);
  }

  return results;
}

/**
 * Check if prorata billing is enabled.
 * @returns {Promise<boolean>} True if prorata is enabled
 */
async function isProrataEnabled() {
  const value = await systemSettingsModel.getValue(SYSTEM_SETTING_KEY.PRORATA_ENABLED);
  return value === 'true' || value === '1';
}

/**
 * Check if installation fee is enabled.
 * @returns {Promise<boolean>} True if installation fee is enabled
 */
async function isInstallationFeeEnabled() {
  const value = await systemSettingsModel.getValue(SYSTEM_SETTING_KEY.INSTALLATION_FEE_ENABLED);
  return value === 'true' || value === '1';
}

/**
 * Get the coverage radius in meters.
 * Falls back to COVERAGE_RADIUS_METERS env var or 500m default.
 * @returns {Promise<number>} Coverage radius in meters
 */
async function getCoverageRadius() {
  const value = await systemSettingsModel.getValue(SYSTEM_SETTING_KEY.COVERAGE_RADIUS);
  if (value !== null) {
    const parsed = Number(value);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return Number(process.env.COVERAGE_RADIUS_METERS) || 500;
}

/**
 * Get notification intervals configuration.
 * Returns parsed JSON object or default intervals.
 * @returns {Promise<object>} Notification intervals config
 */
async function getNotificationIntervals() {
  const value = await systemSettingsModel.getValue(SYSTEM_SETTING_KEY.NOTIFICATION_INTERVALS);
  if (value) {
    try {
      return JSON.parse(value);
    } catch (e) {
      // Fall through to defaults
    }
  }
  return {
    invoice_reminder_days: [1, 3, 7],
    isolir_warning_days: [1, 3],
    payment_confirmation_delay_minutes: 5,
  };
}

/**
 * Delete a setting by key.
 * @param {string} key - Setting key
 * @returns {Promise<void>}
 * @throws {Error} If setting not found
 */
async function deleteSetting(key) {
  const existing = await systemSettingsModel.findByKey(key);
  if (!existing) {
    throw Object.assign(new Error(`Setting '${key}' not found.`), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  await systemSettingsModel.deleteByKey(key);
}

module.exports = {
  getAllSettings,
  getSettingByKey,
  getSettingValue,
  getSettingsMap,
  updateSetting,
  updateMultipleSettings,
  isProrataEnabled,
  isInstallationFeeEnabled,
  getCoverageRadius,
  getNotificationIntervals,
  deleteSetting,
};
