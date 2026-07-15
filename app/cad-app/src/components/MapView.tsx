import { useState, useCallback, useRef, useMemo, type MutableRefObject, type ChangeEvent } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Snackbar from '@mui/material/Snackbar'
import TravelExploreIcon from '@mui/icons-material/TravelExplore'
import CloseIcon from '@mui/icons-material/Close'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import {
  MapContainer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapHierarchyPanel } from './MapHierarchyPanel'
import { MapPropertiesPanel } from './MapPropertiesPanel'
import { MapDrawingLayer, MapDrawingToolbar, haversineM, type DrawTool } from './MapDrawing'
import { MapEditLayer } from './MapEditLayer'
import { OverpassDialog } from './OverpassDialog'
import { parseGeoFile } from '../map/geoImporter'
import { GeoExportDialog } from './GeoExportDialog'
import { SplitPathDialog } from './SplitPathDialog'
import { ServerFileBrowser } from './ServerFileBrowser'
import { RouteDialog, type RouteDraft } from './RouteDialog'
import { InfoView } from './InfoView'
import { readFileAt, writeFileAt, MAP_EXT } from '../vfs/cadProjectApi'
import { useMapLayers } from '../map/useMapLayers'
import { renderMapNode } from '../map/renderMapNode'
import { fetchRoute, TRAVEL_MODES, formatDistance, formatDuration } from '../map/routing'
import { useRegisterFileOps } from '../fileops/FileOpsContext'
import { captureLeafletCanvas, exportCanvasPng, exportCanvasSvg, exportCanvasPdf } from '../io/exportGraphics'
import type { MapNode, MapNodeType, RoutePoint, TravelMode } from '../map/types'

// ── serialization ─────────────────────────────────────────────────────────────

interface MapFile { version: number; nodes: MapNode[] }

function serializeMap(nodes: MapNode[]): string {
  return JSON.stringify({ version: 1, nodes } satisfies MapFile, null, 2)
}

function deserializeMap(text: string): MapNode[] {
  const data = JSON.parse(text) as MapFile | MapNode[]
  return Array.isArray(data) ? data : (data.nodes ?? [])
}


const MAP_STYLE = { width: '100%', height: '100%' } as const
const MAP_CENTER: [number, number] = [52.2297, 21.0122]

function findNode(nodes: MapNode[], id: string): MapNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children) { const f = findNode(n.children, id); if (f) return f }
  }
  return null
}

// Returns the direct parent of the node with given id, or null if at root.
// Returns undefined when id is not found at all.
function findParentNode(nodes: MapNode[], id: string, parent: MapNode | null = null): MapNode | null | undefined {
  for (const n of nodes) {
    if (n.id === id) return parent
    if (n.children) {
      const result = findParentNode(n.children, id, n)
      if (result !== undefined) return result
    }
  }
  return undefined
}

// Collect every lat/lng a node covers (its own point + positions + descendants).
function collectLatLngs(node: MapNode, acc: [number, number][]): void {
  if (node.lat != null && node.lng != null) acc.push([node.lat, node.lng])
  if (node.positions?.length) for (const p of node.positions) acc.push(p)
  if (node.children) for (const c of node.children) collectLatLngs(c, acc)
}

/**
 * Gdy Collection jest zaznaczona, chcemy pokazać na mapie WYŁĄCZNIE jej członków
 * (plus tile-layery jako podkład). Ta funkcja zwraca sfiltrowane drzewo:
 * — tile-layer: przepuszczamy zawsze (mapa musi mieć podkład)
 * — group: renderujemy rekursywnie sfiltrowaną zawartość jeśli cokolwiek zostało
 * — inne node'y: renderujemy tylko gdy są w memberIds, przy czym force visible=true
 *   (żeby użytkownik zobaczył też te które sam ukrył w hierarchy)
 * — sama Collection: nie renderujemy (nie ma własnej geometrii)
 */
