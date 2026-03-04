import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box, Typography, Button, IconButton, Chip, Stack, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  TableSortLabel,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Alert, CircularProgress,
  Autocomplete,
} from '@mui/material';
import { Edit, Delete, Add, UploadFile } from '@mui/icons-material';
import { minisApi } from '../../services/MinisApiService';
import { useSourceUpload } from '../../hooks/useSourceUpload';
import type { MinisDeviceDefModel, MinisModuleDefModel } from '@mhersztowski/core';

type SortKey = 'name' | 'modules';
type SortDir = 'asc' | 'desc';

interface FormData {
  name: string;
  modules: string[];
}

const emptyForm: FormData = { name: '', modules: [] };

function DevicesDefPage() {
  const [items, setItems] = useState<MinisDeviceDefModel[]>([]);
  const [moduleDefs, setModuleDefs] = useState<MinisModuleDefModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const { uploading, fileInputRef, triggerUpload, handleFileSelected } = useSourceUpload('devicedefs', (msg) => setError(msg));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [defs, mods] = await Promise.all([
        minisApi.getDeviceDefs(),
        minisApi.getModuleDefs(),
      ]);
      setItems(defs);
      setModuleDefs(mods);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

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
    try {
      if (editId) {
        await minisApi.updateDeviceDef(editId, { name: form.name, modules: form.modules });
      } else {
        await minisApi.createDeviceDef({ name: form.name, modules: form.modules });
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await minisApi.deleteDeviceDef(id);
      setDeleteConfirm(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const moduleDefIds = moduleDefs.map((m) => m.id);
  const moduleDefNameById = Object.fromEntries(moduleDefs.map((m) => [m.id, m.name]));

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
                    {(item.modules || []).map((m) => <Chip key={m} label={moduleDefNameById[m] || m} size="small" variant="outlined" />)}
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Upload Sources (zip)">
                    <span>
                      <IconButton size="small" onClick={() => triggerUpload(item.id)} disabled={uploading === item.id}>
                        {uploading === item.id ? <CircularProgress size={18} /> : <UploadFile />}
                      </IconButton>
                    </span>
                  </Tooltip>
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
            options={moduleDefIds}
            getOptionLabel={(id) => moduleDefNameById[id] || id}
            value={form.modules}
            onChange={(_e, newValue) => setForm({ ...form, modules: newValue })}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip label={moduleDefNameById[option] || option} size="small" {...getTagProps({ index })} key={option} />
              ))
            }
            renderInput={(params) => (
              <TextField {...params} label="Modules" placeholder="Select modules..." />
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

      <input type="file" accept=".zip" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelected} />
    </Box>
  );
}

export default DevicesDefPage;
