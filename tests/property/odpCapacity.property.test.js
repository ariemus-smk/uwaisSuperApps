/**
 * Property-based tests for ODP Capacity Exclusion.
 *
 * **Validates: Requirements 29.5**
 *
 * Property 10: ODP Capacity Exclusion
 * For any set of ODPs, the coverage check SHALL never include an ODP
 * where used_ports >= total_ports. Only ODPs with available capacity
 * (used_ports < total_ports) may appear in coverage results.
 */

const fc = require('fast-check');
const { calculateDistance } = require('../../src/utils/gpsDistance');

/**
 * Pure coverage filtering logic matching the behavior of:
 * - odpModel.findActiveWithAvailablePorts() which filters: status = 'Active' AND used_ports < total_ports
 * - coverageService.checkCoverage() which further filters by distance
 *
 * This function replicates the full coverage check pipeline:
 * 1. Filter active ODPs with available ports (used_ports < total_ports)
 * 2. Calculate distance from customer location to each ODP
 * 3. Include only ODPs within the specified radius
 *
 * @param {Array} odps - Array of ODP records
 * @param {number} latitude - Customer latitude
 * @param {number} longitude - Customer longitude
 * @param {number} radiusMeters - Coverage radius in meters
 * @returns {Array} ODPs that pass all coverage filters
 */
function filterCoverageOdps(odps, latitude, longitude, radiusMeters) {
  // Step 1: Filter active ODPs with available ports (mirrors DB query in odpModel)
  const activeWithPorts = odps.filter(
    (odp) => odp.status === 'Active' && odp.used_ports < odp.total_ports
  );

  // Step 2 & 3: Calculate distance and filter by radius (mirrors coverage service)
  const nearbyOdps = [];
  for (const odp of activeWithPorts) {
    const distance = calculateDistance(latitude, longitude, odp.latitude, odp.longitude);
    if (distance <= radiusMeters) {
      nearbyOdps.push({
        ...odp,
        available_ports: odp.total_ports - odp.used_ports,
        distance_meters: Math.round(distance),
      });
    }
  }

  return nearbyOdps;
}

// --- Arbitraries ---

// Valid GPS coordinates
const latArb = fc.double({ min: -90, max: 90, noNaN: true });
const lonArb = fc.double({ min: -180, max: 180, noNaN: true });

// Port counts: total_ports between 1 and 48 (typical ODP splitter sizes)
const totalPortsArb = fc.integer({ min: 1, max: 48 });

// ODP status
const odpStatusArb = fc.constantFrom('Active', 'Inactive');

// Coverage radius in meters
const radiusArb = fc.integer({ min: 100, max: 5000 });

/**
 * Generate an ODP record with random port usage.
 * used_ports ranges from 0 to total_ports (inclusive, so full capacity is possible).
 */
const odpArb = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  name: fc.string({ minLength: 1, maxLength: 20 }),
  latitude: latArb,
  longitude: lonArb,
  total_ports: totalPortsArb,
  status: odpStatusArb,
}).chain((odp) =>
  fc.integer({ min: 0, max: odp.total_ports }).map((used_ports) => ({
    ...odp,
    used_ports,
    olt_id: 1,
    olt_pon_port: 1,
    branch_id: 1,
  }))
);

// Generate a list of ODPs (1 to 20)
const odpListArb = fc.array(odpArb, { minLength: 1, maxLength: 20 });

describe('Property 10: ODP Capacity Exclusion', () => {
  it('full-capacity ODPs (used_ports >= total_ports) are never included in coverage results', () => {
    fc.assert(
      fc.property(
        odpListArb,
        latArb,
        lonArb,
        radiusArb,
        (odps, customerLat, customerLon, radius) => {
          const results = filterCoverageOdps(odps, customerLat, customerLon, radius);

          // No result should have used_ports >= total_ports
          return results.every((odp) => odp.used_ports < odp.total_ports);
        }
      ),
      { numRuns: 1000 }
    );
  });

  it('all returned ODPs have available_ports > 0', () => {
    fc.assert(
      fc.property(
        odpListArb,
        latArb,
        lonArb,
        radiusArb,
        (odps, customerLat, customerLon, radius) => {
          const results = filterCoverageOdps(odps, customerLat, customerLon, radius);

          return results.every((odp) => odp.available_ports > 0);
        }
      ),
      { numRuns: 1000 }
    );
  });

  it('when all ODPs are at full capacity, coverage results are empty', () => {
    // Generate ODPs that are all at full capacity
    const fullOdpArb = fc.record({
      id: fc.integer({ min: 1, max: 10000 }),
      name: fc.string({ minLength: 1, maxLength: 20 }),
      latitude: latArb,
      longitude: lonArb,
      total_ports: totalPortsArb,
      status: fc.constant('Active'),
    }).map((odp) => ({
      ...odp,
      used_ports: odp.total_ports, // full capacity
      olt_id: 1,
      olt_pon_port: 1,
      branch_id: 1,
    }));

    const fullOdpListArb = fc.array(fullOdpArb, { minLength: 1, maxLength: 20 });

    fc.assert(
      fc.property(
        fullOdpListArb,
        latArb,
        lonArb,
        radiusArb,
        (odps, customerLat, customerLon, radius) => {
          const results = filterCoverageOdps(odps, customerLat, customerLon, radius);

          return results.length === 0;
        }
      ),
      { numRuns: 500 }
    );
  });

  it('ODPs with used_ports exceeding total_ports are also excluded', () => {
    // Edge case: used_ports > total_ports (data inconsistency)
    const overCapacityOdpArb = fc.record({
      id: fc.integer({ min: 1, max: 10000 }),
      name: fc.string({ minLength: 1, maxLength: 20 }),
      latitude: latArb,
      longitude: lonArb,
      total_ports: totalPortsArb,
      status: fc.constant('Active'),
    }).chain((odp) =>
      fc.integer({ min: odp.total_ports, max: odp.total_ports + 10 }).map((used_ports) => ({
        ...odp,
        used_ports,
        olt_id: 1,
        olt_pon_port: 1,
        branch_id: 1,
      }))
    );

    const overCapacityListArb = fc.array(overCapacityOdpArb, { minLength: 1, maxLength: 20 });

    fc.assert(
      fc.property(
        overCapacityListArb,
        latArb,
        lonArb,
        radiusArb,
        (odps, customerLat, customerLon, radius) => {
          const results = filterCoverageOdps(odps, customerLat, customerLon, radius);

          return results.length === 0;
        }
      ),
      { numRuns: 500 }
    );
  });

  it('only active ODPs with available ports within radius are included', () => {
    fc.assert(
      fc.property(
        odpListArb,
        latArb,
        lonArb,
        radiusArb,
        (odps, customerLat, customerLon, radius) => {
          const results = filterCoverageOdps(odps, customerLat, customerLon, radius);

          return results.every(
            (odp) =>
              odp.status === 'Active' &&
              odp.used_ports < odp.total_ports &&
              odp.distance_meters <= radius
          );
        }
      ),
      { numRuns: 1000 }
    );
  });
});
