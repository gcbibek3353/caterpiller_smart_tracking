/** Geo helpers. Shared by the seed, the simulator and the geofence detectors. */

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export const haversineMeters = (
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number => {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
};

export const haversineKm = (aLat: number, aLng: number, bLat: number, bLng: number): number =>
  haversineMeters(aLat, aLng, bLat, bLng) / 1000;

/** Metres → degrees. Longitude degrees shrink with latitude, so correct for it. */
export const metersToDegLat = (m: number) => m / 111_320;
export const metersToDegLng = (m: number, atLat: number) =>
  m / (111_320 * Math.max(0.01, Math.cos(toRad(atLat))));

/** Is a point inside a circular geofence? */
export const isInsideGeofence = (
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number,
  radiusMeters: number,
): boolean => haversineMeters(lat, lng, centerLat, centerLng) <= radiusMeters;
