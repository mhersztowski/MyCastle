import { useState, useCallback, useRef, useMemo, useEffect, type MutableRefObject } from 'react'
import Dialog from '@mui/material/Dialog'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Checkbox from '@mui/material/Checkbox'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Divider from '@mui/material/Divider'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Tooltip from '@mui/material/Tooltip'
import CloseIcon from '@mui/icons-material/Close'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import DownloadIcon from '@mui/icons-material/Download'
import PlaceIcon from '@mui/icons-material/Place'
import TimelineIcon from '@mui/icons-material/Timeline'
import CropSquareIcon from '@mui/icons-material/CropSquare'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import SelectAllIcon from '@mui/icons-material/SelectAll'
import DeselectIcon from '@mui/icons-material/Deselect'
import L from 'leaflet'
import { MapContainer, TileLayer, CircleMarker, Polyline, Polygon, useMap } from 'react-leaflet'
import type { OsmElement, OsmNode, OsmWay, OsmRelation } from '../map/overpassTypes'
import type { MapNode } from '../map/types'

// ── Query templates ───────────────────────────────────────────────────────────

interface TemplateItem { label: string; query: string }
interface TemplateGroup { group: string; items: TemplateItem[] }

const TEMPLATE_GROUPS: TemplateGroup[] = [
  {
    group: 'Terrain',
    items: [
      { label: 'Peaks',      query: `[out:json][timeout:25];\n(\n  node["natural"="peak"]({{bbox}});\n  node["natural"="volcano"]({{bbox}});\n);\nout geom;` },
      { label: 'Saddles',    query: `[out:json][timeout:25];\n(\n  node["natural"="saddle"]({{bbox}});\n  node["natural"="col"]({{bbox}});\n);\nout geom;` },
      { label: 'Caves',      query: `[out:json][timeout:25];\n(\n  node["natural"="cave_entrance"]({{bbox}});\n);\nout geom;` },
      { label: 'Waterfalls', query: `[out:json][timeout:25];\n(\n  node["waterway"="waterfall"]({{bbox}});\n  way["waterway"="waterfall"]({{bbox}});\n);\nout geom;` },
      { label: 'Springs',    query: `[out:json][timeout:25];\n(\n  node["natural"="spring"]({{bbox}});\n  node["natural"="hot_spring"]({{bbox}});\n);\nout geom;` },
      { label: 'Beaches',    query: `[out:json][timeout:25];\n(\n  node["natural"="beach"]({{bbox}});\n  way["natural"="beach"]({{bbox}});\n);\nout geom;` },
      { label: 'Cliffs',     query: `[out:json][timeout:25];\n(\n  way["natural"="cliff"]({{bbox}});\n);\nout geom;` },
      { label: 'Rocks',      query: `[out:json][timeout:25];\n(\n  node["natural"~"rock|stone|boulder"]({{bbox}});\n  way["natural"="rock"]({{bbox}});\n);\nout geom;` },
    ],
  },
  {
    group: 'Protected',
    items: [
      { label: 'Nat. Parks', query: `[out:json][timeout:60];\n(\n  relation["boundary"="national_park"]({{bbox}});\n  relation["boundary"="protected_area"]["protect_class"~"^[12]$"]({{bbox}});\n);\nout geom;` },
      { label: 'Reserves',   query: `[out:json][timeout:60];\n(\n  relation["leisure"="nature_reserve"]({{bbox}});\n  way["leisure"="nature_reserve"]({{bbox}});\n);\nout geom;` },
    ],
  },
  {
    group: 'Outdoor',
    items: [
      { label: 'Viewpoints',  query: `[out:json][timeout:25];\n(\n  node["tourism"="viewpoint"]({{bbox}});\n);\nout geom;` },
      { label: 'Campsites',   query: `[out:json][timeout:25];\n(\n  node["tourism"="camp_site"]({{bbox}});\n  way["tourism"="camp_site"]({{bbox}});\n);\nout geom;` },
      { label: 'Alpine Huts', query: `[out:json][timeout:25];\n(\n  node["tourism"~"alpine_hut|wilderness_hut|shelter"]({{bbox}});\n  way["tourism"~"alpine_hut|wilderness_hut"]({{bbox}});\n);\nout geom;` },
      { label: 'Picnic',      query: `[out:json][timeout:25];\n(\n  node["tourism"="picnic_site"]({{bbox}});\n  node["leisure"="picnic_table"]({{bbox}});\n);\nout geom;` },
      { label: 'Historic',    query: `[out:json][timeout:25];\n(\n  node["historic"]({{bbox}});\n  way["historic"]({{bbox}});\n);\nout geom;` },
      { label: 'Attractions', query: `[out:json][timeout:25];\n(\n  node["tourism"~"attraction|artwork|gallery"]({{bbox}});\n  way["tourism"~"attraction|artwork|gallery"]({{bbox}});\n);\nout geom;` },
      { label: 'Museums',     query: `[out:json][timeout:25];\n(\n  node["tourism"="museum"]({{bbox}});\n  way["tourism"="museum"]({{bbox}});\n);\nout geom;` },
      { label: 'Info Points', query: `[out:json][timeout:25];\n(\n  node["tourism"="information"]({{bbox}});\n);\nout geom;` },
    ],
  },
  {
    group: 'Food & Drink',
    items: [
      { label: 'Restaurants', query: `[out:json][timeout:25];\n(\n  node["amenity"="restaurant"]({{bbox}});\n  way["amenity"="restaurant"]({{bbox}});\n);\nout geom;` },
      { label: 'Cafes',       query: `[out:json][timeout:25];\n(\n  node["amenity"="cafe"]({{bbox}});\n  way["amenity"="cafe"]({{bbox}});\n);\nout geom;` },
      { label: 'Bars & Pubs', query: `[out:json][timeout:25];\n(\n  node["amenity"~"bar|pub|biergarten"]({{bbox}});\n  way["amenity"~"bar|pub"]({{bbox}});\n);\nout geom;` },
      { label: 'Fast Food',   query: `[out:json][timeout:25];\n(\n  node["amenity"="fast_food"]({{bbox}});\n);\nout geom;` },
    ],
  },
  {
    group: 'Stay & Services',
    items: [
      { label: 'Hotels',     query: `[out:json][timeout:25];\n(\n  node["tourism"~"hotel|motel|hostel|guest_house|apartment"]({{bbox}});\n  way["tourism"~"hotel|motel|hostel|guest_house"]({{bbox}});\n);\nout geom;` },
      { label: 'Hospitals',  query: `[out:json][timeout:25];\n(\n  node["amenity"~"hospital|clinic|doctors"]({{bbox}});\n  way["amenity"~"hospital|clinic"]({{bbox}});\n);\nout geom;` },
      { label: 'Pharmacies', query: `[out:json][timeout:25];\n(\n  node["amenity"="pharmacy"]({{bbox}});\n);\nout geom;` },
      { label: 'Banks/ATMs', query: `[out:json][timeout:25];\n(\n  node["amenity"~"bank|atm"]({{bbox}});\n);\nout geom;` },
      { label: 'Shops',      query: `[out:json][timeout:25];\n(\n  node["shop"~"supermarket|convenience|bakery|butcher|greengrocer"]({{bbox}});\n  way["shop"="supermarket"]({{bbox}});\n);\nout geom;` },
    ],
  },
  {
    group: 'Transport',
    items: [
      { label: 'Parking',     query: `[out:json][timeout:25];\n(\n  node["amenity"="parking"]({{bbox}});\n  way["amenity"="parking"]({{bbox}});\n);\nout geom;` },
      { label: 'Bus Stops',   query: `[out:json][timeout:25];\n(\n  node["highway"="bus_stop"]({{bbox}});\n  node["public_transport"="stop_position"]["bus"="yes"]({{bbox}});\n);\nout geom;` },
      { label: 'Stations',    query: `[out:json][timeout:25];\n(\n  node["railway"~"station|halt"]({{bbox}});\n  node["public_transport"="station"]({{bbox}});\n);\nout geom;` },
      { label: 'Fuel',        query: `[out:json][timeout:25];\n(\n  node["amenity"="fuel"]({{bbox}});\n);\nout geom;` },
      { label: 'EV Charging', query: `[out:json][timeout:25];\n(\n  node["amenity"="charging_station"]({{bbox}});\n);\nout geom;` },
    ],
  },
  {
    group: 'Infrastructure',
    items: [
      { label: 'Roads',     query: `[out:json][timeout:25];\n(\n  way["highway"~"primary|secondary|tertiary|residential"]({{bbox}});\n);\nout geom;` },
      { label: 'Buildings', query: `[out:json][timeout:25];\n(\n  way["building"]({{bbox}});\n);\nout geom;` },
      { label: 'Parks',     query: `[out:json][timeout:25];\n(\n  way["leisure"="park"]({{bbox}});\n  relation["leisure"="park"]({{bbox}});\n);\nout geom;` },
      { label: 'Water',     query: `[out:json][timeout:25];\n(\n  way["natural"="water"]({{bbox}});\n  way["waterway"~"river|stream|canal"]({{bbox}});\n  relation["natural"="water"]({{bbox}});\n);\nout geom;` },
      { label: 'Barriers',  query: `[out:json][timeout:25];\n(\n  node["barrier"]({{bbox}});\n  way["barrier"]({{bbox}});\n);\nout geom;` },
    ],
  },
  {
    group: 'Routes',
    items: [
      { label: 'Hiking',     query: `[out:json][timeout:60];\n(\n  relation["route"="hiking"]({{bbox}});\n  relation["route"="foot"]({{bbox}});\n);\nout geom;` },
      { label: 'Cycling',    query: `[out:json][timeout:60];\n(\n  relation["route"="bicycle"]({{bbox}});\n  relation["route"="mtb"]({{bbox}});\n);\nout geom;` },
      { label: 'Horse',      query: `[out:json][timeout:60];\n(\n  relation["route"="horse"]({{bbox}});\n);\nout geom;` },
      { label: 'Ski Routes', query: `[out:json][timeout:60];\n(\n  relation["route"~"ski|piste"]({{bbox}});\n);\nout geom;` },
    ],
  },
  {
    group: 'Sports',
    items: [
      { label: 'Climbing',    query: `[out:json][timeout:25];\n(\n  node["sport"="climbing"]({{bbox}});\n  way["sport"="climbing"]({{bbox}});\n  node["natural"~"rock|cliff"]["sport"="climbing"]({{bbox}});\n);\nout geom;` },
      { label: 'Ski Slopes',  query: `[out:json][timeout:25];\n(\n  way["piste:type"]({{bbox}});\n  way["aerialway"]({{bbox}});\n);\nout geom;` },
      { label: 'Sports',      query: `[out:json][timeout:25];\n(\n  node["leisure"~"sports_centre|stadium|pitch|swimming_pool"]({{bbox}});\n  way["leisure"~"sports_centre|stadium|pitch|swimming_pool"]({{bbox}});\n);\nout geom;` },
    ],
  },
]

