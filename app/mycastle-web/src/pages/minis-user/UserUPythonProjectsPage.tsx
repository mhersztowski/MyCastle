import { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Button, IconButton, Card, CardActionArea,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Alert, CircularProgress, Chip,
} from '@mui/material';
import { Add, Delete, Refresh } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { minisApi } from '../../services/MinisApiService';
import type { MinisProjectModel } from '@mhersztowski/core';
import type { GithubProjectEntry, GithubModuleEntry } from '../../services/MinisApiService';

const DEFAULT_REPO_URL = 'https://github.com/platform-minis/MinisProjects';
const REPO_URL_KEY = 'minis_github_repo_url';

function UserUPythonProjectsPage() {
  const { userName } = useParams<{ userName: string }>();
  const navigate = useNavigate();
  const [items, setItems] = useState<MinisProjectModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState(() => localStorage.getItem(REPO_URL_KEY) ?? DEFAULT_REPO_URL);
  const [githubProjects, setGithubProjects] = useState<GithubProjectEntry[]>([]);
  const [githubModules, setGithubModules] = useState<GithubModuleEntry[]>([]);
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [selectedGithubProject, setSelectedGithubProject] = useState<GithubProjectEntry | null>(null);
  const [projectName, setProjectName] = useState('');

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userName) return;
    setLoading(true);
    try {
      const projects = await minisApi.getUserProjects(userName);
      setItems(projects.filter((p) => p.softwarePlatform === 'uPython'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [userName]);

  useEffect(() => { load(); }, [load]);

  const handleFetchGithub = async () => {
    setGithubLoading(true);
    setGithubError(null);
    setSelectedGithubProject(null);
    localStorage.setItem(REPO_URL_KEY, repoUrl);
    try {
      const data = await minisApi.getGithubProjectdefs(repoUrl);
      setGithubProjects(data.projects.filter((p) => p.softwarePlatform === 'uPython'));
      setGithubModules(data.modules);
    } catch (err) {
      setGithubError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setGithubLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!userName || !selectedGithubProject || !projectName.trim()) return;
    try {
      const moduleId = selectedGithubProject.moduleId ?? undefined;
      const boardProfileKey = moduleId
        ? githubModules.find((m) => m.id === moduleId)?.boardProfileKey
        : undefined;
      const created = await minisApi.createUserProject(userName, {
        name: projectName.trim(),
        githubProjectId: selectedGithubProject.id,
        githubRepoUrl: repoUrl,
        softwarePlatform: selectedGithubProject.softwarePlatform ?? 'uPython',
        moduleId,
        boardProfileKey,
      });
      const sketches = selectedGithubProject.sketches ?? [];
      const readmePath = selectedGithubProject.readmePath ?? null;
      if (sketches.length > 0 || readmePath) {
        await minisApi.cloneProjectFromGithub(userName, created.name, repoUrl, sketches, readmePath);
      }
      setAddDialogOpen(false);
      setSelectedGithubProject(null);
      setProjectName('');
      setGithubProjects([]);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    }
  };

  const handleDelete = async (name: string) => {
    if (!userName) return;
    try {
      await minisApi.deleteUserProject(userName, name);
      setDeleteConfirm(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">My uPython Projects</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setAddDialogOpen(true)}>Add</Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <CircularProgress />}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {items.map((item) => (
          <Card key={item.id} sx={{ width: 220 }}>
            <CardActionArea onClick={() => navigate(`/user/${userName}/upython-project/${item.id}`)} sx={{ p: 1.5, pb: 0.5 }}>
              <Typography variant="subtitle2" color="text.secondary">Name:</Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>{item.name}</Typography>
              {item.githubProjectId && (
                <>
                  <Typography variant="subtitle2" color="text.secondary">GitHub Project:</Typography>
                  <Typography variant="body2">{item.githubProjectId}</Typography>
                </>
              )}
              {item.moduleId && (
                <Chip label={item.moduleId} size="small" sx={{ mt: 0.5 }} />
              )}
            </CardActionArea>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 0.5, pb: 0.5 }}>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item.name); }}>
                <Delete fontSize="small" />
              </IconButton>
            </Box>
          </Card>
        ))}
        {!loading && items.length === 0 && (
          <Typography color="text.secondary">No uPython projects yet</Typography>
        )}
      </Box>

      {/* Add Project Dialog */}
      <Dialog open={addDialogOpen} onClose={() => { setAddDialogOpen(false); setGithubProjects([]); setSelectedGithubProject(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>Create uPython Project</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', gap: 1, mt: 1, mb: 2 }}>
            <TextField
              fullWidth label="GitHub Repo URL" size="small" value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
            />
            <Button
              variant="outlined" size="small"
              startIcon={githubLoading ? <CircularProgress size={14} /> : <Refresh />}
              onClick={handleFetchGithub}
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
                if (p) setProjectName(p.name);
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
            fullWidth label="Project Name" value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAddDialogOpen(false); setGithubProjects([]); setSelectedGithubProject(null); }}>Cancel</Button>
          <Button variant="contained" onClick={handleAdd} disabled={!selectedGithubProject || !projectName.trim()}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete Project?</DialogTitle>
        <DialogContent><Typography>Are you sure you want to delete this project?</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default UserUPythonProjectsPage;
