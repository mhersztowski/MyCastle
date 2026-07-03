// QtUiLiveCanvas — renders a QtUiScene with the REAL MinisQt library
// (packages/core/browser/qt) on a <qt-canvas>, instead of the hand-rolled 2D
// renderer. Display-only: editing stays in the tree + property panels. If the
// Qt library can't be loaded, it falls back to the provided node (the classic
// QtUiCanvas) so the editor never breaks.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import type { QtUiScene } from './QtUiTypes';
import { ensureQtLib, buildQtWidget } from './qtLib';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Props {
  scene: QtUiScene;
  /** Rendered if the Qt library fails to load (e.g. the classic QtUiCanvas). */
  fallback?: ReactNode;
}

export function QtUiLiveCanvas({ scene, fallback }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gRef = useRef<any>(null);
  const canvasRef = useRef<any>(null);
  const builtRef = useRef<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Load the Qt library once.
  useEffect(() => {
    let cancelled = false;
    ensureQtLib()
      .then((g) => { if (!cancelled) { gRef.current = g; setStatus('ready'); } })
      .catch((e) => { if (!cancelled) { setErrMsg(e instanceof Error ? e.message : String(e)); setStatus('error'); } });
    return () => { cancelled = true; };
  }, []);

  // (Re)build the scene whenever it changes and the library is ready.
  useEffect(() => {
    if (status !== 'ready' || !containerRef.current) return;
    const g = gRef.current;
    const tag: string = g.QtCanvas?.__tag ?? 'qt-canvas';

    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement(tag);
      canvas.style.cssText = 'width:100%;height:100%;display:block;';
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(canvas);
      canvasRef.current = canvas;
    }

    const raf = requestAnimationFrame(() => {
      try {
        // The canvas paints its own `root` QWidget (with _view wired to the canvas).
        // We add our scene UNDER that root so setParent()→_propagateView() gives our
        // widgets the view — required for repaint & hit-testing. Replacing `canvas.root`
        // would strand the new tree without a view.
        const canvasRoot = canvas.root;
        if (!canvasRoot) return;
        if (builtRef.current && typeof builtRef.current.setParent === 'function') {
          try { builtRef.current.setParent(null); } catch { /* ignore */ }  // drop previous scene
        }
        builtRef.current = null;
        const built = buildQtWidget(scene.root, g);
        if (!built) return;
        if (typeof built.setParent === 'function') built.setParent(canvasRoot);
        if (typeof built.setGeometry === 'function') { try { built.setGeometry(0, 0, scene.width, scene.height); } catch { /* ignore */ } }
        builtRef.current = built;
        if (typeof canvasRoot.update === 'function') { try { canvasRoot.update(); } catch { /* ignore */ } }
      } catch { /* best-effort preview */ }
    });
    return () => { try { cancelAnimationFrame(raf); } catch { /* ignore */ } };
  }, [status, scene]);

  if (status === 'error') {
    // Graceful degradation — use the classic renderer if provided, else a note.
    return (
      <>
        {fallback ?? (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
            <Typography variant="caption" color="text.secondary" textAlign="center">
              Nie udało się załadować biblioteki Qt (podgląd): {errMsg}
            </Typography>
          </Box>
        )}
      </>
    );
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', bgcolor: scene.background ?? '#181c20' }}>
      {status === 'loading' && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
          <CircularProgress size={16} /><Typography variant="caption" color="text.secondary">Ładowanie renderera Qt…</Typography>
        </Box>
      )}
      <Box ref={containerRef} sx={{ width: '100%', height: '100%' }} />
    </Box>
  );
}

export default QtUiLiveCanvas;
