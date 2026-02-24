import { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Button, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Alert, CircularProgress,
} from '@mui/material';
import { Add, Delete, OpenInNew } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { minisApi } from '../../services/MinisApiService';
import type { MinisProjectModel, MinisProjectDefModel } from '@mhersztowski/core';

function UserProjectsPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [items, setItems] = useState<MinisProjectModel[]>([]);
  const [projectDefs, setProjectDefs] = useState<MinisProjectDefModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedProjectDef, setSelectedProjectDef] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [projects, defs] = await Promise.all([
        minisApi.getUserProjects(userId),
        minisApi.getProjectDefs(),
      ]);
      setItems(projects);
      setProjectDefs(defs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!userId || !selectedProjectDef) return;
    try {
      await minisApi.createUserProject(userId, selectedProjectDef);
      setAddDialogOpen(false);
      setSelectedProjectDef('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    }
  };

  const handleOpen = (_project: MinisProjectModel) => {
    navigate(`/user/${userId}/project`);
  };

  const handleDelete = async (projectName: string) => {
    if (!userId) return;
    try {
      await minisApi.deleteUserProject(userId, projectName);
      setDeleteConfirm(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">My Projects</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setAddDialogOpen(true)}>Add</Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <CircularProgress />}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Based On</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.projectDefId}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => handleOpen(item)}><OpenInNew /></IconButton>
                  <IconButton size="small" onClick={() => setDeleteConfirm(item.name)}><Delete /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!loading && items.length === 0 && (
              <TableRow><TableCell colSpan={3} align="center">No projects yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add Project Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Project</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, mt: 1 }}>
            Select a project definition to create a new project from.
          </Typography>
          <TextField
            fullWidth select label="Project Definition" value={selectedProjectDef}
            onChange={(e) => setSelectedProjectDef(e.target.value)}
            InputLabelProps={{ shrink: true }}
            SelectProps={{ native: true }}
          >
            <option value=""></option>
            {projectDefs.map((def) => (
              <option key={def.id} value={def.id}>{def.name} (v{def.version})</option>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdd} disabled={!selectedProjectDef}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete Project?</DialogTitle>
        <DialogContent><Typography>Are you sure you want to delete "{deleteConfirm}"?</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default UserProjectsPage;
