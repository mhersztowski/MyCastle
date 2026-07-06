import type { ReactNode } from 'react'
import {
  TileLayer, CircleMarker, Popup, Polygon, Polyline, Circle, LayerGroup, Marker,
} from 'react-leaflet'
import L from 'leaflet'
import type { MapNode } from './types'
import { renderMarkdown } from './markdown'

// One-time stylesheet for markdown labels drawn directly on the map. Injected
// lazily so both the editor and the read-only viewer get the same look.
const LABEL_CSS = `
.map-label-box{display:inline-block;width:max-content;max-width:260px;transform:translate(-50%,-100%);background:rgba(28,28,30,.88);color:#fff;padding:5px 9px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.45);line-height:1.35;pointer-events:auto;white-space:normal;font-family:system-ui,sans-serif}
.map-label-box>*{margin:.15em 0}
.map-label-box>*:first-child{margin-top:0}
.map-label-box>*:last-child{margin-bottom:0}
.map-label-box h1,.map-label-box h2,.map-label-box h3,.map-label-box h4{font-size:1.12em;margin:.2em 0}
.map-label-box code{background:rgba(255,255,255,.15);padding:0 3px;border-radius:3px}
.map-label-box pre{background:rgba(0,0,0,.35);padding:4px 6px;border-radius:4px;overflow:auto}
.map-label-box a{color:#90caf9}
.map-label-box img{max-width:100%}
.map-label-box ul,.map-label-box ol{padding-left:1.2em;margin:.2em 0}
`
let labelCssInjected = false
function ensureLabelCss(): void {
  if (labelCssInjected || typeof document === 'undefined') return
  labelCssInjected = true
  const el = document.createElement('style')
  el.textContent = LABEL_CSS
  document.head.appendChild(el)
}

export interface RenderNodeOpts {
  /** When set, interactive shapes call this on click (used by the viewer). */
  onClick?: (node: MapNode) => void
  /** Skip tile-layer nodes (the viewer supplies its own switchable basemap). */
  skipTileLayers?: boolean
}

/** Recursive read-only renderer for a map node tree (shared by editor & viewer). */
export function renderMapNode(node: MapNode, opts: RenderNodeOpts = {}): ReactNode {
  if (!node.visible) return null
  const handlers = opts.onClick ? { click: () => opts.onClick!(node) } : undefined

  switch (node.type) {
    case 'tile-layer':
      if (opts.skipTileLayers) return null
      return (
        <TileLayer
          key={node.id}
          url={node.url ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
          attribution={node.attribution}
          opacity={node.opacity ?? 1}
        />
      )
    case 'marker':
      if (node.lat == null || node.lng == null) return null
      return (
        <CircleMarker
          key={node.id}
          center={[node.lat, node.lng]}
          radius={7}
          pathOptions={{ color: node.color ?? '#ef5350', fillColor: node.color ?? '#ef5350', fillOpacity: 0.85, weight: 1.5 }}
          eventHandlers={handlers}
        >
          {node.popup ? <Popup><pre style={{ margin: 0, fontSize: '0.72rem' }}>{node.popup}</pre></Popup> : null}
        </CircleMarker>
      )
    case 'label': {
      if (node.lat == null || node.lng == null) return null
      ensureLabelCss()
      const color = node.color ?? '#ffffff'
      const fs = node.fontSize ?? 14
      const html = `<div class="map-label-box" style="color:${color};font-size:${fs}px">${renderMarkdown(node.text ?? '')}</div>`
      // 0×0 icon anchored exactly at the coordinate; the box positions itself via
      // its CSS transform so its bottom-centre sits on the point.
      const icon = L.divIcon({ className: 'map-label-icon', html, iconSize: [0, 0], iconAnchor: [0, 0] })
      return (
        <Marker
          key={node.id}
          position={[node.lat, node.lng]}
          icon={icon}
          interactive={!!opts.onClick}
          eventHandlers={handlers}
        />
      )
    }
    case 'polygon':
      if (!node.positions?.length) return null
      return (
        <Polygon
          key={node.id}
          positions={node.positions}
          pathOptions={{ color: node.color ?? '#4fc3f7', fillOpacity: node.fillOpacity ?? 0.3, weight: node.weight ?? 2 }}
          eventHandlers={handlers}
        />
      )
    case 'polyline':
      if (!node.positions?.length) return null
      return (
        <Polyline
          key={node.id}
          positions={node.positions}
          pathOptions={{ color: node.color ?? '#ff7043', weight: node.weight ?? 3 }}
          eventHandlers={handlers}
        />
      )
    case 'circle':
      if (node.lat == null || node.lng == null) return null
      return (
        <Circle
          key={node.id}
          center={[node.lat, node.lng]}
          radius={node.radius ?? 500}
          pathOptions={{ color: node.color ?? '#66bb6a', fillOpacity: node.fillOpacity ?? 0.3, weight: node.weight ?? 2 }}
          eventHandlers={handlers}
        />
      )
    case 'route': {
      if (!node.positions?.length) return null
      const routeColor = node.color ?? '#42a5f5'
      return (
        <LayerGroup key={node.id}>
          <Polyline
            positions={node.positions}
            pathOptions={{ color: routeColor, weight: node.weight ?? 4, opacity: 0.9 }}
            eventHandlers={handlers}
          >
            {node.popup ? <Popup><pre style={{ margin: 0, fontSize: '0.72rem' }}>{node.popup}</pre></Popup> : null}
          </Polyline>
          {node.from && (
            <CircleMarker
              center={[node.from.lat, node.from.lng]}
              radius={5}
              pathOptions={{ color: '#fff', fillColor: routeColor, fillOpacity: 1, weight: 2 }}
              eventHandlers={handlers}
            />
          )}
          {node.to && (
            <CircleMarker
              center={[node.to.lat, node.to.lng]}
              radius={6}
              pathOptions={{ color: '#fff', fillColor: routeColor, fillOpacity: 1, weight: 2 }}
              eventHandlers={handlers}
            />
          )}
        </LayerGroup>
      )
    }
    case 'group':
      if (!node.children?.length) return null
      return (
        <LayerGroup key={node.id}>
          {node.children.map(child => renderMapNode(child, opts))}
        </LayerGroup>
      )
    default:
      return null
  }
}
