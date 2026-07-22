/**
 * Read-only PCB viewer — renders a saved PCB project (schematic sheet / PCB /
 * symbol / footprint) as inline SVG, pan/zoom only.
 * URL: /viewer/pcb/{vfsPath} where vfsPath = "{vfsFilePath}/{view}[/{itemId}]",
 * vfsFilePath = VFS path bez rozszerzenia (np. users/default/projects/MyBoard),
 * view ∈ 'sheet' | 'pcb' | 'symbol' | 'footprint'. Wczytywane z per-user VFS
 * ({vfsFilePath}.pcb.json).
 */
import { useEffect, useMemo, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { readPcbProject } from '../vfs';
import { PanZoom } from '../components/PanZoom';
import {
  renderEl, renderFpEl, renderPlaced, renderPcbPart,
  elBBox, elBBoxFp, placedBBox, pcbPartBBox,
  unionBB, unionBBox, fitVB, defaultLayers,
  type PcbProject, type El, type FpEl, type PlacedComp,
} from '../pcb/render';

interface Props { vfsPath: string }
type View = 'sheet' | 'pcb' | 'symbol' | 'footprint';

const FALLBACK_VB = '0 0 800 600';

// Union bbox of a set of El + PlacedComp; falls back to a default frame when empty.
function unionOf(
  els: El[], placed: PlacedComp[],
  placedBox: (c: PlacedComp) => { x: number; y: number; w: number; h: number },
): { x: number; y: number; w: number; h: number } | null {
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  if (els.length) boxes.push(unionBB(els, elBBox));
  if (placed.length) boxes.push(unionBB(placed, placedBox));
  if (!boxes.length) return null;
  return boxes.reduce((acc, b) => unionBBox(acc, b));
}

const VIEWS: View[] = ['sheet', 'pcb', 'symbol', 'footprint'];

export function PcbViewerPage({ vfsPath }: Props) {
  const [project, setProject] = useState<PcbProject | null>(null);
  const [error, setError] = useState<string | null>(null);

  // vfsPath = "{vfsFilePath}/{view}[/{itemId}]" — parsujemy view/itemId od końca
  // (to słowa zarezerwowane), reszta = ścieżka pliku VFS (dir + name bez rozszerzenia).
  const { dir, name, view, itemId } = useMemo(() => {
    const parts = vfsPath.split('/').filter(Boolean);
    let v: View = 'sheet';
    let item: string | undefined;
    let fileSegs = parts;
    if (parts.length >= 2 && VIEWS.includes(parts[parts.length - 2] as View)) {
      v = parts[parts.length - 2] as View; item = parts[parts.length - 1]; fileSegs = parts.slice(0, -2);
    } else if (parts.length >= 1 && VIEWS.includes(parts[parts.length - 1] as View)) {
      v = parts[parts.length - 1] as View; fileSegs = parts.slice(0, -1);
    }
    const nm = fileSegs[fileSegs.length - 1] ?? '';
    const d = '/' + fileSegs.slice(0, -1).join('/');
    return { dir: d, name: nm, view: v, itemId: item };
  }, [vfsPath]);

  useEffect(() => {
    if (!name) { setError('Missing project path'); return; }
    let cancelled = false;
    setProject(null); setError(null);
    (async () => {
      try {
        const data = await readPcbProject(dir, name);
        if (!cancelled) setProject(data as PcbProject);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [dir, name]);

  const content = useMemo(() => {
    if (!project) return null;
    const layers = defaultLayers();

    if (view === 'symbol') {
      const syms = project.symbols ?? [];
      const sym = (itemId ? syms.find((s) => s.id === itemId) : undefined) ?? syms[0];
      const els: El[] = sym?.elements ?? [];
      return { bg: '#ffffff', viewBox: fitVB(unionBB(els, elBBox)), svg: els.map((e, i) => renderEl(e, i)) };
    }

    if (view === 'footprint') {
      const fps = project.footprints ?? [];
      const fp = (itemId ? fps.find((s) => s.id === itemId) : undefined) ?? fps[0];
      const els: FpEl[] = fp?.elements ?? [];
      return { bg: '#111', viewBox: fitVB(unionBB(els, elBBoxFp), 30), svg: els.map((e, i) => renderFpEl(e, i, false, layers)) };
    }

    if (view === 'pcb') {
      const els: FpEl[] = project.pcb?.elements ?? [];
      // Wszystkie footprinty umieszczone na wszystkich arkuszach są renderowane na PCB.
      const placed: PlacedComp[] = (project.sheets ?? []).flatMap((s) => s.placed ?? []);
      const boxes: { x: number; y: number; w: number; h: number }[] = [];
      if (els.length) boxes.push(unionBB(els, elBBoxFp));
      if (placed.length) boxes.push(unionBB(placed, pcbPartBBox));
      const bb = boxes.length ? boxes.reduce((acc, b) => unionBBox(acc, b)) : null;
      return {
        bg: '#111',
        viewBox: bb ? fitVB(bb, 30) : FALLBACK_VB,
        svg: [
          ...els.map((e, i) => renderFpEl(e, `el-${i}`, false, layers)),
          ...placed.map((c, i) => renderPcbPart(c, `pc-${i}`, false, layers)),
        ],
      };
    }

    // view === 'sheet'
    const sheets = project.sheets ?? [];
    const sheet = (itemId ? sheets.find((s) => s.id === itemId) : undefined)
      ?? (project.activeSheetId ? sheets.find((s) => s.id === project.activeSheetId) : undefined)
      ?? sheets[0];
    const els: El[] = sheet?.elements ?? [];
    const placed: PlacedComp[] = sheet?.placed ?? [];
    const bb = unionOf(els, placed, placedBBox);
    return {
      bg: '#ffffff',
      viewBox: bb ? fitVB(bb) : FALLBACK_VB,
      svg: [
        ...els.map((e, i) => renderEl(e, `el-${i}`)),
        ...placed.map((c, i) => renderPlaced(c, `pc-${i}`)),
      ],
    };
  }, [project, view, itemId]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, bgcolor: '#1a1a1a', color: '#fff' }}>
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        {error && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ color: 'error.main', fontSize: 14 }}>Failed to load: {error}</Typography>
          </Box>
        )}
        {!error && !content && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress size={32} /></Box>
        )}
        {!error && content && (
          <PanZoom>
            <Box sx={{ width: '100%', height: '100%', '& svg': { display: 'block', width: '100%', height: '100%' } }}>
              <svg viewBox={content.viewBox} preserveAspectRatio="xMidYMid meet" style={{ background: content.bg }}>
                {content.svg}
              </svg>
            </Box>
          </PanZoom>
        )}
      </Box>
    </Box>
  );
}
