import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Box, Typography, Button, IconButton, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  TableSortLabel,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Alert, CircularProgress,
} from '@mui/material';
import { Edit, Delete, Add, UploadFile } from '@mui/icons-material';
import { minisApi } from '../../services/MinisApiService';
import type { MinisProjectDefModel, MinisModuleDefModel, MinisDeviceDefModel } from '@mhersztowski/core';

type SortKey = 'name' | 'version' | 'deviceDefId' | 'moduleDefId' | 'softwarePlatform';
type SortDir = 'asc' | 'desc';

interface FormData {
  name: string;
  version: string;
  deviceDefId: string;
  moduleDefId: string;
  softwarePlatform: string;
  blocklyDef: string;
}

const emptyForm: FormData = { name: '', version: '1.0', deviceDefId: '', moduleDefId: '', softwarePlatform: 'Arduino', blocklyDef: '' };

function ProjectDefsPage() {
  const [items, setItems] = useState<MinisProjectDefModel[]>([]);
  const [deviceDefs, setDeviceDefs] = useState<MinisDeviceDefModel[]>([]);
  const [moduleDefs, setModuleDefs] = useState<MinisModuleDefModel[]>([]);
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
      const [defs, devDefs, mods] = await Promise.all([
        minisApi.getProjectDefs(),
        minisApi.getDeviceDefs(),
        minisApi.getModuleDefs(),
      ]);
      setItems(defs);
      setDeviceDefs(devDefs);
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
      const va = String(a[sortBy] || '');
      const vb = String(b[sortBy] || '');
      return va.localeCompare(vb);
    });
    return sortDir === 'desc' ? sorted.reverse() : sorted;
  }, [items, sortBy, sortDir]);

  const openAdd = () => { setEditId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (item: MinisProjectDefModel) => {
    setEditId(item.id);
    setForm({
      name: item.name,
      version: item.version,
      deviceDefId: item.deviceDefId,
      moduleDefId: item.moduleDefId,
      softwarePlatform: item.softwarePlatform,
      blocklyDef: item.blocklyDef,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editId) {
        await minisApi.updateProjectDef(editId, form);
      } else {
        await minisApi.createProjectDef(form);
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await minisApi.deleteProjectDef(id);
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
      const result = await minisApi.uploadProjectDefSources(uploadTargetId.current, file);
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
        <Typography variant="h4">Project Definitions</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={openAdd}>Add ProjectDef</Button>
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
              <TableCell sortDirection={sortBy === 'version' ? sortDir : false}>
                <TableSortLabel active={sortBy === 'version'} direction={sortBy === 'version' ? sortDir : 'asc'} onClick={() => handleSort('version')}>Version</TableSortLabel>
              </TableCell>
              <TableCell sortDirection={sortBy === 'deviceDefId' ? sortDir : false}>
                <TableSortLabel active={sortBy === 'deviceDefId'} direction={sortBy === 'deviceDefId' ? sortDir : 'asc'} onClick={() => handleSort('deviceDefId')}>DeviceDef</TableSortLabel>
              </TableCell>
              <TableCell sortDirection={sortBy === 'moduleDefId' ? sortDir : false}>
                <TableSortLabel active={sortBy === 'moduleDefId'} direction={sortBy === 'moduleDefId' ? sortDir : 'asc'} onClick={() => handleSort('moduleDefId')}>ModuleDef</TableSortLabel>
              </TableCell>
              <TableCell sortDirection={sortBy === 'softwarePlatform' ? sortDir : false}>
                <TableSortLabel active={sortBy === 'softwarePlatform'} direction={sortBy === 'softwarePlatform' ? sortDir : 'asc'} onClick={() => handleSort('softwarePlatform')}>Platform</TableSortLabel>
              </TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell><Typography variant="caption" color="text.secondary">{item.id}</Typography></TableCell>
                <TableCell>{item.version}</TableCell>
                <TableCell>{deviceDefs.find((d) => d.id === item.deviceDefId)?.name || item.deviceDefId}</TableCell>
                <TableCell>{moduleDefs.find((m) => m.id === item.moduleDefId)?.name || item.moduleDefId}</TableCell>
                <TableCell>{item.softwarePlatform}</TableCell>
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
              <TableRow><TableCell colSpan={7} align="center">No project definitions</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Edit ProjectDef' : 'Add ProjectDef'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} sx={{ mt: 1, mb: 2 }} />
          <TextField fullWidth label="Version" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} sx={{ mb: 2 }} />
          <TextField
            fullWidth select label="DeviceDef" value={form.deviceDefId}
            onChange={(e) => {
              const newDeviceDefId = e.target.value;
              const selectedDev = deviceDefs.find((d) => d.id === newDeviceDefId);
              const allowedModules = selectedDev?.modules || [];
              setForm({
                ...form,
                deviceDefId: newDeviceDefId,
                moduleDefId: allowedModules.includes(form.moduleDefId) ? form.moduleDefId : '',
              });
            }}
            sx={{ mb: 2 }}
            InputLabelProps={{ shrink: true }}
            SelectProps={{ native: true }}
          >
            <option value=""></option>
            {deviceDefs.map((def) => (
              <option key={def.id} value={def.id}>{def.name}</option>
            ))}
          </TextField>
          <TextField
            fullWidth select label="ModuleDef" value={form.moduleDefId}
            onChange={(e) => setForm({ ...form, moduleDefId: e.target.value })}
            sx={{ mb: 2 }}
            InputLabelProps={{ shrink: true }}
            SelectProps={{ native: true }}
          >
            <option value=""></option>
            {moduleDefs
              .filter((mod) => {
                const selectedDev = deviceDefs.find((d) => d.id === form.deviceDefId);
                return selectedDev ? (selectedDev.modules || []).includes(mod.id) : true;
              })
              .map((mod) => (
                <option key={mod.id} value={mod.id}>{mod.name}</option>
              ))}
          </TextField>
          <TextField fullWidth label="Software Platform" value={form.softwarePlatform} onChange={(e) => setForm({ ...form, softwarePlatform: e.target.value })} sx={{ mb: 2 }} />
          <TextField fullWidth label="Blockly Definition" value={form.blocklyDef} onChange={(e) => setForm({ ...form, blocklyDef: e.target.value })} multiline rows={3} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete ProjectDef?</DialogTitle>
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

export default ProjectDefsPage;
