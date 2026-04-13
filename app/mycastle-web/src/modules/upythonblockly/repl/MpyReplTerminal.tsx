import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Chip,
  IconButton,
  MenuItem,
  Paper,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Close, DeleteOutline, DragIndicator, PlayArrow, Stop } from '@mui/icons-material';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { MpySerialReplService } from './MpySerialReplService';
import { MpyWebReplService } from './MpyWebReplService';

type Backend = 'serial' | 'webrepl';

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400];
const PANEL_HEIGHT = 320;

interface MpyReplTerminalProps {
  open: boolean;
  onClose: () => void;
  /** Optional code to run on device */
  code?: string;
  /** Which backend to show first */
  defaultBackend?: Backend;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

function MpyReplTerminal({
  open,
  onClose,
  code,
  defaultBackend = 'serial',
  onConnect,
  onDisconnect,
}: MpyReplTerminalProps) {
  const [backend, setBackend] = useState<Backend>(defaultBackend);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [baudRate, setBaudRate] = useState(115200);
  const [webReplIp, setWebReplIp] = useState('192.168.4.1');
  const [webReplPort, setWebReplPort] = useState(8266);
  const [webReplPassword, setWebReplPassword] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [positioned, setPositioned] = useState(false);

  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const serialRef = useRef<MpySerialReplService | null>(null);
  const webReplRef = useRef<MpyWebReplService | null>(null);
  const backendRef = useRef<Backend>(defaultBackend);
  useEffect(() => { backendRef.current = backend; }, [backend]);

  // Set initial position when opening
  useEffect(() => {
    if (open && !positioned) {
      setPosition({
        x: 116,
        y: window.innerHeight - PANEL_HEIGHT - 16 - 36,
      });
      setPositioned(true);
    }
    if (!open) {
      setPositioned(false);
    }
  }, [open, positioned]);

  // Initialize xterm.js
  useEffect(() => {
    if (!open || !terminalRef.current) return;

    const term = new Terminal({
      theme: { background: '#1e1e1e', foreground: '#d4d4d4', cursor: '#d4d4d4' },
      fontSize: 12,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      cursorBlink: true,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    requestAnimationFrame(() => fitAddon.fit());

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
      if (backendRef.current === 'serial' && serialRef.current?.isConnected) {
        serialRef.current.write(data).catch(() => {});
      } else if (backendRef.current === 'webrepl' && webReplRef.current?.isConnected) {
        webReplRef.current.send(data).catch(() => {});
      }
    });

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    const observer = new ResizeObserver(() => fitAddon.fit());
    observer.observe(terminalRef.current);

    return () => {
      observer.disconnect();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const writeToTerminal = (text: string) => {
    xtermRef.current?.write(text.replace(/\n/g, '\r\n'));
  };

  const handleConnect = async () => {
    setConnecting(true);
    setStatusMsg('');
    try {
      if (backend === 'serial') {
        const svc = new MpySerialReplService();
        svc.onData(writeToTerminal);
        await svc.connect(baudRate);
        serialRef.current = svc;
        await svc.write('\x03\x03\x02\r\n');
      } else {
        const svc = new MpyWebReplService();
        svc.onData(writeToTerminal);
        await svc.connect({ ip: webReplIp, port: webReplPort, password: webReplPassword });
        webReplRef.current = svc;
        await svc.send('\r\n');
      }
      setConnected(true);
      onConnect?.();
      writeToTerminal('\r\n\x1b[32m[Connected]\x1b[0m\r\n');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (backend === 'serial') {
      await serialRef.current?.disconnect();
      serialRef.current = null;
    } else {
      webReplRef.current?.disconnect();
      webReplRef.current = null;
    }
    setConnected(false);
    onDisconnect?.();
    writeToTerminal('\r\n\x1b[31m[Disconnected]\x1b[0m\r\n');
  };

  const handleRunCode = async () => {
    if (!code || !connected) return;
    writeToTerminal('\r\n\x1b[33m[Running code...]\x1b[0m\r\n');
    try {
      let output = '';
      if (backend === 'serial' && serialRef.current) {
        output = await serialRef.current.execCode(code);
      } else if (backend === 'webrepl' && webReplRef.current) {
        output = await webReplRef.current.execCode(code);
      }
      if (output) writeToTerminal(output);
      writeToTerminal('\r\n\x1b[32m[Done]\x1b[0m\r\n');
    } catch (err) {
      writeToTerminal(`\r\n\x1b[31m[Error: ${err instanceof Error ? err.message : String(err)}]\x1b[0m\r\n`);
    }
  };

  const handleClear = () => {
    xtermRef.current?.clear();
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
        border: 1,
        borderColor: connected ? 'success.dark' : 'divider',
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
          MicroPython REPL
        </Typography>
        <Chip
          size="small"
          label={connected ? 'Connected' : 'Disconnected'}
          color={connected ? 'success' : 'default'}
          sx={{ height: 16, fontSize: 10, '.MuiChip-label': { px: 0.75 } }}
        />
        {statusMsg && (
          <Typography variant="caption" color="error" sx={{ ml: 1 }} noWrap>
            {statusMsg}
          </Typography>
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

      {/* Connection toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1,
          py: 0.5,
          bgcolor: '#252526',
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <ButtonGroup size="small">
          <Button
            variant={backend === 'serial' ? 'contained' : 'outlined'}
            onClick={() => setBackend('serial')}
            disabled={connected}
            sx={{ height: 24, fontSize: 11, textTransform: 'none', px: 1 }}
          >
            Serial
          </Button>
          <Button
            variant={backend === 'webrepl' ? 'contained' : 'outlined'}
            onClick={() => setBackend('webrepl')}
            disabled={connected}
            sx={{ height: 24, fontSize: 11, textTransform: 'none', px: 1 }}
          >
            WebREPL
          </Button>
        </ButtonGroup>

        {backend === 'serial' ? (
          <Select
            size="small"
            value={baudRate}
            onChange={(e) => setBaudRate(Number(e.target.value))}
            disabled={connected}
            sx={{
              height: 24,
              fontSize: 12,
              color: '#ccc',
              '.MuiOutlinedInput-notchedOutline': { borderColor: '#555' },
              '.MuiSvgIcon-root': { color: '#888', fontSize: 16 },
            }}
          >
            {BAUD_RATES.map((b) => (
              <MenuItem key={b} value={b} sx={{ fontSize: 12 }}>{b}</MenuItem>
            ))}
          </Select>
        ) : (
          <>
            <TextField
              size="small"
              label="IP"
              value={webReplIp}
              onChange={(e) => setWebReplIp(e.target.value)}
              disabled={connected}
              sx={{ width: 120, '& .MuiInputBase-root': { height: 24, fontSize: 12 }, '& .MuiInputLabel-root': { fontSize: 11 } }}
            />
            <TextField
              size="small"
              label="Port"
              value={webReplPort}
              onChange={(e) => setWebReplPort(Number(e.target.value))}
              disabled={connected}
              sx={{ width: 70, '& .MuiInputBase-root': { height: 24, fontSize: 12 }, '& .MuiInputLabel-root': { fontSize: 11 } }}
            />
            <TextField
              size="small"
              label="Password"
              type="password"
              value={webReplPassword}
              onChange={(e) => setWebReplPassword(e.target.value)}
              disabled={connected}
              sx={{ width: 110, '& .MuiInputBase-root': { height: 24, fontSize: 12 }, '& .MuiInputLabel-root': { fontSize: 11 } }}
            />
          </>
        )}

        {connected ? (
          <Button
            size="small"
            variant="outlined"
            color="warning"
            startIcon={<Stop sx={{ fontSize: '14px !important' }} />}
            onClick={handleDisconnect}
            sx={{ height: 24, fontSize: 11, textTransform: 'none', px: 1, minWidth: 0 }}
          >
            Disconnect
          </Button>
        ) : (
          <Button
            size="small"
            variant="contained"
            color="success"
            onClick={handleConnect}
            disabled={connecting}
            sx={{ height: 24, fontSize: 11, textTransform: 'none', px: 1, minWidth: 0 }}
          >
            {connecting ? 'Connecting...' : 'Connect'}
          </Button>
        )}

        {code && (
          <Tooltip title="Run current code on device">
            <span>
              <Button
                size="small"
                variant="contained"
                startIcon={<PlayArrow sx={{ fontSize: '14px !important' }} />}
                onClick={handleRunCode}
                disabled={!connected}
                sx={{ height: 24, fontSize: 11, textTransform: 'none', px: 1, minWidth: 0 }}
              >
                Run
              </Button>
            </span>
          </Tooltip>
        )}
      </Box>

      {/* xterm.js terminal */}
      <Box
        ref={terminalRef}
        sx={{
          flexGrow: 1,
          bgcolor: '#1e1e1e',
          overflow: 'hidden',
          '& .xterm': { height: '100%' },
          '& .xterm-viewport': { overflowY: 'auto' },
        }}
      />
    </Paper>
  );
}

export default MpyReplTerminal;
