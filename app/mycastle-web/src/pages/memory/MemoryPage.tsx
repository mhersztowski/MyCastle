/**
 * Memory PIM page — knowledge testing platform.
 *
 * Three tabs:
 *  • Test      — pick categories, get smart-randomized questions, AI judging
 *  • Stats     — per-question correctness + session history
 *  • Design    — CRUD questions, generate with AI, enrich with images
 *
 * Data lives in `data/memory.json` per user, loaded + saved through
 * `useFilesystem()` (same pattern as HealthPage). Save is debounced
 * 800 ms and flushed on page hide.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../modules/auth';
import {
  Alert, Box, CircularProgress, Snackbar, Tab, Tabs, Typography,
} from '@mui/material';
import PsychologyIcon from '@mui/icons-material/Psychology';
import EditNoteIcon from '@mui/icons-material/EditNote';
import BarChartIcon from '@mui/icons-material/BarChart';
import { useFilesystem } from '../../modules/filesystem';
import MemoryTestTab from './MemoryTestTab';
import MemoryStatsTab from './MemoryStatsTab';
import MemoryDesignTab from './MemoryDesignTab';
import { EMPTY_MEMORY, type MemoryData } from './types';

const MEMORY_PATH = 'data/memory.json';

export default function MemoryPage(): React.JSX.Element {
  // Fall back to the logged-in user so this component also works as a Global
  // window mounted outside any user-scoped route.
  const params = useParams<{ userName: string }>();
  const { currentUser } = useAuth();
  const userName = params.userName || currentUser?.name || '';
  const { readFile, writeFile, isDataLoaded } = useFilesystem();

  const [tab, setTab] = useState(0);
  const [data, setData] = useState<MemoryData>(EMPTY_MEMORY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; msg: string; severity: 'success'|'error' }>({ open: false, msg: '', severity: 'success' });

  // Avoid stomping the file on first auto-save before the initial read completes.
  const hasLoadedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writeFileRef = useRef(writeFile);
  const latestDataRef = useRef<MemoryData>(EMPTY_MEMORY);
  useEffect(() => { writeFileRef.current = writeFile; }, [writeFile]);
  useEffect(() => { latestDataRef.current = data; }, [data]);

  // Load
  useEffect(() => {
    if (!isDataLoaded || hasLoadedRef.current) return;
    readFile(MEMORY_PATH).then((file) => {
      if (file) {
        try {
          const parsed = JSON.parse(file.toString()) as MemoryData;
          if (parsed && parsed.type === 'memory_data') {
            setData({
              ...EMPTY_MEMORY,
              ...parsed,
              categories: parsed.categories ?? [],
              questions: parsed.questions ?? [],
              sessions: parsed.sessions ?? [],
            });
          }
        } catch (err) {
          console.error('[Memory] parse error:', err);
          setSnackbar({ open: true, msg: 'Failed to parse memory.json — starting empty', severity: 'error' });
        }
      }
      hasLoadedRef.current = true;
      setLoading(false);
    }).catch((err) => {
      console.error('[Memory] readFile failed:', err);
      hasLoadedRef.current = true;
      setLoading(false);
    });
  }, [isDataLoaded, readFile]);

  // Debounced save — reads latestDataRef so closures never go stale
  const scheduleSave = useCallback(() => {
    if (!hasLoadedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        const result = await writeFileRef.current(
          MEMORY_PATH,
          JSON.stringify(latestDataRef.current, null, 2),
        );
        if (result === null) setSnackbar({ open: true, msg: 'Save failed — check connection', severity: 'error' });
      } catch (err) {
        console.error('[Memory] writeFile failed:', err);
        setSnackbar({ open: true, msg: (err as Error).message, severity: 'error' });
      } finally {
        setSaving(false);
      }
    }, 800);
  }, []);

  // Flush pending save on unmount / page hide (same pattern as Health)
  useEffect(() => {
    const flush = () => {
      if (!saveTimerRef.current) return;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      writeFileRef.current(MEMORY_PATH, JSON.stringify(latestDataRef.current, null, 2))
        .catch((err) => console.error('[Memory] flush failed:', err));
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, []);

  // Single state-updater shared by every tab
  const handleUpdate = useCallback((next: MemoryData) => {
    setData(next);
    scheduleSave();
  }, [scheduleSave]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography variant="h5" sx={{ flex: 1 }}>Memory</Typography>
        {saving && <Typography variant="caption" color="text.secondary">saving…</Typography>}
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tab icon={<PsychologyIcon />} iconPosition="start" label="Test" />
        <Tab icon={<BarChartIcon />} iconPosition="start" label="Statistics" />
        <Tab icon={<EditNoteIcon />} iconPosition="start" label="Design" />
      </Tabs>

      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {tab === 0 && <MemoryTestTab data={data} userName={userName} onUpdate={handleUpdate} />}
        {tab === 1 && <MemoryStatsTab data={data} onUpdate={handleUpdate} />}
        {tab === 2 && <MemoryDesignTab data={data} userName={userName} onUpdate={handleUpdate} />}
      </Box>

      <Snackbar open={snackbar.open} autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity}>{snackbar.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
