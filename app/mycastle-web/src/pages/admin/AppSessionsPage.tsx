import { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, CircularProgress, Alert,
  Chip, Tooltip, LinearProgress, Select, MenuItem, FormControl,
  InputLabel, Stack, ToggleButton, ToggleButtonGroup, Tab, Tabs,
} from '@mui/material';
import {
  Computer as ComputerIcon,
  PhoneAndroid as MobileIcon,
  Language as WebIcon,
  FiberManualRecord as DotIcon,
  Code as CodeIcon,
  Memory as MemoryIcon,
  SportsEsports as PygameIcon,
  Router as IotIcon,
  Notes as NotesIcon,
  Apps as PimIcon,
  Edit as EditorIcon,
  ElectricalServices as ElecIcon,
} from '@mui/icons-material';
import { minisApi, type AppSession, type AppSessionWeekEntry, type ProjectTimeStat } from '../../services/MinisApiService';
import type { AppSessionPlatform } from '../../services/MinisApiService';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const ONLINE_THRESHOLD_MS = 90_000; // 1.5 × heartbeat interval

function isOnline(session: AppSession): boolean {
  return Date.now() - session.lastSeenAt < ONLINE_THRESHOLD_MS;
}

function fmtDuration(seconds: number): string {
  if (seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Last 7 days YYYY-MM-DD */
function last7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function shortDay(isoDate: string): string {
  return new Date(isoDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}

function PlatformIcon({ platform }: { platform: AppSessionPlatform }) {
  if (platform === 'desktop') return <ComputerIcon fontSize="small" />;
  if (platform === 'mobile') return <MobileIcon fontSize="small" />;
  return <WebIcon fontSize="small" />;
}

// ──────────────────────────────────────────────────────────────────────────────
// Weekly mini bar chart (pure CSS)
// ──────────────────────────────────────────────────────────────────────────────

interface WeekBarChartProps {
  entry: AppSessionWeekEntry;
  days: string[];
}

function WeekBarChart({ entry, days }: WeekBarChartProps) {
  const dayMap = new Map(entry.days.map((d) => [d.date, d]));
  const maxTotal = Math.max(...days.map((d) => dayMap.get(d)?.totalSeconds ?? 0), 1);

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, height: 44 }}>
      {days.map((date) => {
        const bucket = dayMap.get(date);
        const total = bucket?.totalSeconds ?? 0;
        const active = bucket?.activeSeconds ?? 0;
        const totalH = Math.round((total / maxTotal) * 40);
        const activeH = total > 0 ? Math.round((active / total) * totalH) : 0;

        return (
          <Tooltip
            key={date}
            title={
              <Box>
                <Typography variant="caption">{shortDay(date)}</Typography><br />
                <Typography variant="caption">Total: {fmtDuration(total)}</Typography><br />
                <Typography variant="caption">Active: {fmtDuration(active)}</Typography>
              </Box>
            }
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 14 }}>
              <Box sx={{
                width: 10, height: totalH, minHeight: total > 0 ? 2 : 0,
                bgcolor: 'primary.dark', borderRadius: 0.5,
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden',
              }}>
                {activeH > 0 && (
                  <Box sx={{ width: '100%', height: activeH, bgcolor: 'primary.main' }} />
                )}
              </Box>
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Sessions table
// ──────────────────────────────────────────────────────────────────────────────

interface SessionTableProps {
  sessions: AppSession[];
  weeklyMap: Map<string, AppSessionWeekEntry>;
  days: string[];
}

function SessionTable({ sessions, weeklyMap, days }: SessionTableProps) {
  if (sessions.length === 0) {
    return <Typography color="text.secondary" sx={{ mt: 2 }}>No sessions recorded yet.</Typography>;
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Status</TableCell>
            <TableCell>Platform</TableCell>
            <TableCell>Label</TableCell>
            <TableCell>User</TableCell>
            <TableCell>Started</TableCell>
            <TableCell>Last seen</TableCell>
            <TableCell>Total</TableCell>
            <TableCell>Active / Total</TableCell>
            <TableCell>Last 7 days</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sessions.map((s) => {
            const online = isOnline(s);
            const activeRatio = s.totalSeconds > 0 ? (s.activeSeconds / s.totalSeconds) * 100 : 0;
            const weekEntry = weeklyMap.get(s.id);

            return (
              <TableRow key={s.id} hover>
                {/* Online dot */}
                <TableCell padding="checkbox" sx={{ width: 32 }}>
                  <Tooltip title={online ? 'Online' : 'Offline'}>
                    <DotIcon sx={{ color: online ? 'success.main' : 'text.disabled', fontSize: 14, display: 'block', mx: 'auto' }} />
                  </Tooltip>
                </TableCell>

                {/* Platform */}
                <TableCell>
                  <Tooltip title={s.platform}>
                    <Box sx={{ display: 'inline-flex', color: 'text.secondary' }}>
                      <PlatformIcon platform={s.platform} />
                    </Box>
                  </Tooltip>
                </TableCell>

                {/* Label */}
                <TableCell>
                  <Typography variant="body2" noWrap sx={{ maxWidth: 160 }}>
                    {s.label}
                  </Typography>
                </TableCell>

                {/* User */}
                <TableCell>
                  <Chip label={s.userId} size="small" variant="outlined" />
                </TableCell>

                {/* Started */}
                <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary', fontSize: 12 }}>
                  {fmtDate(s.startedAt)}
                </TableCell>

                {/* Last seen */}
                <TableCell sx={{ whiteSpace: 'nowrap', color: online ? 'text.primary' : 'text.secondary', fontSize: 12 }}>
                  {fmtDate(s.lastSeenAt)}
                </TableCell>

                {/* Total time */}
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Typography variant="body2">{fmtDuration(s.totalSeconds)}</Typography>
                </TableCell>

                {/* Active ratio bar */}
                <TableCell sx={{ minWidth: 120 }}>
                  <Tooltip title={`Active: ${fmtDuration(s.activeSeconds)} / Total: ${fmtDuration(s.totalSeconds)}`}>
                    <Box>
                      <Typography variant="caption" sx={{ display: 'block', mb: 0.25 }}>
                        {fmtDuration(s.activeSeconds)} / {fmtDuration(s.totalSeconds)}
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={activeRatio}
                        sx={{ height: 6, borderRadius: 3 }}
                      />
                    </Box>
                  </Tooltip>
                </TableCell>

                {/* Weekly chart */}
                <TableCell sx={{ minWidth: 130 }}>
                  {weekEntry ? (
                    <WeekBarChart entry={weekEntry} days={days} />
                  ) : (
                    <Typography variant="caption" color="text.disabled">—</Typography>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Project Time tab
// ──────────────────────────────────────────────────────────────────────────────

const CONTEXT_ICONS: Record<string, React.ReactNode> = {
  arduino:      <CodeIcon fontSize="small" />,
  upython:      <MemoryIcon fontSize="small" />,
  pygame:       <PygameIcon fontSize="small" />,
  'iot-device': <IotIcon fontSize="small" />,
  iot:          <IotIcon fontSize="small" />,
  notes:        <NotesIcon fontSize="small" />,
  pim:          <PimIcon fontSize="small" />,
  editor:       <EditorIcon fontSize="small" />,
  electronics:  <ElecIcon fontSize="small" />,
  admin:        <ComputerIcon fontSize="small" />,
  page:         <WebIcon fontSize="small" />,
};

const CONTEXT_COLORS: Record<string, string> = {
  arduino:      '#f57c00',
  upython:      '#2196f3',
  pygame:       '#9c27b0',
  'iot-device': '#00897b',
  iot:          '#00897b',
  notes:        '#795548',
  pim:          '#5c6bc0',
  editor:       '#546e7a',
  electronics:  '#e53935',
  admin:        '#78909c',
  page:         '#90a4ae',
};

interface ProjectTimeBarChartProps {
  stat: ProjectTimeStat;
  days: string[];
  maxTotal: number;
}

function ProjectTimeBarChart({ stat, days, maxTotal }: ProjectTimeBarChartProps) {
  const dayMap = new Map(stat.days.map((d) => [d.date, d]));

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, height: 44 }}>
      {days.map((date) => {
        const bucket = dayMap.get(date);
        const total = bucket?.totalSeconds ?? 0;
        const active = bucket?.activeSeconds ?? 0;
        const barH = maxTotal > 0 ? Math.round((total / maxTotal) * 40) : 0;
        const activeH = total > 0 ? Math.round((active / total) * barH) : 0;
        const color = CONTEXT_COLORS[stat.contextType] ?? '#9e9e9e';

        return (
          <Tooltip
            key={date}
            title={
              <Box>
                <Typography variant="caption">{shortDay(date)}</Typography><br />
                <Typography variant="caption">Total: {fmtDuration(total)}</Typography><br />
                <Typography variant="caption">Active: {fmtDuration(active)}</Typography>
              </Box>
            }
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 14 }}>
              <Box sx={{
                width: 10, height: barH, minHeight: total > 0 ? 2 : 0,
                bgcolor: color, opacity: 0.4, borderRadius: 0.5,
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden',
              }}>
                {activeH > 0 && (
                  <Box sx={{ width: '100%', height: activeH, bgcolor: color, opacity: 1 }} />
                )}
              </Box>
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}

interface ProjectTimeTableProps {
  stats: ProjectTimeStat[];
  days: string[];
}

function ProjectTimeTable({ stats, days }: ProjectTimeTableProps) {
  if (stats.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ mt: 2 }}>
        No project time recorded yet. Start using the app and come back in 30 s.
      </Typography>
    );
  }

  const maxTotal = Math.max(...stats.flatMap((s) => s.days.map((d) => d.totalSeconds)), 1);

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Type</TableCell>
            <TableCell>Project / Section</TableCell>
            <TableCell>User</TableCell>
            <TableCell>Last active</TableCell>
            <TableCell>Total</TableCell>
            <TableCell>Active / Total</TableCell>
            <TableCell>Last 7 days</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {stats.map((s) => {
            const activeRatio = s.totalSeconds > 0 ? (s.activeSeconds / s.totalSeconds) * 100 : 0;
            const color = CONTEXT_COLORS[s.contextType] ?? '#9e9e9e';
            const icon = CONTEXT_ICONS[s.contextType] ?? <CodeIcon fontSize="small" />;

            return (
              <TableRow key={`${s.userId}-${s.contextType}-${s.contextId}`} hover>
                {/* Type chip */}
                <TableCell>
                  <Chip
                    icon={<Box sx={{ color: `${color} !important`, display: 'flex' }}>{icon}</Box>}
                    label={s.contextType}
                    size="small"
                    sx={{ bgcolor: `${color}22`, color, borderColor: color, fontSize: 11 }}
                    variant="outlined"
                  />
                </TableCell>

                {/* Project / section ID */}
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {s.contextId || '—'}
                  </Typography>
                </TableCell>

                {/* User */}
                <TableCell>
                  <Chip label={s.userId} size="small" variant="outlined" />
                </TableCell>

                {/* Last active */}
                <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary', fontSize: 12 }}>
                  {fmtDate(s.lastSeenAt)}
                </TableCell>

                {/* Total time */}
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Typography variant="body2" fontWeight={600}>{fmtDuration(s.totalSeconds)}</Typography>
                </TableCell>

                {/* Active ratio */}
                <TableCell sx={{ minWidth: 120 }}>
                  <Tooltip title={`Active: ${fmtDuration(s.activeSeconds)} / Total: ${fmtDuration(s.totalSeconds)}`}>
                    <Box>
                      <Typography variant="caption" sx={{ display: 'block', mb: 0.25 }}>
                        {fmtDuration(s.activeSeconds)} / {fmtDuration(s.totalSeconds)}
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={activeRatio}
                        sx={{ height: 6, borderRadius: 3, '& .MuiLinearProgress-bar': { bgcolor: color } }}
                      />
                    </Box>
                  </Tooltip>
                </TableCell>

                {/* Weekly chart */}
                <TableCell sx={{ minWidth: 130 }}>
                  <ProjectTimeBarChart stat={s} days={days} maxTotal={maxTotal} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────────

type FilterPlatform = 'all' | AppSessionPlatform;

export default function AppSessionsPage() {
  const [tab, setTab] = useState(0);
  const [sessions, setSessions] = useState<AppSession[]>([]);
  const [weeklyEntries, setWeeklyEntries] = useState<AppSessionWeekEntry[]>([]);
  const [projectStats, setProjectStats] = useState<ProjectTimeStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<FilterPlatform>('all');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [filterProjectUser, setFilterProjectUser] = useState<string>('all');

  const days = last7Days();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [all, weekly, projStats] = await Promise.all([
        minisApi.getAppSessions(),
        minisApi.getAppSessionsWeekly(),
        minisApi.getProjectTimeStats(),
      ]);
      setSessions(all);
      setWeeklyEntries(weekly);
      setProjectStats(projStats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load app sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30 s
  useEffect(() => {
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  // Sessions tab derived data
  const weeklyMap = new Map(weeklyEntries.map((e) => [e.session.id, e]));
  const allUsers = [...new Set(sessions.map((s) => s.userId))].sort();
  const allProjectUsers = [...new Set(projectStats.map((s) => s.userId))].sort();
  const onlineCount = sessions.filter(isOnline).length;

  const filteredSessions = sessions.filter((s) => {
    if (filterPlatform !== 'all' && s.platform !== filterPlatform) return false;
    if (filterUser !== 'all' && s.userId !== filterUser) return false;
    return true;
  });

  const filteredProjectStats = filterProjectUser === 'all'
    ? projectStats
    : projectStats.filter((s) => s.userId === filterProjectUser);

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
        <Box>
          <Typography variant="h5" fontWeight={600}>App Sessions</Typography>
          <Typography variant="body2" color="text.secondary">
            Web · Mobile · Desktop — admin view only
          </Typography>
        </Box>
        <Chip
          icon={<DotIcon sx={{ color: 'success.main !important', fontSize: 12 }} />}
          label={`${onlineCount} online`}
          size="small"
          variant="outlined"
          color={onlineCount > 0 ? 'success' : 'default'}
        />
      </Stack>

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Sessions" />
        <Tab label="Project Time" />
      </Tabs>

      {loading && <CircularProgress size={24} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* ── Tab 0: Sessions ── */}
      {!loading && !error && tab === 0 && (
        <>
          {/* Filters */}
          <Stack direction="row" spacing={2} mb={2} flexWrap="wrap">
            <ToggleButtonGroup
              size="small"
              value={filterPlatform}
              exclusive
              onChange={(_, v) => v && setFilterPlatform(v)}
            >
              <ToggleButton value="all">All</ToggleButton>
              <ToggleButton value="web"><WebIcon sx={{ mr: 0.5, fontSize: 16 }} />Web</ToggleButton>
              <ToggleButton value="mobile"><MobileIcon sx={{ mr: 0.5, fontSize: 16 }} />Mobile</ToggleButton>
              <ToggleButton value="desktop"><ComputerIcon sx={{ mr: 0.5, fontSize: 16 }} />Desktop</ToggleButton>
            </ToggleButtonGroup>

            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>User</InputLabel>
              <Select value={filterUser} label="User" onChange={(e) => setFilterUser(e.target.value)}>
                <MenuItem value="all">All users</MenuItem>
                {allUsers.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>

          {/* Legend */}
          <Stack direction="row" spacing={2} mb={2} alignItems="center">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 10, height: 10, bgcolor: 'primary.dark', borderRadius: 0.5 }} />
              <Typography variant="caption" color="text.secondary">Total time</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 10, height: 10, bgcolor: 'primary.main', borderRadius: 0.5 }} />
              <Typography variant="caption" color="text.secondary">Active (mouse/keyboard/touch)</Typography>
            </Box>
            <Typography variant="caption" color="text.disabled">Inactive threshold: 30 s</Typography>
          </Stack>

          <SessionTable sessions={filteredSessions} weeklyMap={weeklyMap} days={days} />
        </>
      )}

      {/* ── Tab 1: Project Time ── */}
      {!loading && !error && tab === 1 && (
        <>
          <Stack direction="row" spacing={2} mb={2} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>User</InputLabel>
              <Select value={filterProjectUser} label="User" onChange={(e) => setFilterProjectUser(e.target.value)}>
                <MenuItem value="all">All users</MenuItem>
                {allProjectUsers.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.disabled">
              Sorted by total time · data accumulated per heartbeat interval (30 s)
            </Typography>
          </Stack>

          {/* Legend */}
          <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
            {Object.entries(CONTEXT_COLORS).map(([type, color]) => (
              <Box key={type} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 10, height: 10, bgcolor: color, borderRadius: 0.5 }} />
                <Typography variant="caption" color="text.secondary">{type}</Typography>
              </Box>
            ))}
            <Typography variant="caption" color="text.disabled">· faded = total, solid = active</Typography>
          </Stack>

          <ProjectTimeTable stats={filteredProjectStats} days={days} />
        </>
      )}
    </Box>
  );
}
