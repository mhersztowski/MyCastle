import { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Button, IconButton, Card, CardActionArea,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Alert, CircularProgress, Chip,
} from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { minisApi } from '../../services/MinisApiService';
import type { MinisProjectModel } from '@mhersztowski/core';

function UserCppProjectsPage() {
  const { userName } = useParams<{ userName: string }>();
  const navigate = useNavigate();

  const [items, setItems] = useState<MinisProjectModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userName) return;
    setLoading(true);
    try {
      const projects = await minisApi.getUserProjects(userName);
      setItems(projects.filter((p) => p.softwarePlatform === 'Cpp'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [userName]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!userName || !newName.trim()) return;
    try {
      await minisApi.createUserProject(userName, {
        name: newName.trim(),
        softwarePlatform: 'Cpp',
      });
      setAddDialogOpen(false);
      setNewName('');
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
        <Typography variant="h4">My C++ Projects</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => { setNewName(''); setAddDialogOpen(true); }}>
          New Project
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <CircularProgress />}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {items.map((item) => (
          <Card key={item.id} sx={{ width: 220 }}>
            <CardActionArea
              onClick={() => navigate(`/user/${userName}/cpp-project/${encodeURIComponent(item.name)}`)}
              sx={{ p: 1.5, pb: 0.5 }}
            >
              <Typography variant="subtitle2" color="text.secondary">Name:</Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>{item.name}</Typography>
              <Chip label="C++" size="small" color="primary" sx={{ mt: 0.5 }} />
            </CardActionArea>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 0.5, pb: 0.5 }}>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item.name); }}>
                <Delete fontSize="small" />
              </IconButton>
            </Box>
          </Card>
        ))}
        {!loading && items.length === 0 && (
          <Typography color="text.secondary">No C++ projects yet</Typography>
        )}
      </Box>

      {/* New project dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New C++ Project</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            autoFocus fullWidth label="Project Name"
            value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          />
          <Typography variant="body2" color="text.secondary">
            Native C++ — edit headers and sources with full IntelliSense.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdd} disabled={!newName.trim()}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete Project?</DialogTitle>
        <DialogContent><Typography>Are you sure you want to delete <strong>{deleteConfirm}</strong>?</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default UserCppProjectsPage;
