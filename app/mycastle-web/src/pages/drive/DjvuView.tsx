// DjvuView — renderowanie POJEDYNCZEJ strony dokumentu DjVu w scenie *.dash.json.
// Analogicznie do PdfView: DjVu jest źródłem danych (fileType === 'djvu'); jeden plik
// może mieć WIELE bloczków (każdy z własną stroną). Dokument jest parsowany RAZ i
// współdzielony przez cache. Dekodowanie przez djvu.js (djvujs-dist) na głównym wątku.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Box, CircularProgress, Typography, IconButton, InputBase, Tooltip } from '@mui/material';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import DjVuDocument from 'djvujs-dist/library/src/DjVuDocument.js';

// ── VFS (te same konwencje co PdfView) ─────────────────────────────────────────
const apiBase = (userName: string) => `/api/users/${encodeURIComponent(userName)}/vfs`;
const authToken = (): string => {
  try { return (JSON.parse(localStorage.getItem('minis_current_user') || '{}') as { token?: string }).token ?? ''; }
  catch { return ''; }
};
const toAbsVfsPath = (userName: string, rel: string): string => {
  if (rel.startsWith('/data/Minis/')) return rel;
  const cleaned = rel.replace(/^\/+|\/+$/g, '');
  return cleaned ? `/data/Minis/Users/${userName}/drive/${cleaned}` : `/data/Minis/Users/${userName}/drive`;
};

const djvuCache = new Map<string, Promise<DjVuDocument>>();

export function loadDjvuDocument(userName: string, filePath: string): Promise<DjVuDocument> {
  const key = `${userName}::${filePath}`;
  let p = djvuCache.get(key);
  if (!p) {
    p = (async () => {
      const r = await fetch(`${apiBase(userName)}/readFile?path=${encodeURIComponent(toAbsVfsPath(userName, filePath))}`,
        { headers: { Authorization: `Bearer ${authToken()}` } });
      if (!r.ok) throw new Error(`readFile ${r.status}`);
      const j = (await r.json()) as { data?: string };
      const bin = atob(j.data ?? '');
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new DjVuDocument(bytes.buffer);
    })();
    djvuCache.set(key, p);
    p.catch(() => djvuCache.delete(key));
  }
  return p;
}

export function invalidateDjvuCache(userName: string, filePath: string): void {
  djvuCache.delete(`${userName}::${filePath}`);
}

/** Hook zwracający liczbę stron DjVu (do walidacji pola „Strona" w Properties). */
export function useDjvuNumPages(userName: string, filePath: string): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    setN(null);
    if (!filePath) return;
    loadDjvuDocument(userName, filePath).then((doc) => { if (alive) setN(doc.getPagesQuantity()); }).catch(() => { if (alive) setN(null); });
    return () => { alive = false; };
  }, [userName, filePath]);
  return n;
}

/** Zapamiętany widok (region) dokumentu: znormalizowany offset (0..1 strony) + zoom. */
export interface DocView { x: number; y: number; zoom: number }

