import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Alert,
  Chip,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { minisApi } from '../../services/MinisApiService';

interface ScriptInfo {
  name: string;
  size: number;
  updatedAt: string;
}

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  duration: number;
}

const ScriptsPage: React.FC = () => {
  const [scripts, setScripts] = useState<ScriptInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editor dialog
  const [editorOpen, setEditorOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editIsNew, setEditIsNew] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteName, setDeleteName] = useState('');

  // Run output panel
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [runName, setRunName] = useState('');
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await minisApi.listScripts();
      setScripts(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load scripts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Open editor for new script
  const openNew = () => {
    setEditName('');
    setEditContent('// New script\n');
    setEditIsNew(true);
    setEditError(null);
    setEditorOpen(true);
  };

  // Open editor to edit existing script
  const openEdit = async (name: string) => {
    setEditError(null);
    try {
      const content = await minisApi.getScript(name);
      setEditName(name);
      setEditContent(content);
      setEditIsNew(false);
      setEditorOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load script');
    }
  };

  const handleSave = async () => {
    setEditSaving(true);
    setEditError(null);
    try {
      await minisApi.putScript(editName, editContent);
      setEditorOpen(false);
      load();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setEditSaving(false);
    }
  };

  const openDelete = (name: string) => {
    setDeleteName(name);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    try {
      await minisApi.deleteScript(deleteName);
      setDeleteOpen(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete script');
      setDeleteOpen(false);
    }
  };

  const handleRun = async (name: string) => {
    setRunning(true);
    setRunName(name);
    setRunResult(null);
    try {
      const result = await minisApi.runScript(name);
      setRunResult(result);
    } catch (e) {
      setRunResult({ stdout: '', stderr: e instanceof Error ? e.message : 'Error', exitCode: -1, duration: 0 });
    } finally {
      setRunning(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleString();

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Scripts</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openNew}>
          Add Script
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Size</TableCell>
              <TableCell>Updated</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} align="center"><CircularProgress size={24} sx={{ my: 1 }} /></TableCell>
              </TableRow>
            ) : scripts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  <Typography variant="body2" color="text.secondary">No scripts yet</Typography>
                </TableCell>
              </TableRow>
            ) : (
              scripts.map((s) => (
                <TableRow key={s.name} hover>
                  <TableCell><code>{s.name}</code></TableCell>
                  <TableCell>{formatSize(s.size)}</TableCell>
                  <TableCell>{formatDate(s.updatedAt)}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Run">
                      <span>
                        <IconButton size="small" onClick={() => handleRun(s.name)} disabled={running}>
                          <PlayArrowIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => openEdit(s.name)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" onClick={() => openDelete(s.name)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Run output panel */}
      {(running || runResult) && (
        <Paper sx={{ mt: 3, p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="subtitle2">Run: <code>{runName}</code></Typography>
            {running && <CircularProgress size={16} />}
            {runResult && (
              <Chip
                size="small"
                label={runResult.exitCode === 0 ? 'OK' : `Exit ${runResult.exitCode}`}
                color={runResult.exitCode === 0 ? 'success' : 'error'}
              />
            )}
            {runResult && (
              <Typography variant="caption" color="text.secondary">{runResult.duration} ms</Typography>
            )}
          </Box>
          {runResult?.stdout && (
            <Box>
              <Typography variant="caption" color="text.secondary">stdout</Typography>
              <Box
                component="pre"
                sx={{ fontFamily: 'monospace', fontSize: 12, bgcolor: 'grey.900', color: 'grey.100', p: 1.5, borderRadius: 1, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 300 }}
              >
                {runResult.stdout}
              </Box>
            </Box>
          )}
          {runResult?.stderr && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="error.main">stderr</Typography>
              <Box
                component="pre"
                sx={{ fontFamily: 'monospace', fontSize: 12, bgcolor: 'grey.900', color: 'error.light', p: 1.5, borderRadius: 1, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 300 }}
              >
                {runResult.stderr}
              </Box>
            </Box>
          )}
        </Paper>
      )}

      {/* Editor dialog */}
      <Dialog open={editorOpen} onClose={() => setEditorOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editIsNew ? 'New Script' : `Edit: ${editName}`}</DialogTitle>
        <DialogContent>
          {editIsNew && (
            <TextField
              label="Script name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              fullWidth
              size="small"
              sx={{ mb: 2, mt: 1 }}
              placeholder="my-script.js"
              helperText="Allowed: letters, digits, - _ and extension .js or .mjs"
            />
          )}
          <TextField
            label="Content"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            fullWidth
            multiline
            rows={20}
            inputProps={{ style: { fontFamily: 'monospace', fontSize: 13 } }}
          />
          {editError && <Alert severity="error" sx={{ mt: 1 }}>{editError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditorOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={editSaving || !editName.trim()}>
            {editSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete Script</DialogTitle>
        <DialogContent>
          <Typography>Delete <strong>{deleteName}</strong>?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ScriptsPage;
