import type { MapNode } from './types'

/**
 * Export MapNode[] to GeoJSON / GPX. MapNode uses [lat, lng]; GeoJSON needs
 * [lng, lat] (swapped here). Groups are flattened into their child features.
 */

// ─── selection pruning ───────────────────────────────────────────────────────

/** Keep only selected leaf geometries. A group is kept (with its selected
 *  descendants) whenever at least one descendant is selected — so unchecking a
 *  single child inside a group still exports the rest. */
export function filterSelected(nodes: MapNode[], sel: Set<string>): MapNode[] {
  const out: MapNode[] = []
  for (const n of nodes) {
    if (n.type === 'group') {
      const kids = filterSelected(n.children ?? [], sel)
      if (kids.length) out.push({ ...n, children: kids })
    } else if (sel.has(n.id)) {
      out.push(n)
    }
  }
  return out
}

/** Number of exportable geometries in a (possibly nested) node list. */
export function countGeometries(nodes: MapNode[]): number {
  let n = 0
  for (const node of nodes) {
    if (node.type === 'group') n += countGeometries(node.children ?? [])
    else if (node.type === 'marker' || node.type === 'circle') { if (node.lat != null) n++ }
    else if (node.positions?.length) n++
  }
  return n
}

// ─── GeoJSON ─────────────────────────────────────────────────────────────────

const toLngLat = (p: [number, number]): [number, number] => [p[1], p[0]]

interface GjFeature { type: 'Feature'; properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }

function nodeToFeatures(n: MapNode): GjFeature[] {
  const props: Record<string, unknown> = { name: n.name }
  if (n.popup) props.description = n.popup
  if (n.color) props['marker-color'] = n.color
  switch (n.type) {
    case 'marker':
      return n.lat != null && n.lng != null ? [{ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [n.lng, n.lat] } }] : []
    case 'circle':
      return n.lat != null && n.lng != null ? [{ type: 'Feature', properties: { ...props, radius: n.radius }, geometry: { type: 'Point', coordinates: [n.lng, n.lat] } }] : []
    case 'polyline':
    case 'route':
      return n.positions?.length ? [{ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: n.positions.map(toLngLat) } }] : []
    case 'polygon': {
      if (!n.positions?.length) return []
      const ring = n.positions.map(toLngLat)
      const first = ring[0], last = ring[ring.length - 1]
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first) // close ring
      return [{ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [ring] } }]
    }
    case 'group':
      return (n.children ?? []).flatMap(nodeToFeatures)
    default:
      return []
  }
}

export function nodesToGeoJSON(nodes: MapNode[]): string {
  return JSON.stringify({ type: 'FeatureCollection', features: nodes.flatMap(nodeToFeatures) }, null, 2)
}

// ─── GPX ─────────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function collectGpx(n: MapNode, out: { wpts: string[]; trks: string[] }): void {
  switch (n.type) {
    case 'marker':
    case 'circle':
      if (n.lat != null && n.lng != null) {
        out.wpts.push(`  <wpt lat="${n.lat}" lon="${n.lng}"><name>${esc(n.name)}</name>${n.popup ? `<desc>${esc(n.popup)}</desc>` : ''}</wpt>`)
      }
      break
    case 'polyline':
    case 'route':
    case 'polygon':
      if (n.positions?.length) {
        const pts = n.positions.map(([lat, lng]) => `      <trkpt lat="${lat}" lon="${lng}"/>`).join('\n')
        out.trks.push(`  <trk><name>${esc(n.name)}</name><trkseg>\n${pts}\n    </trkseg></trk>`)
      }
      break
    case 'group':
      (n.children ?? []).forEach((c) => collectGpx(c, out))
      break
  }
}

export function nodesToGPX(nodes: MapNode[]): string {
  const out = { wpts: [] as string[], trks: [] as string[] }
  nodes.forEach((n) => collectGpx(n, out))
  const body = [...out.wpts, ...out.trks].filter(Boolean).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MyCastle CAD" xmlns="http://www.topografix.com/GPX/1/1">
${body}
</gpx>`
}
