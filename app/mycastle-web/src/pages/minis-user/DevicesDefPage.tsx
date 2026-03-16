import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box, Typography, Button, IconButton, Chip, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  TableSortLabel,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Alert, CircularProgress,
  Autocomplete,
} from '@mui/material';
import { Edit, Delete, Add } from '@mui/icons-material';
import { useParams } from 'react-router-dom';
import { minisApi } from '../../services/MinisApiService';
import type { GithubModuleEntry } from '../../services/MinisApiService';
import type { MinisDeviceDefModel } from '@mhersztowski/core';

const DEFAULT_REPO_URL = 'https://github.com/platform-minis/MinisProjects';
const REPO_URL_KEY = 'minis_github_repo_url';

type SortKey = 'name' | 'modules';
type SortDir = 'asc' | 'desc';

interface FormData {
  name: string;
  modules: string[];
}

const emptyForm: FormData = { name: '', modules: [] };

function DevicesDefPage() {
  const { userName } = useParams<{ userName: string }>();
  const [items, setItems] = useState<MinisDeviceDefModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [githubModules, setGithubModules] = useState<GithubModuleEntry[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const load = useCallback(async () => {
    if (!userName) return;
    setLoading(true);
    try {
      const repoUrl = localStorage.getItem(REPO_URL_KEY) ?? DEFAULT_REPO_URL;
      const [defs, githubData] = await Promise.all([
        minisApi.getDeviceDefs(userName),
        minisApi.getGithubProjectdefs(repoUrl).catch(() => null),
      ]);
      setItems(defs);
      if (githubData?.modules) setGithubModules(githubData.modules);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [userName]);

  useEffect(() => { load(); }, [load]);

  const handleSort = (key: SortKey) => {
    setSortDir(sortBy === key && sortDir === 'asc' ? 'desc' : 'asc');
    setSortBy(key);
  };

  const sortedItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      let va: string, vb: string;
      if (sortBy === 'modules') {
        va = (a.modules || []).join(',');
        vb = (b.modules || []).join(',');
      } else {
        va = a.name;
        vb = b.name;
      }
      return va.localeCompare(vb);
    });
    return sortDir === 'desc' ? sorted.reverse() : sorted;
  }, [items, sortBy, sortDir]);

  const openAdd = () => { setEditId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (item: MinisDeviceDefModel) => {
    setEditId(item.id);
    setForm({ name: item.name, modules: item.modules || [] });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!userName) return;
    try {
      if (editId) {
        await minisApi.updateDeviceDef(userName, editId, { name: form.name, modules: form.modules });
      } else {
        await minisApi.createDeviceDef(userName, { name: form.name, modules: form.modules });
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const handleDelete = async (id: string) => {
    if (!userName) return;
    try {
      await minisApi.deleteDeviceDef(userName, id);
      setDeleteConfirm(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Device Definitions</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={openAdd}>Add DeviceDef</Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <CircularProgress />}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sortDirection={sortBy === 'name' ? sortDir : false}>
                <TableSortLabel active={sortBy === 'name'} direction={sortBy === 'name' ? sortDir : 'asc'} onClick={() => handleSort('name')}>Name</TableSortLabel>
              </TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Id</TableCell>
              <TableCell sortDirection={sortBy === 'modules' ? sortDir : false}>
                <TableSortLabel active={sortBy === 'modules'} direction={sortBy === 'modules' ? sortDir : 'asc'} onClick={() => handleSort('modules')}>Modules</TableSortLabel>
              </TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><Typography variant="caption" color="text.secondary">{item.id}</Typography></TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap">
                    {(item.modules || []).map((m) => <Chip key={m} label={m} size="small" variant="outlined" />)}
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => openEdit(item)}><Edit /></IconButton>
                  <IconButton size="small" onClick={() => setDeleteConfirm(item.id)}><Delete /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!loading && items.length === 0 && (
              <TableRow><TableCell colSpan={4} align="center">No device definitions</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Edit DeviceDef' : 'Add DeviceDef'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} sx={{ mt: 1, mb: 2 }} />
          <Autocomplete
            multiple
            freeSolo
            options={githubModules.map((m) => m.id)}
            getOptionLabel={(id) => {
              const m = githubModules.find((m) => m.id === id);
              return m ? `${m.id} — ${m.name}` : id;
            }}
            value={form.modules}
            onChange={(_e, newValue) => setForm({ ...form, modules: newValue as string[] })}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip label={option} size="small" {...getTagProps({ index })} key={option} />
              ))
            }
            renderInput={(params) => (
              <TextField {...params} label="Module IDs" placeholder="Select or type module id..." />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete DeviceDef?</DialogTitle>
        <DialogContent><Typography>Are you sure?</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}

export default DevicesDefPage;
