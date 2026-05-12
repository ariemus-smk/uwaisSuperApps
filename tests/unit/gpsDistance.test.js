const { calculateDistance, EARTH_RADIUS_METERS } = require('../../src/utils/gpsDistance');

describe('GPS Distance Calculator (Haversine)', () => {
  describe('calculateDistance', () => {
    it('should return 0 for identical coordinates', () => {
      const distance = calculateDistance(-6.2, 106.8, -6.2, 106.8);
      expect(distance).toBe(0);
    });

    it('should calculate distance between two known points', () => {
      // Jakarta to Bandung (straight-line ~116 km via Haversine)
      const distance = calculateDistance(-6.2088, 106.8456, -6.9175, 107.6191);
      expect(distance).toBeGreaterThan(110000);
      expect(distance).toBeLessThan(120000);
    });

    it('should return distance in meters', () => {
      // Two points approximately 1 km apart
      // 1 degree latitude ≈ 111 km, so 0.001 degree ≈ 111 meters
      const distance = calculateDistance(0, 0, 0.001, 0);
      expect(distance).toBeGreaterThan(100);
      expect(distance).toBeLessThan(120);
    });

    it('should handle short distances (within ODP coverage range)', () => {
      // Two points ~300 meters apart in a typical Indonesian city
      const lat1 = -6.200000;
      const lon1 = 106.800000;
      const lat2 = -6.202700; // ~300m south
      const lon2 = 106.800000;
      const distance = calculateDistance(lat1, lon1, lat2, lon2);
      expect(distance).toBeGreaterThan(290);
      expect(distance).toBeLessThan(310);
    });

    it('should be symmetric (distance A->B equals B->A)', () => {
      const distAB = calculateDistance(-6.2, 106.8, -6.9, 107.6);
      const distBA = calculateDistance(-6.9, 107.6, -6.2, 106.8);
      expect(distAB).toBeCloseTo(distBA, 10);
    });

    it('should handle equator crossing', () => {
      const distance = calculateDistance(-1, 100, 1, 100);
      // 2 degrees latitude ≈ 222 km
      expect(distance).toBeGreaterThan(220000);
      expect(distance).toBeLessThan(224000);
    });

    it('should handle negative longitudes', () => {
      const distance = calculateDistance(0, -1, 0, 1);
      expect(distance).toBeGreaterThan(0);
    });

    it('should handle poles', () => {
      // North pole to equator = ~10,000 km (quarter of circumference)
      const distance = calculateDistance(90, 0, 0, 0);
      expect(distance).toBeGreaterThan(9900000);
      expect(distance).toBeLessThan(10100000);
    });
  });

  describe('EARTH_RADIUS_METERS', () => {
    it('should be approximately 6,371,000 meters', () => {
      expect(EARTH_RADIUS_METERS).toBe(6371000);
    });
  });
});