export const DjvuViewContent: React.FC<{
  userName: string;
  filePath: string;
  page: number;
  showNavigation?: boolean;
  region?: boolean;
  view?: DocView;
  onViewChange?: (v: DocView) => void;
  onPageChange?: (p: number) => void;
  onNumPages?: (n: number) => void;
}> = ({ userName, filePath, page, showNavigation, region, view, onViewChange, onPageChange, onNumPages }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [gotoText, setGotoText] = useState('');
  const [vzoom, setVzoom] = useState(view?.zoom ?? 1);
  const offRef = useRef({ x: view?.x ?? 0, y: view?.y ?? 0 });
  const dimsRef = useRef({ rw: 0, rh: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => { setWidth(el.clientWidth); setHeight(el.clientHeight); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setVzoom(view?.zoom ?? 1);
    offRef.current = { x: view?.x ?? 0, y: view?.y ?? 0 };
    applyPan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.x, view?.y, view?.zoom]);

  const applyPan = useCallback(() => {
    const canvas = canvasRef.current, el = wrapRef.current;
    if (!canvas || !el) return;
    if (!region) { canvas.style.position = ''; canvas.style.left = ''; canvas.style.top = ''; return; }
    const { rw, rh } = dimsRef.current;
    if (rw <= 0 || rh <= 0) return; // jeszcze nie wyrenderowano — nie zeruj zapisanego offsetu
    const bw = el.clientWidth, bh = el.clientHeight;
    const maxX = Math.max(0, rw - bw), maxY = Math.max(0, rh - bh);
    let offX = (offRef.current.x || 0) * rw, offY = (offRef.current.y || 0) * rh;
    offX = Math.min(Math.max(0, offX), maxX); offY = Math.min(Math.max(0, offY), maxY);
    offRef.current = { x: rw > 0 ? offX / rw : 0, y: rh > 0 ? offY / rh : 0 };
    canvas.style.position = 'absolute';
    canvas.style.left = `${-offX}px`;
    canvas.style.top = `${-offY}px`;
  }, [region]);

  const render = useCallback(async () => {
    if (!filePath || width <= 0) return;
    setStatus('loading');
    try {
      const doc = await loadDjvuDocument(userName, filePath);
      const total = doc.getPagesQuantity();
      setNumPages(total);
      onNumPages?.(total);
      const clamped = Math.min(Math.max(1, Math.floor(page) || 1), total);
      const pg = await doc.getPage(clamped);
      const imageData = pg.getImageData();
      // ImageData jest w natywnej rozdzielczości strony — skalujemy do szerokości bloczka × zoom.
      const off = document.createElement('canvas');
      off.width = imageData.width; off.height = imageData.height;
      off.getContext('2d')?.putImageData(imageData, 0, 0);
      const dpr = window.devicePixelRatio || 1;
      // Region: skala „cover" (region wypełnia CAŁY blok — pan w obu osiach) × zoom.
      const fit = region
        ? Math.max(width / imageData.width, height > 0 ? height / imageData.height : width / imageData.width)
        : width / imageData.width;
      const scale = fit * (region ? Math.max(0.1, vzoom) : 1);
      const targetW = Math.floor(imageData.width * scale);
      const targetH = Math.floor(imageData.height * scale);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = Math.floor(targetW * dpr);
      canvas.height = Math.floor(targetH * dpr);
      canvas.style.width = `${targetW}px`;
      canvas.style.height = `${targetH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.drawImage(off, 0, 0, targetW, targetH);
      dimsRef.current = { rw: targetW, rh: targetH };
      applyPan();
      setStatus('ok');
    } catch (e) {
      setErrMsg((e as Error).message || 'Błąd renderowania DjVu');
      setStatus('error');
    }
  }, [userName, filePath, page, width, height, region, vzoom, onNumPages, applyPan]);

  useEffect(() => { void render(); }, [render]);

  const persist = useCallback(() => { onViewChange?.({ x: offRef.current.x, y: offRef.current.y, zoom: vzoom }); }, [onViewChange, vzoom]);

  const onPanPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!region || status !== 'ok') return;
    const { rw, rh } = dimsRef.current;
    const el = wrapRef.current; if (!el) return;
    const bw = el.clientWidth, bh = el.clientHeight;
    if (rw <= bw && rh <= bh) return;
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const startOffX = offRef.current.x * rw, startOffY = offRef.current.y * rh;
    const maxX = Math.max(0, rw - bw), maxY = Math.max(0, rh - bh);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const onMove = (me: PointerEvent) => {
      let offX = startOffX - (me.clientX - startX), offY = startOffY - (me.clientY - startY);
      offX = Math.min(Math.max(0, offX), maxX); offY = Math.min(Math.max(0, offY), maxY);
      offRef.current = { x: rw > 0 ? offX / rw : 0, y: rh > 0 ? offY / rh : 0 };
      const canvas = canvasRef.current; if (canvas) { canvas.style.left = `${-offX}px`; canvas.style.top = `${-offY}px`; }
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); persist(); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [region, status, persist]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !region) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); setVzoom((z) => Math.min(8, Math.max(0.2, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [region]);
  useEffect(() => { if (region && status === 'ok') persist(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [vzoom]);

  return (
    <Box ref={wrapRef} onPointerDown={onPanPointerDown}
      className={region ? 'nodrag nopan' : undefined}
      sx={{ width: '100%', height: '100%', display: region ? 'block' : 'flex', flexDirection: 'column', alignItems: 'center',
        position: 'relative', bgcolor: '#525659', overflow: 'hidden', cursor: region && status === 'ok' ? 'grab' : 'default', touchAction: region ? 'none' : undefined }}>
      {status === 'loading' && (
        <Box sx={{ position: region ? 'absolute' : 'static', inset: 0, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress size={16} sx={{ color: '#fff' }} />
        </Box>
      )}
      {status === 'error' && (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 1 }}>
          <Typography sx={{ fontSize: 11, color: '#ff8a80', fontFamily: 'monospace', textAlign: 'center' }}>
            {errMsg || 'Nie udało się wczytać DjVu'}
          </Typography>
        </Box>
      )}
      <canvas ref={canvasRef} style={{ display: status === 'ok' ? 'block' : 'none', maxWidth: region ? 'none' : '100%' }} />
      {status === 'ok' && numPages > 0 && !showNavigation && (
        <Typography sx={{ position: 'absolute', bottom: 2, right: 6, fontSize: 9, color: 'rgba(255,255,255,0.7)', bgcolor: 'rgba(0,0,0,0.4)', px: 0.5, borderRadius: 0.5, pointerEvents: 'none' }}>
          {Math.min(Math.max(1, Math.floor(page) || 1), numPages)} / {numPages}
        </Typography>
      )}
      {showNavigation && status === 'ok' && numPages > 0 && (() => {
        const cur = Math.min(Math.max(1, Math.floor(page) || 1), numPages);
        const go = (p: number) => onPageChange?.(Math.min(Math.max(1, p), numPages));
        const commitGoto = () => { const n = parseInt(gotoText, 10); if (Number.isFinite(n)) go(n); setGotoText(''); };
        const btn = { p: 0.375, color: '#fff', '&.Mui-disabled': { color: 'rgba(255,255,255,0.3)' }, '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' } };
        return (
          <Box className="nodrag nopan" onPointerDown={(e) => e.stopPropagation()}
            sx={{ position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 0.25,
              bgcolor: 'rgba(30,30,34,0.88)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 2, px: 0.5, py: 0.25, boxShadow: '0 2px 8px rgba(0,0,0,0.5)', zIndex: 6 }}>
            <Tooltip title="Pierwsza strona" arrow><span><IconButton size="small" sx={btn} disabled={cur <= 1} onClick={() => go(1)}><FirstPageIcon sx={{ fontSize: 16 }} /></IconButton></span></Tooltip>
            <Tooltip title="Poprzednia" arrow><span><IconButton size="small" sx={btn} disabled={cur <= 1} onClick={() => go(cur - 1)}><NavigateBeforeIcon sx={{ fontSize: 16 }} /></IconButton></span></Tooltip>
            <InputBase value={gotoText === '' ? String(cur) : gotoText}
              onChange={(e) => setGotoText(e.target.value.replace(/[^0-9]/g, ''))}
              onFocus={(e) => { setGotoText(''); e.target.select(); }}
              onBlur={() => setGotoText('')}
              onKeyDown={(e) => { if (e.key === 'Enter') { commitGoto(); (e.target as HTMLInputElement).blur(); } }}
              inputProps={{ style: { textAlign: 'center', width: 26, color: '#fff', fontSize: 12, padding: '2px 0' } }} />
            <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', px: 0.25, whiteSpace: 'nowrap' }}>/ {numPages}</Typography>
            <Tooltip title="Następna" arrow><span><IconButton size="small" sx={btn} disabled={cur >= numPages} onClick={() => go(cur + 1)}><NavigateNextIcon sx={{ fontSize: 16 }} /></IconButton></span></Tooltip>
            <Tooltip title="Ostatnia strona" arrow><span><IconButton size="small" sx={btn} disabled={cur >= numPages} onClick={() => go(numPages)}><LastPageIcon sx={{ fontSize: 16 }} /></IconButton></span></Tooltip>
          </Box>
        );
      })()}
    </Box>
  );
};

export default DjvuViewContent;
