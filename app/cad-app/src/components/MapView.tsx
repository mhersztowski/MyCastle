import { useState, useCallback, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Snackbar from '@mui/material/Snackbar'
import TravelExploreIcon from '@mui/icons-material/TravelExplore'
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined'
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined'
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  Polygon,
  Polyline,
  Circle,
  LayerGroup,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { MapHierarchyPanel } from './MapHierarchyPanel'
import { MapPropertiesPanel } from './MapPropertiesPanel'
import { MapDrawingLayer, MapDrawingToolbar, haversineM, type DrawTool } from './MapDrawing'
import { MapEditLayer } from './MapEditLayer'
import { OverpassDialog } from './OverpassDialog'
import { SplitPathDialog } from './SplitPathDialog'
import { ServerFileBrowser } from './ServerFileBrowser'
import { readFileAt, writeFileAt, MAP_EXT } from '../vfs/cadProjectApi'
import { useMapLayers } from '../map/useMapLayers'
import type { MapNode } from '../map/types'

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

// ── Recursive layer renderer ──────────────────────────────────────────────────

function renderMapNode(node: MapNode): ReactNode {
  if (!node.visible) return null

  switch (node.type) {
    case 'tile-layer':
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
        >
          {node.popup ? <Popup><pre style={{ margin: 0, fontSize: '0.72rem' }}>{node.popup}</pre></Popup> : null}
        </CircleMarker>
      )
    case 'polygon':
      if (!node.positions?.length) return null
      return (
        <Polygon
          key={node.id}
          positions={node.positions}
          pathOptions={{ color: node.color ?? '#4fc3f7', fillOpacity: node.fillOpacity ?? 0.3, weight: node.weight ?? 2 }}
        />
      )
    case 'polyline':
      if (!node.positions?.length) return null
      return (
        <Polyline
          key={node.id}
          positions={node.positions}
          pathOptions={{ color: node.color ?? '#ff7043', weight: node.weight ?? 3 }}
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
        />
      )
    case 'group':
      if (!node.children?.length) return null
      return (
        <LayerGroup key={node.id}>
          {node.children.map(renderMapNode)}
        </LayerGroup>
      )
    default:
      return null
  }
}

// ── MapView ───────────────────────────────────────────────────────────────────

export function MapView() {
  const {
    nodes, selectedId, selectedIds, selectedNode,
    toggleSelect,
    addLayer, placeNode, deleteLayer, renameLayer, toggleVisibility, updateLayer, updateLayers, importAsGroup, addSibling, loadNodes,
  } = useMapLayers()

  const selectedNodes = collectNodes(nodes, selectedIds)

  // ── file state ─────────────────────────────────────────────────────────────
  const [openDialog, setOpenDialog]   = useState(false)
  const [saveDialog, setSaveDialog]   = useState(false)
  const [currentName, setCurrentName] = useState<string | null>(null)
  const [toast, setToast]             = useState<string | null>(null)

  const handleOpen = useCallback(async (dir: string, name: string) => {
    const text = await readFileAt(dir, name, MAP_EXT)
    loadNodes(deserializeMap(text))
    setCurrentName(name)
  }, [loadNodes])

  const handleSave = useCallback(async (dir: string, name: string) => {
    await writeFileAt(dir, name, MAP_EXT, serializeMap(nodes))
    setCurrentName(name)
    setToast(`Saved "${name}"`)
  }, [nodes])

  const [overpassOpen, setOverpassOpen] = useState(false)
  const [splitNode, setSplitNode] = useState<MapNode | null>(null)

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

  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left: Hierarchy panel */}
      <MapHierarchyPanel
        nodes={nodes}
        selectedId={selectedId}
        selectedIds={selectedIds}
        onSelect={toggleSelect}
        onToggleVisibility={toggleVisibility}
        onRename={renameLayer}
        onDelete={deleteLayer}
        onAdd={addLayer}
        onSplit={handleSplitOpen}
      />

      {/* Center: Leaflet map */}
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <MapContainer
          center={MAP_CENTER}
          zoom={13}
          style={MAP_STYLE}
          scrollWheelZoom
          doubleClickZoom={activeTool === 'select'}
        >
          {nodes.map(renderMapNode)}
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

        {/* Left: draw tools toolbar */}
        <MapDrawingToolbar
          activeTool={activeTool}
          drawingPts={drawingPts}
          onSelectTool={handleSelectTool}
          onFinish={finishDrawing}
          onCancel={cancelDrawing}
          onEscapeKey={cancelDrawing}
        />

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
            {/* Open */}
            <Tooltip title="Open map from server" placement="left">
              <IconButton
                size="small"
                onClick={() => setOpenDialog(true)}
                sx={{
                  bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.15)',
                  boxShadow: '0 1px 5px rgba(0,0,0,0.4)', borderRadius: 1,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <FolderOpenOutlinedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>

            {/* Save */}
            <Tooltip title="Save map to server" placement="left">
              <IconButton
                size="small"
                onClick={() => setSaveDialog(true)}
                sx={{
                  bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.15)',
                  boxShadow: '0 1px 5px rgba(0,0,0,0.4)', borderRadius: 1,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <SaveOutlinedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>

            {/* Overpass */}
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
      <OverpassDialog
        open={overpassOpen}
        onClose={() => setOverpassOpen(false)}
        onImport={handleOverpassImport}
        initialCenter={MAP_CENTER}
      />

      {/* Right: Properties inspector */}
      <MapPropertiesPanel
        node={selectedNode ?? null}
        selectedNodes={selectedNodes}
        onUpdate={updateLayer}
        onUpdateMany={updateLayers}
      />

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
