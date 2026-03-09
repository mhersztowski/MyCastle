import { useEffect, useRef, useState } from 'react';
import {
  Box,
  CircularProgress,
  IconButton,
  Paper,
  Tooltip,
  Typography,
} from '@mui/material';
import { Close, DeleteOutline, DragIndicator } from '@mui/icons-material';

const PANEL_HEIGHT = 260;

interface BuildOutputPanelProps {
  open: boolean;
  onClose: () => void;
  output: string;
  compiling: boolean;
  success: boolean | null;
}

export function BuildOutputPanel({ open, onClose, output, compiling, success }: BuildOutputPanelProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [positioned, setPositioned] = useState(false);
  const [cleared, setCleared] = useState(false);

  // Set initial position when opening
  useEffect(() => {
    if (open && !positioned) {
      setPosition({
        x: 116,
        y: window.innerHeight - PANEL_HEIGHT - 16 - 36,
      });
      setPositioned(true);
      setCleared(false);
    }
    if (!open) {
      setPositioned(false);
    }
  }, [open, positioned]);

  // Auto-scroll on new output
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
    if (output) setCleared(false);
  }, [output]);

  // --- Drag handling ---
  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = { ...position };

    const onMouseMove = (ev: MouseEvent) => {
      setPosition({
        x: startPos.x + (ev.clientX - startX),
        y: startPos.y + (ev.clientY - startY),
      });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const statusColor = success === true ? '#4caf50' : success === false ? '#f44336' : '#888';
  const statusText = compiling
    ? 'Compiling...'
    : success === true
      ? 'Build succeeded'
      : success === false
        ? 'Build failed'
        : 'Build Output';

  const displayContent = cleared ? '' : (compiling && !output ? 'Compiling...\n' : output);

  if (!open) return null;

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: 'calc(100vw - 232px)',
        height: PANEL_HEIGHT,
        zIndex: 1300,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: 2,
        borderColor: statusColor,
      }}
    >
      {/* Draggable title bar */}
      <Box
        onMouseDown={handleDragStart}
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 1,
          py: 0.25,
          bgcolor: '#2d2d2d',
          cursor: 'move',
          userSelect: 'none',
          flexShrink: 0,
          gap: 0.5,
        }}
      >
        <DragIndicator sx={{ fontSize: 16, color: '#888' }} />

        {compiling && <CircularProgress size={12} sx={{ color: '#ccc', mr: 0.5 }} />}

        <Typography variant="caption" sx={{ color: statusColor, fontWeight: 'bold', mr: 1 }} noWrap>
          {statusText}
        </Typography>

        <Box sx={{ flexGrow: 1 }} />

        <Tooltip title="Clear">
          <IconButton size="small" onClick={() => setCleared(true)} sx={{ color: '#888', p: 0.25 }}>
            <DeleteOutline sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Close">
          <IconButton size="small" onClick={onClose} sx={{ color: '#888', p: 0.25 }}>
            <Close sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Build output content */}
      <Box
        ref={contentRef}
        sx={{
          flexGrow: 1,
          bgcolor: '#1e1e1e',
          color: '#d4d4d4',
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          fontSize: 12,
          p: 1,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          lineHeight: 1.4,
        }}
      >
        {displayContent || 'Ready.\n'}
      </Box>
    </Paper>
  );
}
