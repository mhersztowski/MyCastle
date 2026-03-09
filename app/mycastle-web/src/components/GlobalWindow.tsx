import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton, Paper, Typography, useMediaQuery, useTheme } from '@mui/material';
import { Close, CropSquare, FilterNone, Minimize } from '@mui/icons-material';
import { useGlobalWindows, type WindowName } from './GlobalWindowsContext';

// Base z-index below MUI's popper/modal (1300) so autocomplete dropdowns render above windows
let zIndexCounter = 0;
function nextZIndex() {
  return 1200 + (++zIndexCounter % 100);
}

interface GlobalWindowProps {
  windowName?: WindowName;
  title: string;
  open: boolean;
  minimized?: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  onRestore?: () => void;
  children: ReactNode;
  defaultWidth?: number;
  defaultHeight?: number;
}

export function GlobalWindow({
  windowName,
  title,
  open,
  minimized = false,
  onClose,
  onMinimize,
  onRestore,
  children,
  defaultWidth = 800,
  defaultHeight = 600,
}: GlobalWindowProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { savedConfigs, layoutVersion, registerWindow } = useGlobalWindows();
  const initConfig = windowName ? savedConfigs.get(windowName) : undefined;
  const [pos, setPos] = useState(initConfig?.pos ?? { x: 100, y: 80 });
  const [size, setSize] = useState(initConfig?.size ?? { w: defaultWidth, h: defaultHeight });
  const [maximized, setMaximized] = useState(initConfig?.maximized ?? false);
  const [zIndex, setZIndex] = useState(() => nextZIndex());
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);
  const posRef = useRef(pos);
  posRef.current = pos;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const maximizedRef = useRef(maximized);
  maximizedRef.current = maximized;

  // Register config getter for save
  useEffect(() => {
    if (!windowName) return;
    return registerWindow(windowName, () => ({
      pos: posRef.current,
      size: sizeRef.current,
      maximized: maximizedRef.current,
    }));
  }, [windowName, registerWindow]);

  // Restore from loaded layout
  useEffect(() => {
    if (!windowName || layoutVersion === 0) return;
    const c = savedConfigs.get(windowName);
    if (c) {
      setPos(c.pos);
      setSize(c.size);
      setMaximized(c.maximized);
    }
  }, [layoutVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close if entirely outside viewport
  useEffect(() => {
    if (!open || maximized) return;
    const check = () => {
      const p = posRef.current;
      const s = sizeRef.current;
      if (p.x + s.w < 0 || p.y + s.h < 0 || p.x > window.innerWidth || p.y > window.innerHeight) {
        onClose();
      }
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [open, maximized, onClose]);

  const bringToFront = useCallback(() => {
    setZIndex(nextZIndex());
  }, []);

  const isFullscreen = maximized || isMobile;

  const handleTitleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      bringToFront();
      if (isFullscreen) return;
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };

      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        setPos({
          x: dragRef.current.origX + ev.clientX - dragRef.current.startX,
          y: Math.max(0, dragRef.current.origY + ev.clientY - dragRef.current.startY),
        });
      };
      const onUp = () => {
        dragRef.current = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [isFullscreen, pos, bringToFront],
  );

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isFullscreen) return;
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: size.w, origH: size.h };

      const onMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        setSize({
          w: Math.max(300, resizeRef.current.origW + ev.clientX - resizeRef.current.startX),
          h: Math.max(200, resizeRef.current.origH + ev.clientY - resizeRef.current.startY),
        });
      };
      const onUp = () => {
        resizeRef.current = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [isFullscreen, size],
  );

  if (!open && !minimized) return null;

  return (
    <>
      {/* Minimized taskbar indicator — shown only when minimized */}
      {minimized && (
        <Paper
          elevation={4}
          onClick={() => { bringToFront(); onRestore?.(); }}
          onMouseDown={bringToFront}
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 16,
            zIndex,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 1.5,
            py: 0.5,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            cursor: 'pointer',
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            maxWidth: 200,
            userSelect: 'none',
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 'bold', flexGrow: 1 }} noWrap>
            {title}
          </Typography>
          <IconButton
            size="small"
            sx={{ color: 'inherit' }}
            onClick={(e) => { e.stopPropagation(); onClose(); }}
          >
            <Close sx={{ fontSize: 14 }} />
          </IconButton>
        </Paper>
      )}

      {/* Main window — kept in DOM even when minimized to preserve children state (e.g. xterm canvas) */}
      <Paper
        elevation={8}
        onMouseDown={bringToFront}
        sx={{
          position: 'fixed',
          zIndex,
          display: minimized ? 'none' : 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: isFullscreen ? 0 : 1,
          ...(isFullscreen
            ? { top: 0, left: 0, width: '100dvw', height: '100dvh' }
            : { top: pos.y, left: pos.x, width: size.w, height: size.h }),
        }}
      >
        {/* Title bar */}
        <Box
          onMouseDown={handleTitleMouseDown}
          onDoubleClick={() => setMaximized((m) => !m)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            px: 1,
            pt: isFullscreen ? 'calc(env(safe-area-inset-top) + 4px)' : 0.5,
            pb: 0.5,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            cursor: isFullscreen ? 'default' : 'move',
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 'bold', flexGrow: 1 }} noWrap>
            {title}
          </Typography>
          {onMinimize && (
            <IconButton size="small" sx={{ color: 'inherit' }} onClick={onMinimize}>
              <Minimize sx={{ fontSize: 16 }} />
            </IconButton>
          )}
          {!isMobile && (
            <IconButton size="small" sx={{ color: 'inherit' }} onClick={() => setMaximized((m) => !m)}>
              {maximized ? <FilterNone sx={{ fontSize: 14 }} /> : <CropSquare sx={{ fontSize: 16 }} />}
            </IconButton>
          )}
          <IconButton size="small" sx={{ color: 'inherit' }} onClick={onClose}>
            <Close sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>

        {/* Content */}
        <Box sx={{ flexGrow: 1, overflow: 'hidden', minHeight: 0 }}>
          {children}
        </Box>

        {/* Resize handle */}
        {!isFullscreen && (
          <Box
            onMouseDown={handleResizeMouseDown}
            sx={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 16,
              height: 16,
              cursor: 'nwse-resize',
            }}
          />
        )}
      </Paper>
    </>
  );
}
