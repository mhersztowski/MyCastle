import { useCallback, useRef, useState } from 'react';
import Box from '@mui/material/Box';

interface ResizeDividerProps {
  /** Current width (px) of the panel to the right of the divider. */
  width: number;
  /** Called with the new width as the user drags. */
  onResize: (width: number) => void;
  min?: number;
  max?: number;
}

/**
 * Draggable vertical separator for the code-editor side panel.
 * Drag left → wider, drag right → narrower. While dragging, a fixed full-screen
 * overlay captures pointer events so the Monaco editor surface does not swallow
 * them mid-drag. Supports mouse and touch.
 */
export function ResizeDivider({ width, onResize, min = 280, max = 1400 }: ResizeDividerProps) {
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const startWRef = useRef(0);

  const begin = useCallback((clientX: number) => {
    startXRef.current = clientX;
    startWRef.current = width;
    setDragging(true);
  }, [width]);

  const move = useCallback((clientX: number) => {
    const delta = startXRef.current - clientX; // drag left → positive → wider
    const maxW = Math.min(max, window.innerWidth - 240);
    onResize(Math.max(min, Math.min(maxW, startWRef.current + delta)));
  }, [onResize, min, max]);

  return (
    <>
      <Box
        onMouseDown={e => { e.preventDefault(); begin(e.clientX); }}
        onTouchStart={e => begin(e.touches[0].clientX)}
        sx={{
          width: 6, flexShrink: 0, cursor: 'col-resize',
          bgcolor: dragging ? 'primary.main' : 'rgba(255,255,255,0.10)',
          '&:hover': { bgcolor: 'primary.main' },
          transition: 'background-color .15s',
          touchAction: 'none',
        }}
      />
      {dragging && (
        <Box
          onMouseMove={e => move(e.clientX)}
          onMouseUp={() => setDragging(false)}
          onMouseLeave={() => setDragging(false)}
          onTouchMove={e => move(e.touches[0].clientX)}
          onTouchEnd={() => setDragging(false)}
          sx={{ position: 'fixed', inset: 0, zIndex: 9999, cursor: 'col-resize' }}
        />
      )}
    </>
  );
}