function filterForCollection(nodes: MapNode[], memberSet: Set<string>): MapNode[] {
  const result: MapNode[] = []
  for (const n of nodes) {
    if (n.type === 'tile-layer') {
      result.push(n)
      continue
    }
    if (n.type === 'collection') continue
    if (n.type === 'group') {
      const childrenFiltered = filterForCollection(n.children ?? [], memberSet)
      if (childrenFiltered.length > 0) {
        // Grupa musi być widoczna, inaczej Leaflet nie zrenderuje dzieci
        result.push({ ...n, visible: true, children: childrenFiltered })
      }
      continue
    }
    if (memberSet.has(n.id)) {
      // Force visible — użytkownik chce zobaczyć wszystkich członków kolekcji,
      // nawet jeśli w hierarchy je ukrył.
      result.push({ ...n, visible: true })
    }
  }
  return result
}

// Captures the Leaflet map instance into a ref so MapView can fly imperatively.
function MapRefCapture({ mapRef }: { mapRef: MutableRefObject<L.Map | null> }) {
  const map = useMap()
  mapRef.current = map
  return null
}

// Collect all nodes whose id is in the given set (recursive)
function collectNodes(nodes: MapNode[], ids: Set<string>): MapNode[] {
  const result: MapNode[] = []
  function visit(ns: MapNode[]) {
    for (const n of ns) {
      if (ids.has(n.id)) result.push(n)
      if (n.children) visit(n.children)
    }
  }
  visit(nodes)
  return result
}

// Captures map clicks while the route dialog is in "pick on map" mode.
function RoutePickCapture({ active, onPick }: { active: boolean; onPick: (pt: [number, number]) => void }) {
  useMapEvents({
    click(e) { if (active) onPick([e.latlng.lat, e.latlng.lng]) },
  })
  return null
}

// ── MapView ───────────────────────────────────────────────────────────────────

