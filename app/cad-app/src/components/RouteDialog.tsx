import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import RoomIcon from '@mui/icons-material/Room'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk'
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike'
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar'
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus'
import TrainIcon from '@mui/icons-material/Train'
import FlightIcon from '@mui/icons-material/Flight'
import type { MapNode, RoutePoint, TravelMode } from '../map/types'
import { TRAVEL_MODE_LIST, TRAVEL_MODES } from '../map/routing'

// ── travel-mode icon resolver ───────────────────────────────────────────────────

const MODE_ICONS: Record<string, typeof DirectionsWalkIcon> = {
  DirectionsWalk: DirectionsWalkIcon,
  DirectionsBike: DirectionsBikeIcon,
  DirectionsCar: DirectionsCarIcon,
  DirectionsBus: DirectionsBusIcon,
  Train: TrainIcon,
  Flight: FlightIcon,
}

function ModeIcon({ name, size = 18 }: { name: string; size?: number }) {
  const Icon = MODE_ICONS[name] ?? DirectionsCarIcon
  return <Icon sx={{ fontSize: size }} />
}

// ── point collection (markers & circles from the hierarchy) ─────────────────────

interface PointOption { id: string; name: string; lat: number; lng: number }

function collectPoints(nodes: MapNode[], acc: PointOption[] = []): PointOption[] {
  for (const n of nodes) {
    if ((n.type === 'marker' || n.type === 'circle') && n.lat != null && n.lng != null) {
      acc.push({ id: n.id, name: n.name, lat: n.lat, lng: n.lng })
    }
    if (n.children) collectPoints(n.children, acc)
  }
  return acc
}

// ── draft shape ─────────────────────────────────────────────────────────────────

export interface RouteDraft {
  mode: TravelMode
  from: RoutePoint | null
  to: RoutePoint | null
}

interface Props {
  open: boolean
  draft: RouteDraft
  nodes: MapNode[]
  busy: boolean
  error: string | null
  onModeChange: (m: TravelMode) => void
  onSetEndpoint: (which: 'from' | 'to', point: RoutePoint | null) => void
  onPickOnMap: (which: 'from' | 'to') => void
  onConfirm: () => void
  onClose: () => void
}

// ── endpoint row ────────────────────────────────────────────────────────────────

function EndpointRow({
  which, label, value, points, onPickOnMap, onSelectPoint, onClear,
}: {
  which: 'from' | 'to'
  label: string
  value: RoutePoint | null
  points: PointOption[]
  onPickOnMap: (which: 'from' | 'to') => void
  onSelectPoint: (which: 'from' | 'to', p: PointOption) => void
  onClear: (which: 'from' | 'to') => void
}) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', mb: 0.5 }}>
        {label}
      </Typography>

      {/* current value */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, mb: 0.75,
        borderRadius: 1, border: '1px solid rgba(255,255,255,0.12)',
        bgcolor: value ? 'rgba(79,195,247,0.08)' : 'transparent',
      }}>
        <RoomIcon sx={{ fontSize: 16, color: value ? '#4fc3f7' : 'text.disabled' }} />
        <Typography sx={{ fontSize: '0.75rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: value ? 'text.primary' : 'text.disabled' }}>
          {value ? (value.label || `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}`) : 'Not set'}
        </Typography>
        {value && (
          <Button size="small" color="inherit" onClick={() => onClear(which)} sx={{ minWidth: 0, fontSize: '0.65rem', textTransform: 'none', px: 0.75 }}>
            Clear
          </Button>
        )}
      </Box>

      {/* pickers */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<MyLocationIcon sx={{ fontSize: 15 }} />}
          onClick={() => onPickOnMap(which)}
          sx={{ textTransform: 'none', fontSize: '0.72rem', flexShrink: 0 }}
        >
          Pick on map
        </Button>
        <Select
          size="small"
          displayEmpty
          value=""
          onChange={e => {
            const p = points.find(pt => pt.id === e.target.value)
            if (p) onSelectPoint(which, p)
          }}
          disabled={points.length === 0}
          sx={{ flex: 1, fontSize: '0.72rem', '& .MuiSelect-select': { py: 0.5 } }}
          renderValue={() => (
            <Typography sx={{ fontSize: '0.72rem', color: 'text.disabled' }}>
              {points.length ? 'From a layer…' : 'No points in layers'}
            </Typography>
          )}
        >
          {points.map(p => (
            <MenuItem key={p.id} value={p.id} sx={{ fontSize: '0.75rem' }}>
              {p.name}
            </MenuItem>
          ))}
        </Select>
      </Box>
    </Box>
  )
}

// ── RouteDialog ─────────────────────────────────────────────────────────────────

export function RouteDialog({
  open, draft, nodes, busy, error,
  onModeChange, onSetEndpoint, onPickOnMap, onConfirm, onClose,
}: Props) {
  const points = collectPoints(nodes)
  const meta = TRAVEL_MODES[draft.mode]
  const isStraight = meta.osrmProfile == null
  const canConfirm = Boolean(draft.from && draft.to) && !busy

  const handleSelectPoint = (which: 'from' | 'to', p: PointOption) => {
    onSetEndpoint(which, { lat: p.lat, lng: p.lng, label: p.name })
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1, fontSize: '1rem' }}>
        <ModeIcon name={meta.icon} size={20} />
        Add Route
      </DialogTitle>

      <DialogContent sx={{ pt: '8px !important' }}>
        {error && <Alert severity="error" sx={{ mb: 1.5, fontSize: '0.74rem' }}>{error}</Alert>}

        {/* travel mode */}
        <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', mb: 0.5 }}>
          Travel mode
        </Typography>
        <ToggleButtonGroup
          value={draft.mode}
          exclusive
          size="small"
          onChange={(_, v: TravelMode | null) => v && onModeChange(v)}
          sx={{ mb: 2, flexWrap: 'wrap', gap: 0.5, '& .MuiToggleButton-root': { px: 1, py: 0.4, border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px !important' } }}
        >
          {TRAVEL_MODE_LIST.map(m => (
            <ToggleButton
              key={m.key}
              value={m.key}
              sx={{
                textTransform: 'none', fontSize: '0.7rem', gap: 0.5,
                color: draft.mode === m.key ? m.color : 'text.secondary',
                '&.Mui-selected': { bgcolor: m.color + '22', color: m.color, '&:hover': { bgcolor: m.color + '33' } },
              }}
            >
              <ModeIcon name={m.icon} size={16} />
              {m.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* endpoints */}
        <EndpointRow
          which="from" label="Start point" value={draft.from} points={points}
          onPickOnMap={onPickOnMap} onSelectPoint={handleSelectPoint}
          onClear={w => onSetEndpoint(w, null)}
        />
        <EndpointRow
          which="to" label="End point" value={draft.to} points={points}
          onPickOnMap={onPickOnMap} onSelectPoint={handleSelectPoint}
          onClear={w => onSetEndpoint(w, null)}
        />

        {isStraight && (
          <Tooltip title="No road routing for this mode — a straight line between the two points is drawn.">
            <Typography sx={{ fontSize: '0.66rem', color: 'text.disabled', mt: 0.5 }}>
              {meta.label}: drawn as a straight line (no road routing).
            </Typography>
          </Tooltip>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button onClick={onClose} size="small" color="inherit" disabled={busy}>Cancel</Button>
        <Button
          variant="contained"
          size="small"
          onClick={onConfirm}
          disabled={!canConfirm}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {busy ? 'Routing…' : 'Add Route'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
