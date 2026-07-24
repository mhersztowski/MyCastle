import { Box } from '@mui/material';
import { freecadIconUrl } from '../../assets/freecadIcons';

/**
 * Ikony FreeCAD-style dla ops toolbar. SVG importowane przez Vite z src/assets/freecad-icons
 * (pobrane skryptem scripts/fetch-freecad-icons.sh z repo FreeCAD, LGPL).
 * Dla 'sketch' używamy inline SVG (bo Sketcher_NewSketch.svg jest w Sketcher module
 * i nie zawsze pobiera się prawidłowo).
 */
export type FreeCadIconName =
  | 'extrude' | 'pocket' | 'mirror' | 'revolve' | 'groove' | 'hole'
  | 'loft' | 'sweep' | 'helix' | 'shell'
  | 'loft_cut' | 'sweep_cut'
  | 'fillet' | 'chamfer' | 'draft'
  | 'linear_pattern' | 'polar_pattern'
  | 'datum_point' | 'datum_line' | 'datum_plane' | 'datum_cs'
  | 'sketch';

/** Inline SVG dla sketch — niebieska siatka + zielony punkt origin, w stylu FreeCAD. */
function SketchInlineIcon({ size }: { size: number }) {
  return (
    <Box sx={{ width: size, height: size, display: 'inline-block', lineHeight: 0 }}>
      <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        {/* Tło grid — jasnoniebieski */}
        <rect x="2" y="2" width="20" height="20" fill="#e3f2fd" stroke="#1976d2" strokeWidth="1.5" rx="1" />
        {/* Wewnętrzne linie grid */}
        <line x1="2" y1="8"  x2="22" y2="8"  stroke="#90caf9" strokeWidth="0.5" />
        <line x1="2" y1="14" x2="22" y2="14" stroke="#90caf9" strokeWidth="0.5" />
        <line x1="8"  y1="2" x2="8"  y2="22" stroke="#90caf9" strokeWidth="0.5" />
        <line x1="14" y1="2" x2="14" y2="22" stroke="#90caf9" strokeWidth="0.5" />
        {/* Osie */}
        <line x1="2" y1="18" x2="22" y2="18" stroke="#c62828" strokeWidth="1.2" />
        <line x1="6" y1="2"  x2="6"  y2="22" stroke="#2e7d32" strokeWidth="1.2" />
        {/* Origin — kropka */}
        <circle cx="6" cy="18" r="1.6" fill="#2e7d32" />
      </svg>
    </Box>
  );
}

export function FreeCadIcon({ name, size = 20 }: { name: FreeCadIconName; size?: number }) {
  // Sketch — inline SVG (nie polegamy na pobranym pliku)
  if (name === 'sketch') return <SketchInlineIcon size={size} />;
  const url = freecadIconUrl(name);
  if (!url) return <Box sx={{ width: size, height: size }} />;
  return (
    <Box
      component="img"
      src={url}
      alt={name}
      sx={{
        width: size,
        height: size,
        display: 'block',
        objectFit: 'contain',
      }}
    />
  );
}
