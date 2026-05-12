/**
 * Property-based tests for FUP Threshold Enforcement.
 *
 * **Validates: Requirements 41.2**
 *
 * Property 14: FUP Threshold Enforcement
 * For any subscription with FUP enabled, quota threshold Q (in bytes), and current usage U,
 * the FUP enforcement function SHALL trigger speed reduction if and only if U >= Q.
 * When U < Q, the original speed profile SHALL remain active.
 * When FUP is disabled, no speed reduction SHALL be triggered regardless of usage.
 */

const fc = require('fast-check');
const {
  isThresholdExceeded,
  getThresholdBytes,
  buildFupRateLimit,
  buildNormalRateLimit,
  gbToBytes,
  bytesToGb,
  getUsagePercentage,
} = require('../../src/utils/fupCalc');

/**
 * Generator for FUP-enabled package configurations.
 * Generates realistic ISP package configs with FUP parameters.
 */
const fupEnabledPackageArb = fc.record({
  fup_enabled: fc.constant(true),
  fup_quota_gb: fc.integer({ min: 1, max: 1000 }), // 1 GB to 1 TB
  fup_upload_speed: fc.integer({ min: 64, max: 102400 }), // 64 kbps to 100 Mbps
  fup_download_speed: fc.integer({ min: 64, max: 102400 }),
  upload_rate_limit: fc.integer({ min: 1024, max: 1048576 }), // 1 Mbps to 1 Gbps
  download_rate_limit: fc.integer({ min: 1024, max: 1048576 }),
});

/**
 * Generator for FUP-disabled package configurations.
 */
const fupDisabledPackageArb = fc.record({
  fup_enabled: fc.constant(false),
  fup_quota_gb: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 1000 })),
  fup_upload_speed: fc.oneof(fc.constant(null), fc.integer({ min: 64, max: 102400 })),
  fup_download_speed: fc.oneof(fc.constant(null), fc.integer({ min: 64, max: 102400 })),
  upload_rate_limit: fc.integer({ min: 1024, max: 1048576 }),
  download_rate_limit: fc.integer({ min: 1024, max: 1048576 }),
});

/**
 * Generator for byte usage values (0 to ~2 TB in bytes).
 */
const bytesUsedArb = fc.integer({ min: 0, max: 2 * 1024 * 1024 * 1024 * 1024 });

describe('Property 14: FUP Threshold Enforcement', () => {
  describe('Threshold exceeded detection', () => {
    it('isThresholdExceeded returns true when bytes_used >= fup_quota_gb in bytes', () => {
      fc.assert(
        fc.property(fupEnabledPackageArb, (pkg) => {
          const thresholdBytes = gbToBytes(pkg.fup_quota_gb);
          // Test with usage at threshold
          const resultAtThreshold = isThresholdExceeded(thresholdBytes, pkg);
          // Test with usage above threshold
          const resultAboveThreshold = isThresholdExceeded(thresholdBytes + 1, pkg);

          return resultAtThreshold === true && resultAboveThreshold === true;
        }),
        { numRuns: 1000 }
      );
    });

    it('isThresholdExceeded returns false when bytes_used < fup_quota_gb in bytes', () => {
      fc.assert(
        fc.property(fupEnabledPackageArb, fc.double({ min: 0, max: 0.9999999, noNaN: true }), (pkg, fraction) => {
          const thresholdBytes = gbToBytes(pkg.fup_quota_gb);
          // Generate usage strictly below threshold
          const bytesUsed = Math.floor(thresholdBytes * fraction);

          return isThresholdExceeded(bytesUsed, pkg) === false;
        }),
        { numRuns: 1000 }
      );
    });
  });

  describe('FUP disabled behavior', () => {
    it('isThresholdExceeded always returns false when FUP is disabled regardless of usage', () => {
      fc.assert(
        fc.property(fupDisabledPackageArb, bytesUsedArb, (pkg, bytesUsed) => {
          return isThresholdExceeded(bytesUsed, pkg) === false;
        }),
        { numRuns: 1000 }
      );
    });

    it('getThresholdBytes returns null when FUP is disabled', () => {
      fc.assert(
        fc.property(fupDisabledPackageArb, (pkg) => {
          return getThresholdBytes(pkg) === null;
        }),
        { numRuns: 1000 }
      );
    });
  });

  describe('FUP rate limit format', () => {
    it('buildFupRateLimit returns correct format "uploadk/downloadk"', () => {
      fc.assert(
        fc.property(fupEnabledPackageArb, (pkg) => {
          const result = buildFupRateLimit(pkg);
          const expected = `${pkg.fup_upload_speed}k/${pkg.fup_download_speed}k`;

          return result === expected;
        }),
        { numRuns: 1000 }
      );
    });

    it('buildNormalRateLimit returns correct format "uploadk/downloadk"', () => {
      fc.assert(
        fc.property(fupEnabledPackageArb, (pkg) => {
          const result = buildNormalRateLimit(pkg);
          const expected = `${pkg.upload_rate_limit}k/${pkg.download_rate_limit}k`;

          return result === expected;
        }),
        { numRuns: 1000 }
      );
    });
  });

  describe('Threshold boundary exactness', () => {
    it('at exactly quota bytes, threshold is exceeded (boundary is inclusive)', () => {
      fc.assert(
        fc.property(fupEnabledPackageArb, (pkg) => {
          const exactThreshold = gbToBytes(pkg.fup_quota_gb);
          return isThresholdExceeded(exactThreshold, pkg) === true;
        }),
        { numRuns: 1000 }
      );
    });

    it('at one byte below quota, threshold is NOT exceeded', () => {
      fc.assert(
        fc.property(fupEnabledPackageArb, (pkg) => {
          const oneBelowThreshold = gbToBytes(pkg.fup_quota_gb) - 1;
          return isThresholdExceeded(oneBelowThreshold, pkg) === false;
        }),
        { numRuns: 1000 }
      );
    });
  });

  describe('Conversion consistency', () => {
    it('gbToBytes and bytesToGb are inverse operations', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 1000 }), (gb) => {
          const bytes = gbToBytes(gb);
          const backToGb = bytesToGb(bytes);
          return backToGb === gb;
        }),
        { numRuns: 1000 }
      );
    });

    it('getThresholdBytes equals gbToBytes(fup_quota_gb) when FUP is enabled', () => {
      fc.assert(
        fc.property(fupEnabledPackageArb, (pkg) => {
          const threshold = getThresholdBytes(pkg);
          const expected = gbToBytes(pkg.fup_quota_gb);
          return threshold === expected;
        }),
        { numRuns: 1000 }
      );
    });

    it('getUsagePercentage returns 100 at exactly the threshold', () => {
      fc.assert(
        fc.property(fupEnabledPackageArb, (pkg) => {
          const threshold = gbToBytes(pkg.fup_quota_gb);
          const percentage = getUsagePercentage(threshold, pkg);
          return percentage === 100;
        }),
        { numRuns: 1000 }
      );
    });
  });
});
