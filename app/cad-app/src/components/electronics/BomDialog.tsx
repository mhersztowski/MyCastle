/**
 * "Lista BOM" — Bill of Materials dialog for a PCB project. Two views:
 *  • "Bieżący projekt" — the live BOM aggregated from the project's placed
 *    components, which can be saved to the backend.
 *  • "Zapisane BOM" — every BOM saved on the backend (across all projects),
 *    which can be reopened or deleted.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Button, IconButton, Tabs, Tab, TextField,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Typography, Tooltip, CircularProgress, Alert, List, ListItemButton, ListItemText,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  type BomSourceComp, type BomLine, type SavedBomMeta,
  buildBom, listSavedBoms, readBom, saveBom, deleteBom,
} from '../../electronics/bom';

interface Props {
  open: boolean;
  onClose: () => void;
  projectName: string;
  /** Live placed components of the current project (PcbView `allPlaced`). */
  placed: BomSourceComp[];
}

function formatDate(ms: number): string {
  if (!ms) return '';
  try { return new Date(ms).toLocaleString(); } catch { return ''; }
}

/** Shared BOM line table. */
function BomTable({ lines }: { lines: BomLine[] }) {
  if (lines.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
        Brak elementów w BOM.
      </Typography>
    );
  }
  return (
    <TableContainer sx={{ maxHeight: 420 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell align="right">Ilość</TableCell>
            <TableCell>Wartość / komentarz</TableCell>
            <TableCell>Obudowa</TableCell>
            <TableCell>Oznaczenia</TableCell>
            <TableCell>MPN</TableCell>
            <TableCell>LCSC</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {lines.map((l, i) => (
            <TableRow key={i} hover>
              <TableCell>{i + 1}</TableCell>
              <TableCell align="right">{l.quantity}</TableCell>
              <TableCell>{l.comment || '—'}</TableCell>
              <TableCell>{l.footprint || '—'}</TableCell>
              <TableCell>{l.designators.join(', ') || '—'}</TableCell>
              <TableCell>{l.mpn || '—'}</TableCell>
              <TableCell>{l.lcsc || '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export function BomDialog({ open, onClose, projectName, placed }: Props) {
  const [tab, setTab] = useState<'current' | 'saved'>('current');
  const [saveName, setSaveName] = useState(projectName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Saved-BOM browsing state.
  const [savedList, setSavedList] = useState<SavedBomMeta[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [openedProject, setOpenedProject] = useState<string | null>(null);
  const [openedLines, setOpenedLines] = useState<BomLine[]>([]);

  // Aggregate the current project's placed components into BOM lines.
  const currentLines = useMemo(() => buildBom(placed), [placed]);

  // Reset transient state and default the save name whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setSaveName(projectName);
    setError(null);
    setNotice(null);
  }, [open, projectName]);

  const refreshSaved = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      setSavedList(await listSavedBoms());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingList(false);
    }
  }, []);

  // Load the saved list when switching to that tab (or opening straight into it).
  useEffect(() => {
    if (open && tab === 'saved') refreshSaved();
  }, [open, tab, refreshSaved]);

  const handleSave = useCallback(async () => {
    const name = saveName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await saveBom(name, currentLines, Date.now());
      setNotice(`Zapisano BOM projektu „${name}" (${currentLines.length} pozycji).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [saveName, currentLines]);

  const handleOpenSaved = useCallback(async (project: string) => {
    setError(null);
    try {
      const doc = await readBom(project);
      setOpenedProject(project);
      setOpenedLines(doc.lines ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const handleDeleteSaved = useCallback(async (project: string) => {
    setError(null);
    try {
      await deleteBom(project);
      if (openedProject === project) { setOpenedProject(null); setOpenedLines([]); }
      await refreshSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [openedProject, refreshSaved]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '1rem' }}>
        Lista BOM
        <Typography component="span" variant="caption" color="text.secondary">
          — {projectName}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, minHeight: 40 }}>
        <Tab value="current" label="Bieżący projekt" sx={{ minHeight: 40 }} />
        <Tab value="saved" label="Zapisane BOM" sx={{ minHeight: 40 }} />
      </Tabs>

      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice(null)}>{notice}</Alert>}

        {tab === 'current' ? (
          <>
            <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                size="small" label="Nazwa projektu (BOM)" sx={{ maxWidth: 320 }}
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
              />
              <Button
                variant="contained" size="small"
                startIcon={<SaveOutlinedIcon />}
                disabled={saving || !saveName.trim()}
                onClick={handleSave}
              >
                Zapisz BOM na backend
              </Button>
              {saving && <CircularProgress size={20} />}
              <Box sx={{ flex: 1 }} />
              <Typography variant="body2" color="text.secondary">
                Pozycji: {currentLines.length} · Sztuk: {currentLines.reduce((n, l) => n + l.quantity, 0)}
              </Typography>
            </Box>
            <BomTable lines={currentLines} />
          </>
        ) : (
          <Box sx={{ display: 'flex', gap: 2, minHeight: 300 }}>
            {/* Saved-project list */}
            <Box sx={{ width: 260, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.12)', pr: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2" sx={{ flex: 1 }}>Projekty</Typography>
                <Tooltip title="Odśwież">
                  <IconButton size="small" onClick={refreshSaved}><RefreshIcon fontSize="small" /></IconButton>
                </Tooltip>
              </Box>
              {loadingList ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>
              ) : savedList.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                  Brak zapisanych BOM.
                </Typography>
              ) : (
                <List dense disablePadding>
                  {savedList.map(m => (
                    <ListItemButton
                      key={m.project}
                      selected={openedProject === m.project}
                      onClick={() => handleOpenSaved(m.project)}
                      sx={{ borderRadius: 1 }}
                    >
                      <ListItemText
                        primary={m.project}
                        secondary={formatDate(m.mtime)}
                        primaryTypographyProps={{ noWrap: true }}
                      />
                      <Tooltip title="Usuń">
                        <IconButton
                          size="small" color="error"
                          onClick={e => { e.stopPropagation(); handleDeleteSaved(m.project); }}
                        >
                          <DeleteOutlineIcon fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                    </ListItemButton>
                  ))}
                </List>
              )}
            </Box>
            {/* Opened BOM content */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {openedProject ? (
                <>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>{openedProject}</Typography>
                  <BomTable lines={openedLines} />
                </>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  Wybierz projekt z listy po lewej, aby wyświetlić jego BOM.
                </Typography>
              )}
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Zamknij</Button>
      </DialogActions>
    </Dialog>
  );
}
