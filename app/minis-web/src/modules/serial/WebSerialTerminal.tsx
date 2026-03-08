import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Box,
  Button,
  FormControl,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Tooltip,
  Typography,
} from '@mui/material';
import { Close, UsbOff, Usb, DeleteOutline, DragIndicator } from '@mui/icons-material';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { WebSerialService } from './WebSerialService';

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
const PANEL_HEIGHT = 220;

interface WebSerialTerminalProps {
  open: boolean;
  onClose: () => void;
}

export function WebSerialTerminal({ open, onClose }: WebSerialTerminalProps) {
  const termContainerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const serialRef = useRef<WebSerialService | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [connected, setConnected] = useState(false);
  const [baudRate, setBaudRate] = useState(115200);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [positioned, setPositioned] = useState(false);

  // Initialize serial service once
  useEffect(() => {
    serialRef.current = new WebSerialService();
    return () => {
      serialRef.current?.disconnect();
      serialRef.current = null;
    };
  }, []);

  // Set initial position when opening
  useEffect(() => {
    if (open && !positioned) {
      const margin = 116;
      setPosition({
        x: margin,
        y: window.innerHeight - PANEL_HEIGHT - 16 - 36, // 16 = bottom margin, 36 = status bar height
      });
      setPositioned(true);
    }
    if (!open) {
      setPositioned(false);
    }
  }, [open, positioned]);

  // Initialize xterm when panel opens
  useEffect(() => {
    if (!open || !termContainerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
      },
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termContainerRef.current);

    requestAnimationFrame(() => fitAddon.fit());

    // Ctrl+Shift+C → copy selection
    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown') return true;
      if (ev.ctrlKey && ev.shiftKey && ev.code === 'KeyC') {
        const sel = term.getSelection();
        if (sel) navigator.clipboard.writeText(sel).catch(() => {});
        return false;
      }
      return true;
    });

    term.onData((data) => {
      serialRef.current?.write(data);
    });

    serialRef.current?.setOnData((text) => {
      term.write(text);
    });

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const observer = new ResizeObserver(() => {
      fitAddon.fit();
    });
    observer.observe(termContainerRef.current);

    return () => {
      observer.disconnect();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [open]);

  const handleConnect = useCallback(async () => {
    const serial = serialRef.current;
    if (!serial) return;

    try {
      await serial.connect({ baudRate });
      setConnected(true);
      termRef.current?.writeln(`\x1b[32m--- Connected (${baudRate} baud) ---\x1b[0m`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      termRef.current?.writeln(`\x1b[31m--- Error: ${msg} ---\x1b[0m`);
    }
  }, [baudRate]);

  const handleDisconnect = useCallback(async () => {
    await serialRef.current?.disconnect();
    setConnected(false);
    termRef.current?.writeln('\x1b[33m--- Disconnected ---\x1b[0m');
  }, []);

  const handleClear = () => {
    termRef.current?.clear();
  };

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

  const isSupported = typeof navigator !== 'undefined' && 'serial' in navigator;

  if (!open) return null;

  return (
    <Paper
      ref={panelRef}
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
        border: 1,
        borderColor: 'divider',
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
        <Typography variant="caption" sx={{ color: '#ccc', mr: 1 }} noWrap>
          Serial Terminal
        </Typography>

        {!connected ? (
          <>
            <FormControl size="small" sx={{ minWidth: 90 }}>
              <Select
                value={baudRate}
                onChange={(e) => setBaudRate(Number(e.target.value))}
                sx={{
                  height: 24,
                  fontSize: 12,
                  color: '#ccc',
                  '.MuiOutlinedInput-notchedOutline': { borderColor: '#555' },
                  '.MuiSvgIcon-root': { color: '#888', fontSize: 16 },
                }}
              >
                {BAUD_RATES.map((rate) => (
                  <MenuItem key={rate} value={rate} sx={{ fontSize: 12 }}>
                    {rate}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              size="small"
              variant="contained"
              startIcon={<Usb sx={{ fontSize: '14px !important' }} />}
              onClick={handleConnect}
              disabled={!isSupported}
              sx={{ height: 24, fontSize: 11, textTransform: 'none', px: 1, minWidth: 0 }}
            >
              Connect
            </Button>
          </>
        ) : (
          <Button
            size="small"
            variant="outlined"
            color="warning"
            startIcon={<UsbOff sx={{ fontSize: '14px !important' }} />}
            onClick={handleDisconnect}
            sx={{ height: 24, fontSize: 11, textTransform: 'none', px: 1, minWidth: 0 }}
          >
            Disconnect
          </Button>
        )}

        <Box sx={{ flexGrow: 1 }} />

        <Tooltip title="Clear">
          <IconButton size="small" onClick={handleClear} sx={{ color: '#888', p: 0.25 }}>
            <DeleteOutline sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Close">
          <IconButton size="small" onClick={onClose} sx={{ color: '#888', p: 0.25 }}>
            <Close sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Terminal content */}
      {!isSupported ? (
        <Box sx={{ p: 2, bgcolor: '#1e1e1e', flexGrow: 1 }}>
          <Typography color="error" variant="body2">
            Web Serial API is not supported in this browser. Use Chrome or Edge.
          </Typography>
        </Box>
      ) : (
        <Box
          ref={termContainerRef}
          sx={{ flexGrow: 1, bgcolor: '#1e1e1e', overflow: 'hidden' }}
        />
      )}
    </Paper>
  );
}
