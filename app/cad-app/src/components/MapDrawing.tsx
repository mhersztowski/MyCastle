import { useEffect } from 'react'
import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'
import IconButton from '@mui/material/IconButton'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import NearMeIcon from '@mui/icons-material/NearMe'
import PlaceIcon from '@mui/icons-material/Place'
import TimelineIcon from '@mui/icons-material/Timeline'
import CropSquareIcon from '@mui/icons-material/CropSquare'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import { useMapEvents, Polyline, CircleMarker, Circle } from 'react-leaflet'

// ── types ─────────────────────────────────────────────────────────────────────

export type DrawTool = 'select' | 'marker' | 'polyline' | 'polygon' | 'circle'

type LatLng = [number, number]

// ── MapDrawingLayer ────────────────────────────────────────────────────────────
// Must be rendered inside <MapContainer>

interface LayerProps {
  activeTool: DrawTool
  drawingPts: LatLng[]
  previewPt: LatLng | null
  onMapClick: (pt: LatLng) => void
  onMouseMove: (pt: LatLng) => void
}

export function MapDrawingLayer({ activeTool, drawingPts, previewPt, onMapClick, onMouseMove }: LayerProps) {
  useMapEvents({
    click(e) {
      if (activeTool !== 'select') {
        onMapClick([e.latlng.lat, e.latlng.lng])
      }
    },
    mousemove(e) {
      onMouseMove([e.latlng.lat, e.latlng.lng])
    },
  })

  if (activeTool === 'select' || drawingPts.length === 0) return null

  const cursorPt = previewPt ?? drawingPts[drawingPts.length - 1]

  // ── marker: just show a preview dot ───────────────────────────────────────
  if (activeTool === 'marker') {
    return (
      <CircleMarker
        center={cursorPt}
        radius={8}
        pathOptions={{ color: '#ef5350', fillColor: '#ef5350', fillOpacity: 0.6, weight: 2, dashArray: '4' }}
      />
    )
  }

  // ── circle: first pt = center, show radius preview ────────────────────────
  if (activeTool === 'circle') {
    const center = drawingPts[0]
    const radius = previewPt ? haversineM(center, previewPt) : 0
    return (
      <>
        <CircleMarker center={center} radius={5} pathOptions={{ color: '#ce93d8', fillColor: '#ce93d8', fillOpacity: 0.9 }} />
        {radius > 0 && (
          <Circle center={center} radius={radius} pathOptions={{ color: '#ce93d8', weight: 2, fillOpacity: 0.15, dashArray: '6' }} />
        )}
        {previewPt && (
          <Polyline positions={[center, previewPt]} pathOptions={{ color: '#ce93d8', weight: 1, dashArray: '4', opacity: 0.7 }} />
        )}
      </>
    )
  }

  // ── polyline / polygon ────────────────────────────────────────────────────
  const pathPts = previewPt ? [...drawingPts, previewPt] : drawingPts
  const color = activeTool === 'polygon' ? '#4fc3f7' : '#66bb6a'
  const closingPts: LatLng[] = activeTool === 'polygon' && previewPt
    ? [previewPt, drawingPts[0]]
    : []

  return (
    <>
      {/* committed points */}
      {drawingPts.map((pt, i) => (
        <CircleMarker key={i} center={pt} radius={4}
          pathOptions={{ color, fillColor: color, fillOpacity: 1, weight: 1 }}
        />
      ))}
      {/* path built so far + rubber-band to cursor */}
      {pathPts.length >= 2 && (
        <Polyline positions={pathPts} pathOptions={{ color, weight: 2.5, opacity: 0.9 }} />
      )}
      {/* closing edge for polygon */}
      {closingPts.length === 2 && drawingPts.length >= 2 && (
        <Polyline positions={closingPts} pathOptions={{ color, weight: 1.5, dashArray: '6', opacity: 0.6 }} />
      )}
    </>
  )
}

// ── MapDrawingToolbar ──────────────────────────────────────────────────────────
// Floating toolbar rendered OUTSIDE MapContainer (no Leaflet context needed)

interface ToolbarProps {
  activeTool: DrawTool
  drawingPts: LatLng[]
  onSelectTool: (t: DrawTool) => void
  onFinish: () => void
  onCancel: () => void
  onEscapeKey?: () => void
}

