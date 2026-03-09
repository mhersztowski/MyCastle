import { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Button, IconButton, Chip, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Switch, FormControlLabel, Alert, CircularProgress, Tooltip,
} from '@mui/material';
import { Edit, Delete, Add, PersonSearch as ImpersonateIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { minisApi, type UserPublic } from '../../services/MinisApiService';
import { useAuth } from '@modules/auth';

interface UserFormData {
  name: string;
  password: string;
  isAdmin: boolean;
  roles: string;
}

const emptyForm: UserFormData = { name: '', password: '', isAdmin: false, roles: '' };

function UsersPage() {
  const navigate = useNavigate();
  const { currentUser, startImpersonating } = useAuth();
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<UserFormData>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleImpersonate = (user: UserPublic) => {
    startImpersonating(user);
    navigate(`/user/${user.name}/main`);
  };

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await minisApi.getUsers();
      setUsers(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (user: UserPublic) => {
    setEditId(user.id);
    setForm({ name: user.name, password: '', isAdmin: user.isAdmin, roles: (user.roles || []).join(', ') });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const roles = form.roles.split(',').map(r => r.trim()).filter(Boolean);
      if (editId) {
        const update: Record<string, unknown> = { name: form.name, isAdmin: form.isAdmin, roles };
        if (form.password) update.password = form.password;
        await minisApi.updateUser(editId, update);
      } else {
        await minisApi.createUser({ name: form.name, password: form.password, isAdmin: form.isAdmin, roles });
      }
      setDialogOpen(false);
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await minisApi.deleteUser(id);
      setDeleteConfirm(null);
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Users</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={openAdd}>Add User</Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <CircularProgress />}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Admin</TableCell>
              <TableCell>Roles</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.name}</TableCell>
                <TableCell>{user.isAdmin && <Chip label="Admin" color="primary" size="small" />}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5}>
                    {(user.roles || []).map((r) => <Chip key={r} label={r} size="small" variant="outlined" />)}
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  {user.name !== currentUser?.name && (
                    <Tooltip title={`View as ${user.name}`}>
                      <IconButton size="small" onClick={() => handleImpersonate(user)}>
                        <ImpersonateIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                  <IconButton size="small" onClick={() => openEdit(user)}><Edit /></IconButton>
                  <IconButton size="small" onClick={() => setDeleteConfirm(user.id)}><Delete /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!loading && users.length === 0 && (
              <TableRow><TableCell colSpan={4} align="center">No users</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Edit User' : 'Add User'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} sx={{ mt: 1, mb: 2 }} />
          <TextField fullWidth label="Password" type="password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            helperText={editId ? 'Leave empty to keep current' : ''} sx={{ mb: 2 }} />
          <FormControlLabel control={<Switch checked={form.isAdmin} onChange={(e) => setForm({ ...form, isAdmin: e.target.checked })} />} label="Admin" />
          <TextField fullWidth label="Roles (comma separated)" value={form.roles} onChange={(e) => setForm({ ...form, roles: e.target.value })} sx={{ mt: 2 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name || (!editId && !form.password)}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete User?</DialogTitle>
        <DialogContent><Typography>Are you sure you want to delete this user?</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default UsersPage;
