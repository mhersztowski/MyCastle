import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Alert, Chip, Tooltip, CircularProgress, Divider,
} from '@mui/material';
import { Add, Delete, ContentCopy, Close } from '@mui/icons-material';
import { minisApi } from '../services/MinisApiService';
import type { ApiKeyPublic } from '@mhersztowski/core';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  userName: string;
}

/**
 * Ustawienia użytkownika — na razie generowanie i zarządzanie tokenami API backendu.
 * Token (klucz API) jest długożyjący i działa jako `Authorization: Bearer <token>`
 * na wszystkich endpointach `/api/*` — w tym do klientów z `core/browser/api`.
 */
export function SettingsDialog({ open, onClose, userName }: SettingsDialogProps) {
  const [keys, setKeys] = useState<ApiKeyPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      setError(err instanceof Error ? err.message : 'Nie udało się wczytać kluczy API');
    } finally {
      setLoading(false);
    }
  }, [userName]);

  // Wczytaj klucze za każdym otwarciem dialogu.
  useEffect(() => {
    if (open) { setLoading(true); loadKeys(); }
  }, [open, loadKeys]);

  const handleCreate = async () => {
    if (!userName || !newKeyName.trim()) return;
    setCreating(true);
    try {
      const result = await minisApi.createApiKey(userName, newKeyName.trim());
      setCreatedRawKey(result.rawKey);
      setNewKeyName('');
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się utworzyć klucza API');
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
      setError(err instanceof Error ? err.message : 'Nie udało się usunąć klucza API');
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
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        Settings
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={onClose}><Close fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="subtitle1" gutterBottom>Tokeny API (backend)</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Osobiste tokeny dostępu do API backendu — działają jako
          {' '}<code>Authorization: Bearer &lt;token&gt;</code> na endpointach <code>/api/*</code>
          {' '}(np. dla klientów z <code>core/browser/api</code>, Node-RED, Home Assistant).
          Tokeny nie wygasają.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

        {createdRawKey && (
          <Alert
            severity="success"
            sx={{ mb: 2 }}
            onClose={() => setCreatedRawKey(null)}
            action={
              <Tooltip title={copied ? 'Skopiowano!' : 'Kopiuj do schowka'}>
                <IconButton size="small" color="inherit" onClick={() => handleCopy(createdRawKey)}>
                  <ContentCopy fontSize="small" />
                </IconButton>
              </Tooltip>
            }
          >
            <Typography variant="subtitle2" gutterBottom>
              Token utworzony. Skopiuj go teraz — nie zostanie pokazany ponownie.
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {createdRawKey}
            </Typography>
          </Alert>
        )}

        {/* Tworzenie nowego tokenu — inline */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <TextField
            size="small"
            fullWidth
            label="Nazwa tokenu"
            placeholder="np. Node-RED, skrypt, telefon"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && newKeyName.trim() && handleCreate()}
          />
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleCreate}
            disabled={creating || !newKeyName.trim()}
          >
            {creating ? 'Tworzę…' : 'Generuj'}
          </Button>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress /></Box>
        ) : keys.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">
              Brak tokenów. Wygeneruj pierwszy powyżej.
            </Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Nazwa</TableCell>
                  <TableCell>Token</TableCell>
                  <TableCell>Utworzono</TableCell>
                  <TableCell width={48} />
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
                        {key.prefix}…
                      </Typography>
                    </TableCell>
                    <TableCell>{formatDate(key.createdAt)}</TableCell>
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
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Zamknij</Button>
      </DialogActions>

      {/* Potwierdzenie usunięcia (nested) */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Usunąć token?</DialogTitle>
        <DialogContent>
          <Typography>Każda integracja używająca tego tokenu przestanie natychmiast działać.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Anuluj</Button>
          <Button color="error" variant="contained" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>
            Usuń
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
