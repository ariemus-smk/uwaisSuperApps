/**
 * FUP (Fair Usage Policy) Threshold Calculation Utility
 * Provides functions for calculating FUP quota thresholds and
 * determining whether a subscription has exceeded its FUP limit.
 *
 * Requirements: 41.1, 41.4
 */

/**
 * Convert gigabytes to bytes.
 * @param {number} gb - Value in gigabytes
 * @returns {number} Value in bytes
 */
function gbToBytes(gb) {
  return gb * 1024 * 1024 * 1024;
}

/**
 * Convert bytes to gigabytes.
 * @param {number} bytes - Value in bytes
 * @returns {number} Value in gigabytes (decimal)
 */
function bytesToGb(bytes) {
  return bytes / (1024 * 1024 * 1024);
}

/**
 * Calculate the FUP threshold in bytes for a given package.
 * Returns the quota threshold converted from GB to bytes.
 *
 * @param {object} pkg - Package object with FUP configuration
 * @param {boolean} pkg.fup_enabled - Whether FUP is enabled for this package
 * @param {number|null} pkg.fup_quota_gb - FUP quota threshold in GB
 * @returns {number|null} Threshold in bytes, or null if FUP is not enabled/configured
 */
function getThresholdBytes(pkg) {
  if (!pkg || !pkg.fup_enabled || !pkg.fup_quota_gb) {
    return null;
  }

  return gbToBytes(pkg.fup_quota_gb);
}

/**
 * Check whether cumulative usage has exceeded the FUP threshold.
 *
 * @param {number} bytesUsed - Total bytes used in the billing cycle
 * @param {object} pkg - Package object with FUP configuration
 * @param {boolean} pkg.fup_enabled - Whether FUP is enabled for this package
 * @param {number|null} pkg.fup_quota_gb - FUP quota threshold in GB
 * @returns {boolean} True if threshold is exceeded, false otherwise
 */
function isThresholdExceeded(bytesUsed, pkg) {
  const threshold = getThresholdBytes(pkg);
  if (threshold === null) {
    return false;
  }

  return bytesUsed >= threshold;
}

/**
 * Build the Mikrotik rate limit string for FUP reduced speed.
 * Format: "uploadSpeed/downloadSpeed" in kbps notation for Mikrotik.
 * Mikrotik expects rate-limit in format: rx-rate/tx-rate (from router perspective)
 * where rx = upload (client to router) and tx = download (router to client).
 *
 * @param {object} pkg - Package object with FUP speed configuration
 * @param {number} pkg.fup_upload_speed - Reduced upload speed in kbps
 * @param {number} pkg.fup_download_speed - Reduced download speed in kbps
 * @returns {string|null} Mikrotik rate limit string (e.g., "2048k/4096k") or null if not configured
 */
function buildFupRateLimit(pkg) {
  if (!pkg || !pkg.fup_upload_speed || !pkg.fup_download_speed) {
    return null;
  }

  return `${pkg.fup_upload_speed}k/${pkg.fup_download_speed}k`;
}

/**
 * Build the Mikrotik rate limit string for the original (normal) speed.
 * Used when restoring speed after FUP reset.
 *
 * @param {object} pkg - Package object with normal speed configuration
 * @param {number} pkg.upload_rate_limit - Normal upload speed in kbps
 * @param {number} pkg.download_rate_limit - Normal download speed in kbps
 * @returns {string|null} Mikrotik rate limit string (e.g., "10240k/20480k") or null if not configured
 */
function buildNormalRateLimit(pkg) {
  if (!pkg || !pkg.upload_rate_limit || !pkg.download_rate_limit) {
    return null;
  }

  return `${pkg.upload_rate_limit}k/${pkg.download_rate_limit}k`;
}

/**
 * Calculate usage percentage relative to FUP quota.
 *
 * @param {number} bytesUsed - Total bytes used in the billing cycle
 * @param {object} pkg - Package object with FUP configuration
 * @param {boolean} pkg.fup_enabled - Whether FUP is enabled
 * @param {number|null} pkg.fup_quota_gb - FUP quota threshold in GB
 * @returns {number|null} Usage percentage (0-100+), or null if FUP not enabled
 */
function getUsagePercentage(bytesUsed, pkg) {
  const threshold = getThresholdBytes(pkg);
  if (threshold === null || threshold === 0) {
    return null;
  }

  return (bytesUsed / threshold) * 100;
}

module.exports = {
  gbToBytes,
  bytesToGb,
  getThresholdBytes,
  isThresholdExceeded,
  buildFupRateLimit,
  buildNormalRateLimit,
  getUsagePercentage,
};
