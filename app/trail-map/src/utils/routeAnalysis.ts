import * as turf from '@turf/turf';
import type { RouteStats, TrailRoute } from '../types';

/** Compute summary statistics for a route from its coordinate array. */
export function computeRouteStats(
  coords: [number, number, number][],
  timestamps?: number[],
): RouteStats {
  if (coords.length < 2) {
    return {
      totalDistance: 0,
      elevationGain: 0,
      elevationLoss: 0,
      maxElevation: 0,
      minElevation: 0,
      avgElevation: 0,
      pointCount: coords.length,
    };
  }

  const line = turf.lineString(coords.map((c) => [c[0], c[1]]));
  const totalDistance = turf.length(line, { units: 'kilometers' });

  let elevationGain = 0;
  let elevationLoss = 0;
  let elevSum = 0;
  let maxElevation = -Infinity;
  let minElevation = Infinity;

  for (let i = 0; i < coords.length; i++) {
    const ele = coords[i][2];
    elevSum += ele;
    if (ele > maxElevation) maxElevation = ele;
    if (ele < minElevation) minElevation = ele;
    if (i > 0) {
      const diff = ele - coords[i - 1][2];
      if (diff > 0) elevationGain += diff;
      else elevationLoss += Math.abs(diff);
    }
  }

  const duration =
    timestamps && timestamps.length >= 2
      ? timestamps[timestamps.length - 1] - timestamps[0]
      : undefined;

  return {
    totalDistance,
    elevationGain: Math.round(elevationGain),
    elevationLoss: Math.round(elevationLoss),
    maxElevation: Math.round(maxElevation),
    minElevation: Math.round(minElevation),
    avgElevation: Math.round(elevSum / coords.length),
    pointCount: coords.length,
    duration,
  };
}

/**
 * Compute cumulative distances (km) from the start for each coordinate.
 * Returns an array of the same length as coords.
 */
export function cumulativeDistances(coords: [number, number, number][]): number[] {
  const result: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    const from = turf.point([coords[i - 1][0], coords[i - 1][1]]);
    const to = turf.point([coords[i][0], coords[i][1]]);
    result.push(result[i - 1] + turf.distance(from, to, { units: 'kilometers' }));
  }
  return result;
}

/**
 * Compute slope (%) for each segment between consecutive coordinates.
 * Returns an array of length coords.length - 1.
 */
export function segmentSlopes(coords: [number, number, number][]): number[] {
  const slopes: number[] = [];
  for (let i = 1; i < coords.length; i++) {
    const from = turf.point([coords[i - 1][0], coords[i - 1][1]]);
    const to = turf.point([coords[i][0], coords[i][1]]);
    const horizDist = turf.distance(from, to, { units: 'meters' });
    const vertDiff = coords[i][2] - coords[i - 1][2];
    slopes.push(horizDist > 0 ? (vertDiff / horizDist) * 100 : 0);
  }
  return slopes;
}

/**
 * Get the geographic center and a reasonable zoom level for a route bounding box.
 */
export function routeBounds(
  coords: [number, number, number][],
): { center: [number, number]; bbox: [number, number, number, number] } {
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  return {
    center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
    bbox: [minLng, minLat, maxLng, maxLat],
  };
}

/**
 * Build a route segment list suitable for PathLayer — each segment is a pair of
 * consecutive coordinates together with a numeric value (elevation or slope)
 * used for color encoding.
 */
export interface RouteSegment {
  path: [[number, number, number], [number, number, number]];
  /** Elevation midpoint (m) */
  elevation: number;
  /** Slope (%) — positive = uphill */
  slope: number;
  /** Cumulative km at start of segment */
  distKm: number;
  /** Index of the first coordinate */
  index: number;
}

export function buildRouteSegments(route: TrailRoute): RouteSegment[] {
  const coords = route.coordinates;
  const cumDist = cumulativeDistances(coords);
  const slopes = segmentSlopes(coords);
  const segments: RouteSegment[] = [];

  for (let i = 0; i < coords.length - 1; i++) {
    segments.push({
      path: [coords[i], coords[i + 1]],
      elevation: (coords[i][2] + coords[i + 1][2]) / 2,
      slope: slopes[i],
      distKm: cumDist[i],
      index: i,
    });
  }
  return segments;
}

/** Find the closest coordinate index to a given distance (km). */
export function closestIndexByDistance(cumDist: number[], targetKm: number): number {
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < cumDist.length; i++) {
    const diff = Math.abs(cumDist[i] - targetKm);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}
