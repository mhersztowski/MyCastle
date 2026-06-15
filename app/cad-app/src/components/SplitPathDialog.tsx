import { useState, useMemo, useRef, useEffect } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Slider from '@mui/material/Slider'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import ContentCutIcon from '@mui/icons-material/ContentCut'
import { MapContainer, TileLayer, Polyline } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapNode } from '../map/types'

// ── helpers ───────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9) }

type LatLng = [number, number]

interface Segment { positions: LatLng[]; color?: string; weight?: number }

// Recursively collect all geometry from a node (for preview rendering)
function nodeGeometry(node: MapNode): Segment[] {
  if (node.type === 'polyline' || node.type === 'polygon') {
    return [{ positions: (node.positions ?? []) as LatLng[], color: node.color, weight: node.weight }]
  }
  if (node.type === 'group') {
    return (node.children ?? []).flatMap(c => nodeGeometry(c))
  }
  return []
}

function computeBounds(points: LatLng[]): [LatLng, LatLng] | null {
  if (!points.length) return null
  const lats = points.map(p => p[0])
  const lngs = points.map(p => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  // Prevent zero-size bounds (single point)
  const padLat = Math.max((maxLat - minLat) * 0.1, 0.001)
  const padLng = Math.max((maxLng - minLng) * 0.1, 0.001)
  return [[minLat - padLat, minLng - padLng], [maxLat + padLat, maxLng + padLng]]
}

// ── SplitPathDialog ───────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  node: MapNode | null
  onExtract: (newNode: MapNode) => void
}

