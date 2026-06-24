import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Paper, Tabs, Tab, Typography, Button, TextField, Chip, Stack,
  MenuItem, Table, TableBody, TableCell, TableHead, TableRow, Divider,
  List, ListItem, ListItemText, IconButton, Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import SendIcon from '@mui/icons-material/Send';
import { mqttClient } from '@mhersztowski/web-client';
import {
  SERVER_INBOX, SERVER_OUTBOX,
  userInbox, userOutbox, clientInbox, clientOutbox,
  classifyTopic, parseEnvelope, stringifyEnvelope,
  EnumLogKind,
  type Envelope, type ILogMessage, type ActivityEntry, type ClientPresence, type ClientId,
} from '@mhersztowski/server-logic/web';
import { useAuth } from '@modules/auth';

const MAX = 300;

interface FeedItem { ts: number; type: string; raw: string }
interface PingState { latencyMs: number | null; waiting: boolean }

const kindColor: Record<string, 'default' | 'info' | 'warning' | 'error'> = {
  [EnumLogKind.Debug]: 'default',
  [EnumLogKind.Log]: 'info',
  [EnumLogKind.Warning]: 'warning',
  [EnumLogKind.Error]: 'error',
};

function fmtTime(ts?: number): string {
  return ts ? new Date(ts).toLocaleTimeString() : '';
}

