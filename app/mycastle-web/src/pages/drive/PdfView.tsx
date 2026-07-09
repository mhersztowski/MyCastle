// PdfView — renderowanie POJEDYNCZEJ strony PDF w scenie *.dash.json.
//
// PDF jest źródłem danych (DataSourceEntry.fileType === 'pdf'). Jeden plik może mieć
// WIELE bloczków PdfView (każdy z własnym numerem strony) — dokument PDF jest więc
// ładowany RAZ i współdzielony przez cache (klucz: userName+filePath).
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Box, CircularProgress, Typography, IconButton, InputBase, Tooltip } from '@mui/material';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import * as pdfjsLib from 'pdfjs-dist';
// Vite bundluje workera przez `?worker` (niezawodne w dev i prod). Wcześniejsze `?url`
// potrafiło nie załadować modułowego workera → „Setting up fake worker failed / failed
// to fetch dynamically imported module: pdf.worker". Jeden shared worker obsługuje wiele
// dokumentów (pdfjs multipleksuje po docId).
import PdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';

pdfjsLib.GlobalWorkerOptions.workerPort = new PdfjsWorker();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;

// ── VFS (self-contained — te same konwencje co DashEditorPanel) ────────────────
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

// Cache załadowanych dokumentów PDF — współdzielony między wszystkimi PdfView.
const pdfCache = new Map<string, Promise<PdfDoc>>();

export function loadPdfDocument(userName: string, filePath: string): Promise<PdfDoc> {
  const key = `${userName}::${filePath}`;
  let p = pdfCache.get(key);
  if (!p) {
    p = (async () => {
      const r = await fetch(`${apiBase(userName)}/readFile?path=${encodeURIComponent(toAbsVfsPath(userName, filePath))}`,
        { headers: { Authorization: `Bearer ${authToken()}` } });
      if (!r.ok) throw new Error(`readFile ${r.status}`);
      const j = (await r.json()) as { data?: string };
      const bin = atob(j.data ?? '');
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return pdfjsLib.getDocument({ data: bytes }).promise;
    })();
    pdfCache.set(key, p);
    // Nie trzymaj odrzuconej obietnicy — pozwól ponowić po błędzie (np. reload pliku).
    p.catch(() => pdfCache.delete(key));
  }
  return p;
}

/** Odświeża cache dla pliku (po reload/replace źródła). */
export function invalidatePdfCache(userName: string, filePath: string): void {
  pdfCache.delete(`${userName}::${filePath}`);
}

/** Hook zwracający liczbę stron PDF (do walidacji pola „Strona" w Properties). */
export function usePdfNumPages(userName: string, filePath: string): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    setN(null);
    if (!filePath) return;
    loadPdfDocument(userName, filePath).then((doc) => { if (alive) setN(doc.numPages); }).catch(() => { if (alive) setN(null); });
    return () => { alive = false; };
  }, [userName, filePath]);
  return n;
}

