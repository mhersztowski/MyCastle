import { SceneGraph, MeshNode, GroupNode, SceneSerializer } from '@mhersztowski/core-scene3d'
import type { MapNode } from '../map/types'

type LatLng = [number, number]

/** Target scene width/height in scene units (camera-friendly default view). */
const SCENE_SIZE = 200

// Geographic projection: lat/lng → XZ plane meters (relative to reference point)
function latlngToXZ(lat: number, lng: number, refLat: number, refLng: number): [number, number] {
  const x = (lng - refLng) * Math.cos(refLat * Math.PI / 180) * 111320
  const z = -(lat - refLat) * 111320  // north = -Z
  return [x, z]
}

function collectPoints(nodes: MapNode[]): LatLng[] {
  const pts: LatLng[] = []
  function visit(ns: MapNode[]) {
    for (const n of ns) {
      if ((n.type === 'marker' || n.type === 'circle') && n.lat != null && n.lng != null) {
        pts.push([n.lat, n.lng])
      }
      if ((n.type === 'polyline' || n.type === 'polygon') && n.positions) {
        for (const p of n.positions as LatLng[]) pts.push(p)
      }
      if (n.children) visit(n.children)
    }
  }
  visit(nodes)
  return pts
}

function centroid(pts: LatLng[]): LatLng {
  if (!pts.length) return [0, 0]
  let lat = 0, lng = 0
  for (const p of pts) { lat += p[0]; lng += p[1] }
  return [lat / pts.length, lng / pts.length]
}

// ── OSM tile helpers ──────────────────────────────────────────────────────────

function lonToTileX(lon: number, zoom: number): number {
  return Math.floor((lon + 180) / 360 * (1 << zoom))
}
function latToTileY(lat: number, zoom: number): number {
  const r = lat * Math.PI / 180
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * (1 << zoom))
}
function tileToLon(x: number, zoom: number): number {
  return x / (1 << zoom) * 360 - 180
}
function tileToLat(y: number, zoom: number): number {
  const n = Math.PI - 2 * Math.PI * y / (1 << zoom)
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

async function fetchOsmTile(x: number, y: number, z: number): Promise<HTMLImageElement | null> {
  const s = ['a', 'b', 'c'][(x + y) % 3]
  const url = `https://${s}.tile.openstreetmap.org/${z}/${x}/${y}.png`
  try {
    // Use fetch() rather than new Image() to avoid CORS cache-poisoning:
    // Leaflet loads the same tiles without crossOrigin, which caches them without CORS
    // headers. A subsequent Image+crossOrigin then taints the canvas (SecurityError).
    // fetch() uses a separate cache partition and always gets CORS headers from OSM.
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    return await new Promise(resolve => {
      const img = new Image()
      img.onload  = () => { URL.revokeObjectURL(blobUrl); resolve(img) }
      img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(null) }
      img.src = blobUrl
    })
  } catch {
    return null
  }
}

const TILE_PX = 256

interface OsmGroundResult {
  node: MeshNode
  widthM: number
  heightM: number
}

