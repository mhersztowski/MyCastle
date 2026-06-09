import { useEffect, useState, useCallback } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Card,
  CardActionArea,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add, Delete, Memory } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { minisApi } from '../../services/MinisApiService';
import { useAuth } from '../../modules/auth';
import type { MinisProjectModel } from '@mhersztowski/core';
import { CppWasmRuntime } from '@mhersztowski/web-cpp';

interface WasmTarget {
  projectName: string;
  sketchName: string;
  buildSseUrl: string;
  wasmJsUrl: string;
}

interface CppProject {
  name: string;
}

type ProjectEntry =
  | { kind: 'arduino'; project: MinisProjectModel }
  | { kind: 'cpp'; project: CppProject };

function UserCppProjectsPage() {
  const { userName } = useParams<{ userName: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  const [items, setItems] = useState<ProjectEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ kind: 'cpp'; name: string } | null>(null);

  const [wasmTarget, setWasmTarget] = useState<WasmTarget | null>(null);

  const load = useCallback(async () => {
    if (!userName) return;
    setLoading(true);
    try {
      const [arduinoProjects, cppProjects] = await Promise.all([
        minisApi.getUserProjects(userName).then(ps =>
          ps.filter(p => {
            const plat = p.softwarePlatform ?? '';
            return plat === '' || plat === 'Arduino';
          })
        ),
        minisApi.listCppProjects(userName),
      ]);
      const entries: ProjectEntry[] = [
        ...arduinoProjects.map(p => ({ kind: 'arduino' as const, project: p })),
        ...cppProjects.map(p => ({ kind: 'cpp' as const, project: p })),
      ];
      setItems(entries);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [userName]);

  useEffect(() => { void load(); }, [load]);

  const handleAdd = async () => {
    if (!userName || !newName.trim()) return;
    try {
      await minisApi.createCppProject(userName, newName.trim());
      setAddDialogOpen(false);
      setNewName('');
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    }
  };

  const handleDelete = async (kind: 'cpp', name: string) => {
    if (!userName) return;
    try {
      if (kind === 'cpp') await minisApi.deleteCppProject(userName, name);
      setDeleteConfirm(null);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const openWasm = (entry: ProjectEntry) => {
    if (!userName) return;
    if (entry.kind === 'arduino') {
      const name = entry.project.name;
      setWasmTarget({
        projectName: name,
        sketchName: name,
        buildSseUrl: minisApi.getArduinoWasmBuildSseUrl(userName, name, name),
        wasmJsUrl: minisApi.getArduinoWasmJsUrl(userName, name, name),
      });
    } else {
      const name = entry.project.name;
      setWasmTarget({
        projectName: name,
        sketchName: name,
        buildSseUrl: minisApi.getCppWasmBuildSseUrl(userName, name, name),
        wasmJsUrl: minisApi.getCppWasmJsUrl(userName, name, name),
      });
    }
  };

  const projectPath = (entry: ProjectEntry) => {
    if (!userName) return '#';
    if (entry.kind === 'cpp') {
      return `/user/${userName}/cpp-project/${encodeURIComponent(entry.project.name)}`;
    }
    return `/user/${userName}/project/${encodeURIComponent(entry.project.name)}`;
  };

  const entryName = (entry: ProjectEntry) => entry.project.name;

  const platformLabel = (entry: ProjectEntry) => entry.kind === 'cpp' ? 'C++' : 'Arduino';
  const platformColor = (entry: ProjectEntry): 'primary' | 'success' => entry.kind === 'cpp' ? 'primary' : 'success';

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">C++ Browser</Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => { setNewName(''); setAddDialogOpen(true); }}
        >
          New C++ Project
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Compile and run C++ / Arduino projects directly in the browser using WebAssembly.
        Arduino projects can also be opened here for simulation without real hardware.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <CircularProgress />}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {items.map((entry) => (
          <Card key={`${entry.kind}-${entryName(entry)}`} sx={{ width: 240 }}>
            <CardActionArea
              onClick={() => navigate(projectPath(entry))}
              sx={{ p: 1.5, pb: 0.5 }}
            >
              <Typography variant="subtitle2" color="text.secondary">Project</Typography>
              <Typography variant="body1" sx={{ mb: 1, fontWeight: 500 }}>{entryName(entry)}</Typography>
              <Chip
                label={platformLabel(entry)}
                size="small"
                color={platformColor(entry)}
                sx={{ mt: 0.5 }}
              />
            </CardActionArea>

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', px: 0.5, pb: 0.5, gap: 0.5 }}>
              <Tooltip title="Run in browser (WASM simulator)">
                <IconButton size="small" color="primary" onClick={(e) => { e.stopPropagation(); openWasm(entry); }}>
                  <Memory fontSize="small" />
                </IconButton>
              </Tooltip>
              {entry.kind === 'cpp' && (
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ kind: 'cpp', name: entry.project.name }); }}
                >
                  <Delete fontSize="small" />
                </IconButton>
              )}
            </Box>
          </Card>
        ))}

        {!loading && items.length === 0 && (
          <Typography color="text.secondary">
            No C++ or Arduino projects yet. Create a new C++ project or visit the Arduino section.
          </Typography>
        )}
      </Box>

      {/* WASM Simulator */}
      {wasmTarget && (
        <CppWasmRuntime
          open={!!wasmTarget}
          onClose={() => setWasmTarget(null)}
          title={`WASM Simulator — ${wasmTarget.sketchName}`}
          buildSseUrl={wasmTarget.buildSseUrl}
          wasmJsUrl={wasmTarget.wasmJsUrl}
          token={token}
        />
      )}

      {/* New project dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New C++ Project</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            autoFocus fullWidth label="Project Name"
            value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
          />
          <Typography variant="body2" color="text.secondary">
            Native C++ project — edit sources, compile to WebAssembly and run in the browser.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void handleAdd()} disabled={!newName.trim()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete Project?</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => { if (deleteConfirm) void handleDelete(deleteConfirm.kind, deleteConfirm.name); }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default UserCppProjectsPage;
