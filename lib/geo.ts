/**
 * Geographic utilities — Haversine formula and formatting helpers.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Returns the distance in miles between two lat/lng coordinates
 * using the Haversine formula.
 */
export function distanceMiles(a: LatLng, b: LatLng): number {
  const R      = 3_958.8; // Earth radius in miles
  const dLat   = toRad(b.lat - a.lat);
  const dLng   = toRad(b.lng - a.lng);
  const sinDLt = Math.sin(dLat / 2);
  const sinDLn = Math.sin(dLng / 2);
  const h =
    sinDLt * sinDLt +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLn * sinDLn;
  return R * 2 * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Formats a distance in miles to a human-readable string. */
export function formatDistance(miles: number): string {
  if (miles < 0.1) return "< 0.1 mi";
  if (miles < 10)  return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}