const DEFAULT_QUERY = `[out:json][timeout:25];
(
  node["amenity"]({{bbox}});
  way["amenity"]({{bbox}});
);
out geom;`

const DEFAULT_ENDPOINT = 'https://overpass-api.de/api/interpreter'

// ── Helpers ───────────────────────────────────────────────────────────────────

function isClosedWay(way: OsmWay): boolean {
  if (way.nodes && way.nodes.length >= 3) {
    return way.nodes[0] === way.nodes[way.nodes.length - 1]
  }
  const geo = way.geometry
  if (!geo || geo.length < 3) return false
  return (
    Math.abs(geo[0].lat - geo[geo.length - 1].lat) < 1e-7 &&
    Math.abs(geo[0].lon - geo[geo.length - 1].lon) < 1e-7
  )
}

function getElementLabel(el: OsmElement): string {
  const tags = el.tags ?? {}
  const name = tags.name
  const category =
    tags.amenity ?? tags.highway ?? tags.building ?? tags.leisure ??
    tags.landuse ?? tags.natural ?? tags.historic ?? tags.shop ?? tags.tourism ?? ''
  if (name && category) return `${name} · ${category}`
  if (name) return name
  if (category) return `${el.type} #${el.id} · ${category}`
  return `${el.type} #${el.id}`
}

