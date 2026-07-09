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

export const DjvuViewContent: React.FC<{
  userName: string;
  filePath: string;
  page: number;
  showNavigation?: boolean;
  onPageChange?: (p: number) => void;
  onNumPages?: (n: number) => void;
}> = ({ userName, filePath, page, showNavigation, onPageChange, onNumPages }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState(0);
  const [gotoText, setGotoText] = useState('');

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
      // ImageData jest w natywnej rozdzielczości strony — skalujemy do szerokości bloczka.
      const off = document.createElement('canvas');
      off.width = imageData.width; off.height = imageData.height;
      off.getContext('2d')?.putImageData(imageData, 0, 0);
      const dpr = window.devicePixelRatio || 1;
      const scale = width / imageData.width;
      const targetW = Math.floor(width);
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
      setStatus('ok');
    } catch (e) {
      setErrMsg((e as Error).message || 'Błąd renderowania DjVu');
      setStatus('error');
    }
  }, [userName, filePath, page, width, onNumPages]);

  useEffect(() => { void render(); }, [render]);

  return (
    <Box ref={wrapRef} sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', bgcolor: '#525659', overflow: 'hidden' }}>
      {status === 'loading' && (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
      <canvas ref={canvasRef} style={{ display: status === 'ok' ? 'block' : 'none', maxWidth: '100%' }} />
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
