/**
 * Property-based tests for QoS Parameter Constraints.
 *
 * **Validates: Requirements 4.2, 4.3**
 *
 * Property 3: QoS Parameter Constraints
 * For any service package QoS parameters:
 * (a) Valid parameters (burst_limit >= rate_limit AND burst_threshold <= rate_limit) never throw
 * (b) Invalid parameters (burst_limit < rate_limit OR burst_threshold > rate_limit) always throw
 * (c) Boundary cases: burst_limit == rate_limit is valid, burst_threshold == rate_limit is valid
 * (d) The validation is symmetric (same rules apply to both upload and download)
 */

const fc = require('fast-check');
const { validateQoSParameters } = require('../../src/services/package.service');

/**
 * Generator for a positive rate limit value (kbps).
 * Represents realistic ISP speed values from 64 kbps to 1 Gbps.
 */
const rateLimitArb = fc.integer({ min: 1, max: 1000000 });

/**
 * Generator for valid QoS parameters where:
 * - burst_limit >= rate_limit
 * - burst_threshold <= rate_limit
 * for both upload and download.
 */
const validQoSArb = rateLimitArb.chain((uploadRate) =>
  rateLimitArb.chain((downloadRate) =>
    fc
      .tuple(
        fc.integer({ min: uploadRate, max: uploadRate * 10 }), // upload_burst_limit >= upload_rate_limit
        fc.integer({ min: downloadRate, max: downloadRate * 10 }), // download_burst_limit >= download_rate_limit
        fc.integer({ min: 1, max: uploadRate }), // upload_burst_threshold <= upload_rate_limit
        fc.integer({ min: 1, max: downloadRate }) // download_burst_threshold <= download_rate_limit
      )
      .map(([uploadBurst, downloadBurst, uploadThreshold, downloadThreshold]) => ({
        upload_rate_limit: uploadRate,
        download_rate_limit: downloadRate,
        upload_burst_limit: uploadBurst,
        download_burst_limit: downloadBurst,
        upload_burst_threshold: uploadThreshold,
        download_burst_threshold: downloadThreshold,
      }))
  )
);

/**
 * Rate limit that is at least 2, so we can generate a burst_limit that is strictly less.
 */
const rateLimitMinTwoArb = fc.integer({ min: 2, max: 1000000 });

/**
 * Generator for invalid QoS parameters where at least one constraint is violated:
 * - burst_limit < rate_limit (for upload or download)
 * - burst_threshold > rate_limit (for upload or download)
 */
const invalidQoSArb = fc.oneof(
  // Case 1: upload_burst_limit < upload_rate_limit
  rateLimitMinTwoArb.chain((uploadRate) =>
    fc.integer({ min: 1, max: uploadRate - 1 }).chain((uploadBurst) =>
      rateLimitArb.chain((downloadRate) =>
        fc
          .tuple(
            fc.integer({ min: downloadRate, max: downloadRate * 10 }),
            fc.integer({ min: 1, max: uploadRate }),
            fc.integer({ min: 1, max: downloadRate })
          )
          .map(([downloadBurst, uploadThreshold, downloadThreshold]) => ({
            upload_rate_limit: uploadRate,
            download_rate_limit: downloadRate,
            upload_burst_limit: uploadBurst,
            download_burst_limit: downloadBurst,
            upload_burst_threshold: uploadThreshold,
            download_burst_threshold: downloadThreshold,
          }))
      )
    )
  ),

  // Case 2: download_burst_limit < download_rate_limit
  rateLimitArb.chain((uploadRate) =>
    rateLimitMinTwoArb.chain((downloadRate) =>
      fc.integer({ min: 1, max: downloadRate - 1 }).chain((downloadBurst) =>
        fc
          .tuple(
            fc.integer({ min: uploadRate, max: uploadRate * 10 }),
            fc.integer({ min: 1, max: uploadRate }),
            fc.integer({ min: 1, max: downloadRate })
          )
          .map(([uploadBurst, uploadThreshold, downloadThreshold]) => ({
            upload_rate_limit: uploadRate,
            download_rate_limit: downloadRate,
            upload_burst_limit: uploadBurst,
            download_burst_limit: downloadBurst,
            upload_burst_threshold: uploadThreshold,
            download_burst_threshold: downloadThreshold,
          }))
      )
    )
  ),

  // Case 3: upload_burst_threshold > upload_rate_limit
  rateLimitArb.chain((uploadRate) =>
    fc.integer({ min: uploadRate + 1, max: uploadRate * 10 }).chain((uploadThreshold) =>
      rateLimitArb.chain((downloadRate) =>
        fc
          .tuple(
            fc.integer({ min: uploadRate, max: uploadRate * 10 }),
            fc.integer({ min: downloadRate, max: downloadRate * 10 }),
            fc.integer({ min: 1, max: downloadRate })
          )
          .map(([uploadBurst, downloadBurst, downloadThreshold]) => ({
            upload_rate_limit: uploadRate,
            download_rate_limit: downloadRate,
            upload_burst_limit: uploadBurst,
            download_burst_limit: downloadBurst,
            upload_burst_threshold: uploadThreshold,
            download_burst_threshold: downloadThreshold,
          }))
      )
    )
  ),

  // Case 4: download_burst_threshold > download_rate_limit
  rateLimitArb.chain((uploadRate) =>
    rateLimitArb.chain((downloadRate) =>
      fc.integer({ min: downloadRate + 1, max: downloadRate * 10 }).chain((downloadThreshold) =>
        fc
          .tuple(
            fc.integer({ min: uploadRate, max: uploadRate * 10 }),
            fc.integer({ min: downloadRate, max: downloadRate * 10 }),
            fc.integer({ min: 1, max: uploadRate })
          )
          .map(([uploadBurst, downloadBurst, uploadThreshold]) => ({
            upload_rate_limit: uploadRate,
            download_rate_limit: downloadRate,
            upload_burst_limit: uploadBurst,
            download_burst_limit: downloadBurst,
            upload_burst_threshold: uploadThreshold,
            download_burst_threshold: downloadThreshold,
          }))
      )
    )
  )
);

