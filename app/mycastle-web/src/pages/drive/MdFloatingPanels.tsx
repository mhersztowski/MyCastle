// Ruchome (przeciągalne) okienka nad edytorem markdown: Spis treści i Ulubione.
// Ustawiane z Drive → Ustawienia widoku (per-plik). Renderowane jako fixed-position
// panele, przesuwane za nagłówek.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton, Typography, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ListAltIcon from '@mui/icons-material/ListAlt';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import ArticleIcon from '@mui/icons-material/Article';

// ── Bazowe przeciągalne okienko ──────────────────────────────────────────────
const FloatingPanel: React.FC<{
  title: string;
  icon?: React.ReactNode;
  initial: { x: number; y: number };
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, icon, initial, width = 260, onClose, children }) => {
  const [pos, setPos] = useState(initial);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const onMove = (me: PointerEvent) => {
      if (!dragRef.current) return;
      const nx = Math.max(0, Math.min(window.innerWidth - 60, me.clientX - dragRef.current.dx));
      const ny = Math.max(0, Math.min(window.innerHeight - 40, me.clientY - dragRef.current.dy));
      setPos({ x: nx, y: ny });
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [pos]);

  return (
    <Box sx={{
      position: 'fixed', top: pos.y, left: pos.x, width, maxHeight: '60vh', zIndex: 1250,
      display: 'flex', flexDirection: 'column', bgcolor: 'background.paper',
      border: '1px solid', borderColor: 'divider', borderRadius: 1.5, boxShadow: 6, overflow: 'hidden',
    }}>
      <Box onPointerDown={onPointerDown} sx={{
        display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.5, cursor: 'grab',
        bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider', userSelect: 'none', '&:active': { cursor: 'grabbing' },
      }}>
        {icon}
        <Typography sx={{ flex: 1, fontSize: 12, fontWeight: 700 }}>{title}</Typography>
        <IconButton size="small" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} sx={{ p: 0.25 }}>
          <CloseIcon sx={{ fontSize: 15 }} />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto', py: 0.5 }}>{children}</Box>
    </Box>
  );
};

// ── Spis treści (na podstawie nagłówków w DOM edytora) ────────────────────────
interface TocItem { level: number; text: string; el: HTMLElement }

export const MdTocPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [items, setItems] = useState<TocItem[]>([]);

  useEffect(() => {
    const scan = () => {
      const wrap = document.querySelector('.md-editor-content-wrapper');
      if (!wrap) { setItems([]); return; }
      const hs = Array.from(wrap.querySelectorAll('h1,h2,h3,h4,h5,h6')) as HTMLElement[];
      // Usuń wiodący marker zwijania sekcji (▾/▸…) dokładany przez HeadingFoldExtension.
      const clean = (s: string) => s.replace(/^[\s▾▸▿◂◄▶►⯆⯈∨›»]+/, '').trim();
      setItems(hs.map((el) => ({ level: Number(el.tagName[1]), text: clean(el.textContent || '') || '—', el })));
    };
    scan();
    const id = window.setInterval(scan, 1500); // odśwież przy edycji
    return () => window.clearInterval(id);
  }, []);

  return (
    <FloatingPanel title="Spis treści" icon={<ListAltIcon sx={{ fontSize: 16 }} />} initial={{ x: window.innerWidth - 300, y: 120 }} onClose={onClose}>
      {items.length === 0 ? (
        <Typography sx={{ fontSize: 11, color: 'text.disabled', px: 1.25, py: 0.5, fontStyle: 'italic' }}>Brak nagłówków</Typography>
      ) : items.map((it, i) => (
        <Box key={i} onClick={() => it.el.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          sx={{ px: 1.25, py: 0.35, pl: 1.25 + (it.level - 1) * 1.25, cursor: 'pointer', fontSize: 12,
            color: it.level === 1 ? 'text.primary' : 'text.secondary', fontWeight: it.level <= 2 ? 600 : 400,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', '&:hover': { bgcolor: 'action.hover' } }}>
          {it.text}
        </Box>
      ))}
    </FloatingPanel>
  );
};

// ── Ulubione ──────────────────────────────────────────────────────────────────
export const MdFavoritesPanel: React.FC<{
  favorites: string[];                       // rel-y (drive-relative)
  currentRel?: string;                       // bieżący plik (drive-relative) — może być poza listą
  currentName?: string;
  isCurrentFav: boolean;
  onToggleCurrent: () => void;
  onOpen: (rel: string) => void;
  onRemove: (rel: string) => void;
  onClose: () => void;
}> = ({ favorites, currentRel, currentName, isCurrentFav, onToggleCurrent, onOpen, onRemove, onClose }) => {
  return (
    <FloatingPanel title="Ulubione" icon={<StarIcon sx={{ fontSize: 16, color: '#ffb300' }} />} initial={{ x: window.innerWidth - 300, y: 360 }} width={280} onClose={onClose}>
      {currentRel && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.25, py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Tooltip title={isCurrentFav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}>
            <IconButton size="small" onClick={onToggleCurrent} sx={{ p: 0.25 }}>
              {isCurrentFav ? <StarIcon sx={{ fontSize: 18, color: '#ffb300' }} /> : <StarBorderIcon sx={{ fontSize: 18 }} />}
            </IconButton>
          </Tooltip>
          <Typography sx={{ flex: 1, fontSize: 11, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {isCurrentFav ? 'W ulubionych: ' : 'Ten plik: '}{currentName}
          </Typography>
        </Box>
      )}
      {favorites.length === 0 ? (
        <Typography sx={{ fontSize: 11, color: 'text.disabled', px: 1.25, py: 0.5, fontStyle: 'italic' }}>Brak ulubionych</Typography>
      ) : favorites.map((rel) => (
        <Box key={rel} sx={{ display: 'flex', alignItems: 'center', px: 1.25, py: 0.35, '&:hover': { bgcolor: 'action.hover' } }}>
          <ArticleIcon sx={{ fontSize: 14, color: 'text.disabled', mr: 0.75, flexShrink: 0 }} />
          <Typography onClick={() => onOpen(rel)} title={rel}
            sx={{ flex: 1, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {rel.split('/').pop()}
          </Typography>
          <Tooltip title="Usuń z ulubionych">
            <IconButton size="small" onClick={() => onRemove(rel)} sx={{ p: 0.25, ml: 0.5 }}>
              <StarIcon sx={{ fontSize: 15, color: '#ffb300' }} />
            </IconButton>
          </Tooltip>
        </Box>
      ))}
    </FloatingPanel>
  );
};