async function buildOsmGroundPlane(
  pts: LatLng[], refLat: number, refLng: number, sceneScale: number,
): Promise<OsmGroundResult | null> {
  if (pts.length < 2) return null

  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
  for (const [la, ln] of pts) {
    minLat = Math.min(minLat, la); maxLat = Math.max(maxLat, la)
    minLng = Math.min(minLng, ln); maxLng = Math.max(maxLng, ln)
  }
  // 5% margin so map nodes don't sit exactly on the edge
  const dlat = Math.max((maxLat - minLat) * 0.05, 0.001)
  const dlng = Math.max((maxLng - minLng) * 0.05, 0.001)
  minLat -= dlat; maxLat += dlat
  minLng -= dlng; maxLng += dlng

  // Pick zoom so we cover the area in ≤ 6×6 tiles
  let zoom = 16
  let tileX0: number, tileX1: number, tileY0: number, tileY1: number
  do {
    tileX0 = lonToTileX(minLng, zoom)
    tileX1 = lonToTileX(maxLng, zoom)
    tileY0 = latToTileY(maxLat, zoom)   // smaller Y = further north
    tileY1 = latToTileY(minLat, zoom)
    if (tileX1 - tileX0 < 6 && tileY1 - tileY0 < 6) break
    zoom--
  } while (zoom > 8)

  const tileW = tileX1 - tileX0 + 1
  const tileH = tileY1 - tileY0 + 1

  // Composite tiles onto a canvas
  const canvas = document.createElement('canvas')
  canvas.width = tileW * TILE_PX
  canvas.height = tileH * TILE_PX
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#e0e0d8'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const fetches: Promise<{ img: HTMLImageElement | null; tx: number; ty: number }>[] = []
  for (let ty = tileY0; ty <= tileY1; ty++) {
    for (let tx = tileX0; tx <= tileX1; tx++) {
      fetches.push(fetchOsmTile(tx, ty, zoom).then(img => ({ img, tx, ty })))
    }
  }
  const results = await Promise.all(fetches)
  let tilesLoaded = 0
  for (const { img, tx, ty } of results) {
    if (img) { ctx.drawImage(img, (tx - tileX0) * TILE_PX, (ty - tileY0) * TILE_PX); tilesLoaded++ }
  }
  // eslint-disable-next-line no-console
  console.log(`[MapToScene] OSM tiles: zoom=${zoom} grid=${tileW}×${tileH} loaded=${tilesLoaded}/${tileW * tileH}`)

  // Geographic extent covered by the fetched tile grid
  const gridTopLat   = tileToLat(tileY0,     zoom)
  const gridBotLat   = tileToLat(tileY1 + 1, zoom)
  const gridLeftLng  = tileToLon(tileX0,     zoom)
  const gridRightLng = tileToLon(tileX1 + 1, zoom)
  const gridCenterLat = (gridTopLat + gridBotLat) / 2
  const gridCenterLng = (gridLeftLng + gridRightLng) / 2

  const widthM  = (gridRightLng - gridLeftLng) * Math.cos(gridCenterLat * Math.PI / 180) * 111320
  const heightM = (gridTopLat - gridBotLat) * 111320

  // Center of the tile grid in scene coords (scaled)
  const [cxM, czM] = latlngToXZ(gridCenterLat, gridCenterLng, refLat, refLng)
  const cx = cxM * sceneScale
  const cz = czM * sceneScale

  return {
    node: new MeshNode({
      name: '[osm] tiles',
      position: [cx, -0.5, cz],
      rotation: [-Math.PI / 2, 0, 0],  // PlaneGeometry is XY — rotate to lay flat
      geometry: {
        type: 'plane',
        params: { width: widthM * sceneScale, height: heightM * sceneScale },
      },
      material: {
        color: '#ffffff',
        opacity: 1,
        wireframe: false,
        side: 'double',
        textureDataUrl: canvas.toDataURL('image/jpeg', 0.85),
      },
    }),
    widthM,
    heightM,
  }
}

// ── Map node conversion ───────────────────────────────────────────────────────

// Fixed visual sizes in scene units (independent of real-world scale)
const MARKER_R = 2    // sphere radius
const ROAD_H   = 1    // road segment height
const ROAD_W   = 1    // road segment depth (width on XZ)