export default function ServerLogicPage() {
  const { userName: routeUser } = useParams();
  const { currentUser } = useAuth();
  const userName = routeUser ?? currentUser?.name ?? 'admin';

  const [tab, setTab] = useState(0);
  const [serverReady, setServerReady] = useState(false);
  const [ping, setPing] = useState<PingState>({ latencyMs: null, waiting: false });
  const [logs, setLogs] = useState<ILogMessage[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [clients, setClients] = useState<ClientPresence[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);

  // log composer
  const [logMsg, setLogMsg] = useState('Hello from Server Logic page');
  const [logKind, setLogKind] = useState<EnumLogKind>(EnumLogKind.Log);
  // playground
  const [pubTopic, setPubTopic] = useState(SERVER_INBOX);
  const [pubPayload, setPubPayload] = useState('{\n  "type": "ping"\n}');

  const pingSentAt = useRef<Map<string, number>>(new Map());

  const clientStr = `${userName}/admin-web/server-logic-page`;

  const publish = useCallback((env: Envelope) => {
    mqttClient.rawPublish(SERVER_INBOX, stringifyEnvelope({ from: clientStr, ts: Date.now(), ...env }));
  }, [clientStr]);

  // Subscribe to the server outbox and dispatch by envelope type.
  useEffect(() => {
    const unsub = mqttClient.rawSubscribe(SERVER_OUTBOX, (payload) => {
      const env = parseEnvelope(payload);
      if (!env) return;
      setFeed((f) => [{ ts: Date.now(), type: env.type, raw: payload }, ...f].slice(0, MAX));
      switch (env.type) {
        case 'server.ready':
          setServerReady(true);
          break;
        case 'pong': {
          const sent = env.reqId ? pingSentAt.current.get(env.reqId) : undefined;
          setPing({ latencyMs: sent ? Date.now() - sent : null, waiting: false });
          setServerReady(true);
          break;
        }
        case 'log.entry':
          setLogs((l) => [env.payload as ILogMessage, ...l].slice(0, MAX));
          break;
        case 'log.snapshot':
          setLogs(((env.payload as ILogMessage[]) ?? []).slice().reverse());
          break;
        case 'activity.entry':
          setActivity((a) => [env.payload as ActivityEntry, ...a].slice(0, MAX));
          break;
        case 'activity.snapshot':
          setActivity(((env.payload as ActivityEntry[]) ?? []).slice().reverse());
          break;
        case 'clients.changed':
        case 'clients.snapshot':
          setClients((env.payload as ClientPresence[]) ?? []);
          break;
      }
    });

    // Initial pull + presence ping.
    publish({ type: 'log.list' });
    publish({ type: 'activity.list' });
    publish({ type: 'clients.list' });
    const reqId = crypto.randomUUID();
    pingSentAt.current.set(reqId, Date.now());
    setPing({ latencyMs: null, waiting: true });
    publish({ type: 'ping', reqId });

    return unsub;
  }, [publish]);

  const sendPing = useCallback(() => {
    const reqId = crypto.randomUUID();
    pingSentAt.current.set(reqId, Date.now());
    setPing({ latencyMs: null, waiting: true });
    publish({ type: 'ping', reqId });
  }, [publish]);

  const sendLog = useCallback(() => {
    if (!logMsg.trim()) return;
    publish({ type: 'log', payload: { message: logMsg, kind: logKind } });
  }, [logMsg, logKind, publish]);

  const rawPublish = useCallback(() => {
    mqttClient.rawPublish(pubTopic, pubPayload);
  }, [pubTopic, pubPayload]);

  const sampleClient: ClientId = useMemo(
    () => ({ userName, device: 'desktop', clientType: 'web', id: '<id>' }),
    [userName],
  );

  const pubClass = useMemo(() => classifyTopic(pubTopic), [pubTopic]);

  return (
    <Box sx={{ p: 2, maxWidth: 1100, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
        <Typography variant="h5">Server Logic</Typography>
        <Chip
          size="small"
          color={serverReady ? 'success' : 'default'}
          label={serverReady ? 'server online' : 'no server yet'}
        />
        <Chip
          size="small"
          variant="outlined"
          label={`ping: ${ping.waiting ? '…' : ping.latencyMs != null ? `${ping.latencyMs} ms` : '—'}`}
        />
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Send ping to server/inbox">
          <Button size="small" variant="outlined" onClick={sendPing}>Ping</Button>
        </Tooltip>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Talks to <code>@mhersztowski/server-logic</code> (IotServer) over MQTT — publishes to{' '}
        <code>{SERVER_INBOX}</code>, listens on <code>{SERVER_OUTBOX}</code>.
      </Typography>

      <Paper variant="outlined">
        <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
          <Tab label="Overview" />
          <Tab label={`Log (${logs.length})`} />
          <Tab label={`Activity (${activity.length})`} />
          <Tab label={`Clients (${clients.length})`} />
          <Tab label="Topics & Playground" />
        </Tabs>
        <Divider />

        {/* ── Overview ───────────────────────────────────────────────── */}
        {tab === 0 && (
          <Box sx={{ p: 2 }}>
            <Stack spacing={1}>
              <Row label="Server status" value={serverReady ? 'online (received server.ready / pong)' : 'waiting for server…'} />
              <Row label="Ping latency" value={ping.latencyMs != null ? `${ping.latencyMs} ms` : ping.waiting ? 'waiting…' : '—'} />
              <Row label="Log entries" value={String(logs.length)} />
              <Row label="Activity entries" value={String(activity.length)} />
              <Row label="Known clients" value={String(clients.length)} />
              <Row label="Outbox messages seen" value={String(feed.length)} />
            </Stack>
          </Box>
        )}

        {/* ── Log ────────────────────────────────────────────────────── */}
        {tab === 1 && (
          <Box sx={{ p: 2 }}>
            <Toolbar onReload={() => publish({ type: 'log.list' })} onClear={() => setLogs([])} />
            <Stack direction="row" spacing={1} sx={{ my: 1 }}>
              <TextField
                size="small" fullWidth label="Message" value={logMsg}
                onChange={(e) => setLogMsg(e.target.value)}
              />
              <TextField
                size="small" select label="Kind" value={logKind} sx={{ minWidth: 140 }}
                onChange={(e) => setLogKind(e.target.value as EnumLogKind)}
              >
                {Object.values(EnumLogKind).map((k) => <MenuItem key={k} value={k}>{k}</MenuItem>)}
              </TextField>
              <Button variant="contained" startIcon={<SendIcon />} onClick={sendLog}>Log</Button>
            </Stack>
            <List dense sx={{ maxHeight: 460, overflow: 'auto' }}>
              {logs.length === 0 && <Empty text="No log entries. Send one above or hit Reload." />}
              {logs.map((m, i) => (
                <ListItem key={i} divider>
                  <Chip size="small" sx={{ mr: 1, minWidth: 70 }} color={kindColor[m.kind] ?? 'default'} label={m.kind} />
                  <ListItemText
                    primary={m.message}
                    secondary={`${fmtTime(m.ts)}${m.source ? ` · ${m.source}` : ''}`}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        )}

        {/* ── Activity ───────────────────────────────────────────────── */}
        {tab === 2 && (
          <Box sx={{ p: 2 }}>
            <Toolbar onReload={() => publish({ type: 'activity.list' })} onClear={() => setActivity([])} />
            <List dense sx={{ maxHeight: 520, overflow: 'auto', mt: 1 }}>
              {activity.length === 0 && <Empty text="No activity yet." />}
              {activity.map((a, i) => (
                <ListItem key={i} divider>
                  <Chip size="small" variant="outlined" sx={{ mr: 1 }} label={a.kind} />
                  <ListItemText primary={a.message} secondary={fmtTime(a.ts)} />
                </ListItem>
              ))}
            </List>
          </Box>
        )}

        {/* ── Clients ────────────────────────────────────────────────── */}
        {tab === 3 && (
          <Box sx={{ p: 2 }}>
            <Toolbar onReload={() => publish({ type: 'clients.list' })} />
            <Table size="small" sx={{ mt: 1 }}>
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Device</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Id</TableCell>
                  <TableCell>Connected</TableCell>
                  <TableCell>Last seen</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {clients.length === 0 && (
                  <TableRow><TableCell colSpan={6}><Empty text="No clients registered (waiting for client.hello)." /></TableCell></TableRow>
                )}
                {clients.map((p) => (
                  <TableRow key={`${p.client.userName}/${p.client.device}-${p.client.clientType}/${p.client.id}`}>
                    <TableCell>{p.client.userName}</TableCell>
                    <TableCell>{p.client.device}</TableCell>
                    <TableCell>{p.client.clientType}</TableCell>
                    <TableCell>{p.client.id}</TableCell>
                    <TableCell>{fmtTime(p.connectedAt)}</TableCell>
                    <TableCell>{fmtTime(p.lastSeen)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}

        {/* ── Topics & Playground ────────────────────────────────────── */}
        {tab === 4 && (
          <Box sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Topic scheme (for {userName})</Typography>
            <Table size="small" sx={{ mb: 2 }}>
              <TableBody>
                <TopicRow label="server inbox" topic={SERVER_INBOX} />
                <TopicRow label="server outbox" topic={SERVER_OUTBOX} />
                <TopicRow label="user inbox" topic={userInbox(userName)} />
                <TopicRow label="user outbox" topic={userOutbox(userName)} />
                <TopicRow label="client inbox" topic={clientInbox(sampleClient)} />
                <TopicRow label="client outbox" topic={clientOutbox(sampleClient)} />
              </TableBody>
            </Table>

            <Typography variant="subtitle2" gutterBottom>Raw publish</Typography>
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField size="small" fullWidth label="Topic" value={pubTopic} onChange={(e) => setPubTopic(e.target.value)} />
                <Chip size="small" variant="outlined"
                  label={pubClass.scope === 'unknown' ? 'unknown topic' : `${pubClass.scope}/${pubClass.direction ?? '?'}`} />
              </Stack>
              <Stack direction="row" spacing={1}>
                {['ping', 'clients.list', 'log.list', 'activity.list'].map((t) => (
                  <Button key={t} size="small" variant="text"
                    onClick={() => { setPubTopic(SERVER_INBOX); setPubPayload(`{\n  "type": "${t}"\n}`); }}>
                    {t}
                  </Button>
                ))}
              </Stack>
              <TextField
                size="small" fullWidth multiline minRows={4} label="Payload (JSON)"
                value={pubPayload} onChange={(e) => setPubPayload(e.target.value)}
                sx={{ '& textarea': { fontFamily: 'monospace', fontSize: 13 } }}
              />
              <Box>
                <Button variant="contained" startIcon={<SendIcon />} onClick={rawPublish}>Publish</Button>
              </Box>
            </Stack>

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" gutterBottom>Outbox monitor ({SERVER_OUTBOX})</Typography>
            <List dense sx={{ maxHeight: 300, overflow: 'auto', bgcolor: 'action.hover', borderRadius: 1 }}>
              {feed.length === 0 && <Empty text="Nothing received yet." />}
              {feed.map((m, i) => (
                <ListItem key={i} divider>
                  <Chip size="small" sx={{ mr: 1 }} label={m.type} />
                  <ListItemText
                    primaryTypographyProps={{ sx: { fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' } }}
                    primary={m.raw}
                    secondary={fmtTime(m.ts)}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        )}
      </Paper>
    </Box>
  );
}

// ── small presentational helpers ───────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" spacing={2}>
      <Typography sx={{ minWidth: 180 }} color="text.secondary">{label}</Typography>
      <Typography>{value}</Typography>
    </Stack>
  );
}

function Toolbar({ onReload, onClear }: { onReload: () => void; onClear?: () => void }) {
  return (
    <Stack direction="row" spacing={1}>
      <Tooltip title="Reload snapshot from server">
        <IconButton size="small" onClick={onReload}><RefreshIcon fontSize="small" /></IconButton>
      </Tooltip>
      {onClear && (
        <Tooltip title="Clear local view">
          <IconButton size="small" onClick={onClear}><DeleteSweepIcon fontSize="small" /></IconButton>
        </Tooltip>
      )}
    </Stack>
  );
}

function TopicRow({ label, topic }: { label: string; topic: string }) {
  return (
    <TableRow>
      <TableCell sx={{ color: 'text.secondary', width: 140 }}>{label}</TableCell>
      <TableCell><code>{topic}</code></TableCell>
    </TableRow>
  );
}

function Empty({ text }: { text: string }) {
  return <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>{text}</Typography>;
}
