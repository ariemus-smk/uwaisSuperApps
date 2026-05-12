/**
 * GPS distance calculation using the Haversine formula.
 * Used for coverage check to determine if a customer location is within range of an ODP.
 */

/**
 * Earth's mean radius in meters.
 */
const EARTH_RADIUS_METERS = 6371000;

/**
 * Convert degrees to radians.
 * @param {number} degrees - Angle in degrees
 * @returns {number} Angle in radians
 */
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate the distance between two GPS coordinates using the Haversine formula.
 * @param {number} lat1 - Latitude of the first point (in degrees)
 * @param {number} lon1 - Longitude of the first point (in degrees)
 * @param {number} lat2 - Latitude of the second point (in degrees)
 * @param {number} lon2 - Longitude of the second point (in degrees)
 * @returns {number} Distance between the two points in meters
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

module.exports = {
  calculateDistance,
  EARTH_RADIUS_METERS,
};
