import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton, Tab, Tabs, Tooltip, Typography } from '@mui/material';
import { Add as AddIcon, Circle as CircleIcon, Close as CloseIcon } from '@mui/icons-material';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { GlobalWindow } from './GlobalWindow';
import { useGlobalWindows } from './GlobalWindowsContext';
import { minisApi } from '../services/MinisApiService';

type SessionStatus = 'connecting' | 'connected' | 'idle' | 'error';

interface SessionData {
  term: Terminal;
  fitAddon: FitAddon;
  ws: WebSocket | null;
}

interface TabInfo {
  id: number;
  label: string;
  status: SessionStatus;
  errorMsg: string;
}

let globalSessionCounter = 0;

export function GlobalTerminal() {
  const { windows, close, minimize, restore } = useGlobalWindows();
  const windowState = windows.get('terminal');
  const isOpen = windowState === 'open';

  // xterm/ws data — not in React state
  const sessionsRef = useRef<Map<number, SessionData>>(new Map());
  const openedSet = useRef<Set<number>>(new Set());
  const divRefsMap = useRef<Map<number, HTMLDivElement | null>>(new Map());

  // React state for UI
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Cleanup all sessions ───────────────────────────────────────────────────
  const cleanupAll = useCallback(() => {
    for (const [, s] of sessionsRef.current) {
      s.ws?.close();
      s.term.dispose();
    }
    sessionsRef.current.clear();
    openedSet.current.clear();
    divRefsMap.current.clear();
    setTabs([]);
    setActiveId(null);
  }, []);

  // Cleanup when window is closed
  const prevWindowState = useRef(windowState);
  useEffect(() => {
    const prev = prevWindowState.current;
    prevWindowState.current = windowState;
    // Closed (state went from open/minimized to undefined)
    if ((prev === 'open' || prev === 'minimized') && windowState === undefined) {
      cleanupAll();
    }
  }, [windowState, cleanupAll]);

  // Cleanup on unmount
  useEffect(() => () => { cleanupAll(); }, [cleanupAll]); // eslint-disable-line

  // ── Update a tab's status in React state ──────────────────────────────────
  const updateTabStatus = useCallback((id: number, status: SessionStatus, errorMsg = '') => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, status, errorMsg } : t)));
  }, []);

  // ── Connect WebSocket for a session ──────────────────────────────────────
  const connectSession = useCallback(async (id: number) => {
    const session = sessionsRef.current.get(id);
    if (!session) return;

    updateTabStatus(id, 'connecting');
    try {
      const { ticket } = await minisApi.getTerminalTicket();
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}/ws/terminal`);
      session.ws = ws;

      ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', ticket }));

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as { type: string; data?: string; code?: number };
          if (msg.type === 'output' && msg.data) {
            session.term.write(msg.data);
          } else if (msg.type === 'ready') {
            updateTabStatus(id, 'connected');
            const dims = session.fitAddon.proposeDimensions();
            if (dims) ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
          } else if (msg.type === 'exit') {
            session.term.write(`\r\n\x1b[33m[Process exited with code ${msg.code ?? 0}]\x1b[0m\r\n`);
            updateTabStatus(id, 'idle');
          } else if (msg.type === 'error') {
            session.term.write(`\r\n\x1b[31m[Error: ${msg.data}]\x1b[0m\r\n`);
            updateTabStatus(id, 'error', msg.data ?? '');
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        if (session.ws === ws) session.ws = null;
        setTabs((prev) => prev.map((t) => {
          if (t.id !== id || t.status === 'idle') return t;
          return { ...t, status: 'error' as SessionStatus, errorMsg: 'Connection closed' };
        }));
        session.term.write('\r\n\x1b[33m[Connection closed — press Reconnect to try again]\x1b[0m\r\n');
      };

      ws.onerror = () => {
        const msg = 'WebSocket connection failed';
        updateTabStatus(id, 'error', msg);
        session.term.write(`\r\n\x1b[31m[${msg}]\x1b[0m\r\n`);
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateTabStatus(id, 'error', msg);
      session.term.write(`\r\n\x1b[31m[Connection error: ${msg}]\x1b[0m\r\n`);
    }
  }, [updateTabStatus]);

  // ── Create a new session ─────────────────────────────────────────────────
  const addSession = useCallback(() => {
    const id = ++globalSessionCounter;
    const label = `Session ${id}`;

    const term = new Terminal({
      theme: { background: '#1e1e1e', foreground: '#d4d4d4' },
      fontSize: 14,
      fontFamily: 'monospace',
      cursorBlink: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

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
      const s = sessionsRef.current.get(id);
      if (s?.ws?.readyState === WebSocket.OPEN) {
        s.ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    sessionsRef.current.set(id, { term, fitAddon, ws: null });
    setTabs((prev) => [...prev, { id, label, status: 'connecting', errorMsg: '' }]);
    setActiveId(id);
  }, []);

  // ── Remove a session ─────────────────────────────────────────────────────
  const removeSession = useCallback((id: number) => {
    const session = sessionsRef.current.get(id);
    if (session) {
      session.ws?.close();
      session.term.dispose();
      sessionsRef.current.delete(id);
      openedSet.current.delete(id);
      divRefsMap.current.delete(id);
    }
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      setActiveId((cur) => {
        if (cur !== id) return cur;
        return next.length > 0 ? next[next.length - 1].id : null;
      });
      return next;
    });
  }, []);

  // ── Div callback ref — open xterm once div is in DOM ─────────────────────
  const setDivRef = useCallback((id: number, el: HTMLDivElement | null) => {
    divRefsMap.current.set(id, el);
    if (el && !openedSet.current.has(id)) {
      const session = sessionsRef.current.get(id);
      if (session) {
        openedSet.current.add(id);
        session.term.open(el);
        session.fitAddon.fit();
        connectSession(id);
      }
    }
  }, [connectSession]);

  // ── Resize observer on container ─────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (activeId === null) return;
      const session = sessionsRef.current.get(activeId);
      if (!session) return;
      session.fitAddon.fit();
      if (session.ws?.readyState === WebSocket.OPEN) {
        const dims = session.fitAddon.proposeDimensions();
        if (dims) session.ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [activeId]);

  // ── Re-fit on tab switch ──────────────────────────────────────────────────
  useEffect(() => {
    if (activeId === null) return;
    const session = sessionsRef.current.get(activeId);
    if (!session) return;
    setTimeout(() => session.fitAddon.fit(), 30);
  }, [activeId]);

  // ── Auto-open first session when window opens ─────────────────────────────
  useEffect(() => {
    if (isOpen && tabs.length === 0) addSession();
  }, [isOpen]); // eslint-disable-line

  // ── Status dot color ─────────────────────────────────────────────────────
  const statusColor = (status: SessionStatus) => {
    if (status === 'connected') return '#4caf50';
    if (status === 'error') return '#f44336';
    if (status === 'connecting') return '#ff9800';
    return '#9e9e9e';
  };

  return (
    <GlobalWindow
      windowName="terminal"
      title="Terminal"
      open={isOpen}
      minimized={windowState === 'minimized'}
      onClose={() => close('terminal')}
      onMinimize={() => minimize('terminal')}
      onRestore={() => restore('terminal')}
      defaultWidth={950}
      defaultHeight={580}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Tab bar */}
        <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'divider', minHeight: 36 }}>
          <Tabs
            value={activeId ?? false}
            onChange={(_, val) => setActiveId(val as number)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ flexGrow: 1, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0, px: 1.5, textTransform: 'none' } }}
          >
            {tabs.map((tab) => (
              <Tab
                key={tab.id}
                value={tab.id}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <CircleIcon sx={{ fontSize: 8, color: statusColor(tab.status), flexShrink: 0 }} />
                    <Typography variant="caption">{tab.label}</Typography>
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); removeSession(tab.id); }}
                      sx={{ p: 0.25, ml: 0.5, '&:hover': { color: 'error.main' } }}
                    >
                      <CloseIcon sx={{ fontSize: 12 }} />
                    </IconButton>
                  </Box>
                }
              />
            ))}
          </Tabs>
          <Tooltip title="New session">
            <IconButton size="small" onClick={addSession} sx={{ mx: 0.5, flexShrink: 0 }}>
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Terminal panes — all in DOM, active one visible */}
        <Box ref={containerRef} sx={{ flexGrow: 1, position: 'relative', overflow: 'hidden', bgcolor: '#1e1e1e' }}>
          {tabs.map((tab) => (
            <Box
              key={tab.id}
              ref={(el) => setDivRef(tab.id, el as HTMLDivElement | null)}
              sx={{
                position: 'absolute',
                inset: 0,
                display: activeId === tab.id ? 'block' : 'none',
                '& .xterm': { height: '100%', padding: '4px' },
                '& .xterm-viewport': { overflowY: 'auto' },
              }}
            />
          ))}
          {tabs.length === 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Typography variant="body2" color="text.secondary">No sessions. Click + to start one.</Typography>
            </Box>
          )}
        </Box>
      </Box>
    </GlobalWindow>
  );
}
