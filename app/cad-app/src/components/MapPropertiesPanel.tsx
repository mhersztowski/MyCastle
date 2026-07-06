import { useState, useEffect, useCallback } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Slider from '@mui/material/Slider'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Tooltip from '@mui/material/Tooltip'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Button from '@mui/material/Button'
import VisibilityIcon from '@mui/icons-material/Visibility'
import type { MapNode, MapNodeType } from '../map/types'
import { TRAVEL_MODES, formatDistance, formatDuration } from '../map/routing'

// ── constants ─────────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<MapNodeType, string> = {
  'tile-layer': '#ffb74d',
  marker:       '#ef5350',
  polygon:      '#4fc3f7',
  polyline:     '#66bb6a',
  circle:       '#ce93d8',
  group:        '#78909c',
  route:        '#42a5f5',
  label:        '#ffd54f',
}

// ── small building blocks ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <Typography sx={{
      fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.09em', color: 'text.disabled', px: 1.5, pt: 1, pb: 0.25,
    }}>
      {children}
    </Typography>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.4, gap: 1 }}>
      <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', minWidth: 68, flexShrink: 0 }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {children}
      </Box>
    </Box>
  )
}

interface NumberInputProps {
  value: number | undefined
  placeholder?: number
  min?: number
  step?: number
  onChange: (v: number) => void
}
function NumberInput({ value, placeholder, min, step = 1, onChange }: NumberInputProps) {
  const [local, setLocal] = useState(String(value ?? placeholder ?? ''))
  useEffect(() => { setLocal(String(value ?? placeholder ?? '')) }, [value, placeholder])
  return (
    <TextField
      size="small"
      type="number"
      value={local}
      inputProps={{ min, step, style: { fontSize: '0.72rem', padding: '2px 6px', height: 'auto' } }}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => {
        const n = parseFloat(local)
        if (!isNaN(n)) onChange(n)
      }}
      sx={{ '& .MuiOutlinedInput-root': { height: 24 } }}
      fullWidth
    />
  )
}

interface TextInputProps { value: string | undefined; placeholder?: string; multiline?: boolean; rows?: number; onChange: (v: string) => void }
function TextInput({ value, placeholder, multiline, rows, onChange }: TextInputProps) {
  const [local, setLocal] = useState(value ?? '')
  useEffect(() => { setLocal(value ?? '') }, [value])
  return (
    <TextField
      size="small"
      multiline={multiline}
      rows={rows}
      value={local}
      placeholder={placeholder}
      inputProps={{ style: { fontSize: '0.72rem', ...(multiline ? {} : { padding: '2px 6px' }) } }}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => onChange(local)}
      sx={multiline ? {} : { '& .MuiOutlinedInput-root': { height: 24 } }}
      fullWidth
    />
  )
}

interface ColorPickerProps { value: string | undefined; fallback: string; onChange: (v: string) => void }
function ColorPicker({ value, fallback, onChange }: ColorPickerProps) {
  const current = value ?? fallback
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Tooltip title="Pick color">
        <Box
          component="label"
          sx={{ width: 22, height: 22, borderRadius: 0.5, border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', bgcolor: current, flexShrink: 0, display: 'block' }}
        >
          <input
            type="color"
            value={current}
            onChange={e => onChange(e.target.value)}
            style={{ opacity: 0, position: 'absolute', width: 0, height: 0 }}
          />
        </Box>
      </Tooltip>
      <Typography sx={{ fontSize: '0.68rem', fontFamily: 'monospace', color: 'text.secondary' }}>
        {current}
      </Typography>
    </Box>
  )
}

interface OpacitySliderProps { value: number | undefined; fallback: number; onChange: (v: number) => void }
function OpacitySlider({ value, fallback, onChange }: OpacitySliderProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Slider
        size="small"
        min={0} max={1} step={0.05}
        value={value ?? fallback}
        onChange={(_, v) => onChange(v as number)}
        sx={{ flex: 1, color: 'primary.main', py: 0.25 }}
      />
      <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', minWidth: 30, textAlign: 'right' }}>
        {((value ?? fallback) * 100).toFixed(0)}%
      </Typography>
    </Box>
  )
}

// ── positions editor ──────────────────────────────────────────────────────────