function osmToMapNode(el: OsmElement): MapNode | null {
  if (el.type === 'node') {
    const n = el as OsmNode
    const tagStr = Object.entries(n.tags ?? {})
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')
    return {
      id: `osm-node-${n.id}`,
      name: n.tags?.name ?? `Node #${n.id}`,
      type: 'marker',
      visible: true,
      lat: n.lat,
      lng: n.lon,
      popup: tagStr || undefined,
    }
  }
  if (el.type === 'way') {
    const w = el as OsmWay
    if (!w.geometry?.length) return null
    const positions: [number, number][] = w.geometry.map(p => [p.lat, p.lon])
    const closed = isClosedWay(w)
    return {
      id: `osm-way-${w.id}`,
      name: w.tags?.name ?? `Way #${w.id}`,
      type: closed ? 'polygon' : 'polyline',
      visible: true,
      positions,
      color: '#4fc3f7',
      fillOpacity: 0.25,
      weight: 2,
    }
  }
  if (el.type === 'relation') {
    const r = el as OsmRelation
    const trailColor = getTrailColor(r.tags) ?? '#ce93d8'
    const children: MapNode[] = []
    for (const m of r.members ?? []) {
      if (!m.geometry?.length) continue
      const positions: [number, number][] = m.geometry.map(p => [p.lat, p.lon])
      if (m.type === 'node') {
        children.push({
          id: `osm-rel-${r.id}-node-${m.ref}`,
          name: m.role ? `${m.role} #${m.ref}` : `Node #${m.ref}`,
          type: 'marker',
          visible: true,
          lat: m.geometry[0].lat,
          lng: m.geometry[0].lon,
        })
      } else if (m.type === 'way') {
        const closed =
          positions.length >= 3 &&
          Math.abs(positions[0][0] - positions[positions.length - 1][0]) < 1e-7 &&
          Math.abs(positions[0][1] - positions[positions.length - 1][1]) < 1e-7
        children.push({
          id: `osm-rel-${r.id}-way-${m.ref}`,
          name: m.role ? `${m.role} #${m.ref}` : `Way #${m.ref}`,
          type: closed ? 'polygon' : 'polyline',
          visible: true,
          positions,
          color: trailColor,
          fillOpacity: 0.25,
          weight: 2,
        })
      }
    }
    if (!children.length) return null
    return {
      id: `osm-relation-${r.id}`,
      name: r.tags?.name ?? `Relation #${r.id}`,
      type: 'group',
      visible: true,
      children,
    }
  }
  return null
}

