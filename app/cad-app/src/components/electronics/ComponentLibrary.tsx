import { useState } from 'react';
import { Box, Divider, InputAdornment, TextField, Tooltip, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { GRID, type BodyShape } from '../../electronics/types';
import { CATEGORY_LABEL, CATEGORY_ORDER, PART_LIBRARY, type PartDef } from '../../electronics/partLibrary';

interface Props {
  selectedPartId: string | null;
  onSelectPart: (partId: string) => void;
}

// Small thumbnail SVG for the library panel
function PartThumb({ part }: { part: PartDef }) {
  const maxDim = 40;
  const scaleX = maxDim / (part.width * GRID);
  const scaleY = maxDim / (part.height * GRID);
  const scale = Math.min(scaleX, scaleY, 1);
  const w = part.width * GRID * scale;
  const h = part.height * GRID * scale;

  return (
    <svg width={maxDim} height={maxDim} style={{ display: 'block', flexShrink: 0 }}>
      <g transform={`translate(${(maxDim - w) / 2},${(maxDim - h) / 2}) scale(${scale})`}>
        <ThumbShape part={part} />
      </g>
    </svg>
  );
}

function ThumbShape({ part }: { part: PartDef }) {
  const W = part.width * GRID;
  const H = part.height * GRID;

  if (part.bodyShape === 'breadboard') {
    return (
      <g>
        <rect x={0} y={0} width={W} height={H} rx={2} fill="#e8e0d0" stroke="#8d6e63" strokeWidth={1} />
        <rect x={2} y={2} width={W - 4} height={H * 0.18} rx={1} fill="#fce4e4" />
        <rect x={2} y={H * 0.24} width={W - 4} height={H * 0.32} rx={1} fill="#ede8da" />
        <rect x={2} y={H * 0.62} width={W - 4} height={H * 0.32} rx={1} fill="#ede8da" />
        <rect x={2} y={H * 0.82} width={W - 4} height={H * 0.16} rx={1} fill="#fce4e4" />
      </g>
    );
  }

  const bodyShapes: Record<BodyShape, JSX.Element> = {
    breadboard: <></>,
    dip: (
      <g>
        <rect x={W * 0.15} y={0} width={W * 0.7} height={H} rx={2} fill={part.bodyColor} />
        <ellipse cx={W / 2} cy={0} rx={W * 0.15} ry={H * 0.05} fill="#111" />
        {[0.2, 0.4, 0.6, 0.8].map(f => (
          <rect key={f} x={0} y={H * f - 2} width={W * 0.15} height={4} rx={1} fill="#bbb" />
        ))}
        {[0.2, 0.4, 0.6, 0.8].map(f => (
          <rect key={f} x={W * 0.85} y={H * f - 2} width={W * 0.15} height={4} rx={1} fill="#bbb" />
        ))}
      </g>
    ),
    resistor: (
      <g>
        <line x1={0} y1={H / 2} x2={W * 0.25} y2={H / 2} stroke="#bbb" strokeWidth={1.5} />
        <line x1={W * 0.75} y1={H / 2} x2={W} y2={H / 2} stroke="#bbb" strokeWidth={1.5} />
        <rect x={W * 0.25} y={H * 0.2} width={W * 0.5} height={H * 0.6} rx={3} fill={part.bodyColor} />
        <rect x={W * 0.34} y={H * 0.2} width={W * 0.07} height={H * 0.6} fill="#333" />
        <rect x={W * 0.48} y={H * 0.2} width={W * 0.07} height={H * 0.6} fill="#e53935" />
        <rect x={W * 0.62} y={H * 0.2} width={W * 0.07} height={H * 0.6} fill="#ffd600" />
      </g>
    ),
    led: (
      <g>
        <line x1={0} y1={H / 2} x2={W * 0.25} y2={H / 2} stroke="#bbb" strokeWidth={1.5} />
        <line x1={W * 0.7} y1={H / 2} x2={W} y2={H / 2} stroke="#bbb" strokeWidth={1.5} />
        <circle cx={W * 0.6} cy={H / 2} r={H * 0.42} fill={part.indicatorColor ?? part.bodyColor} />
        <ellipse cx={W * 0.52} cy={H * 0.35} rx={W * 0.06} ry={H * 0.12} fill="white" opacity={0.35} />
      </g>
    ),
    button: (
      <g>
        <rect x={W * 0.1} y={H * 0.1} width={W * 0.8} height={H * 0.8} rx={2} fill={part.bodyColor} />
        <circle cx={W / 2} cy={H / 2} r={Math.min(W, H) * 0.28} fill="#78909c" />
        <circle cx={W / 2} cy={H / 2} r={Math.min(W, H) * 0.18} fill="#90a4ae" />
      </g>
    ),
    capacitor: (
      <g>
        <line x1={0} y1={H / 2} x2={W * 0.25} y2={H / 2} stroke="#bbb" strokeWidth={1.5} />
        <line x1={W * 0.75} y1={H / 2} x2={W} y2={H / 2} stroke="#bbb" strokeWidth={1.5} />
        <rect x={W * 0.25} y={H * 0.15} width={W * 0.5} height={H * 0.7} rx={3} fill={part.bodyColor} />
      </g>
    ),
    transistor: (
      <g>
        <path d={`M ${W / 2} 0 A ${W / 2} ${H / 2} 0 1 1 ${W / 2} ${H} L ${W / 2} 0 Z`}
          fill={part.bodyColor} />
        {[0.2, 0.5, 0.8].map(f => (
          <line key={f} x1={W * f} y1={H * 0.85} x2={W * f} y2={H} stroke="#bbb" strokeWidth={1.5} />
        ))}
      </g>
    ),
    ic: (
      <g>
        <rect x={2} y={2} width={W - 4} height={H - 4} rx={2} fill={part.bodyColor} />
        <ellipse cx={W / 2} cy={2} rx={W * 0.12} ry={3} fill="#111" />
        {part.label && (
          <text x={W / 2} y={H / 2 + 3} textAnchor="middle" fontSize={Math.min(10, W * 0.25)} fontFamily="monospace" fill="white">
            {part.label.split('\n')[0]}
          </text>
        )}
      </g>
    ),
  };

  return bodyShapes[part.bodyShape] ?? bodyShapes.ic;
}

export function ComponentLibrary({ selectedPartId, onSelectPart }: Props) {
  const [search, setSearch] = useState('');

  const filteredParts = PART_LIBRARY.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.description?.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = CATEGORY_ORDER.map(cat => ({
    cat,
    label: CATEGORY_LABEL[cat],
    parts: filteredParts.filter(p => p.category === cat),
  })).filter(g => g.parts.length > 0);

  return (
    <Box sx={{
      width: 200, display: 'flex', flexDirection: 'column', height: '100%',
      bgcolor: 'background.paper', borderRight: '1px solid rgba(255,255,255,0.08)',
      flexShrink: 0,
    }}>
      <Box sx={{ px: 1, py: 0.75, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', letterSpacing: '0.06em' }}>
          COMPONENTS
        </Typography>
      </Box>

      <Box sx={{ px: 1, py: 0.5, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <TextField
          size="small"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          fullWidth
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 14 }} /></InputAdornment>,
              sx: { fontSize: 11, height: 28 },
            },
          }}
        />
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {grouped.map(({ cat, label, parts }) => (
          <Box key={cat}>
            <Typography variant="caption" sx={{
              display: 'block', px: 1, py: 0.4, mt: 0.5,
              color: 'text.disabled', fontWeight: 600, letterSpacing: '0.05em', fontSize: 10,
            }}>
              {label.toUpperCase()}
            </Typography>
            {parts.map(part => (
              <Tooltip key={part.id} title={part.description ?? part.name} placement="right" arrow>
                <Box
                  onClick={() => onSelectPart(part.id)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1,
                    px: 1, py: 0.5, cursor: 'pointer',
                    bgcolor: selectedPartId === part.id ? 'rgba(79,195,247,0.12)' : 'transparent',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
                    borderLeft: selectedPartId === part.id ? '2px solid #4fc3f7' : '2px solid transparent',
                  }}
                >
                  <PartThumb part={part} />
                  <Typography variant="caption" sx={{ fontSize: 11, lineHeight: 1.3, wordBreak: 'break-word' }}>
                    {part.name}
                  </Typography>
                </Box>
              </Tooltip>
            ))}
            <Divider sx={{ mt: 0.5, borderColor: 'rgba(255,255,255,0.05)' }} />
          </Box>
        ))}
      </Box>

      <Box sx={{ px: 1, py: 0.75, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 10 }}>
          Click a part then click canvas to place · Drag to move · Del to delete
        </Typography>
      </Box>
    </Box>
  );
}