// ── Render pojedynczej strony do canvasu, dopasowany do szerokości kontenera ────
export const PdfViewContent: React.FC<{
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTaskRef = useRef<any>(null);

  // Szerokość kontenera (dopasowanie renderu). Zależna od rozmiaru węzła.
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
      const doc = await loadPdfDocument(userName, filePath);
      setNumPages(doc.numPages);
      onNumPages?.(doc.numPages);
      const clamped = Math.min(Math.max(1, Math.floor(page) || 1), doc.numPages);
      const pdfPage = await doc.getPage(clamped);
      const base = pdfPage.getViewport({ scale: 1 });
      const dpr = window.devicePixelRatio || 1;
      const scale = width / base.width;
      const viewport = pdfPage.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch { /* ignore */ } }
      const task = pdfPage.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      renderTaskRef.current = task;
      await task.promise;
      setStatus('ok');
    } catch (e) {
      // RenderingCancelledException przy szybkiej zmianie strony — ignoruj.
      if ((e as { name?: string })?.name === 'RenderingCancelledException') return;
      setErrMsg((e as Error).message || 'Błąd renderowania PDF');
      setStatus('error');
    }
  }, [userName, filePath, page, width, onNumPages]);

  useEffect(() => { void render(); }, [render]);

  return (
    <Box ref={wrapRef} sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', bgcolor: '#525659', overflow: 'hidden' }}>
      {status === 'loading' && (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
          <CircularProgress size={16} sx={{ color: '#fff' }} />
        </Box>
      )}
      {status === 'error' && (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 1 }}>
          <Typography sx={{ fontSize: 11, color: '#ff8a80', fontFamily: 'monospace', textAlign: 'center' }}>
            {errMsg || 'Nie udało się wczytać PDF'}
          </Typography>
        </Box>
      )}
      <canvas ref={canvasRef} style={{ display: status === 'ok' ? 'block' : 'none', maxWidth: '100%' }} />
      {status === 'ok' && numPages > 0 && !showNavigation && (
        <Typography sx={{ position: 'absolute', bottom: 2, right: 6, fontSize: 9, color: 'rgba(255,255,255,0.7)', bgcolor: 'rgba(0,0,0,0.4)', px: 0.5, borderRadius: 0.5, pointerEvents: 'none' }}>
          {Math.min(Math.max(1, Math.floor(page) || 1), numPages)} / {numPages}
        </Typography>
      )}
      {/* Pasek nawigacji na canvasie — home / prev / goto / next / end. nodrag nopan +
          stopPropagation, by kliki nie przeciągały węzła ReactFlow. */}
      {showNavigation && status === 'ok' && numPages > 0 && (() => {
        const cur = Math.min(Math.max(1, Math.floor(page) || 1), numPages);
        const go = (p: number) => onPageChange?.(Math.min(Math.max(1, p), numPages));
        const commitGoto = () => { const n = parseInt(gotoText, 10); if (Number.isFinite(n)) go(n); setGotoText(''); };
        const btn = { p: 0.375, color: '#fff', '&.Mui-disabled': { color: 'rgba(255,255,255,0.3)' }, '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' } };
        return (
          <Box className="nodrag nopan" onPointerDown={(e) => e.stopPropagation()}
            sx={{ position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 0.25,
              bgcolor: 'rgba(30,30,34,0.88)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 2, px: 0.5, py: 0.25,
              boxShadow: '0 2px 8px rgba(0,0,0,0.5)', zIndex: 6, backdropFilter: 'blur(2px)' }}>
            <Tooltip title="Pierwsza strona" arrow><span><IconButton size="small" sx={btn} disabled={cur <= 1} onClick={() => go(1)}><FirstPageIcon sx={{ fontSize: 16 }} /></IconButton></span></Tooltip>
            <Tooltip title="Poprzednia" arrow><span><IconButton size="small" sx={btn} disabled={cur <= 1} onClick={() => go(cur - 1)}><NavigateBeforeIcon sx={{ fontSize: 16 }} /></IconButton></span></Tooltip>
            <InputBase
              value={gotoText === '' ? String(cur) : gotoText}
              onChange={(e) => setGotoText(e.target.value.replace(/[^0-9]/g, ''))}
              onFocus={(e) => { setGotoText(''); e.target.select(); }}
              onBlur={() => setGotoText('')}
              onKeyDown={(e) => { if (e.key === 'Enter') { commitGoto(); (e.target as HTMLInputElement).blur(); } }}
              inputProps={{ style: { textAlign: 'center', width: 26, color: '#fff', fontSize: 12, padding: '2px 0' } }}
            />
            <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', px: 0.25, whiteSpace: 'nowrap' }}>/ {numPages}</Typography>
            <Tooltip title="Następna" arrow><span><IconButton size="small" sx={btn} disabled={cur >= numPages} onClick={() => go(cur + 1)}><NavigateNextIcon sx={{ fontSize: 16 }} /></IconButton></span></Tooltip>
            <Tooltip title="Ostatnia strona" arrow><span><IconButton size="small" sx={btn} disabled={cur >= numPages} onClick={() => go(numPages)}><LastPageIcon sx={{ fontSize: 16 }} /></IconButton></span></Tooltip>
          </Box>
        );
      })()}
    </Box>
  );
};

export default PdfViewContent;
