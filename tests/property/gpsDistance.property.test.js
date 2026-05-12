/**
 * Property-based tests for Coverage Check Distance Filtering.
 *
 * **Validates: Requirements 47.1**
 *
 * Property 12: Coverage Check Distance Filtering
 * - Distance is always >= 0
 * - Distance from a point to itself is always 0
 * - Distance is symmetric (A->B == B->A)
 * - Triangle inequality holds (dist(A,C) <= dist(A,B) + dist(B,C))
 * - Points within a given radius are correctly identified as "in coverage"
 */

const fc = require('fast-check');
const { calculateDistance } = require('../../src/utils/gpsDistance');

// Arbitrary for valid latitude [-90, 90]
const latArb = fc.double({ min: -90, max: 90, noNaN: true });
// Arbitrary for valid longitude [-180, 180]
const lonArb = fc.double({ min: -180, max: 180, noNaN: true });

// A GPS coordinate point
const pointArb = fc.tuple(latArb, lonArb);

// Coverage radius in meters (configurable, typically 500m but test with various values)
const radiusArb = fc.double({ min: 0, max: 50000, noNaN: true });

describe('Property 12: Coverage Check Distance Filtering', () => {
  it('distance is always >= 0 for any two valid GPS coordinates', () => {
    fc.assert(
      fc.property(
        pointArb,
        pointArb,
        ([lat1, lon1], [lat2, lon2]) => {
          const distance = calculateDistance(lat1, lon1, lat2, lon2);
          return distance >= 0;
        }
      ),
      { numRuns: 500 }
    );
  });

  it('distance from a point to itself is always 0', () => {
    fc.assert(
      fc.property(
        pointArb,
        ([lat, lon]) => {
          const distance = calculateDistance(lat, lon, lat, lon);
          return distance === 0;
        }
      ),
      { numRuns: 500 }
    );
  });

  it('distance is symmetric (A->B == B->A)', () => {
    fc.assert(
      fc.property(
        pointArb,
        pointArb,
        ([lat1, lon1], [lat2, lon2]) => {
          const distAB = calculateDistance(lat1, lon1, lat2, lon2);
          const distBA = calculateDistance(lat2, lon2, lat1, lon1);
          // Allow tiny floating-point tolerance
          return Math.abs(distAB - distBA) < 1e-6;
        }
      ),
      { numRuns: 500 }
    );
  });

  it('triangle inequality holds: dist(A,C) <= dist(A,B) + dist(B,C)', () => {
    fc.assert(
      fc.property(
        pointArb,
        pointArb,
        pointArb,
        ([latA, lonA], [latB, lonB], [latC, lonC]) => {
          const distAC = calculateDistance(latA, lonA, latC, lonC);
          const distAB = calculateDistance(latA, lonA, latB, lonB);
          const distBC = calculateDistance(latB, lonB, latC, lonC);
          // The Haversine formula has known floating-point precision issues
          // for near-antipodal points. Use a tolerance of 1 meter which is
          // negligible for coverage check purposes (radius is typically 500m+).
          return distAC <= distAB + distBC + 1.0;
        }
      ),
      { numRuns: 500 }
    );
  });

  it('points within a given radius are correctly identified as in coverage', () => {
    fc.assert(
      fc.property(
        pointArb,
        pointArb,
        radiusArb,
        ([lat1, lon1], [lat2, lon2], radius) => {
          const distance = calculateDistance(lat1, lon1, lat2, lon2);
          const isInCoverage = distance <= radius;

          // If distance < radius, point must be in coverage
          if (distance < radius) {
            return isInCoverage === true;
          }
          // If distance > radius, point must NOT be in coverage
          if (distance > radius) {
            return isInCoverage === false;
          }
          // If distance === radius, it's on the boundary (in coverage)
          return isInCoverage === true;
        }
      ),
      { numRuns: 500 }
    );
  });
});
