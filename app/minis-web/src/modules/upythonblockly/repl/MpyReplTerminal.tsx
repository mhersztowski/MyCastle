import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Chip,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { PlayArrow, Stop } from '@mui/icons-material';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { MpySerialReplService } from './MpySerialReplService';
import { MpyWebReplService } from './MpyWebReplService';

type Backend = 'serial' | 'webrepl';

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400];

interface MpyReplTerminalProps {
  /** Which backend to show first */
  defaultBackend?: Backend;
  height?: number | string;
  /** Optional code to upload when clicking "Run" */
  code?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

function MpyReplTerminal({
  defaultBackend = 'serial',
  height = 300,
  code,
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

  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const serialRef = useRef<MpySerialReplService | null>(null);
  const webReplRef = useRef<MpyWebReplService | null>(null);

  // Initialize xterm.js
  useEffect(() => {
    if (!terminalRef.current) return;
    const term = new Terminal({
      theme: { background: '#1e1e1e', foreground: '#d4d4d4' },
      fontSize: 13,
      fontFamily: 'monospace',
      rows: 12,
      cursorBlink: true,
    });
    term.open(terminalRef.current);
    xtermRef.current = term;

    // Keyboard input → send to device
    term.onData((data) => {
      if (!connected) return;
      if (backend === 'serial' && serialRef.current?.isConnected) {
        serialRef.current.write(data).catch(() => { /* ignore */ });
      } else if (backend === 'webrepl' && webReplRef.current?.isConnected) {
        webReplRef.current.send(data).catch(() => { /* ignore */ });
      }
    });

    return () => {
      term.dispose();
      xtermRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const writeToTerminal = (text: string) => {
    xtermRef.current?.write(text.replace(/\n/g, '\r\n'));
  };

  const handleConnect = async () => {
    setConnecting(true);
    setStatusMsg('');
    try {
      if (backend === 'serial') {
        const svc = new MpySerialReplService();
        await svc.connect(baudRate);
        svc.onData(writeToTerminal);
        serialRef.current = svc;
      } else {
        const svc = new MpyWebReplService();
        await svc.connect({ ip: webReplIp, port: webReplPort, password: webReplPassword });
        svc.onData(writeToTerminal);
        webReplRef.current = svc;
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height }}>
      {/* Toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1,
          py: 0.5,
          borderBottom: 1,
          borderColor: 'divider',
          flexWrap: 'wrap',
        }}
      >
        <ButtonGroup size="small">
          <Button
            variant={backend === 'serial' ? 'contained' : 'outlined'}
            onClick={() => setBackend('serial')}
            disabled={connected}
          >
            Serial
          </Button>
          <Button
            variant={backend === 'webrepl' ? 'contained' : 'outlined'}
            onClick={() => setBackend('webrepl')}
            disabled={connected}
          >
            WebREPL
          </Button>
        </ButtonGroup>

        {/* Connection params */}
        {backend === 'serial' ? (
          <Select
            size="small"
            value={baudRate}
            onChange={(e) => setBaudRate(Number(e.target.value))}
            disabled={connected}
            sx={{ minWidth: 100 }}
          >
            {BAUD_RATES.map((b) => (
              <MenuItem key={b} value={b}>{b}</MenuItem>
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
              sx={{ width: 130 }}
            />
            <TextField
              size="small"
              label="Port"
              value={webReplPort}
              onChange={(e) => setWebReplPort(Number(e.target.value))}
              disabled={connected}
              sx={{ width: 80 }}
            />
            <TextField
              size="small"
              label="Password"
              type="password"
              value={webReplPassword}
              onChange={(e) => setWebReplPassword(e.target.value)}
              disabled={connected}
              sx={{ width: 120 }}
            />
          </>
        )}

        {/* Connect / Disconnect */}
        {connected ? (
          <Button size="small" color="error" startIcon={<Stop />} onClick={handleDisconnect}>
            Disconnect
          </Button>
        ) : (
          <Button size="small" color="success" onClick={handleConnect} disabled={connecting}>
            {connecting ? 'Connecting...' : 'Connect'}
          </Button>
        )}

        {/* Run code button */}
        {code && (
          <Tooltip title="Run current code on device">
            <span>
              <Button
                size="small"
                startIcon={<PlayArrow />}
                onClick={handleRunCode}
                disabled={!connected}
                variant="contained"
                color="primary"
              >
                Run
              </Button>
            </span>
          </Tooltip>
        )}

        {/* Status */}
        <Chip
          size="small"
          label={connected ? 'Connected' : 'Disconnected'}
          color={connected ? 'success' : 'default'}
        />
        {statusMsg && (
          <Typography variant="caption" color="error" sx={{ ml: 1 }}>
            {statusMsg}
          </Typography>
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
    </Box>
  );
}

export default MpyReplTerminal;
