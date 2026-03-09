import { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Button, IconButton, Card, CardActionArea,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Alert, CircularProgress,
} from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { minisApi } from '../../services/MinisApiService';
import type { MinisProjectModel, MinisProjectDefModel } from '@mhersztowski/core';

function UserProjectsPage() {
  const { userName } = useParams<{ userName: string }>();
  const navigate = useNavigate();
  const [items, setItems] = useState<MinisProjectModel[]>([]);
  const [projectDefs, setProjectDefs] = useState<MinisProjectDefModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedProjectDef, setSelectedProjectDef] = useState('');
  const [projectName, setProjectName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userName) return;
    setLoading(true);
    try {
      const [projects, defs] = await Promise.all([
        minisApi.getUserProjects(userName),
        minisApi.getProjectDefs(),
      ]);
      // Show only Arduino platform (or legacy entries without a platform)
      const arduinoDefs = defs.filter(
        (d) => !d.softwarePlatform || d.softwarePlatform === 'Arduino',
      );
      const arduinoProjects = projects.filter((p) =>
        arduinoDefs.some((d) => d.id === p.projectDefId),
      );
      setItems(arduinoProjects);
      setProjectDefs(arduinoDefs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [userName]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!userName || !selectedProjectDef || !projectName.trim()) return;
    try {
      await minisApi.createUserProject(userName, { name: projectName.trim(), projectDefId: selectedProjectDef });
      setAddDialogOpen(false);
      setSelectedProjectDef('');
      setProjectName('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    }
  };

  const handleOpen = (project: MinisProjectModel) => {
    navigate(`/user/${userName}/project/${project.id}`);
  };

  const handleDelete = async (projectName: string) => {
    if (!userName) return;
    try {
      await minisApi.deleteUserProject(userName, projectName);
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

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {items.map((item) => (
          <Card key={item.id} sx={{ width: 220 }}>
            <CardActionArea onClick={() => handleOpen(item)} sx={{ p: 1.5, pb: 0.5 }}>
              <Typography variant="subtitle2" color="text.secondary">Name:</Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>{item.name}</Typography>
              <Typography variant="subtitle2" color="text.secondary">Based on Module:</Typography>
              <Typography variant="body2">
                {projectDefs.find(d => d.id === item.projectDefId)?.name ?? item.projectDefId}
              </Typography>
            </CardActionArea>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 0.5, pb: 0.5 }}>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item.name); }}>
                <Delete fontSize="small" />
              </IconButton>
            </Box>
          </Card>
        ))}
        {!loading && items.length === 0 && (
          <Typography color="text.secondary">No projects yet</Typography>
        )}
      </Box>

      {/* Add Project Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Project</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth select label="Project Definition" value={selectedProjectDef}
            onChange={(e) => {
              const defId = e.target.value;
              setSelectedProjectDef(defId);
              const def = projectDefs.find(d => d.id === defId);
              if (def) setProjectName(def.name);
            }}
            sx={{ mt: 1, mb: 2 }}
            InputLabelProps={{ shrink: true }}
            SelectProps={{ native: true }}
          >
            <option value=""></option>
            {projectDefs.map((def) => (
              <option key={def.id} value={def.id}>{def.name} (v{def.version})</option>
            ))}
          </TextField>
          <TextField
            fullWidth label="Project Name" value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdd} disabled={!selectedProjectDef || !projectName.trim()}>Create</Button>
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

export default UserProjectsPage;