// ── Trail color helpers ───────────────────────────────────────────────────────

// OSM named colors that map 1:1 to CSS / Leaflet
const OSM_COLOR_NAMES = new Set([
  'red', 'blue', 'green', 'yellow', 'black', 'white',
  'orange', 'violet', 'purple', 'brown', 'gray', 'grey',
])

function resolveOsmColor(raw: string): string {
  const c = raw.trim().toLowerCase()
  // Hex already valid for Leaflet
  if (c.startsWith('#')) return c
  // Named OSM color
  if (OSM_COLOR_NAMES.has(c)) return c === 'white' ? '#e8e8e8' : c
  return '#ce93d8'  // fallback: relation purple
}

/**
 * Extracts trail color from OSM tags.
 * Checks `colour` first, then the waycolor field of `osmc:symbol` (format: waycolor:bg:fg…).
 */
function getTrailColor(tags: Record<string, string> | undefined): string | null {
  if (!tags) return null
  if (tags.colour) return resolveOsmColor(tags.colour)
  if (tags['osmc:symbol']) {
    const wayColor = tags['osmc:symbol'].split(':')[0]
    if (wayColor) return resolveOsmColor(wayColor)
  }
  return null
}

// ── BoundsCapture — must live inside <MapContainer> ───────────────────────────

function BoundsCapture({ boundsRef }: { boundsRef: MutableRefObject<L.LatLngBounds | null> }) {
  const map = useMap()
  useEffect(() => {
    boundsRef.current = map.getBounds()
    const h = () => { boundsRef.current = map.getBounds() }
    map.on('moveend', h)
    map.on('zoomend', h)
    return () => { map.off('moveend', h); map.off('zoomend', h) }
  }, [map, boundsRef])
  return null
}

// ── MapRefCapture — exposes map instance outside MapContainer ─────────────────

function MapRefCapture({ mapRef }: { mapRef: MutableRefObject<L.Map | null> }) {
  const map = useMap()
  useEffect(() => {
    mapRef.current = map
    return () => { mapRef.current = null }
  }, [map, mapRef])
  return null
}

// ── PreviewLayer — renders query results inside the dialog's map ──────────────

const MAX_PREVIEW_NODES = 500
const MAX_PREVIEW_WAYS = 300
const MAX_PREVIEW_RELATIONS = 50

const COLOR_DEFAULT_NODE = '#ef5350'
const COLOR_DEFAULT_WAY = '#4fc3f7'
const COLOR_DEFAULT_RELATION = '#ce93d8'
const COLOR_SELECTED = '#ff9800'
const COLOR_ACTIVE = '#ffeb3b'

interface PreviewLayerProps {
  elements: OsmElement[]
  selected: Set<number>
  activeId: number | null
  onActivate: (el: OsmElement) => void
}

