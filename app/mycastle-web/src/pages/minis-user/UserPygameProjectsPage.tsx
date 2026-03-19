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

function UserPygameProjectsPage() {
  const { userName } = useParams<{ userName: string }>();
  const navigate = useNavigate();
  const [items, setItems] = useState<MinisProjectModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [adding, setAdding] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userName) return;
    setLoading(true);
    try {
      const projects = await minisApi.getUserProjects(userName);
      setItems(projects.filter((p) => p.softwarePlatform === 'pygame'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [userName]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!userName || !projectName.trim()) return;
    setAdding(true);
    try {
      const created = await minisApi.createUserProject(userName, {
        name: projectName.trim(),
        softwarePlatform: 'pygame',
      });
      setAddDialogOpen(false);
      setProjectName('');
      navigate(`/user/${userName}/pygame-project/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!userName) return;
    try {
      await minisApi.deleteUserProject(userName, id);
      setDeleteConfirm(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Typography variant="h5" fontWeight={600}>Pygame Projects</Typography>
        <Button variant="contained" startIcon={<Add />} size="small" onClick={() => setAddDialogOpen(true)}>
          New Project
        </Button>
        <IconButton size="small" onClick={load}><Refresh /></IconButton>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <CircularProgress />
      ) : items.length === 0 ? (
        <Typography color="text.secondary">No Pygame projects yet. Create one to get started!</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {items.map((item) => (
            <Card key={item.id} sx={{ width: 220, position: 'relative' }}>
              <CardActionArea
                onClick={() => navigate(`/user/${userName}/pygame-project/${item.id}`)}
                sx={{ p: 2 }}
              >
                <Typography variant="subtitle1" fontWeight={600} noWrap>{item.name}</Typography>
                <Chip label="Pygame" size="small" color="success" sx={{ mt: 1 }} />
              </CardActionArea>
              <IconButton
                size="small"
                sx={{ position: 'absolute', top: 4, right: 4 }}
                onClick={() => setDeleteConfirm(item.id)}
              >
                <Delete fontSize="small" />
              </IconButton>
            </Card>
          ))}
        </Box>
      )}

      {/* Add dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New Pygame Project</DialogTitle>
        <DialogContent>
          <TextField
            label="Project name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            fullWidth
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdd} disabled={!projectName.trim() || adding}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={Boolean(deleteConfirm)} onClose={() => setDeleteConfirm(null)} maxWidth="xs">
        <DialogTitle>Delete project?</DialogTitle>
        <DialogContent>
          <Typography>This will permanently delete the project and all its sketches.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="error" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default UserPygameProjectsPage;
