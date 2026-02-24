import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Box, Typography, Button, IconButton, Chip, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  TableSortLabel,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Switch, FormControlLabel, Alert, CircularProgress,
} from '@mui/material';
import { Edit, Delete, Add, UploadFile } from '@mui/icons-material';
import { minisApi } from '../../services/MinisApiService';
import type { MinisModuleDefModel } from '@mhersztowski/core';

type SortKey = 'name' | 'soc' | 'isProgrammable';
type SortDir = 'asc' | 'desc';

interface FormData {
  name: string;
  soc: string;
  isProgrammable: boolean;
}

const emptyForm: FormData = { name: '', soc: '', isProgrammable: false };

function ModulesDefPage() {
  const [items, setItems] = useState<MinisModuleDefModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetId = useRef<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await minisApi.getModuleDefs());
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
      if (sortBy === 'isProgrammable') {
        return (a.isProgrammable === b.isProgrammable) ? 0 : a.isProgrammable ? -1 : 1;
      }
      const va = String(a[sortBy] || '');
      const vb = String(b[sortBy] || '');
      return va.localeCompare(vb);
    });
    return sortDir === 'desc' ? sorted.reverse() : sorted;
  }, [items, sortBy, sortDir]);

  const openAdd = () => { setEditId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (item: MinisModuleDefModel) => {
    setEditId(item.id);
    setForm({ name: item.name, soc: item.soc, isProgrammable: item.isProgrammable });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editId) {
        await minisApi.updateModuleDef(editId, form);
      } else {
        await minisApi.createModuleDef(form);
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await minisApi.deleteModuleDef(id);
      setDeleteConfirm(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleUploadSources = (id: string) => {
    uploadTargetId.current = id;
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTargetId.current) return;
    setUploading(uploadTargetId.current);
    try {
      const result = await minisApi.uploadDefSources('moduledefs', uploadTargetId.current, file);
      setError(null);
      alert(`Uploaded: ${result.filesExtracted} files extracted`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Module Definitions</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={openAdd}>Add ModuleDef</Button>
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
              <TableCell>Id</TableCell>
              <TableCell sortDirection={sortBy === 'soc' ? sortDir : false}>
                <TableSortLabel active={sortBy === 'soc'} direction={sortBy === 'soc' ? sortDir : 'asc'} onClick={() => handleSort('soc')}>SoC</TableSortLabel>
              </TableCell>
              <TableCell sortDirection={sortBy === 'isProgrammable' ? sortDir : false}>
                <TableSortLabel active={sortBy === 'isProgrammable'} direction={sortBy === 'isProgrammable' ? sortDir : 'asc'} onClick={() => handleSort('isProgrammable')}>Programmable</TableSortLabel>
              </TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell><Typography variant="caption" color="text.secondary">{item.id}</Typography></TableCell>
                <TableCell>{item.soc || '-'}</TableCell>
                <TableCell>
                  {item.isProgrammable ? <Chip label="Yes" color="success" size="small" /> : <Chip label="No" size="small" />}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Upload Sources (zip)">
                    <span>
                      <IconButton size="small" onClick={() => handleUploadSources(item.id)} disabled={uploading === item.id}>
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
              <TableRow><TableCell colSpan={5} align="center">No module definitions</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Edit ModuleDef' : 'Add ModuleDef'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} sx={{ mt: 1, mb: 2 }} />
          <TextField fullWidth label="SoC (e.g. Esp32)" value={form.soc}
            onChange={(e) => setForm({ ...form, soc: e.target.value, isProgrammable: e.target.value !== '' })} sx={{ mb: 2 }}
            helperText="If not empty, module is programmable" />
          <FormControlLabel control={<Switch checked={form.isProgrammable} onChange={(e) => setForm({ ...form, isProgrammable: e.target.checked })} />} label="Programmable" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete ModuleDef?</DialogTitle>
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

export default ModulesDefPage;