function PreviewLayer({ elements, selected, activeId, onActivate }: PreviewLayerProps) {
  const nodes = useMemo(
    () => elements.filter((e): e is OsmNode => e.type === 'node').slice(0, MAX_PREVIEW_NODES),
    [elements],
  )
  const ways = useMemo(
    () => elements.filter((e): e is OsmWay => e.type === 'way').slice(0, MAX_PREVIEW_WAYS),
    [elements],
  )
  const relations = useMemo(
    () => elements.filter((e): e is OsmRelation => e.type === 'relation').slice(0, MAX_PREVIEW_RELATIONS),
    [elements],
  )

  return (
    <>
      {nodes.map(n => {
        const isSel = selected.has(n.id)
        const isActive = n.id === activeId
        const radius = isActive ? 10 : isSel ? 7 : 4
        const fillColor = isActive ? COLOR_ACTIVE : isSel ? COLOR_SELECTED : COLOR_DEFAULT_NODE
        const strokeColor = isActive ? '#ffffff' : fillColor
        return (
          <CircleMarker
            key={n.id}
            center={[n.lat, n.lon]}
            radius={radius}
            pathOptions={{
              color: strokeColor,
              fillColor,
              fillOpacity: 0.9,
              weight: isActive ? 2.5 : isSel ? 2 : 1,
            }}
            eventHandlers={{ click: () => onActivate(n) }}
          />
        )
      })}
      {ways.map(w => {
        if (!w.geometry?.length) return null
        const positions: [number, number][] = w.geometry.map(p => [p.lat, p.lon])
        const isSel = selected.has(w.id)
        const isActive = w.id === activeId
        const color = isActive ? COLOR_ACTIVE : isSel ? COLOR_SELECTED : COLOR_DEFAULT_WAY
        const weight = isActive ? 4 : isSel ? 3 : 2
        const eventHandlers = { click: () => onActivate(w) }
        return isClosedWay(w)
          ? <Polygon key={w.id} positions={positions} pathOptions={{ color, fillOpacity: isActive ? 0.35 : 0.2, weight }} eventHandlers={eventHandlers} />
          : <Polyline key={w.id} positions={positions} pathOptions={{ color, weight }} eventHandlers={eventHandlers} />
      })}
      {/* Render relation members that carry inline geometry (requires `out geom;`) */}
      {relations.map(r => {
        const isActive = r.id === activeId
        const trailColor = getTrailColor(r.tags) ?? COLOR_DEFAULT_RELATION
        const color = isActive ? COLOR_ACTIVE : trailColor
        const weight = isActive ? 4 : 2
        return (r.members ?? []).map((m, mi) => {
          if (!m.geometry?.length) return null
          const positions: [number, number][] = m.geometry.map(p => [p.lat, p.lon])
          const eventHandlers = { click: () => onActivate(r) }
          const key = `rel-${r.id}-m${mi}`
          if (m.type === 'node') {
            const [lat, lon] = [m.geometry[0].lat, m.geometry[0].lon]
            return (
              <CircleMarker
                key={key}
                center={[lat, lon]}
                radius={isActive ? 8 : 3}
                pathOptions={{
                  color: isActive ? '#ffffff' : color,
                  fillColor: color,
                  fillOpacity: 0.9,
                  weight: isActive ? 2 : 1,
                }}
                eventHandlers={eventHandlers}
              />
            )
          }
          const closed =
            positions.length >= 3 &&
            Math.abs(positions[0][0] - positions[positions.length - 1][0]) < 1e-7 &&
            Math.abs(positions[0][1] - positions[positions.length - 1][1]) < 1e-7
          return closed
            ? <Polygon key={key} positions={positions} pathOptions={{ color, fillOpacity: isActive ? 0.35 : 0.15, weight }} eventHandlers={eventHandlers} />
            : <Polyline key={key} positions={positions} pathOptions={{ color, weight }} eventHandlers={eventHandlers} />
        })
      })}
    </>
  )
}

// ── OverpassDialog ────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'node' | 'way' | 'relation'

interface Props {
  open: boolean
  onClose: () => void
  onImport: (nodes: MapNode[]) => void
  initialCenter?: [number, number]
}

