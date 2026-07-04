import type { MapNode } from './types'

/**
 * Parse GPX / GeoJSON text into MapNode[] ready for the map hierarchy.
 * GeoJSON coordinates are [lng, lat]; MapNode uses [lat, lng] — swapped here.
 */

let seq = 0
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`

const LINE_COLOR = '#4fc3f7'

// ─── GeoJSON ─────────────────────────────────────────────────────────────────

interface GjGeometry {
  type: string
  coordinates?: unknown
  geometries?: GjGeometry[]
}
interface GjFeature { type: 'Feature'; geometry: GjGeometry | null; properties?: Record<string, unknown> | null }

/** [lng, lat] → [lat, lng] */
const toLatLng = (c: number[]): [number, number] => [c[1], c[0]]
const ring = (coords: number[][]): [number, number][] => coords.map(toLatLng)

/** Human-readable name + popup from a feature's properties. */
function nameAndPopup(props: Record<string, unknown> | null | undefined, fallback: string): { name: string; popup?: string } {
  if (!props) return { name: fallback }
  const name = (props.name ?? props.title ?? props.Name ?? fallback) as string
  const lines = Object.entries(props)
    .filter(([, v]) => v != null && typeof v !== 'object')
    .map(([k, v]) => `${k}: ${v}`)
  return { name: String(name), popup: lines.length ? lines.join('\n') : undefined }
}

function geometryToNodes(geom: GjGeometry | null, meta: { name: string; popup?: string }): MapNode[] {
  if (!geom) return []
  const base = { visible: true, color: LINE_COLOR, weight: 2, fillOpacity: 0.25, popup: meta.popup }
  switch (geom.type) {
    case 'Point':
      return [{ id: uid('geo-pt'), name: meta.name, type: 'marker', visible: true, lat: (geom.coordinates as number[])[1], lng: (geom.coordinates as number[])[0], popup: meta.popup }]
    case 'MultiPoint':
      return (geom.coordinates as number[][]).map((c) => ({ id: uid('geo-pt'), name: meta.name, type: 'marker', visible: true, lat: c[1], lng: c[0], popup: meta.popup }))
    case 'LineString':
      return [{ id: uid('geo-ln'), name: meta.name, type: 'polyline', positions: ring(geom.coordinates as number[][]), ...base }]
    case 'MultiLineString':
      return (geom.coordinates as number[][][]).map((line) => ({ id: uid('geo-ln'), name: meta.name, type: 'polyline', positions: ring(line), ...base }))
    case 'Polygon':
      // Outer ring only (first ring); holes are dropped.
      return [{ id: uid('geo-pg'), name: meta.name, type: 'polygon', positions: ring((geom.coordinates as number[][][])[0]), ...base }]
    case 'MultiPolygon':
      return (geom.coordinates as number[][][][]).map((poly) => ({ id: uid('geo-pg'), name: meta.name, type: 'polygon', positions: ring(poly[0]), ...base }))
    case 'GeometryCollection': {
      const children = (geom.geometries ?? []).flatMap((g) => geometryToNodes(g, meta))
      return children.length ? [{ id: uid('geo-grp'), name: meta.name, type: 'group', visible: true, children }] : []
    }
    default:
      return []
  }
}

function parseGeoJson(text: string): MapNode[] {
  const data = JSON.parse(text) as { type?: string; features?: GjFeature[]; geometry?: GjGeometry | null; properties?: Record<string, unknown> | null; coordinates?: unknown; geometries?: GjGeometry[] }
  const out: MapNode[] = []
  if (data.type === 'FeatureCollection') {
    (data.features ?? []).forEach((f, i) => {
      const meta = nameAndPopup(f.properties, `Feature ${i + 1}`)
      const nodes = geometryToNodes(f.geometry, meta)
      // Wrap multi-geometry features so their name stays attached.
      if (nodes.length > 1) out.push({ id: uid('geo-grp'), name: meta.name, type: 'group', visible: true, children: nodes })
      else out.push(...nodes)
    })
  } else if (data.type === 'Feature') {
    const meta = nameAndPopup(data.properties, 'Feature')
    out.push(...geometryToNodes(data.geometry ?? null, meta))
  } else if (data.type) {
    // A bare geometry object.
    out.push(...geometryToNodes(data as GjGeometry, { name: data.type }))
  }
  return out
}

// ─── GPX ─────────────────────────────────────────────────────────────────────

function ptList(parent: Element, tag: string): [number, number][] {
  return Array.from(parent.getElementsByTagName(tag))
    .map((el) => [parseFloat(el.getAttribute('lat') || ''), parseFloat(el.getAttribute('lon') || '')] as [number, number])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
}
const childText = (el: Element, tag: string): string => el.getElementsByTagName(tag)[0]?.textContent?.trim() || ''

function parseGpx(text: string): MapNode[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Niepoprawny plik GPX (błąd XML).')
  const out: MapNode[] = []

  // Waypoints → markers
  Array.from(doc.getElementsByTagName('wpt')).forEach((w, i) => {
    const lat = parseFloat(w.getAttribute('lat') || ''), lng = parseFloat(w.getAttribute('lon') || '')
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    out.push({ id: uid('gpx-wpt'), name: childText(w, 'name') || `Waypoint ${i + 1}`, type: 'marker', visible: true, lat, lng, popup: childText(w, 'desc') || undefined })
  })

  // Tracks → polyline (all segments concatenated)
  Array.from(doc.getElementsByTagName('trk')).forEach((trk, i) => {
    const positions = ptList(trk, 'trkpt')
    if (positions.length < 2) return
    out.push({ id: uid('gpx-trk'), name: childText(trk, 'name') || `Track ${i + 1}`, type: 'polyline', visible: true, positions, color: LINE_COLOR, weight: 3 })
  })

  // Routes → polyline
  Array.from(doc.getElementsByTagName('rte')).forEach((rte, i) => {
    const positions = ptList(rte, 'rtept')
    if (positions.length < 2) return
    out.push({ id: uid('gpx-rte'), name: childText(rte, 'name') || `Route ${i + 1}`, type: 'polyline', visible: true, positions, color: '#ffb74d', weight: 3 })
  })

  return out
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/** Parse a GPX or GeoJSON file (detected by extension, then by content). */
export function parseGeoFile(text: string, filename: string): MapNode[] {
  const lower = filename.toLowerCase()
  const looksGpx = lower.endsWith('.gpx') || /<gpx[\s>]/i.test(text.slice(0, 500))
  const nodes = looksGpx ? parseGpx(text) : parseGeoJson(text)
  if (!nodes.length) throw new Error('Nie znaleziono geometrii do zaimportowania.')
  return nodes
}
