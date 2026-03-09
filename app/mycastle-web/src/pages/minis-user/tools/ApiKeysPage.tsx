import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Alert, Chip, Tooltip, CircularProgress,
} from '@mui/material';
import { Add, Delete, ContentCopy } from '@mui/icons-material';
import { useParams } from 'react-router-dom';
import { minisApi } from '../../../services/MinisApiService';
import type { ApiKeyPublic } from '@mhersztowski/core';

function ApiKeysPage() {
  const { userName } = useParams<{ userName: string }>();
  const [keys, setKeys] = useState<ApiKeyPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    if (!userName) return;
    try {
      setError(null);
      const items = await minisApi.getApiKeys(userName);
      setKeys(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, [userName]);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const handleCreate = async () => {
    if (!userName || !newKeyName.trim()) return;
    setCreating(true);
    try {
      const result = await minisApi.createApiKey(userName, newKeyName.trim());
      setCreatedRawKey(result.rawKey);
      setNewKeyName('');
      setCreateOpen(false);
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (keyId: string) => {
    if (!userName) return;
    try {
      await minisApi.deleteApiKey(userName, keyId);
      setDeleteConfirm(null);
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete API key');
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString('pl-PL', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">API Keys</Typography>
          <Typography variant="body2" color="text.secondary">
            Personal access tokens for Node-RED, Home Assistant, and other integrations. Keys never expire.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>
          Create Key
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {createdRawKey && (
        <Alert
          severity="success"
          sx={{ mb: 2 }}
          onClose={() => setCreatedRawKey(null)}
          action={
            <Tooltip title={copied ? 'Copied!' : 'Copy to clipboard'}>
              <IconButton size="small" color="inherit" onClick={() => handleCopy(createdRawKey)}>
                <ContentCopy fontSize="small" />
              </IconButton>
            </Tooltip>
          }
        >
          <Typography variant="subtitle2" gutterBottom>API key created. Copy it now — it won't be shown again.</Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {createdRawKey}
          </Typography>
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
      ) : keys.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            No API keys yet. Create one for your Node-RED or Home Assistant integrations.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Key</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Last Used</TableCell>
                <TableCell width={60} />
              </TableRow>
            </TableHead>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {key.name}
                      {key.isAdmin && <Chip label="Admin" size="small" color="primary" />}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {key.prefix}...
                    </Typography>
                  </TableCell>
                  <TableCell>{formatDate(key.createdAt)}</TableCell>
                  <TableCell>{key.lastUsedAt ? formatDate(key.lastUsedAt) : <Typography variant="body2" color="text.secondary">Never</Typography>}</TableCell>
                  <TableCell>
                    <IconButton size="small" color="error" onClick={() => setDeleteConfirm(key.id)}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Create API Key</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Key Name"
            placeholder="e.g. Node-RED, Home Assistant"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && newKeyName.trim() && handleCreate()}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={creating || !newKeyName.trim()}>
            {creating ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete API Key?</DialogTitle>
        <DialogContent>
          <Typography>Any integrations using this key will stop working immediately.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ApiKeysPage;