export function MapView() {
  const {
    nodes, selectedId, selectedIds, selectedNode,
    toggleSelect,
    addLayer, placeNode, deleteLayer, renameLayer, toggleVisibility, updateLayer, updateLayers, importAsGroup, addSibling, moveNode, placeRoute, loadNodes,
  } = useMapLayers()

  const selectedNodes = collectNodes(nodes, selectedIds)

  // Gdy Collection jest zaznaczona → mapa pokazuje TYLKO jej członków (isolation mode).
  // W przeciwnym wypadku — całe drzewo tak jak jest.
  const renderNodes = useMemo(() => {
    if (selectedNode?.type === 'collection') {
      const memberSet = new Set(selectedNode.memberIds ?? [])
      return filterForCollection(nodes, memberSet)
    }
    return nodes
  }, [nodes, selectedNode])

  // Leaflet map instance — used to zoom to a node when activated in the hierarchy.
  const mapRef = useRef<L.Map | null>(null)

  const nodesRef = useRef<MapNode[]>([])
  nodesRef.current = nodes

  const flyToNode = useCallback((node: MapNode) => {
    const map = mapRef.current
    if (!map) return
    // Circle: frame the whole disc using its radius.
    if (node.type === 'circle' && node.lat != null && node.lng != null && node.radius) {
      const bounds = L.latLng(node.lat, node.lng).toBounds(node.radius * 2.4)
      map.flyToBounds(bounds, { animate: true, duration: 0.5 })
      return
    }
    // Collection: zbieramy punkty ze wszystkich member nodes → fitBounds
    if (node.type === 'collection') {
      const pts: [number, number][] = []
      for (const memberId of node.memberIds ?? []) {
        const member = findNode(nodesRef.current, memberId)
        if (member) collectLatLngs(member, pts)
      }
      if (pts.length === 0) return
      if (pts.length === 1) {
        map.flyTo(pts[0], Math.max(map.getZoom(), 16), { animate: true, duration: 0.5 })
        return
      }
      const bounds = L.latLngBounds(pts)
      if (bounds.isValid()) map.flyToBounds(bounds.pad(0.2), { animate: true, duration: 0.5 })
      return
    }
    const pts: [number, number][] = []
    collectLatLngs(node, pts)
    if (pts.length === 0) return
    if (pts.length === 1) {
      map.flyTo(pts[0], Math.max(map.getZoom(), 16), { animate: true, duration: 0.5 })
      return
    }
    const bounds = L.latLngBounds(pts)
    if (bounds.isValid()) map.flyToBounds(bounds.pad(0.2), { animate: true, duration: 0.5 })
  }, [])

  // Add a layer at the current camera view (centre + visible span) so new objects
  // spawn where the user is looking instead of at a fixed default location.
  const handleAdd = useCallback((type: MapNodeType, parentId?: string | null) => {
    const map = mapRef.current
    if (!map) return addLayer(type, parentId)
    const c = map.getCenter()
    const b = map.getBounds()
    return addLayer(type, parentId, {
      lat: c.lat,
      lng: c.lng,
      latSpan: b.getNorth() - b.getSouth(),
      lngSpan: b.getEast() - b.getWest(),
    })
  }, [addLayer])

  // Hierarchy activation: select the node AND zoom the map to it. On a multi/range
  // selection (Ctrl / Shift) don't fly — it would yank the view mid-selection.
  const handleHierarchySelect = useCallback((id: string, multi: boolean, range = false) => {
    toggleSelect(id, multi, range)
    if (!multi && !range) {
      const node = findNode(nodes, id)
      if (node) flyToNode(node)
    }
  }, [toggleSelect, nodes, flyToNode])

  // ── file state ─────────────────────────────────────────────────────────────
  const [openDialog, setOpenDialog]   = useState(false)
  const [saveDialog, setSaveDialog]   = useState(false)
  const [currentName, setCurrentName] = useState<string | null>(null)
  const [currentDir, setCurrentDir]   = useState<string | null>(null)
  const [toast, setToast]             = useState<string | null>(null)

  const handleOpen = useCallback(async (dir: string, name: string) => {
    const text = await readFileAt(dir, name, MAP_EXT)
    loadNodes(deserializeMap(text))
    setCurrentName(name)
    setCurrentDir(dir)
  }, [loadNodes])

  const handleSave = useCallback(async (dir: string, name: string) => {
    await writeFileAt(dir, name, MAP_EXT, serializeMap(nodes))
    setCurrentName(name)
    setCurrentDir(dir)
    setToast(`Saved "${name}"`)
  }, [nodes])

  // Build the read-only viewer URL for the currently saved scene file.
  const viewerUrl = useMemo(() => {
    if (!currentName || currentDir == null) return null
    const full = `${currentDir}/${currentName}`.replace(/^\/+/, '')
    return '/viewer/map/' + full.split('/').map(encodeURIComponent).join('/')
  }, [currentDir, currentName])

  const [overpassOpen, setOverpassOpen] = useState(false)
  const [geoExportOpen, setGeoExportOpen] = useState(false)
  const [splitNode, setSplitNode] = useState<MapNode | null>(null)

  // Node whose info/description is currently displayed (lookup keeps it live while editing).
  const [infoNodeId, setInfoNodeId] = useState<string | null>(null)
  // Collection editing — jeśli set, hierarchy pokazuje checkboxes obok każdego node
  const [collectionEditingId, setCollectionEditingId] = useState<string | null>(null)
  // Panel visibility toggles — hierarchy (left) + inspector (right)
  const [hierarchyOpen, setHierarchyOpen] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const infoNode = infoNodeId ? findNode(nodes, infoNodeId) : null

  // Collection member IDs (Set) for hierarchy checkbox rendering
  const collectionEditingNode = collectionEditingId ? findNode(nodes, collectionEditingId) : null
  const collectionMemberIds = useMemo(() =>
    new Set(collectionEditingNode?.memberIds ?? []),
    [collectionEditingNode]
  )
  const toggleCollectionMember = useCallback((memberId: string) => {
    if (!collectionEditingId) return
    const current = findNode(nodes, collectionEditingId)
    if (!current) return
    const ids = new Set(current.memberIds ?? [])
    if (ids.has(memberId)) ids.delete(memberId)
    else ids.add(memberId)
    updateLayer(collectionEditingId, { memberIds: Array.from(ids) })
  }, [collectionEditingId, nodes, updateLayer])

  // ── route state ─────────────────────────────────────────────────────────────
  const [routeOpen, setRouteOpen] = useState(false)
  const [routeDraft, setRouteDraft] = useState<RouteDraft>({ mode: 'car', from: null, to: null })
  const [routePicking, setRoutePicking] = useState<'from' | 'to' | null>(null)
  const [routeBusy, setRouteBusy] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)

  const openRouteDialog = useCallback(() => {
    setRouteDraft({ mode: 'car', from: null, to: null })
    setRouteError(null)
    setRoutePicking(null)
    setRouteOpen(true)
  }, [])

  const handleRouteMode = useCallback((mode: TravelMode) => setRouteDraft(d => ({ ...d, mode })), [])
  const handleRouteEndpoint = useCallback((which: 'from' | 'to', point: RoutePoint | null) =>
    setRouteDraft(d => ({ ...d, [which]: point })), [])

  // Map click while picking → fill the pending endpoint and return to the dialog.
  const handleRoutePick = useCallback((pt: [number, number]) => {
    if (!routePicking) return
    const point: RoutePoint = { lat: pt[0], lng: pt[1], label: `${pt[0].toFixed(5)}, ${pt[1].toFixed(5)}` }
    setRouteDraft(d => ({ ...d, [routePicking]: point }))
    setRoutePicking(null)
  }, [routePicking])

  const handleRouteConfirm = useCallback(async () => {
    const { mode, from, to } = routeDraft
    if (!from || !to) return
    setRouteBusy(true)
    setRouteError(null)
    try {
      const result = await fetchRoute(mode, from, to)
      const meta = TRAVEL_MODES[mode]
      const durTxt = result.durationS != null ? ` · ${formatDuration(result.durationS)}` : ''
      const popup =
        `${meta.label}: ${from.label ?? 'Start'} → ${to.label ?? 'End'}\n` +
        `${formatDistance(result.distanceM)}${durTxt}${result.straight ? '\n(straight line)' : ''}`
      placeRoute({
        name: `${meta.label}: ${from.label ?? 'A'} → ${to.label ?? 'B'}`,
        travelMode: mode,
        from, to,
        positions: result.positions,
        distanceM: result.distanceM,
        durationS: result.durationS,
        color: meta.color,
        weight: 4,
        popup,
      })
      setRouteOpen(false)
    } catch (e) {
      setRouteError((e as Error).message || 'Failed to compute route')
    } finally {
      setRouteBusy(false)
    }
  }, [routeDraft, placeRoute])

  // ── drawing state ─────────────────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState<DrawTool>('select')
  const [drawingPts, setDrawingPts] = useState<[number, number][]>([])
  const [previewPt, setPreviewPt] = useState<[number, number] | null>(null)

  const parentId = selectedNode?.type === 'group' ? selectedNode.id : null

  const finishDrawing = useCallback(() => {
    if (activeTool === 'polyline' && drawingPts.length >= 2) {
      placeNode('polyline', { positions: drawingPts }, parentId)
    } else if (activeTool === 'polygon' && drawingPts.length >= 3) {
      placeNode('polygon', { positions: drawingPts }, parentId)
    } else if (activeTool === 'circle' && drawingPts.length === 1 && previewPt) {
      const radius = haversineM(drawingPts[0], previewPt)
      placeNode('circle', { lat: drawingPts[0][0], lng: drawingPts[0][1], radius }, parentId)
    }
    setDrawingPts([])
    setPreviewPt(null)
  }, [activeTool, drawingPts, previewPt, placeNode, parentId])

  const cancelDrawing = useCallback(() => {
    setDrawingPts([])
    setPreviewPt(null)
  }, [])

  const handleSelectTool = useCallback((tool: DrawTool) => {
    cancelDrawing()
    setActiveTool(tool)
  }, [cancelDrawing])

  const handleMapClick = useCallback((pt: [number, number]) => {
    if (activeTool === 'marker') {
      placeNode('marker', { lat: pt[0], lng: pt[1] }, parentId)
      return
    }
    if (activeTool === 'circle') {
      if (drawingPts.length === 0) {
        setDrawingPts([pt])
      } else {
        // second click → finish circle
        const radius = haversineM(drawingPts[0], pt)
        placeNode('circle', { lat: drawingPts[0][0], lng: drawingPts[0][1], radius }, parentId)
        setDrawingPts([])
        setPreviewPt(null)
      }
      return
    }
    if (activeTool === 'polyline' || activeTool === 'polygon') {
      setDrawingPts(prev => [...prev, pt])
    }
  }, [activeTool, drawingPts, placeNode, parentId])

  const handleOverpassImport = useCallback((importedNodes: MapNode[]) => {
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    importAsGroup(`Overpass ${time}`, importedNodes)
  }, [importAsGroup])

  // Local GPX / GeoJSON import — read the picked file, parse to MapNodes, add as a group.
  const geoInputRef = useRef<HTMLInputElement>(null)
  const handleGeoFile = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    try {
      const nodes = parseGeoFile(await file.text(), file.name)
      importAsGroup(file.name.replace(/\.[^.]+$/, '') || 'Import', nodes)
    } catch (err) {
      alert('Import nie powiódł się: ' + ((err as Error).message || 'nieznany błąd'))
    }
  }, [importAsGroup])

  const handleSplitOpen = useCallback((id: string) => {
    const found = findNode(nodes, id)
    if (!found) return

    // If it's already a group → use it directly (children = siblings)
    if (found.type === 'group') {
      setSplitNode(found)
      return
    }

    // Leaf node (polyline/polygon) → try to use parent group so the slider
    // spans all siblings, not just this one node's points
    const parent = findParentNode(nodes, id)
    if (parent && parent.type === 'group') {
      setSplitNode(parent)
    } else {
      setSplitNode(found)
    }
  }, [nodes])

  const handleSplitExtract = useCallback((newNode: MapNode) => {
    if (!splitNode) return
    addSibling(splitNode.id, newNode)
  }, [splitNode, addSibling])

  // Eksport mapy (kafelki + nakładka wektorowa) do PNG/SVG/PDF — best-effort.
  const exportMap = useCallback(async (fmt: 'png' | 'svg' | 'pdf') => {
    const container = mapRef.current?.getContainer?.()
    if (!container) return
    const base = currentName?.replace(/\.[^.]+$/, '') || 'map'
    try {
      const c = await captureLeafletCanvas(container, 2)
      if (fmt === 'png') await exportCanvasPng(c, `${base}.png`)
      else if (fmt === 'svg') exportCanvasSvg(c, `${base}.svg`)
      else exportCanvasPdf(c, `${base}.pdf`)
    } catch (e) {
      console.error('Map export failed', e)
      alert('Eksport mapy nie powiódł się — kafelki mogą blokować zapis (CORS).')
    }
  }, [currentName])

  // Register file operations with the unified top-bar File menu.
  useRegisterFileOps('map', {
    currentName,
    server: [
      { label: 'Open Map from Server…', run: () => setOpenDialog(true) },
      { label: 'Save Map to Server…', run: () => setSaveDialog(true) },
    ],
    importItems: [
      { label: 'Overpass Query…', secondary: 'Import OSM features', run: () => setOverpassOpen(true) },
      { label: 'Import GPX / GeoJSON…', secondary: 'Pliki lokalne', run: () => geoInputRef.current?.click() },
    ],
    exportItems: [
      { label: 'Export GPX / GeoJSON…', secondary: 'Wybierz elementy', run: () => setGeoExportOpen(true) },
      { label: 'Export PNG', run: () => exportMap('png') },
      { label: 'Export SVG', run: () => exportMap('svg') },
      { label: 'Export PDF', run: () => exportMap('pdf') },
    ],
    viewerUrl,
  }, [currentName, viewerUrl, exportMap])

  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left: Hierarchy panel */}
      {hierarchyOpen && <MapHierarchyPanel
        nodes={nodes}
        selectedId={selectedId}
        selectedIds={selectedIds}
        onSelect={handleHierarchySelect}
        onToggleVisibility={toggleVisibility}
        onRename={renameLayer}
        onDelete={deleteLayer}
        onAdd={handleAdd}
        onAddRoute={openRouteDialog}
        onSplit={handleSplitOpen}
        onMove={moveNode}
        onShowInfo={setInfoNodeId}
        collectionEditingId={collectionEditingId}
        collectionMemberIds={collectionMemberIds}
        onToggleMember={toggleCollectionMember}
      />}

      {/* Center: Leaflet map */}
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <MapContainer
          center={MAP_CENTER}
          zoom={13}
          style={MAP_STYLE}
          scrollWheelZoom
          doubleClickZoom={activeTool === 'select'}
        >
          <MapRefCapture mapRef={mapRef} />
          <RoutePickCapture active={routePicking !== null} onPick={handleRoutePick} />
          {/* Gdy Collection jest zaznaczona, renderujemy TYLKO jej członków (plus tile-layery).
              W przeciwnym razie renderujemy całe drzewo normalnie. */}
          {renderNodes.map(n => renderMapNode(n))}
          <MapDrawingLayer
            activeTool={activeTool}
            drawingPts={drawingPts}
            previewPt={previewPt}
            onMapClick={handleMapClick}
            onMouseMove={pt => setPreviewPt(pt)}
          />
          {activeTool === 'select' && (
            <MapEditLayer
              node={selectedNode ?? null}
              onUpdate={updateLayer}
            />
          )}
        </MapContainer>

        {/* Route point-picking hint */}
        {routePicking && (
          <Box sx={{
            position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 1200,
            display: 'flex', alignItems: 'center', gap: 1.5,
            px: 1.5, py: 0.75, borderRadius: 1,
            bgcolor: 'rgba(66,165,245,0.95)', color: '#06222e',
            boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
          }}>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600 }}>
              Click on the map to set the {routePicking === 'from' ? 'start' : 'end'} point
            </Typography>
            <IconButton size="small" onClick={() => setRoutePicking(null)} sx={{ p: 0.25, color: '#06222e' }}>
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
        )}

        {/* Left: draw tools toolbar */}
        <MapDrawingToolbar
          activeTool={activeTool}
          drawingPts={drawingPts}
          onSelectTool={handleSelectTool}
          onFinish={finishDrawing}
          onCancel={cancelDrawing}
          onEscapeKey={cancelDrawing}
        />

        {/* Panel toggle handles — w środku pionowej krawędzi panelu (jak VSCode collapse handle).
            Nie koliduje z: Leaflet zoom (top-left), file+Overpass buttons (top-right), drawing toolbar (bottom-center). */}
        <Box sx={{
          position: 'absolute',
          top: '50%', transform: 'translateY(-50%)',
          left: hierarchyOpen ? 260 : 0,
          zIndex: 1000,
          transition: 'left 0.15s ease',
        }}>
          <Tooltip title={hierarchyOpen ? 'Ukryj hierarchię' : 'Pokaż hierarchię'} placement="right">
            <IconButton size="small" onClick={() => setHierarchyOpen(v => !v)}
              sx={{
                bgcolor: 'background.paper', boxShadow: 2, borderRadius: '0 6px 6px 0',
                width: 22, height: 40,
                '&:hover': { bgcolor: 'background.paper' },
              }}>
              {hierarchyOpen ? <ChevronLeftIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{
          position: 'absolute',
          top: '50%', transform: 'translateY(-50%)',
          right: inspectorOpen ? 300 : 0,
          zIndex: 1000,
          transition: 'right 0.15s ease',
        }}>
          <Tooltip title={inspectorOpen ? 'Ukryj inspector' : 'Pokaż inspector'} placement="left">
            <IconButton size="small" onClick={() => setInspectorOpen(v => !v)}
              sx={{
                bgcolor: 'background.paper', boxShadow: 2, borderRadius: '6px 0 0 6px',
                width: 22, height: 40,
                '&:hover': { bgcolor: 'background.paper' },
              }}>
              {inspectorOpen ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>

        {/* Top-right: file + Overpass buttons */}
        <Box sx={{
          position: 'absolute', top: 10, right: 10, zIndex: 1000,
          display: 'flex', flexDirection: 'column', gap: 0.5,
        }}>
          {/* File name badge */}
          {currentName && (
            <Box sx={{
              px: 1, py: 0.25, borderRadius: 1, fontSize: '0.65rem',
              bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: '0 1px 5px rgba(0,0,0,0.4)',
              color: 'text.secondary', textAlign: 'center',
              maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              <Typography component="span" sx={{ fontSize: '0.65rem', color: 'text.disabled', mr: 0.4 }}>
                MAP
              </Typography>
              {currentName}
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {/* Overpass — open/save/viewer now live in the top-bar File menu */}
            <Tooltip title="Overpass Query Explorer" placement="left">
              <IconButton
                size="small"
                onClick={() => setOverpassOpen(true)}
                sx={{
                  bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.15)',
                  boxShadow: '0 1px 5px rgba(0,0,0,0.4)', borderRadius: 1,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <TravelExploreIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Box>

      {/* Overpass fullscreen dialog */}
      <input
        ref={geoInputRef}
        type="file"
        accept=".gpx,.geojson,.json,application/gpx+xml,application/geo+json"
        style={{ display: 'none' }}
        onChange={handleGeoFile}
      />

      <GeoExportDialog
        open={geoExportOpen}
        nodes={nodes}
        currentName={currentName ?? undefined}
        onClose={() => setGeoExportOpen(false)}
      />

      <OverpassDialog
        open={overpassOpen}
        onClose={() => setOverpassOpen(false)}
        onImport={handleOverpassImport}
        initialCenter={MAP_CENTER}
      />

      {/* Route builder dialog (hidden while picking a point on the map) */}
      <RouteDialog
        open={routeOpen && routePicking === null}
        draft={routeDraft}
        nodes={nodes}
        busy={routeBusy}
        error={routeError}
        onModeChange={handleRouteMode}
        onSetEndpoint={handleRouteEndpoint}
        onPickOnMap={setRoutePicking}
        onConfirm={handleRouteConfirm}
        onClose={() => setRouteOpen(false)}
      />

      {/* Right: Properties inspector */}
      {inspectorOpen && <MapPropertiesPanel
        node={selectedNode ?? null}
        selectedNodes={selectedNodes}
        onUpdate={updateLayer}
        onUpdateMany={updateLayers}
        onShowInfo={n => setInfoNodeId(n.id)}
        collectionEditingId={collectionEditingId}
        onStartCollectionEditing={id => setCollectionEditingId(id)}
        onStopCollectionEditing={() => setCollectionEditingId(null)}
      />}

      {/* Info / description viewer (compact card or fullscreen) */}
      <InfoView node={infoNode} onClose={() => setInfoNodeId(null)} />

      {/* Split / extract segment dialog */}
      <SplitPathDialog
        open={splitNode !== null}
        onClose={() => setSplitNode(null)}
        node={splitNode}
        onExtract={handleSplitExtract}
      />

      {/* Open map dialog */}
      <ServerFileBrowser
        open={openDialog}
        mode="open"
        title="Open Map"
        extension={MAP_EXT}
        storageKey="map.serverFileBrowser.dir"
        onClose={() => setOpenDialog(false)}
        onOpen={handleOpen}
        onDone={name => { setOpenDialog(false); setToast(`Opened "${name}"`) }}
      />

      {/* Save map dialog */}
      <ServerFileBrowser
        open={saveDialog}
        mode="save"
        title="Save Map"
        extension={MAP_EXT}
        defaultName={currentName ?? 'untitled'}
        storageKey="map.serverFileBrowser.dir"
        onClose={() => setSaveDialog(false)}
        onSave={handleSave}
        onDone={() => setSaveDialog(false)}
      />

      {/* Toast */}
      <Snackbar
        open={toast !== null}
        autoHideDuration={2500}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  )
}
