import { useEffect, useMemo, useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Checkbox,
  ToggleButtonGroup, ToggleButton, Box, Typography, IconButton,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import PlaceIcon from '@mui/icons-material/Place'
import TimelineIcon from '@mui/icons-material/Timeline'
import PentagonIcon from '@mui/icons-material/Pentagon'
import PanoramaFishEyeIcon from '@mui/icons-material/PanoramaFishEye'
import FolderIcon from '@mui/icons-material/Folder'
import AltRouteIcon from '@mui/icons-material/AltRoute'
import type { MapNode, MapNodeType } from '../map/types'
import { filterSelected, countGeometries, nodesToGeoJSON, nodesToGPX } from '../map/geoExporter'
import { downloadText } from '../io/exportGraphics'

type Format = 'geojson' | 'gpx'

const iconFor = (t: MapNodeType) => {
  switch (t) {
    case 'marker': return <PlaceIcon fontSize="small" />
    case 'polyline': return <TimelineIcon fontSize="small" />
    case 'polygon': return <PentagonIcon fontSize="small" />
    case 'circle': return <PanoramaFishEyeIcon fontSize="small" />
    case 'route': return <AltRouteIcon fontSize="small" />
    case 'group': return <FolderIcon fontSize="small" />
    default: return null
  }
}

/** Leaf (non-group) descendant ids of a node. Export decisions rest on these. */
function leafIds(node: MapNode, acc: string[] = []): string[] {
  if (node.type === 'group') (node.children ?? []).forEach((c) => leafIds(c, acc))
  else acc.push(node.id)
  return acc
}

/** Checkbox state of a node from its leaf-descendant selection. */
function checkState(node: MapNode, sel: Set<string>): { checked: boolean; indeterminate: boolean } {
  if (node.type !== 'group') return { checked: sel.has(node.id), indeterminate: false }
  const leaves = leafIds(node)
  const on = leaves.filter((id) => sel.has(id)).length
  return { checked: on > 0 && on === leaves.length, indeterminate: on > 0 && on < leaves.length }
}

// Keep only exportable geometry: drop tile-layers everywhere and prune groups
// that end up with no geometry (e.g. the default empty "Layers" root).
function exportable(nodes: MapNode[]): MapNode[] {
  const out: MapNode[] = []
  for (const n of nodes) {
    if (n.type === 'tile-layer') continue
    if (n.type === 'group') {
      const kids = exportable(n.children ?? [])
      if (kids.length) out.push({ ...n, children: kids })
    } else {
      out.push(n)
    }
  }
  return out
}

const TreeRow: React.FC<{
  node: MapNode; depth: number; selected: Set<string>; onToggle: (n: MapNode) => void
}> = ({ node, depth, selected, onToggle }) => {
  const st = checkState(node, selected)
  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', pl: depth * 2 }}>
        <Checkbox size="small" checked={st.checked} indeterminate={st.indeterminate} onChange={() => onToggle(node)} sx={{ p: 0.5 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>{iconFor(node.type)}</Box>
        <Typography variant="body2" sx={{ ml: 0.5 }} noWrap>{node.name}</Typography>
      </Box>
      {node.type === 'group' && (node.children ?? []).map((c) => (
        <TreeRow key={c.id} node={c} depth={depth + 1} selected={selected} onToggle={onToggle} />
      ))}
    </>
  )
}

export const GeoExportDialog: React.FC<{
  open: boolean
  nodes: MapNode[]
  currentName?: string
  onClose: () => void
}> = ({ open, nodes, currentName, onClose }) => {
  const roots = useMemo(() => exportable(nodes), [nodes])
  const [format, setFormat] = useState<Format>('geojson')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const allLeaves = useMemo(() => roots.flatMap((n) => leafIds(n)), [roots])

  useEffect(() => {
    if (open) setSelected(new Set(allLeaves))
  }, [open, allLeaves])

  // Toggle a leaf, or a group's whole set of leaf descendants (based on state).
  const toggle = (n: MapNode) => setSelected((prev) => {
    const next = new Set(prev)
    if (n.type === 'group') {
      const leaves = leafIds(n)
      const allOn = leaves.length > 0 && leaves.every((id) => prev.has(id))
      leaves.forEach((id) => { if (allOn) next.delete(id); else next.add(id) })
    } else {
      if (prev.has(n.id)) next.delete(n.id); else next.add(n.id)
    }
    return next
  })

  const selectedNodes = useMemo(() => filterSelected(roots, selected), [roots, selected])
  const count = countGeometries(selectedNodes)

  const doExport = () => {
    const base = (currentName || 'map').replace(/\.[^.]+$/, '')
    if (format === 'geojson') downloadText(nodesToGeoJSON(selectedNodes), `${base}.geojson`, 'application/geo+json;charset=utf-8')
    else downloadText(nodesToGPX(selectedNodes), `${base}.gpx`, 'application/gpx+xml;charset=utf-8')
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        Eksport GPX / GeoJSON
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <ToggleButtonGroup exclusive size="small" value={format} onChange={(_, v) => v && setFormat(v)} sx={{ mb: 1.5 }}>
          <ToggleButton value="geojson">GeoJSON</ToggleButton>
          <ToggleButton value="gpx">GPX</ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
            Wybierz elementy do eksportu
          </Typography>
          <Button size="small" onClick={() => setSelected(new Set(allLeaves))}>Wszystko</Button>
          <Button size="small" onClick={() => setSelected(new Set())}>Nic</Button>
        </Box>

        <Box sx={{ maxHeight: 340, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1, p: 0.5 }}>
          {roots.length === 0
            ? <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>Brak elementów na mapie.</Typography>
            : roots.map((n) => <TreeRow key={n.id} node={n} depth={0} selected={selected} onToggle={toggle} />)}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Anuluj</Button>
        <Button variant="contained" onClick={doExport} disabled={count === 0}>
          Eksportuj ({count})
        </Button>
      </DialogActions>
    </Dialog>
  )
}