function positionsToText(positions: [number, number][]): string {
  return positions.map(([lat, lng]) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`).join('\n')
}

function textToPositions(text: string): [number, number][] | null {
  const lines = text.trim().split(/\n+/)
  const result: [number, number][] = []
  for (const line of lines) {
    const parts = line.trim().split(/[\s,]+/)
    const lat = parseFloat(parts[0])
    const lng = parseFloat(parts[1])
    if (isNaN(lat) || isNaN(lng)) return null
    result.push([lat, lng])
  }
  return result.length >= 2 ? result : null
}

interface PositionsEditorProps { positions: [number, number][]; onChange: (p: [number, number][]) => void }
function PositionsEditor({ positions, onChange }: PositionsEditorProps) {
  const [text, setText] = useState(() => positionsToText(positions))
  const [error, setError] = useState(false)
  useEffect(() => { setText(positionsToText(positions)); setError(false) }, [positions])

  const commit = () => {
    const parsed = textToPositions(text)
    if (parsed) { setError(false); onChange(parsed) }
    else { setError(true) }
  }

  return (
    <Box sx={{ px: 1.5, pb: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
        <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
          Coordinates (lat, lng per line)
        </Typography>
        <Typography sx={{ fontSize: '0.68rem', color: 'text.disabled' }}>
          {positions.length} pts
        </Typography>
      </Box>
      <TextField
        multiline
        rows={Math.min(positions.length, 8)}
        value={text}
        onChange={e => { setText(e.target.value); setError(false) }}
        onBlur={commit}
        error={error}
        helperText={error ? 'Invalid format' : undefined}
        fullWidth
        size="small"
        inputProps={{ style: { fontSize: '0.65rem', fontFamily: 'monospace', lineHeight: 1.4 } }}
      />
    </Box>
  )
}

// ── MultiSelectionPanel ────────────────────────────────────────────────────────

interface MultiProps {
  nodes: MapNode[]
  onUpdateMany: (ids: string[], changes: Partial<MapNode>) => void
}

function MultiSelectionPanel({ nodes, onUpdateMany }: MultiProps) {
  const ids = nodes.map(n => n.id)

  // Count types
  const typeCounts = nodes.reduce<Partial<Record<MapNode['type'], number>>>((acc, n) => {
    acc[n.type] = (acc[n.type] ?? 0) + 1
    return acc
  }, {})

  // Shared color: if all have same color → show it; else null
  const colors = [...new Set(nodes.map(n => n.color).filter(Boolean))]
  const sharedColor = colors.length === 1 ? colors[0]! : null

  // Which types are in selection (for conditional fields)
  const hasPath  = nodes.some(n => n.type === 'polyline' || n.type === 'polygon')
  const hasFill  = nodes.some(n => n.type === 'polygon'  || n.type === 'circle')
  const hasColor = nodes.some(n => n.type !== 'tile-layer' && n.type !== 'group')

  return (
    <>
      {/* Summary */}
      <Box sx={{ px: 1.5, pt: 1.25, pb: 0.75 }}>
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, mb: 0.75 }}>
          {nodes.length} nodes selected
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {(Object.entries(typeCounts) as [MapNode['type'], number][]).map(([type, count]) => (
            <Chip
              key={type}
              label={`${count} ${type}`}
              size="small"
              sx={{
                height: 16, fontSize: '0.6rem',
                bgcolor: TYPE_COLOR[type] + '22',
                color: TYPE_COLOR[type],
                border: `1px solid ${TYPE_COLOR[type]}44`,
                '& .MuiChip-label': { px: 0.75 },
              }}
            />
          ))}
        </Box>
      </Box>

      <Divider sx={{ opacity: 0.3 }} />

      {/* Shared appearance controls */}
      {hasColor && (<>
        <SectionLabel>Appearance</SectionLabel>
        <Row label="Color">
          <ColorPicker
            value={sharedColor ?? undefined}
            fallback="#90a4ae"
            onChange={v => onUpdateMany(ids, { color: v })}
          />
        </Row>
        {sharedColor == null && (
          <Box sx={{ px: 1.5, pb: 0.5 }}>
            <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled', fontStyle: 'italic' }}>
              Mixed colors — pick to apply to all
            </Typography>
          </Box>
        )}
      </>)}

      {hasPath && (
        <Row label="Width">
          <NumberInput
            value={undefined}
            placeholder={2}
            min={0.5}
            step={0.5}
            onChange={v => onUpdateMany(ids, { weight: v })}
          />
        </Row>
      )}

      {hasFill && (
        <Row label="Fill opacity">
          <OpacitySlider
            value={undefined}
            fallback={0.3}
            onChange={v => onUpdateMany(ids, { fillOpacity: v })}
          />
        </Row>
      )}

      <Divider sx={{ opacity: 0.3, mt: 0.5 }} />

      {/* Visibility */}
      <SectionLabel>Visibility</SectionLabel>
      <Box sx={{ px: 1.5, display: 'flex', gap: 1 }}>
        <Chip
          label="Show all"
          size="small"
          clickable
          onClick={() => onUpdateMany(ids, { visible: true })}
          sx={{ fontSize: '0.68rem', height: 22 }}
        />
        <Chip
          label="Hide all"
          size="small"
          clickable
          onClick={() => onUpdateMany(ids, { visible: false })}
          sx={{ fontSize: '0.68rem', height: 22 }}
        />
      </Box>
    </>
  )
}

// ── main component ────────────────────────────────────────────────────────────

interface Props {
  node: MapNode | null
  selectedNodes: MapNode[]
  onUpdate: (id: string, changes: Partial<MapNode>) => void
  onUpdateMany: (ids: string[], changes: Partial<MapNode>) => void
  onShowInfo?: (node: MapNode) => void
}

export function MapPropertiesPanel({ node, selectedNodes, onUpdate, onUpdateMany, onShowInfo }: Props) {
  const isMulti = selectedNodes.length > 1

  const upd = useCallback((changes: Partial<MapNode>) => {
    if (node) onUpdate(node.id, changes)
  }, [node, onUpdate])

  return (
    <Box sx={{
      width: 250,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      bgcolor: 'background.paper',
      borderLeft: '1px solid rgba(255,255,255,0.08)',
      overflow: 'hidden',
    }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <Box sx={{
        px: 1.5, height: 28, display: 'flex', alignItems: 'center', flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <Typography sx={{
          fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: 'text.secondary',
        }}>
          Inspector
        </Typography>
      </Box>

      {isMulti ? (
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <MultiSelectionPanel nodes={selectedNodes} onUpdateMany={onUpdateMany} />
        </Box>
      ) : !node ? (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
          <Typography sx={{ fontSize: '0.72rem', color: 'text.disabled', textAlign: 'center' }}>
            Select a layer in the hierarchy
          </Typography>
        </Box>
      ) : (
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {/* Node identity */}
          <Box sx={{ px: 1.5, pt: 1.25, pb: 1 }}>
            <Chip
              label={node.type}
              size="small"
              sx={{
                height: 16, fontSize: '0.6rem', mb: 0.75,
                bgcolor: TYPE_COLOR[node.type] + '22',
                color: TYPE_COLOR[node.type],
                border: `1px solid ${TYPE_COLOR[node.type]}55`,
                '& .MuiChip-label': { px: 0.75 },
              }}
            />
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, wordBreak: 'break-all' }}>
              {node.name}
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled', fontFamily: 'monospace', mt: 0.25 }}>
              {node.id}
            </Typography>
          </Box>

          <Divider sx={{ opacity: 0.3 }} />

          {/* ── tile-layer ────────────────────────────────── */}
          {node.type === 'tile-layer' && (<>
            <SectionLabel>Tile Source</SectionLabel>
            <Row label="URL">
              <TextInput value={node.url} placeholder="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" onChange={v => upd({ url: v })} />
            </Row>
            <Row label="Attribution">
              <TextInput value={node.attribution} onChange={v => upd({ attribution: v })} />
            </Row>
            <SectionLabel>Appearance</SectionLabel>
            <Row label="Opacity">
              <OpacitySlider value={node.opacity} fallback={1} onChange={v => upd({ opacity: v })} />
            </Row>
          </>)}

          {/* ── marker ───────────────────────────────────── */}
          {node.type === 'marker' && (<>
            <SectionLabel>Position</SectionLabel>
            <Row label="Latitude">
              <NumberInput value={node.lat} step={0.000001} onChange={v => upd({ lat: v })} />
            </Row>
            <Row label="Longitude">
              <NumberInput value={node.lng} step={0.000001} onChange={v => upd({ lng: v })} />
            </Row>
            <SectionLabel>Appearance</SectionLabel>
            <Row label="Color">
              <ColorPicker value={node.color} fallback="#ef5350" onChange={v => upd({ color: v })} />
            </Row>
            <SectionLabel>Popup</SectionLabel>
            <Box sx={{ px: 1.5, pb: 1 }}>
              <TextInput value={node.popup} multiline rows={4} onChange={v => upd({ popup: v || undefined })} />
            </Box>
          </>)}

          {/* ── label (markdown text on the map) ─────────── */}
          {node.type === 'label' && (<>
            <SectionLabel>Position</SectionLabel>
            <Row label="Latitude">
              <NumberInput value={node.lat} step={0.000001} onChange={v => upd({ lat: v })} />
            </Row>
            <Row label="Longitude">
              <NumberInput value={node.lng} step={0.000001} onChange={v => upd({ lng: v })} />
            </Row>
            <SectionLabel>Text (Markdown)</SectionLabel>
            <Box sx={{ px: 1.5, pb: 1 }}>
              <TextInput
                value={node.text}
                multiline
                rows={5}
                placeholder="# Title&#10;**bold**, *italic*, `code`, [link](https://…)"
                onChange={v => upd({ text: v })}
              />
            </Box>
            <SectionLabel>Appearance</SectionLabel>
            <Row label="Color">
              <ColorPicker value={node.color} fallback="#ffffff" onChange={v => upd({ color: v })} />
            </Row>
            <Row label="Font size">
              <NumberInput value={node.fontSize} placeholder={14} min={6} step={1} onChange={v => upd({ fontSize: v })} />
            </Row>
          </>)}

          {/* ── polyline ─────────────────────────────────── */}
          {node.type === 'polyline' && (<>
            <SectionLabel>Appearance</SectionLabel>
            <Row label="Color">
              <ColorPicker value={node.color} fallback="#66bb6a" onChange={v => upd({ color: v })} />
            </Row>
            <Row label="Width">
              <NumberInput value={node.weight} placeholder={3} min={0.5} step={0.5} onChange={v => upd({ weight: v })} />
            </Row>
            <Divider sx={{ opacity: 0.3, mx: 1.5, my: 0.5 }} />
            <SectionLabel>Path</SectionLabel>
            <PositionsEditor
              positions={(node.positions ?? []) as [number, number][]}
              onChange={p => upd({ positions: p })}
            />
          </>)}

          {/* ── polygon ──────────────────────────────────── */}
          {node.type === 'polygon' && (<>
            <SectionLabel>Appearance</SectionLabel>
            <Row label="Color">
              <ColorPicker value={node.color} fallback="#4fc3f7" onChange={v => upd({ color: v })} />
            </Row>
            <Row label="Fill opacity">
              <OpacitySlider value={node.fillOpacity} fallback={0.3} onChange={v => upd({ fillOpacity: v })} />
            </Row>
            <Row label="Border width">
              <NumberInput value={node.weight} placeholder={2} min={0} step={0.5} onChange={v => upd({ weight: v })} />
            </Row>
            <Divider sx={{ opacity: 0.3, mx: 1.5, my: 0.5 }} />
            <SectionLabel>Shape</SectionLabel>
            <PositionsEditor
              positions={(node.positions ?? []) as [number, number][]}
              onChange={p => upd({ positions: p })}
            />
          </>)}

          {/* ── circle ───────────────────────────────────── */}
          {node.type === 'circle' && (<>
            <SectionLabel>Position</SectionLabel>
            <Row label="Latitude">
              <NumberInput value={node.lat} step={0.000001} onChange={v => upd({ lat: v })} />
            </Row>
            <Row label="Longitude">
              <NumberInput value={node.lng} step={0.000001} onChange={v => upd({ lng: v })} />
            </Row>
            <SectionLabel>Geometry</SectionLabel>
            <Row label="Radius (m)">
              <NumberInput value={node.radius} placeholder={500} min={1} step={10} onChange={v => upd({ radius: v })} />
            </Row>
            <SectionLabel>Appearance</SectionLabel>
            <Row label="Color">
              <ColorPicker value={node.color} fallback="#66bb6a" onChange={v => upd({ color: v })} />
            </Row>
            <Row label="Fill opacity">
              <OpacitySlider value={node.fillOpacity} fallback={0.3} onChange={v => upd({ fillOpacity: v })} />
            </Row>
            <Row label="Border width">
              <NumberInput value={node.weight} placeholder={2} min={0} step={0.5} onChange={v => upd({ weight: v })} />
            </Row>
          </>)}

          {/* ── route ────────────────────────────────────── */}
          {node.type === 'route' && (<>
            <SectionLabel>Route</SectionLabel>
            <Row label="Mode">
              <Chip
                size="small"
                label={node.travelMode ? TRAVEL_MODES[node.travelMode].label : '—'}
                sx={{ height: 18, fontSize: '0.66rem' }}
              />
            </Row>
            <Row label="Distance">
              <Typography sx={{ fontSize: '0.72rem' }}>{formatDistance(node.distanceM)}</Typography>
            </Row>
            <Row label="Duration">
              <Typography sx={{ fontSize: '0.72rem' }}>{formatDuration(node.durationS)}</Typography>
            </Row>
            <Divider sx={{ opacity: 0.3, mx: 1.5, my: 0.5 }} />
            <SectionLabel>Appearance</SectionLabel>
            <Row label="Color">
              <ColorPicker value={node.color} fallback="#42a5f5" onChange={v => upd({ color: v })} />
            </Row>
            <Row label="Width">
              <NumberInput value={node.weight} placeholder={4} min={0.5} step={0.5} onChange={v => upd({ weight: v })} />
            </Row>
          </>)}

          {/* ── group ────────────────────────────────────── */}
          {node.type === 'group' && (<>
            <SectionLabel>Contents</SectionLabel>
            <Row label="Children">
              <Typography sx={{ fontSize: '0.72rem', color: 'text.primary' }}>
                {(node.children?.length ?? 0)} layer{(node.children?.length ?? 0) !== 1 ? 's' : ''}
              </Typography>
            </Row>
            {node.children && node.children.length > 0 && (
              <Box sx={{ px: 1.5, pb: 1 }}>
                {node.children.map(c => (
                  <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.2 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: TYPE_COLOR[c.type], flexShrink: 0 }} />
                    <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </>)}

          {/* ── description / info (all node types) ───────── */}
          <Divider sx={{ opacity: 0.3, mx: 1.5, my: 0.5 }} />
          <SectionLabel>Description</SectionLabel>
          <Row label="Source">
            <Select
              size="small"
              fullWidth
              value={node.infoType ?? 'markdown'}
              onChange={e => upd({ infoType: e.target.value as 'markdown' | 'url' })}
              sx={{ fontSize: '0.72rem', '& .MuiSelect-select': { py: 0.5 } }}
            >
              <MenuItem value="markdown" sx={{ fontSize: '0.75rem' }}>Markdown text</MenuItem>
              <MenuItem value="url" sx={{ fontSize: '0.75rem' }}>Web page (URL)</MenuItem>
            </Select>
          </Row>
          <Box sx={{ px: 1.5, py: 0.4 }}>
            {(node.infoType ?? 'markdown') === 'url' ? (
              <TextField
                size="small"
                fullWidth
                placeholder="https://example.com"
                value={node.info ?? ''}
                onChange={e => upd({ info: e.target.value })}
                slotProps={{ input: { sx: { fontSize: '0.72rem' } } }}
              />
            ) : (
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={3}
                maxRows={10}
                placeholder="# Title&#10;Some **markdown** description…"
                value={node.info ?? ''}
                onChange={e => upd({ info: e.target.value })}
                slotProps={{ input: { sx: { fontSize: '0.72rem', fontFamily: 'monospace', lineHeight: 1.5 } } }}
              />
            )}
          </Box>
          <Row label="Show info">
            <Select
              size="small"
              fullWidth
              value={node.showInfo ?? 'compact'}
              onChange={e => upd({ showInfo: e.target.value as 'compact' | 'fullscreen' })}
              sx={{ fontSize: '0.72rem', '& .MuiSelect-select': { py: 0.5 } }}
            >
              <MenuItem value="compact" sx={{ fontSize: '0.75rem' }}>Compact</MenuItem>
              <MenuItem value="fullscreen" sx={{ fontSize: '0.75rem' }}>Fullscreen</MenuItem>
            </Select>
          </Row>
          <Box sx={{ px: 1.5, pt: 0.4, pb: 1.25 }}>
            <Button
              size="small"
              fullWidth
              variant="outlined"
              startIcon={<VisibilityIcon sx={{ fontSize: 15 }} />}
              disabled={!node.info?.trim() || !onShowInfo}
              onClick={() => node && onShowInfo?.(node)}
              sx={{ textTransform: 'none', fontSize: '0.72rem' }}
            >
              Show info
            </Button>
          </Box>

        </Box>
      )}
    </Box>
  )
}
