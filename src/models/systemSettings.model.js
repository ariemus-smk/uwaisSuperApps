/**
 * System Settings model for App DB.
 * Provides data access methods for the `system_settings` table.
 * Settings are stored as key-value pairs.
 */

const { appPool } = require('../config/database');

/**
 * Get all system settings.
 * @returns {Promise<Array>} List of all setting records
 */
async function findAll() {
  const [rows] = await appPool.execute(
    'SELECT id, setting_key, setting_value, description, updated_at FROM system_settings ORDER BY setting_key ASC'
  );
  return rows;
}

/**
 * Get a single setting by key.
 * @param {string} key - The setting key
 * @returns {Promise<object|null>} Setting record or null
 */
async function findByKey(key) {
  const [rows] = await appPool.execute(
    'SELECT id, setting_key, setting_value, description, updated_at FROM system_settings WHERE setting_key = ? LIMIT 1',
    [key]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Get multiple settings by keys.
 * @param {Array<string>} keys - Array of setting keys
 * @returns {Promise<Array>} List of matching setting records
 */
async function findByKeys(keys) {
  if (!keys || keys.length === 0) {
    return [];
  }

  const placeholders = keys.map(() => '?').join(', ');
  const [rows] = await appPool.execute(
    `SELECT id, setting_key, setting_value, description, updated_at FROM system_settings WHERE setting_key IN (${placeholders}) ORDER BY setting_key ASC`,
    keys
  );
  return rows;
}

/**
 * Get the value of a setting by key.
 * @param {string} key - The setting key
 * @returns {Promise<string|null>} Setting value or null if not found
 */
async function getValue(key) {
  const [rows] = await appPool.execute(
    'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
    [key]
  );
  return rows.length > 0 ? rows[0].setting_value : null;
}

/**
 * Create or update a setting (upsert).
 * If the key exists, updates the value. If not, inserts a new record.
 * @param {string} key - The setting key
 * @param {string} value - The setting value
 * @param {string} [description] - Optional description
 * @returns {Promise<object>} The upserted setting record
 */
async function upsert(key, value, description) {
  const descClause = description !== undefined
    ? ', description = VALUES(description)'
    : '';
  const descParam = description !== undefined ? [key, value, description] : [key, value, null];

  await appPool.execute(
    `INSERT INTO system_settings (setting_key, setting_value, description, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)${descClause}, updated_at = NOW()`,
    descParam
  );

  return findByKey(key);
}

/**
 * Update a setting value by key.
 * @param {string} key - The setting key
 * @param {string} value - The new value
 * @returns {Promise<object>} Query result
 */
async function updateValue(key, value) {
  const [result] = await appPool.execute(
    'UPDATE system_settings SET setting_value = ?, updated_at = NOW() WHERE setting_key = ?',
    [value, key]
  );
  return result;
}

/**
 * Delete a setting by key.
 * @param {string} key - The setting key
 * @returns {Promise<object>} Query result
 */
async function deleteByKey(key) {
  const [result] = await appPool.execute(
    'DELETE FROM system_settings WHERE setting_key = ?',
    [key]
  );
  return result;
}

module.exports = {
  findAll,
  findByKey,
  findByKeys,
  getValue,
  upsert,
  updateValue,
  deleteByKey,
};
