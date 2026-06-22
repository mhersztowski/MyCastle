import type { TravelMode, RoutePoint } from './types'

// ── travel mode metadata ───────────────────────────────────────────────────────

export interface TravelModeMeta {
  key: TravelMode
  label: string
  color: string
  /** OSRM profile, or null when no road routing applies (drawn as a straight line). */
  osrmProfile: string | null
  /** Material icon name (resolved by the UI). */
  icon: string
}

export const TRAVEL_MODES: Record<TravelMode, TravelModeMeta> = {
  foot:  { key: 'foot',  label: 'Walk',   color: '#66bb6a', osrmProfile: 'foot',    icon: 'DirectionsWalk' },
  bike:  { key: 'bike',  label: 'Bike',   color: '#26c6da', osrmProfile: 'bike',    icon: 'DirectionsBike' },
  car:   { key: 'car',   label: 'Car',    color: '#42a5f5', osrmProfile: 'driving', icon: 'DirectionsCar' },
  train: { key: 'train', label: 'Train',  color: '#ab47bc', osrmProfile: null,      icon: 'Train' },
  bus:   { key: 'bus',   label: 'Bus',    color: '#ffa726', osrmProfile: null,      icon: 'DirectionsBus' },
  plane: { key: 'plane', label: 'Flight', color: '#ef5350', osrmProfile: null,      icon: 'Flight' },
}

export const TRAVEL_MODE_LIST: TravelModeMeta[] = Object.values(TRAVEL_MODES)

// Public OSRM demo server. Override via setOsrmBaseUrl() if you host your own.
let osrmBaseUrl = 'https://router.project-osrm.org'
export function setOsrmBaseUrl(url: string): void { osrmBaseUrl = url.replace(/\/$/, '') }

// ── geometry helpers ────────────────────────────────────────────────────────────

function haversineM(a: RoutePoint, b: RoutePoint): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// ── routing ─────────────────────────────────────────────────────────────────────

export interface RouteResult {
  positions: [number, number][]
  distanceM: number
  /** undefined when only a straight-line estimate is available. */
  durationS?: number
  /** true when routing was unavailable and a straight line was used. */
  straight: boolean
}

/**
 * Resolve a route between two points for the given travel mode.
 * Road modes try OSRM; on any failure (or for non-road modes like train/plane)
 * a straight geodesic line is returned so the route is always usable.
 */
export async function fetchRoute(mode: TravelMode, from: RoutePoint, to: RoutePoint): Promise<RouteResult> {
  const profile = TRAVEL_MODES[mode].osrmProfile
  if (profile) {
    try {
      const url =
        `${osrmBaseUrl}/route/v1/${profile}/${from.lng},${from.lat};${to.lng},${to.lat}` +
        `?overview=full&geometries=geojson`
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
      if (res.ok) {
        const json = await res.json()
        const route = json?.routes?.[0]
        const coords = route?.geometry?.coordinates as [number, number][] | undefined
        if (coords?.length) {
          return {
            positions: coords.map(([lng, lat]) => [lat, lng] as [number, number]),
            distanceM: route.distance,
            durationS: route.duration,
            straight: false,
          }
        }
      }
    } catch {
      // fall through to straight line
    }
  }
  return {
    positions: [[from.lat, from.lng], [to.lat, to.lng]],
    distanceM: haversineM(from, to),
    durationS: undefined,
    straight: true,
  }
}

// ── formatting ──────────────────────────────────────────────────────────────────

export function formatDistance(m: number | undefined): string {
  if (m == null) return '—'
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`
}

export function formatDuration(s: number | undefined): string {
  if (s == null) return '—'
  const mins = Math.round(s / 60)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h} h ${m} min` : `${h} h`
}