function convertNode(
  node: MapNode, refLat: number, refLng: number, sceneScale: number,
): MeshNode | GroupNode | null {
  if (!node.visible) return null

  switch (node.type) {
    case 'tile-layer':
      return null

    case 'marker': {
      if (node.lat == null || node.lng == null) return null
      const [xM, zM] = latlngToXZ(node.lat, node.lng, refLat, refLng)
      return new MeshNode({
        name: node.name,
        position: [xM * sceneScale, MARKER_R, zM * sceneScale],
        geometry: { type: 'sphere', params: { radius: MARKER_R } },
        material: { color: node.color ?? '#ef5350', opacity: 1, wireframe: false },
      })
    }

    case 'circle': {
      if (node.lat == null || node.lng == null) return null
      const [xM, zM] = latlngToXZ(node.lat, node.lng, refLat, refLng)
      const r = (node.radius ?? 500) * sceneScale
      return new MeshNode({
        name: node.name,
        position: [xM * sceneScale, 0.5, zM * sceneScale],
        geometry: { type: 'cylinder', params: { radiusTop: r, radiusBottom: r, height: 1, radialSegments: 64 } },
        material: { color: node.color ?? '#66bb6a', opacity: node.fillOpacity ?? 0.5, wireframe: false },
      })
    }

    case 'polyline':
    case 'polygon': {
      const positions = (node.positions ?? []) as LatLng[]
      if (positions.length < 2) return null
      const g = new GroupNode({ name: node.name })
      const isClosed = node.type === 'polygon'
      const count = positions.length
      for (let i = 0; i < count - 1 + (isClosed ? 1 : 0); i++) {
        const a = positions[i]
        const b = positions[(i + 1) % count]
        const [axM, azM] = latlngToXZ(a[0], a[1], refLat, refLng)
        const [bxM, bzM] = latlngToXZ(b[0], b[1], refLat, refLng)
        const ax = axM * sceneScale, az = azM * sceneScale
        const bx = bxM * sceneScale, bz = bzM * sceneScale
        const dx = bx - ax, dz = bz - az
        const length = Math.sqrt(dx * dx + dz * dz)
        if (length < 0.01) continue
        const angle = -Math.atan2(dz, dx)
        g.addChild(new MeshNode({
          name: `seg ${i + 1}`,
          position: [(ax + bx) / 2, ROAD_H / 2, (az + bz) / 2],
          rotation: [0, angle, 0],
          geometry: { type: 'box', params: { width: length, height: ROAD_H, depth: ROAD_W } },
          material: { color: node.color ?? '#ff7043', opacity: 1, wireframe: false },
        }))
      }
      return g
    }

    case 'group': {
      const g = new GroupNode({ name: node.name })
      for (const child of node.children ?? []) {
        const c = convertNode(child, refLat, refLng, sceneScale)
        if (c) g.addChild(c)
      }
      return g
    }

    default:
      return null
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface MapToSceneResult {
  sceneJson: string
  groupId: string
}

export interface MapImportTransform {
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
}

export async function mapNodesToSceneJson(
  nodes: MapNode[],
  name: string,
  transform?: MapImportTransform,
  addOsmGround = true,
): Promise<MapToSceneResult> {
  const pts = collectPoints(nodes)
  const [refLat, refLng] = centroid(pts)

  // Compute scene scale: fit the geographic extent into SCENE_SIZE units.
  // All positions are multiplied by sceneScale; visual object sizes stay fixed.
  let sceneScale = 1
  if (pts.length >= 2) {
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
    for (const [la, ln] of pts) {
      minLat = Math.min(minLat, la); maxLat = Math.max(maxLat, la)
      minLng = Math.min(minLng, ln); maxLng = Math.max(maxLng, ln)
    }
    const widthM  = Math.max((maxLng - minLng) * Math.cos(refLat * Math.PI / 180) * 111320, 1)
    const heightM = Math.max((maxLat - minLat) * 111320, 1)
    sceneScale = SCENE_SIZE / Math.max(widthM, heightM)
  }

  const importGroup = new GroupNode({ name: `[map] ${name}` })
  if (transform?.position) importGroup.setPosition(transform.position)
  if (transform?.rotation) importGroup.setRotation(transform.rotation)
  if (transform?.scale) importGroup.setScale(transform.scale)

  // OSM ground plane (async tile fetch) — added first so it renders behind map objects
  if (addOsmGround && pts.length >= 2) {
    const result = await buildOsmGroundPlane(pts, refLat, refLng, sceneScale).catch(() => null)
    if (result) importGroup.addChild(result.node)
  }

  for (const node of nodes) {
    if (node.type === 'tile-layer') continue
    const child = convertNode(node, refLat, refLng, sceneScale)
    if (child) importGroup.addChild(child)
  }

  const scene = new SceneGraph()
  scene.addNode(importGroup)

  return {
    sceneJson: SceneSerializer.serialize(scene),
    groupId: importGroup.id,
  }
}

export function deserializeMapNodes(text: string): MapNode[] {
  const data = JSON.parse(text) as { version?: number; nodes?: MapNode[] } | MapNode[]
  return Array.isArray(data) ? data : (data.nodes ?? [])
}