describe('Property 3: QoS Parameter Constraints', () => {
  it('valid parameters (burst_limit >= rate_limit AND burst_threshold <= rate_limit) never throw', () => {
    fc.assert(
      fc.property(validQoSArb, (data) => {
        expect(() => validateQoSParameters(data)).not.toThrow();
      }),
      { numRuns: 500 }
    );
  });

  it('invalid parameters (burst_limit < rate_limit OR burst_threshold > rate_limit) always throw', () => {
    fc.assert(
      fc.property(invalidQoSArb, (data) => {
        expect(() => validateQoSParameters(data)).toThrow('QoS parameter validation failed.');
      }),
      { numRuns: 500 }
    );
  });

  it('boundary: burst_limit == rate_limit is valid', () => {
    fc.assert(
      fc.property(rateLimitArb, rateLimitArb, (uploadRate, downloadRate) => {
        const data = {
          upload_rate_limit: uploadRate,
          download_rate_limit: downloadRate,
          upload_burst_limit: uploadRate, // exactly equal
          download_burst_limit: downloadRate, // exactly equal
          upload_burst_threshold: uploadRate, // threshold at max allowed
          download_burst_threshold: downloadRate, // threshold at max allowed
        };

        expect(() => validateQoSParameters(data)).not.toThrow();
      }),
      { numRuns: 500 }
    );
  });

  it('boundary: burst_threshold == rate_limit is valid', () => {
    fc.assert(
      fc.property(rateLimitArb, rateLimitArb, (uploadRate, downloadRate) => {
        const data = {
          upload_rate_limit: uploadRate,
          download_rate_limit: downloadRate,
          upload_burst_limit: uploadRate * 2, // well above rate
          download_burst_limit: downloadRate * 2, // well above rate
          upload_burst_threshold: uploadRate, // exactly equal to rate_limit
          download_burst_threshold: downloadRate, // exactly equal to rate_limit
        };

        expect(() => validateQoSParameters(data)).not.toThrow();
      }),
      { numRuns: 500 }
    );
  });

  it('validation is symmetric: same rules apply to upload and download', () => {
    fc.assert(
      fc.property(rateLimitArb, rateLimitArb, (rate, burstAbove) => {
        // Create data that violates upload burst_limit but not download
        const uploadViolation = {
          upload_rate_limit: rate + 1,
          download_rate_limit: rate,
          upload_burst_limit: rate, // < upload_rate_limit (violation)
          download_burst_limit: rate * 2, // valid
          upload_burst_threshold: 1,
          download_burst_threshold: 1,
        };

        // Create mirrored data that violates download burst_limit but not upload
        const downloadViolation = {
          upload_rate_limit: rate,
          download_rate_limit: rate + 1,
          upload_burst_limit: rate * 2, // valid
          download_burst_limit: rate, // < download_rate_limit (violation)
          upload_burst_threshold: 1,
          download_burst_threshold: 1,
        };

        // Both should throw
        let uploadThrew = false;
        let downloadThrew = false;

        try {
          validateQoSParameters(uploadViolation);
        } catch (e) {
          uploadThrew = true;
        }

        try {
          validateQoSParameters(downloadViolation);
        } catch (e) {
          downloadThrew = true;
        }

        // Symmetric: if upload violation throws, download violation must also throw
        return uploadThrew === downloadThrew && uploadThrew === true;
      }),
      { numRuns: 500 }
    );
  });
});
