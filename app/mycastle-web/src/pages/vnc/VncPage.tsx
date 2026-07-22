/**
 * Tools → VNC: a noVNC client with an EventMode toolbar. The EventMode picker
 * switches how touch/pen gestures are mapped to the remote (see eventModes.ts):
 * general desktop/mobile defaults plus app-specific presets for FreeCAD and
 * CircuitMaker running on a Windows server driven from a touch/pen client.
 *
 * The remote must be reachable over WebSocket (a websockify TCP↔WS proxy in
 * front of the VNC server), e.g. `wss://host/websockify` or `ws://host:6080/`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box, Button, IconButton, Tooltip, Typography, TextField, MenuItem,
  FormControlLabel, Switch, Popover, Alert, Divider,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import RFB from '@novnc/novnc';
import { EVENT_MODES, DEFAULT_EVENT_MODE, getEventMode } from './eventModes';
import { VncInputController } from './VncInputController';

const LS_HOST = 'vnc.host';
const LS_PORT = 'vnc.port';
const LS_PATH = 'vnc.path';
const LS_SECURE = 'vnc.secure';
const LS_PW = 'vnc.password';
const LS_REMEMBER = 'vnc.rememberPw';
const LS_MODE = 'vnc.eventMode';

const KEYSYM_ESC = 0xff1b;
const KEYSYM_SPACE = 0x20;

/**
 * Build a websockify WebSocket URL from the connection fields. Tolerant of a
 * full URL pasted into the Host field (e.g. "ws://192.168.0.207:6080") — the
 * scheme, embedded port and path are extracted so we never emit "ws://ws://…".
 */