export function OverpassDialog({ open, onClose, onImport, initialCenter = [52.2297, 21.0122] }: Props) {
  const [query, setQuery] = useState(DEFAULT_QUERY)
  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elements, setElements] = useState<OsmElement[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState<FilterTab>('all')
  // activeId: element currently focused (fly-to / highlight) — separate from checkbox selection
  const [activeId, setActiveId] = useState<number | null>(null)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const boundsRef = useRef<L.LatLngBounds | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Stable key so the map doesn't remount on every state change
  const mapKey = useRef(`overpass-map-${Date.now()}`).current

  const counts = useMemo(() => ({
    all: elements.length,
    node: elements.filter(e => e.type === 'node').length,
    way: elements.filter(e => e.type === 'way').length,
    relation: elements.filter(e => e.type === 'relation').length,
  }), [elements])

  const filteredElements = useMemo(() => {
    if (filter === 'all') return elements
    return elements.filter(e => e.type === filter)
  }, [elements, filter])

  const resolveQuery = useCallback(() => {
    const b = boundsRef.current
    if (!b) return query
    const bbox = `${b.getSouth().toFixed(6)},${b.getWest().toFixed(6)},${b.getNorth().toFixed(6)},${b.getEast().toFixed(6)}`
    const center = `${b.getCenter().lat.toFixed(6)},${b.getCenter().lng.toFixed(6)}`
    return query
      .replace(/\{\{bbox\}\}/g, bbox)
      .replace(/\{\{center\}\}/g, center)
  }, [query])

  const handleRun = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)
    setElements([])
    setSelected(new Set())
    setActiveId(null)
    try {
      const resolved = resolveQuery()
      const body = new URLSearchParams({ data: resolved })
      const res = await fetch(endpoint, { method: 'POST', body, signal: ctrl.signal })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`)
      }
      const json = await res.json()
      const els: OsmElement[] = json.elements ?? []
      setElements(els)
      if (els.length === 0) setError('Query returned no elements. Try zooming out or changing the query.')
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [endpoint, resolveQuery])

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
    setLoading(false)
  }, [])

  const toggleSelect = useCallback((id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelected(new Set(
      filteredElements.filter(e => e.type !== 'relation').map(e => e.id)
    ))
  }, [filteredElements])

  const deselectAll = useCallback(() => setSelected(new Set()), [])

  // Fly the preview map to a given element
  const flyToElement = useCallback((el: OsmElement) => {
    const map = mapRef.current
    if (!map) return
    if (el.type === 'node') {
      const n = el as OsmNode
      map.flyTo([n.lat, n.lon], Math.max(map.getZoom(), 17), { animate: true, duration: 0.5 })
    } else if (el.type === 'way') {
      const w = el as OsmWay
      if (!w.geometry?.length) return
      const lls: [number, number][] = w.geometry.map(p => [p.lat, p.lon])
      const bounds = L.latLngBounds(lls)
      if (bounds.isValid()) {
        map.flyToBounds(bounds.pad(0.25), { animate: true, duration: 0.5 })
      }
    } else if (el.type === 'relation') {
      const r = el as OsmRelation
      const allPoints: [number, number][] = []
      for (const m of r.members ?? []) {
        if (m.geometry?.length) {
          for (const p of m.geometry) allPoints.push([p.lat, p.lon])
        }
      }
      if (allPoints.length) {
        const bounds = L.latLngBounds(allPoints)
        if (bounds.isValid()) {
          map.flyToBounds(bounds.pad(0.1), { animate: true, duration: 0.5 })
        }
      }
    }
  }, [])

  // List row clicked → activate (fly map) without changing filter tab
  const handleActivateFromList = useCallback((el: OsmElement) => {
    setActiveId(el.id)
    flyToElement(el)
  }, [flyToElement])

  // Map element clicked → activate + switch to All tab so item is visible in list
  const handleActivateFromMap = useCallback((el: OsmElement) => {
    setActiveId(el.id)
    setFilter('all')
  }, [])

  // Scroll list to active item after render (fires when activeId or filter changes)
  useEffect(() => {
    if (activeId == null) return
    const item = listRef.current?.querySelector(`[data-element-id="${activeId}"]`)
    item?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeId, filter])

  const handleImport = useCallback(() => {
    const toImport = elements.filter(e => selected.has(e.id))
    const nodes = toImport.map(osmToMapNode).filter((n): n is MapNode => n !== null)
    if (!nodes.length) return
    onImport(nodes)
    setSelected(new Set())
    setActiveId(null)
    setImportMsg(`${nodes.length} item${nodes.length !== 1 ? 's' : ''} imported to map`)
  }, [elements, selected, onImport])

  const selectedCount = selected.size

  return (
    <>
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      keepMounted
      PaperProps={{
        sx: {
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          bgcolor: 'background.default',
        },
      }}
    >
      {/* ── App bar ──────────────────────────────────────────────────────── */}
      <AppBar
        position="static"
        elevation={0}
        sx={{ bgcolor: 'background.paper', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <Toolbar variant="dense" sx={{ gap: 1, minHeight: 40 }}>
          <Tooltip title="Close">
            <IconButton edge="start" size="small" onClick={onClose}>
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, flex: 1 }}>
            Overpass Query Explorer
          </Typography>
          {elements.length > 0 && (
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mr: 1 }}>
              {elements.length} elements
              {selectedCount > 0 && ` · ${selectedCount} selected`}
            </Typography>
          )}
          {selectedCount > 0 && (
            <Button
              variant="contained"
              size="small"
              startIcon={<DownloadIcon sx={{ fontSize: 15 }} />}
              onClick={handleImport}
              sx={{ fontSize: '0.75rem', textTransform: 'none', minWidth: 0 }}
            >
              Import {selectedCount} to Map
            </Button>
          )}
        </Toolbar>
      </AppBar>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden', minHeight: 0 }}>

        {/* ── Left: Query panel ─────────────────────────────────────────── */}
        <Box sx={{
          width: 360,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.paper',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}>
          {/* Section label */}
          <Box sx={{ px: 1.5, pt: 1.5, pb: 0.5, flexShrink: 0 }}>
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.secondary' }}>
              Overpass QL
            </Typography>
          </Box>

          {/* Query textarea */}
          <Box sx={{ px: 1.5, pb: 1, flexShrink: 0 }}>
            <TextField
              multiline
              fullWidth
              value={query}
              onChange={e => setQuery(e.target.value)}
              variant="outlined"
              size="small"
              minRows={9}
              maxRows={15}
              placeholder="[out:json][timeout:25];..."
              inputProps={{
                style: { fontFamily: 'monospace', fontSize: '0.71rem', lineHeight: 1.55 },
              }}
              sx={{ '& .MuiOutlinedInput-root': { p: 0.75 } }}
            />
          </Box>

          {/* Templates */}
          <Box sx={{ px: 1.5, pb: 1, flexShrink: 0, overflow: 'auto', maxHeight: 260 }}>
            <Typography sx={{ fontSize: '0.66rem', color: 'text.disabled', mb: 0.75 }}>
              Templates (replaces current query)
            </Typography>
            {TEMPLATE_GROUPS.map(g => (
              <Box key={g.group} sx={{ mb: 0.75 }}>
                <Typography sx={{
                  fontSize: '0.58rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color: 'text.disabled',
                  mb: 0.4,
                  opacity: 0.7,
                }}>
                  {g.group}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {g.items.map(t => (
                    <Chip
                      key={t.label}
                      label={t.label}
                      size="small"
                      variant="outlined"
                      onClick={() => setQuery(t.query)}
                      sx={{ fontSize: '0.68rem', height: 20, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                    />
                  ))}
                </Box>
              </Box>
            ))}
          </Box>

          <Divider sx={{ mx: 1.5, flexShrink: 0 }} />

          {/* Endpoint */}
          <Box sx={{ px: 1.5, pt: 1, pb: 1, flexShrink: 0 }}>
            <TextField
              fullWidth
              label="Endpoint"
              value={endpoint}
              onChange={e => setEndpoint(e.target.value)}
              size="small"
              sx={{
                '& .MuiInputBase-input': { fontSize: '0.71rem', fontFamily: 'monospace' },
                '& .MuiInputLabel-root': { fontSize: '0.72rem' },
              }}
            />
          </Box>

          {/* Run / Cancel */}
          <Box sx={{ px: 1.5, pb: 1, display: 'flex', gap: 1, flexShrink: 0 }}>
            <Button
              variant="contained"
              fullWidth
              size="small"
              startIcon={loading
                ? <CircularProgress size={13} color="inherit" />
                : <PlayArrowIcon sx={{ fontSize: 16 }} />
              }
              onClick={handleRun}
              disabled={loading}
              sx={{ textTransform: 'none', fontSize: '0.78rem' }}
            >
              {loading ? 'Running…' : 'Run Query'}
            </Button>
            {loading && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<StopIcon sx={{ fontSize: 16 }} />}
                onClick={handleCancel}
                color="error"
                sx={{ textTransform: 'none', fontSize: '0.78rem', flexShrink: 0 }}
              >
                Stop
              </Button>
            )}
          </Box>

          {/* Hint */}
          <Box sx={{ px: 1.5, pb: 1, flexShrink: 0 }}>
            <Typography sx={{ fontSize: '0.63rem', color: 'text.disabled', lineHeight: 1.5 }}>
              <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 3px', borderRadius: 2 }}>
                {'{{bbox}}'}
              </code>
              {' → map view south,west,north,east · '}
              <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 3px', borderRadius: 2 }}>
                {'{{center}}'}
              </code>
              {' → lat,lon'}
            </Typography>
          </Box>

          {/* Error */}
          {error && (
            <Box sx={{ px: 1.5, pb: 1.5, flexShrink: 0 }}>
              <Alert
                severity="error"
                onClose={() => setError(null)}
                sx={{ fontSize: '0.72rem', '& .MuiAlert-message': { fontSize: '0.72rem' } }}
              >
                {error}
              </Alert>
            </Box>
          )}
        </Box>

        {/* ── Right: map + results ──────────────────────────────────────── */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Preview map — 58% height */}
          <Box sx={{ flex: '0 0 58%', position: 'relative', overflow: 'hidden', minHeight: 0 }}>
            <MapContainer
              key={mapKey}
              center={initialCenter}
              zoom={13}
              style={{ width: '100%', height: '100%' }}
              scrollWheelZoom
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              <BoundsCapture boundsRef={boundsRef} />
              <MapRefCapture mapRef={mapRef} />
              {elements.length > 0 && (
                <PreviewLayer
                  elements={elements}
                  selected={selected}
                  activeId={activeId}
                  onActivate={handleActivateFromMap}
                />
              )}
            </MapContainer>

            {/* Map overlay: loading spinner */}
            {loading && (
              <Box sx={{
                position: 'absolute', inset: 0, zIndex: 1000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: 'rgba(0,0,0,0.35)',
              }}>
                <CircularProgress size={36} />
              </Box>
            )}
          </Box>

          {/* Results panel — 42% height */}
          <Box sx={{
            flex: '0 0 42%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            bgcolor: 'background.paper',
            minHeight: 0,
          }}>
            {/* Results header */}
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              flexShrink: 0,
              px: 0.5,
            }}>
              <Tabs
                value={filter}
                onChange={(_, v: FilterTab) => setFilter(v)}
                sx={{
                  flex: 1,
                  minHeight: 34,
                  '& .MuiTab-root': {
                    minHeight: 34,
                    py: 0,
                    fontSize: '0.72rem',
                    textTransform: 'none',
                    minWidth: 0,
                    px: 1.5,
                  },
                }}
              >
                <Tab value="all" label={`All (${counts.all})`} />
                <Tab value="node" label={`Nodes (${counts.node})`} />
                <Tab value="way" label={`Ways (${counts.way})`} />
                <Tab value="relation" label={`Relations (${counts.relation})`} />
              </Tabs>

              <Box sx={{ display: 'flex', gap: 0.25, pr: 0.5 }}>
                <Tooltip title="Select all importable">
                  <span>
                    <IconButton
                      size="small"
                      onClick={selectAll}
                      disabled={filteredElements.filter(e => e.type !== 'relation').length === 0}
                    >
                      <SelectAllIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Deselect all">
                  <span>
                    <IconButton size="small" onClick={deselectAll} disabled={selectedCount === 0}>
                      <DeselectIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </Box>

            {/* List */}
            {filteredElements.length === 0 ? (
              <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography sx={{ fontSize: '0.78rem', color: 'text.disabled' }}>
                  {loading
                    ? 'Fetching data…'
                    : elements.length === 0
                    ? 'Run a query to see results here'
                    : 'No elements in this category'}
                </Typography>
              </Box>
            ) : (
              <List
                dense
                disablePadding
                ref={listRef}
                sx={{ flex: 1, overflow: 'auto' }}
              >
                {filteredElements.slice(0, 1000).map(el => {
                  const isSel = selected.has(el.id)
                  const isActive = el.id === activeId
                  const canImport =
                    el.type !== 'relation' ||
                    ((el as OsmRelation).members?.some(m => m.geometry?.length) ?? false)
                  const isWay = el.type === 'way'
                  const isClosed = isWay && isClosedWay(el as OsmWay)

                  return (
                    <ListItemButton
                      key={`${el.type}-${el.id}`}
                      // data attr used by scrollIntoView in useEffect
                      data-element-id={el.id}
                      dense
                      // Row click → activate (fly map to element)
                      onClick={() => handleActivateFromList(el)}
                      sx={{
                        minHeight: 30,
                        py: 0,
                        pl: 0.5,
                        pr: 1,
                        opacity: canImport ? 1 : 0.45,
                        bgcolor: isActive
                          ? 'rgba(255,235,59,0.08)'
                          : isSel ? 'rgba(255,152,0,0.1)' : 'transparent',
                        '&:hover': {
                          bgcolor: isActive
                            ? 'rgba(255,235,59,0.13)'
                            : isSel ? 'rgba(255,152,0,0.15)' : 'action.hover',
                        },
                        borderLeft: isActive
                          ? '2px solid #ffeb3b'
                          : isSel ? '2px solid #ff9800' : '2px solid transparent',
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 28 }}>
                        {/* Checkbox click only toggles import selection, doesn't activate/fly */}
                        <Checkbox
                          checked={isSel}
                          disabled={!canImport}
                          size="small"
                          sx={{ p: 0.25 }}
                          onClick={e => e.stopPropagation()}
                          onChange={() => canImport && toggleSelect(el.id)}
                        />
                      </ListItemIcon>
                      <ListItemIcon sx={{ minWidth: 22 }}>
                        {el.type === 'node' ? (
                          <PlaceIcon sx={{ fontSize: 13, color: '#ef5350' }} />
                        ) : el.type === 'way' ? (
                          isClosed
                            ? <CropSquareIcon sx={{ fontSize: 13, color: '#4fc3f7' }} />
                            : <TimelineIcon sx={{ fontSize: 13, color: '#66bb6a' }} />
                        ) : (
                          <AccountTreeIcon sx={{ fontSize: 13, color: '#ce93d8' }} />
                        )}
                      </ListItemIcon>
                      <ListItemText
                        primary={getElementLabel(el)}
                        secondary={`${el.type} #${el.id}${!canImport ? ' · no geometry' : ''}`}
                        primaryTypographyProps={{
                          sx: { fontSize: '0.73rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                        }}
                        secondaryTypographyProps={{ sx: { fontSize: '0.61rem', mt: 0 } }}
                      />
                    </ListItemButton>
                  )
                })}

                {filteredElements.length > 1000 && (
                  <ListItem>
                    <ListItemText
                      primary={`… and ${filteredElements.length - 1000} more elements not shown`}
                      primaryTypographyProps={{
                        sx: { fontSize: '0.7rem', color: 'text.disabled', fontStyle: 'italic' },
                      }}
                    />
                  </ListItem>
                )}
              </List>
            )}
          </Box>
        </Box>
      </Box>
    </Dialog>
    <Snackbar
      open={!!importMsg}
      message={importMsg}
      autoHideDuration={2500}
      onClose={() => setImportMsg(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    />
    </>
  )
}