const TOOLS: Array<{ tool: DrawTool; icon: React.ReactNode; label: string; key: string }> = [
  { tool: 'select',   icon: <NearMeIcon sx={{ fontSize: 16 }} />,              label: 'Select (S)',   key: 'S' },
  { tool: 'marker',   icon: <PlaceIcon sx={{ fontSize: 16 }} />,               label: 'Marker (M)',   key: 'M' },
  { tool: 'polyline', icon: <TimelineIcon sx={{ fontSize: 16 }} />,            label: 'Polyline (L)', key: 'L' },
  { tool: 'polygon',  icon: <CropSquareIcon sx={{ fontSize: 16 }} />,          label: 'Polygon (P)',  key: 'P' },
  { tool: 'circle',   icon: <RadioButtonUncheckedIcon sx={{ fontSize: 16 }} />, label: 'Circle (C)',  key: 'C' },
]

const TOOL_COLOR: Record<DrawTool, string> = {
  select:   '#90a4ae',
  marker:   '#ef5350',
  polyline: '#66bb6a',
  polygon:  '#4fc3f7',
  circle:   '#ce93d8',
}

export function MapDrawingToolbar({ activeTool, drawingPts, onSelectTool, onFinish, onCancel, onEscapeKey }: ToolbarProps) {
  const isDrawing = activeTool !== 'select' && drawingPts.length > 0
  const canFinish = isDrawing && (
    (activeTool === 'polyline' && drawingPts.length >= 2) ||
    (activeTool === 'polygon'  && drawingPts.length >= 3) ||
    activeTool === 'circle'
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Escape') { onEscapeKey?.(); return }
      if (e.key === 'Enter' && canFinish) { onFinish(); return }
      const t = TOOLS.find(t => t.key === e.key.toUpperCase())
      if (t && !isDrawing) onSelectTool(t.tool)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onSelectTool, onFinish, onEscapeKey, isDrawing, canFinish])

  return (
    <Box sx={{
      position: 'absolute',
      left: 10,
      top: '50%',
      transform: 'translateY(-50%)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      gap: 0.25,
      bgcolor: 'background.paper',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 1.5,
      boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
      p: 0.5,
    }}>
      {TOOLS.map(({ tool, icon, label }) => (
        <Tooltip key={tool} title={label} placement="right">
          <IconButton
            size="small"
            disabled={isDrawing && tool !== activeTool}
            onClick={() => onSelectTool(tool)}
            sx={{
              p: 0.6,
              borderRadius: 1,
              color: activeTool === tool ? TOOL_COLOR[tool] : 'text.secondary',
              bgcolor: activeTool === tool ? TOOL_COLOR[tool] + '22' : 'transparent',
              border: activeTool === tool ? `1px solid ${TOOL_COLOR[tool]}55` : '1px solid transparent',
              '&:hover:not(:disabled)': { bgcolor: TOOL_COLOR[tool] + '18' },
              '&.Mui-disabled': { opacity: 0.25 },
            }}
          >
            {icon}
          </IconButton>
        </Tooltip>
      ))}

      {/* Finish / Cancel when drawing */}
      {isDrawing && (
        <>
          <Divider sx={{ my: 0.25, opacity: 0.3 }} />
          {canFinish && (
            <Tooltip title="Finish (Enter)" placement="right">
              <IconButton
                size="small"
                onClick={onFinish}
                sx={{ p: 0.6, borderRadius: 1, color: '#66bb6a', '&:hover': { bgcolor: '#66bb6a22' } }}
              >
                <CheckIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Cancel (Esc)" placement="right">
            <IconButton
              size="small"
              onClick={onCancel}
              sx={{ p: 0.6, borderRadius: 1, color: '#ef5350', '&:hover': { bgcolor: '#ef535022' } }}
            >
              <CloseIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
          {/* point counter */}
          <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled', textAlign: 'center', px: 0.5 }}>
            {drawingPts.length} pt{drawingPts.length !== 1 ? 's' : ''}
          </Typography>
        </>
      )}
    </Box>
  )
}

// ── helpers ───────────────────────────────────────────────────────────────────

export function haversineM([lat1, lng1]: LatLng, [lat2, lng2]: LatLng): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