function buildWsUrl(secure: boolean, host: string, port: string, path: string): string {
  let h = host.trim().replace(/^[a-z]+:\/\//i, ''); // drop any ws://, wss://, http://, https://
  let embeddedPath = '';
  const slash = h.indexOf('/');
  if (slash >= 0) { embeddedPath = h.slice(slash); h = h.slice(0, slash); }
  let embeddedPort = '';
  const colon = h.indexOf(':');
  if (colon >= 0) { embeddedPort = h.slice(colon + 1); h = h.slice(0, colon); }

  const scheme = secure ? 'wss' : 'ws';
  const usePort = (port.trim() || embeddedPort).trim();
  const portPart = usePort ? `:${usePort}` : '';
  let tail = (path.trim() || embeddedPath).trim();
  if (tail && !tail.startsWith('/')) tail = `/${tail}`;
  return `${scheme}://${h}${portPart}${tail}`;
}

export default function VncPage() {
  const pageSecure = window.location.protocol === 'https:';
  const [host, setHost] = useState(() => localStorage.getItem(LS_HOST) ?? '');
  const [port, setPort] = useState(() => localStorage.getItem(LS_PORT) ?? '6080');
  const [path, setPath] = useState(() => localStorage.getItem(LS_PATH) ?? '');
  // Default the scheme to match the page (https page → wss, else ws) to avoid mixed-content blocks.
  const [secure, setSecure] = useState(() => {
    const saved = localStorage.getItem(LS_SECURE);
    return saved != null ? saved === '1' : pageSecure;
  });
  const [rememberPw, setRememberPw] = useState(() => localStorage.getItem(LS_REMEMBER) === '1');
  const [password, setPassword] = useState(() => (localStorage.getItem(LS_REMEMBER) === '1' ? (localStorage.getItem(LS_PW) ?? '') : ''));
  const [eventModeId, setEventModeId] = useState(() => localStorage.getItem(LS_MODE) ?? DEFAULT_EVENT_MODE);
  const [scale, setScale] = useState(true);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [helpAnchor, setHelpAnchor] = useState<HTMLElement | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);
  const controllerRef = useRef<VncInputController | null>(null);
  const connectTimerRef = useRef<number | null>(null);
  // Latest event-mode id, read live by the controller without re-attaching.
  const eventModeRef = useRef(eventModeId);
  useEffect(() => { eventModeRef.current = eventModeId; localStorage.setItem(LS_MODE, eventModeId); }, [eventModeId]);

  const preset = getEventMode(eventModeId);

  const cleanup = useCallback(() => {
    if (connectTimerRef.current != null) { window.clearTimeout(connectTimerRef.current); connectTimerRef.current = null; }
    controllerRef.current?.detach();
    controllerRef.current = null;
    if (rfbRef.current) {
      try { rfbRef.current.disconnect(); } catch { /* ignore */ }
      rfbRef.current = null;
    }
    setConnected(false);
    setConnecting(false);
  }, []);

  const connect = useCallback(() => {
    if (!containerRef.current || !host.trim()) return;

    // Persist connection fields so they are remembered next time.
    localStorage.setItem(LS_HOST, host.trim());
    localStorage.setItem(LS_PORT, port.trim());
    localStorage.setItem(LS_PATH, path.trim());
    localStorage.setItem(LS_SECURE, secure ? '1' : '0');
    localStorage.setItem(LS_REMEMBER, rememberPw ? '1' : '0');
    if (rememberPw) localStorage.setItem(LS_PW, password);
    else localStorage.removeItem(LS_PW);

    const wsUrl = buildWsUrl(secure, host, port, path);

    // Mixed content: an https page cannot open an insecure ws:// socket — the
    // browser kills it during the handshake ("Disconnected unexpectedly").
    if (pageSecure && !secure) {
      setStatus('This page is served over HTTPS, so it can only connect with a secure WebSocket (wss). Enable "Secure (wss)" and run websockify behind TLS, or open MyCastle over http.');
      return;
    }

    cleanup();
    setStatus(null);
    setConnecting(true);

    let rfb: RFB;
    try {
      rfb = new RFB(containerRef.current, wsUrl, {
        credentials: password ? { password } : undefined,
        shared: true,
      });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
      setConnecting(false);
      return;
    }
    rfbRef.current = rfb;
    rfb.scaleViewport = scale;
    rfb.clipViewport = !scale;
    rfb.focusOnClick = true;
    rfb.showDotCursor = true;
    rfb.background = 'rgb(20,20,20)';

    // If neither connect nor disconnect fires, the WS handshake is likely hanging.
    connectTimerRef.current = window.setTimeout(() => {
      if (rfbRef.current === rfb) {
        setStatus(`No response from ${wsUrl} within 12s. Is websockify running on that host:port and pointing at a live VNC server? (e.g. \`websockify 6080 localhost:5900\`)`);
        cleanup();
      }
    }, 12000);

    rfb.addEventListener('connect', () => {
      if (connectTimerRef.current != null) { window.clearTimeout(connectTimerRef.current); connectTimerRef.current = null; }
      setConnecting(false);
      setConnected(true);
      setStatus(null);
      // The input overlay is wired in a separate effect once React has rendered it.
    });
    rfb.addEventListener('disconnect', (e: Event) => {
      if (connectTimerRef.current != null) { window.clearTimeout(connectTimerRef.current); connectTimerRef.current = null; }
      const clean = (e as CustomEvent<{ clean: boolean }>).detail?.clean;
      setConnected(false);
      setConnecting(false);
      controllerRef.current?.detach();
      controllerRef.current = null;
      rfbRef.current = null;
      if (!clean) setStatus(`Disconnected unexpectedly from ${wsUrl}. Check that websockify is running and reachable, that the VNC server is up, and that the scheme (ws/wss) matches your setup.`);
    });
    rfb.addEventListener('credentialsrequired', () => {
      if (password) rfb.sendCredentials({ password });
      else setStatus('This server requires a password.');
    });
    rfb.addEventListener('securityfailure', (e: Event) => {
      const d = (e as CustomEvent<{ reason?: string }>).detail;
      setStatus(`Security failure: ${d?.reason ?? 'unknown'}`);
    });
  }, [host, port, path, secure, password, rememberPw, scale, cleanup, pageSecure]);

  /**
   * Diagnostic: open a raw WebSocket to the same URL and report exactly what
   * happens. This separates "the proxy is unreachable" (never opens) from
   * "the proxy answers but VNC drops" (opens fine, but noVNC still disconnects).
   */
  const testConnection = useCallback(() => {
    if (!host.trim()) return;
    const wsUrl = buildWsUrl(secure, host, port, path);
    if (pageSecure && !secure) {
      setStatus('This page is HTTPS — a ws:// test will be blocked by the browser. Enable "wss".');
      return;
    }
    setStatus(`Testing ${wsUrl} …`);
    let done = false;
    let opened = false;
    let openedAt = 0;
    let ws: WebSocket;
    try { ws = new WebSocket(wsUrl); } catch (e) { setStatus(`Cannot create WebSocket: ${e instanceof Error ? e.message : String(e)}`); return; }
    const finish = (msg: string) => { if (done) return; done = true; window.clearTimeout(timer); setStatus(msg); try { ws.close(); } catch { /* ignore */ } };
    // Overall guard.
    const timer = window.setTimeout(() => {
      if (opened) {
        // The socket opened and STAYED open — the proxy and its target are both
        // alive. So the failure is above the transport, in the VNC/RFB handshake.
        finish(`${wsUrl}: WebSocket opened and stayed up — websockify AND the VNC server are reachable. The disconnect happens in the VNC handshake itself. Usual causes: the server uses a security type noVNC can't do (UltraVNC MS-Logon / encryption plugin, VeNCrypt/TLS, or Apple screen sharing). Use TigerVNC/TightVNC with plain "VNC password" authentication, and disable any encryption/DH plugin.`);
      } else {
        finish(`No response from ${wsUrl} within 6s — websockify is not listening on that host:port, or a firewall is blocking it.`);
      }
    }, 6000);
    ws.onopen = () => { opened = true; openedAt = performance.now(); setStatus(`${wsUrl}: WebSocket open — watching for early close…`); };
    ws.onerror = () => finish(`WebSocket to ${wsUrl} failed — websockify is unreachable at that host/port (not running, wrong port, or firewall).`);
    ws.onclose = (ev) => {
      if (done) return;
      if (!opened) {
        finish(`WebSocket to ${wsUrl} closed before opening (code ${ev.code}${ev.reason ? `, ${ev.reason}` : ''}). Likely not a websockify endpoint, wrong path, or scheme mismatch.`);
      } else {
        const ms = Math.round(performance.now() - openedAt);
        finish(`${wsUrl}: websockify ACCEPTED the WebSocket but closed it after ${ms}ms (code ${ev.code}${ev.reason ? `, ${ev.reason}` : ''}). This means its target VNC server did not respond — wrong target host:port or the VNC server is not running. Start it as e.g. \`websockify ${port || '6080'} localhost:5900\` with a VNC server actually listening on :5900 (check the display: :0→5900, :1→5901).`);
      }
    };
  }, [host, port, path, secure, pageSecure]);

  // Disconnect on unmount.
  useEffect(() => cleanup, [cleanup]);

  // Wire the custom input overlay once connected and the DOM (canvas + overlay) exists.
  useEffect(() => {
    if (!connected) return;
    const rfb = rfbRef.current;
    const canvas = containerRef.current?.querySelector('canvas');
    if (!rfb || !canvas || !overlayRef.current) return;
    const controller = new VncInputController(
      canvas as HTMLElement,
      overlayRef.current,
      rfb,
      () => getEventMode(eventModeRef.current),
      () => { try { rfb.focus(); } catch { /* ignore */ } },
    );
    controller.attach();
    controllerRef.current = controller;
    return () => { controller.detach(); controllerRef.current = null; };
  }, [connected]);

  // Apply scale changes live.
  useEffect(() => {
    if (rfbRef.current) { rfbRef.current.scaleViewport = scale; rfbRef.current.clipViewport = !scale; }
  }, [scale]);

  const sendKey = useCallback((keysym: number, code: string) => {
    rfbRef.current?.sendKey(keysym, code);
    try { rfbRef.current?.focus(); } catch { /* ignore */ }
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', bgcolor: '#111' }}>
      {/* Toolbar */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, flexWrap: 'wrap',
        bgcolor: 'background.paper', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
      }}>
        <Typography variant="subtitle2" sx={{ mr: 1 }}>VNC</Typography>

        <TextField
          size="small" placeholder="host or IP" label="Host"
          value={host} onChange={(e) => setHost(e.target.value)}
          sx={{ minWidth: 160 }} disabled={connected || connecting}
        />
        <TextField
          size="small" label="Port" placeholder="6080"
          value={port} onChange={(e) => setPort(e.target.value)}
          sx={{ width: 90 }} disabled={connected || connecting}
        />
        <TextField
          size="small" label="Path" placeholder="/websockify"
          value={path} onChange={(e) => setPath(e.target.value)}
          sx={{ width: 130 }} disabled={connected || connecting}
        />
        <Tooltip title="Use a secure WebSocket (wss). Required when MyCastle runs over HTTPS.">
          <FormControlLabel
            control={<Switch size="small" checked={secure} onChange={(e) => setSecure(e.target.checked)} disabled={connected || connecting} />}
            label={<Typography variant="caption">wss</Typography>}
          />
        </Tooltip>
        <TextField
          size="small" type="password" label="Password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          sx={{ width: 120 }} disabled={connected || connecting}
        />
        <Tooltip title="Remember host/port and password on this device">
          <FormControlLabel
            control={<Switch size="small" checked={rememberPw} onChange={(e) => setRememberPw(e.target.checked)} disabled={connected || connecting} />}
            label={<Typography variant="caption">Save</Typography>}
          />
        </Tooltip>

        {connected ? (
          <Button size="small" variant="outlined" color="error" startIcon={<StopIcon />} onClick={cleanup}>Disconnect</Button>
        ) : (
          <>
            <Button size="small" variant="contained" startIcon={<PlayArrowIcon />} onClick={connect} disabled={!host.trim() || connecting}>
              {connecting ? 'Connecting…' : 'Connect'}
            </Button>
            <Tooltip title="Diagnose: open a raw WebSocket to check reachability">
              <span><Button size="small" onClick={testConnection} disabled={!host.trim() || connecting}>Test</Button></span>
            </Tooltip>
          </>
        )}

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* EventMode picker */}
        <TextField
          select size="small" label="EventMode"
          value={eventModeId} onChange={(e) => setEventModeId(e.target.value)}
          sx={{ minWidth: 220 }}
        >
          {EVENT_MODES.map((m) => <MenuItem key={m.id} value={m.id}>{m.label}</MenuItem>)}
        </TextField>
        <Tooltip title="EventMode help">
          <IconButton size="small" onClick={(e) => setHelpAnchor(e.currentTarget)}><HelpOutlineIcon fontSize="small" /></IconButton>
        </Tooltip>

        <Box sx={{ flex: 1 }} />

        <FormControlLabel
          control={<Switch size="small" checked={scale} onChange={(e) => setScale(e.target.checked)} />}
          label={<Typography variant="caption">Fit</Typography>}
        />
        <Tooltip title="Send Esc"><span><Button size="small" disabled={!connected} onClick={() => sendKey(KEYSYM_ESC, 'Escape')}>Esc</Button></span></Tooltip>
        <Tooltip title="Send Space (rotate while placing)"><span><Button size="small" disabled={!connected} onClick={() => sendKey(KEYSYM_SPACE, 'Space')}>Space</Button></span></Tooltip>
        <Tooltip title="Ctrl+Alt+Del"><span><Button size="small" disabled={!connected} onClick={() => rfbRef.current?.sendCtrlAltDel()}>C-A-D</Button></span></Tooltip>
        <Tooltip title="Focus keyboard"><span><IconButton size="small" disabled={!connected} onClick={() => { try { rfbRef.current?.focus(); } catch { /* ignore */ } }}><KeyboardIcon fontSize="small" /></IconButton></span></Tooltip>
        <Tooltip title="Fullscreen"><IconButton size="small" onClick={toggleFullscreen}><FullscreenIcon fontSize="small" /></IconButton></Tooltip>
      </Box>

      {status && <Alert severity="warning" onClose={() => setStatus(null)} sx={{ borderRadius: 0 }}>{status}</Alert>}

      {/* VNC viewport + input overlay */}
      <Box sx={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <Box ref={containerRef} sx={{ position: 'absolute', inset: 0 }} />
        {connected && (
          <Box
            ref={overlayRef}
            sx={{ position: 'absolute', inset: 0, touchAction: 'none', cursor: 'default' }}
          />
        )}
        {!connected && !connecting && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.disabled', flexDirection: 'column', gap: 1, p: 3, textAlign: 'center' }}>
            <Typography variant="body2">Enter host and port, then press Connect.</Typography>
            <Typography variant="caption">
              The VNC server must be exposed over WebSocket via a websockify proxy
              (e.g. <code>websockify 6080 localhost:5900</code> → <code>ws://host:6080/</code>).
            </Typography>
          </Box>
        )}
      </Box>

      {/* EventMode help popover */}
      <Popover
        open={Boolean(helpAnchor)} anchorEl={helpAnchor} onClose={() => setHelpAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 2, maxWidth: 380 }}>
          <Typography variant="subtitle2" gutterBottom>{preset.label}</Typography>
          <Typography variant="body2" color="text.secondary" paragraph>{preset.description}</Typography>
          {preset.serverHint && <Alert severity="info" sx={{ mt: 1 }}>{preset.serverHint}</Alert>}
        </Box>
      </Popover>
    </Box>
  );
}