export function SplitPathDialog({ open, onClose, node, onExtract }: Props) {
  const [range, setRange] = useState<[number, number]>([0, 100])
  const [name, setName] = useState('')
  const mapKey = useRef(`split-map-${Date.now()}`).current

  const isGroup = node?.type === 'group'

  // For group: geometry per direct child (each child is one selectable unit)
  const childGeometry = useMemo((): Segment[][] => {
    if (!node || !isGroup) return []
    return (node.children ?? []).map(c => nodeGeometry(c))
  }, [node, isGroup])

  // For polyline/polygon: geometry of the node itself
  const leafSegments = useMemo((): Segment[] => {
    if (!node || isGroup) return []
    return nodeGeometry(node)
  }, [node, isGroup])

  // total units: direct children count (group) or point count (polyline)
  const total = isGroup ? childGeometry.length : (leafSegments[0]?.positions.length ?? 0)

  // Map 0–100 slider to actual indices
  const fromIdx = Math.round((range[0] / 100) * Math.max(total - 1, 0))
  const toIdx   = Math.round((range[1] / 100) * Math.max(total - 1, 0))

  // Highlighted geometry for preview
  const selectedSegments = useMemo((): Segment[] => {
    if (isGroup) return childGeometry.slice(fromIdx, toIdx + 1).flat()
    const pts = leafSegments[0]?.positions ?? []
    return [{ positions: pts.slice(fromIdx, toIdx + 1), color: leafSegments[0]?.color, weight: leafSegments[0]?.weight }]
  }, [isGroup, childGeometry, leafSegments, fromIdx, toIdx])

  // All geometry (for dim background and bounds)
  const allSegments = isGroup ? childGeometry.flat() : leafSegments
  const allPoints = useMemo(() => allSegments.flatMap(s => s.positions), [allSegments])
  const bounds = useMemo(() => computeBounds(allPoints), [allPoints])

  useEffect(() => {
    if (node && open) {
      setRange([0, 100])
      setName(`${node.name} – segment`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id, open])

  if (!node || !bounds) return null

  const selectedPtCount = selectedSegments.reduce((acc, s) => acc + s.positions.length, 0)
  const canExtract = isGroup
    ? (toIdx >= fromIdx && childGeometry.slice(fromIdx, toIdx + 1).some(g => g.length > 0))
    : selectedPtCount >= 2

  const handleExtract = () => {
    if (!canExtract) return
    let newNode: MapNode

    if (isGroup && node.children) {
      // Take direct children as whole units — each child (even if itself a group) is kept intact
      newNode = {
        id: uid(),
        name: name.trim() || `${node.name} – segment`,
        type: 'group',
        visible: true,
        children: node.children.slice(fromIdx, toIdx + 1),
      }
    } else {
      const pts = (leafSegments[0]?.positions ?? []).slice(fromIdx, toIdx + 1)
      newNode = {
        id: uid(),
        name: name.trim() || `${node.name} – segment`,
        type: 'polyline',
        visible: true,
        positions: pts,
        color: node.color ?? leafSegments[0]?.color,
        weight: node.weight ?? leafSegments[0]?.weight,
      }
    }

    onExtract(newNode)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: '0.88rem', pb: 0.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <ContentCutIcon sx={{ fontSize: 17 }} />
        Extract segment — {node.name}
      </DialogTitle>

      <DialogContent sx={{ pt: '8px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>

        {/* Preview map */}
        <Box sx={{ height: 260, borderRadius: 1, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
          <MapContainer
            key={mapKey}
            bounds={bounds}
            boundsOptions={{ padding: [16, 16] }}
            style={{ width: '100%', height: '100%' }}
            scrollWheelZoom
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {/* Full path — dimmed */}
            {allSegments.map((s, i) => (
              <Polyline
                key={`full-${i}`}
                positions={s.positions}
                pathOptions={{ color: '#607d8b', weight: 2, opacity: 0.3 }}
              />
            ))}
            {/* Selected sub-segment — highlighted */}
            {selectedSegments.map((s, i) => (
              <Polyline
                key={`sel-${i}`}
                positions={s.positions}
                pathOptions={{
                  color: s.color ?? '#ffeb3b',
                  weight: (s.weight ?? 3) + 2,
                  opacity: 1,
                }}
              />
            ))}
          </MapContainer>
        </Box>

        {/* Range slider */}
        <Box sx={{ px: 1 }}>
          <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mb: 0.5 }}>
            {isGroup
              ? `Children ${fromIdx + 1}–${toIdx + 1} of ${total} (${toIdx - fromIdx + 1} selected)`
              : `Points ${fromIdx}–${toIdx} of ${Math.max(total - 1, 0)}`}
            {canExtract && !isGroup && (
              <Box component="span" sx={{ ml: 1.5, color: '#ffeb3b', fontWeight: 600 }}>
                {selectedPtCount} pts selected
              </Box>
            )}
          </Typography>
          <Slider
            value={range}
            onChange={(_, v) => setRange(v as [number, number])}
            valueLabelDisplay="auto"
            valueLabelFormat={v => `${v}%`}
            disableSwap
            sx={{
              color: '#ffeb3b',
              '& .MuiSlider-thumb': { width: 14, height: 14 },
              '& .MuiSlider-track': { height: 4 },
            }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: -0.5 }}>
            <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>Start</Typography>
            <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>End</Typography>
          </Box>
        </Box>

        {/* Segment name */}
        <TextField
          label="Segment name"
          value={name}
          onChange={e => setName(e.target.value)}
          size="small"
          fullWidth
          onKeyDown={e => { if (e.key === 'Enter' && canExtract) handleExtract() }}
        />
      </DialogContent>

      <DialogActions sx={{ px: 2, pb: 1.5 }}>
        <Button onClick={onClose} size="small" sx={{ textTransform: 'none' }}>Cancel</Button>
        <Button
          onClick={handleExtract}
          variant="contained"
          size="small"
          disabled={!canExtract}
          startIcon={<ContentCutIcon sx={{ fontSize: 14 }} />}
          sx={{ textTransform: 'none' }}
        >
          Extract Segment
        </Button>
      </DialogActions>
    </Dialog>
  )
}
