import { useState, useEffect, useCallback } from 'react'
import { useMap, useMapEvents, CircleMarker, Polyline, Circle } from 'react-leaflet'
import type { LeafletMouseEvent } from 'leaflet'
import type { MapNode } from '../map/types'
import { haversineM } from './MapDrawing'

// ── types ─────────────────────────────────────────────────────────────────────

type LatLng = [number, number]

type DragState =
  | { kind: 'vertex';   vtxIdx: number; pts: LatLng[] }
  | { kind: 'midpoint'; vtxIdx: number; pts: LatLng[] }
  | { kind: 'center' }
  | { kind: 'radius';   center: LatLng }

// ── helpers ───────────────────────────────────────────────────────────────────

function mid(a: LatLng, b: LatLng): LatLng {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

function radiusHandle(center: LatLng, radiusM: number): LatLng {
  const dLng = radiusM / (111320 * Math.cos((center[0] * Math.PI) / 180))
  return [center[0], center[1] + dLng]
}

// ── MapEditLayer ──────────────────────────────────────────────────────────────
// Must be rendered inside <MapContainer>

interface Props {
  node: MapNode | null
  onUpdate: (id: string, changes: Partial<MapNode>) => void
}

export function MapEditLayer({ node, onUpdate }: Props) {
  const map = useMap()

  // live state during drag (local – avoids committing on every mousemove)
  const [drag, setDrag]         = useState<DragState | null>(null)
  const [livePts, setLivePts]   = useState<LatLng[]>([])
  const [liveXY, setLiveXY]     = useState<LatLng | null>(null)   // marker / circle center
  const [liveR, setLiveR]       = useState<number | null>(null)   // circle radius

  // Sync live state from node (when selection changes or node mutates externally)
  useEffect(() => {
    if (!node) return
    if (node.type === 'polyline' || node.type === 'polygon') {
      setLivePts((node.positions ?? []) as LatLng[])
    }
    if (node.type === 'marker' || node.type === 'circle' || node.type === 'label') {
      if (node.lat != null && node.lng != null) setLiveXY([node.lat, node.lng])
    }
    if (node.type === 'circle' && node.radius != null) setLiveR(node.radius)
  }, [node])

  // ── drag events on the map level ─────────────────────────────────────────

  useMapEvents({
    mousemove(e) {
      if (!drag || !node) return
      const pt: LatLng = [e.latlng.lat, e.latlng.lng]

      if (drag.kind === 'vertex' || drag.kind === 'midpoint') {
        const next = [...drag.pts]
        next[drag.vtxIdx] = pt
        setLivePts(next)
      } else if (drag.kind === 'center') {
        setLiveXY(pt)
      } else if (drag.kind === 'radius') {
        setLiveR(haversineM(drag.center, pt))
      }
    },

    mouseup(e) {
      if (!drag || !node) return
      const pt: LatLng = [e.latlng.lat, e.latlng.lng]

      if (drag.kind === 'vertex' || drag.kind === 'midpoint') {
        const next = [...drag.pts]
        next[drag.vtxIdx] = pt
        onUpdate(node.id, { positions: next })
        setLivePts(next)
      } else if (drag.kind === 'center') {
        onUpdate(node.id, { lat: pt[0], lng: pt[1] })
        setLiveXY(pt)
      } else if (drag.kind === 'radius') {
        onUpdate(node.id, { radius: haversineM(drag.center, pt) })
      }

      setDrag(null)
      map.dragging.enable()
    },
  })

  const beginDrag = useCallback((state: DragState, e: LeafletMouseEvent) => {
    e.originalEvent.preventDefault()
    e.originalEvent.stopPropagation()
    map.dragging.disable()
    setDrag(state)
  }, [map])

  if (!node) return null

  // ── Marker ────────────────────────────────────────────────────────────────

  if ((node.type === 'marker' || node.type === 'label') && liveXY) {
    return (
      <CircleMarker
        center={liveXY}
        radius={10}
        pathOptions={{ color: '#ffeb3b', fillColor: '#ffeb3b', fillOpacity: 0.45, weight: 2.5 }}
        eventHandlers={{ mousedown: e => beginDrag({ kind: 'center' }, e) }}
      />
    )
  }

  // ── Circle ────────────────────────────────────────────────────────────────

  if (node.type === 'circle' && liveXY && liveR != null) {
    const rHandle = radiusHandle(liveXY, liveR)
    return (
      <>
        <Circle
          center={liveXY}
          radius={liveR}
          pathOptions={{ color: '#ffeb3b', weight: 1.5, fillOpacity: 0, dashArray: '6 4' }}
        />
        <Polyline
          positions={[liveXY, rHandle]}
          pathOptions={{ color: '#ffeb3b', weight: 1, opacity: 0.5, dashArray: '4 4' }}
        />
        {/* Center */}
        <CircleMarker
          center={liveXY}
          radius={8}
          pathOptions={{ color: '#ffeb3b', fillColor: '#ffeb3b', fillOpacity: 0.75, weight: 2 }}
          eventHandlers={{ mousedown: e => beginDrag({ kind: 'center' }, e) }}
        />
        {/* Radius handle */}
        <CircleMarker
          center={rHandle}
          radius={6}
          pathOptions={{ color: '#ffeb3b', fillColor: 'transparent', fillOpacity: 0, weight: 2 }}
          eventHandlers={{ mousedown: e => beginDrag({ kind: 'radius', center: liveXY }, e) }}
        />
      </>
    )
  }

  // ── Polyline / Polygon ────────────────────────────────────────────────────

  if ((node.type === 'polyline' || node.type === 'polygon') && livePts.length >= 2) {
    const closed = node.type === 'polygon'
    const n = livePts.length
    const col = node.color ?? (closed ? '#4fc3f7' : '#66bb6a')

    // Edge midpoints — click to insert
    const mids: { pt: LatLng; at: number }[] = []
    for (let i = 0; i < n; i++) {
      if (i < n - 1 || closed) {
        mids.push({ pt: mid(livePts[i], livePts[(i + 1) % n]), at: i + 1 })
      }
    }

    const deleteVertex = (idx: number) => {
      if (livePts.length <= 2) return
      const next = livePts.filter((_, i) => i !== idx)
      onUpdate(node.id, { positions: next })
      setLivePts(next)
    }

    return (
      <>
        {/* Mid-edge handles */}
        {mids.map((m, i) => (
          <CircleMarker
            key={`m${i}`}
            center={m.pt}
            radius={4}
            pathOptions={{ color: col, fillColor: '#1a1a1a', fillOpacity: 0.7, weight: 1.5, opacity: 0.7 }}
            eventHandlers={{
              mousedown: e => {
                const pts = [...livePts]
                pts.splice(m.at, 0, m.pt)
                setLivePts(pts)
                beginDrag({ kind: 'midpoint', vtxIdx: m.at, pts }, e)
              },
            }}
          />
        ))}

        {/* Vertex handles */}
        {livePts.map((pt, i) => (
          <CircleMarker
            key={`v${i}`}
            center={pt}
            radius={6}
            pathOptions={{ color: '#ffeb3b', fillColor: '#ffeb3b', fillOpacity: 0.9, weight: 1.5 }}
            eventHandlers={{
              mousedown: e => beginDrag({ kind: 'vertex', vtxIdx: i, pts: livePts }, e),
              contextmenu: e => {
                e.originalEvent.preventDefault()
                deleteVertex(i)
              },
            }}
          />
        ))}
      </>
    )
  }

  return null
}
