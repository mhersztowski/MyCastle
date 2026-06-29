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
import { Add, Delete, Memory, GitHub, Refresh } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { minisApi } from '../../services/MinisApiService';
import { useAuth } from '../../modules/auth';
import type { MinisProjectModel } from '@mhersztowski/core';
import type { GithubProjectEntry, GithubModuleEntry } from '../../services/MinisApiService';
import { CppWasmRuntime } from '@mhersztowski/web-cpp';

const DEFAULT_REPO_URL = 'https://github.com/platform-minis/MinisProjects';
const REPO_URL_KEY = 'minis_github_repo_url';

// GitHub projects that belong in the C++ browser: native C++ or Arduino sketches
// (anything that is not a uPython / Pygame / PicoSDK platform). Empty/null platform
// is treated as Arduino, matching how local Arduino projects are listed below.
const CPP_PLATFORMS = ['', 'Arduino', 'C++', 'cpp'];

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

  // Add From Repo dialog state
  const [repoDialogOpen, setRepoDialogOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState(() => localStorage.getItem(REPO_URL_KEY) ?? DEFAULT_REPO_URL);
  const [githubProjects, setGithubProjects] = useState<GithubProjectEntry[]>([]);
  const [githubModules, setGithubModules] = useState<GithubModuleEntry[]>([]);
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [selectedGithubProject, setSelectedGithubProject] = useState<GithubProjectEntry | null>(null);
  const [repoProjectName, setRepoProjectName] = useState('');

  const load = useCallback(async () => {
    if (!userName) return;
    setLoading(true);
    try {
      const [arduinoProjects, cppProjects] = await Promise.all([
        minisApi.getUserProjects(userName).then(ps =>
          ps.filter(p => CPP_PLATFORMS.includes(p.softwarePlatform ?? ''))
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

  const handleFetchGithub = async () => {
    setGithubLoading(true);
    setGithubError(null);
    setSelectedGithubProject(null);
    localStorage.setItem(REPO_URL_KEY, repoUrl);
    try {
      const data = await minisApi.getGithubProjectdefs(repoUrl);
      setGithubProjects(data.projects.filter(p => CPP_PLATFORMS.includes(p.softwarePlatform ?? '')));
      setGithubModules(data.modules);
    } catch (err) {
      setGithubError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setGithubLoading(false);
    }
  };

  const handleAddFromRepo = async () => {
    if (!userName || !selectedGithubProject || !repoProjectName.trim()) return;
    try {
      const moduleId = selectedGithubProject.moduleId ?? undefined;
      const boardProfileKey = moduleId
        ? githubModules.find(m => m.id === moduleId)?.boardProfileKey
        : undefined;
      const created = await minisApi.createUserProject(userName, {
        name: repoProjectName.trim(),
        githubProjectId: selectedGithubProject.id,
        githubRepoUrl: repoUrl,
        // Empty platform from the repo defdef is treated as Arduino so the project
        // lands in this C++ browser (see CPP_PLATFORMS / load filter).
        softwarePlatform: selectedGithubProject.softwarePlatform || 'Arduino',
        moduleId,
        boardProfileKey,
      });
      const sketches = selectedGithubProject.sketches ?? [];
      const readmePath = selectedGithubProject.readmePath ?? null;
      const libraries = selectedGithubProject.libraries?.length ? selectedGithubProject.libraries : undefined;
      if (sketches.length > 0 || readmePath || libraries || selectedGithubProject.projectScriptPath) {
        await minisApi.cloneProjectFromGithub(userName, created.name, repoUrl, sketches, readmePath, libraries, selectedGithubProject.projectScriptPath ?? undefined);
      }
      setRepoDialogOpen(false);
      setSelectedGithubProject(null);
      setRepoProjectName('');
      setGithubProjects([]);
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

  const openWasm = async (entry: ProjectEntry) => {
    if (!userName) return;
    const name = entry.project.name;
    try {
      if (entry.kind === 'arduino') {
        // Cloned projects keep their original sketch name (e.g. "QtDemo"),
        // which usually differs from the project name — resolve the real one
        // so the WASM build can find sketches/{sketchName}.
        const sketches = await minisApi.listSketches(userName, name);
        const sketchName = sketches[0] ?? name;
        setWasmTarget({
          projectName: name,
          sketchName,
          buildSseUrl: minisApi.getArduinoWasmBuildSseUrl(userName, name, sketchName),
          wasmJsUrl: minisApi.getArduinoWasmJsUrl(userName, name, sketchName),
        });
      } else {
        const sketches = await minisApi.listCppSketches(userName, name);
        const sketchName = sketches[0] ?? name;
        setWasmTarget({
          projectName: name,
          sketchName,
          buildSseUrl: minisApi.getCppWasmBuildSseUrl(userName, name, sketchName),
          wasmJsUrl: minisApi.getCppWasmJsUrl(userName, name, sketchName),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve project sketch');
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
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<Add />}
            onClick={() => { setNewName(''); setAddDialogOpen(true); }}
          >
            New C++ Project
          </Button>
          <Button
            variant="contained"
            startIcon={<GitHub />}
            onClick={() => setRepoDialogOpen(true)}
          >
            Add From Repo
          </Button>
        </Box>
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
                <IconButton size="small" color="primary" onClick={(e) => { e.stopPropagation(); void openWasm(entry); }}>
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

      {/* Add From Repo dialog */}
      <Dialog
        open={repoDialogOpen}
        onClose={() => { setRepoDialogOpen(false); setGithubProjects([]); setSelectedGithubProject(null); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create C++ Project from Repo</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', gap: 1, mt: 1, mb: 2 }}>
            <TextField
              fullWidth label="GitHub Repo URL" size="small" value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
            />
            <Button
              variant="outlined" size="small"
              startIcon={githubLoading ? <CircularProgress size={14} /> : <Refresh />}
              onClick={() => void handleFetchGithub()}
              disabled={githubLoading || !repoUrl}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Load
            </Button>
          </Box>
          {githubError && <Alert severity="error" sx={{ mb: 2 }}>{githubError}</Alert>}
          {githubProjects.length > 0 && (
            <TextField
              fullWidth select label="GitHub Project" value={selectedGithubProject?.id ?? ''}
              onChange={(e) => {
                const p = githubProjects.find((x) => x.id === e.target.value) ?? null;
                setSelectedGithubProject(p);
                if (p) setRepoProjectName(p.name);
              }}
              sx={{ mb: 2 }}
              InputLabelProps={{ shrink: true }}
              SelectProps={{ native: true }}
            >
              <option value=""></option>
              {githubProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name} {p.moduleId ? `(${p.moduleId})` : ''}</option>
              ))}
            </TextField>
          )}
          <TextField
            fullWidth label="Project Name" value={repoProjectName}
            onChange={(e) => setRepoProjectName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setRepoDialogOpen(false); setGithubProjects([]); setSelectedGithubProject(null); }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void handleAddFromRepo()}
            disabled={!selectedGithubProject || !repoProjectName.trim()}
          >
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
