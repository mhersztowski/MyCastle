import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Alert, Chip, Tooltip, CircularProgress, Divider,
  Tabs, Tab, MenuItem, Select, FormControl, InputLabel, Switch, FormControlLabel,
} from '@mui/material';
import {
  Add, Delete, ContentCopy, Close, Visibility, VisibilityOff,
} from '@mui/icons-material';
import { minisApi } from '../services/MinisApiService';
import type { ApiKeyPublic } from '@mhersztowski/core';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  userName: string;
}

/** Namespace (pluginId) pod którym trzymane są ręczne credentiale użytkownika. */
const CREDENTIALS_NS = '__credentials__';
const SECRET_TYPES = ['password', 'token', 'other'] as const;
type SecretType = (typeof SECRET_TYPES)[number];

interface SecretRow { rawKey: string; type: SecretType; name: string; global: boolean; updatedAt: number; }

/** Klucz sekretu = `{type}:{name}` — typ widoczny w liście bez ujawniania wartości. */
function parseSecretKey(rawKey: string): { type: SecretType; name: string } {
  const i = rawKey.indexOf(':');
  if (i === -1) return { type: 'other', name: rawKey };
  const t = rawKey.slice(0, i) as SecretType;
  return { type: SECRET_TYPES.includes(t) ? t : 'other', name: rawKey.slice(i + 1) };
}

/**
 * Ustawienia użytkownika.
 *  - Tokeny API: osobiste tokeny dostępu do backendu (Bearer).
 *  - Sekrety: menedżer credentiali (hasła, tokeny, inne) przechowywanych
 *    bezpiecznie na backendzie (szyfrowane AES-256-GCM at rest).
 */
export function SettingsDialog({ open, onClose, userName }: SettingsDialogProps) {
  const [tab, setTab] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const formatDate = (ts: number) => new Date(ts).toLocaleDateString('pl-PL', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  // ── Tokeny API ──────────────────────────────────────────────────────────
  const [keys, setKeys] = useState<ApiKeyPublic[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [deleteKeyConfirm, setDeleteKeyConfirm] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    if (!userName) return;
    try {
      setError(null);
      setKeys(await minisApi.getApiKeys(userName));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się wczytać tokenów API');
    } finally { setKeysLoading(false); }
  }, [userName]);

  const handleCreateKey = async () => {
    if (!userName || !newKeyName.trim()) return;
    setCreating(true);
    try {
      const result = await minisApi.createApiKey(userName, newKeyName.trim());
      setCreatedRawKey(result.rawKey);
      setNewKeyName('');
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się utworzyć tokenu');
    } finally { setCreating(false); }
  };

  const handleDeleteKey = async (keyId: string) => {
    try {
      await minisApi.deleteApiKey(userName, keyId);
      setDeleteKeyConfirm(null);
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się usunąć tokenu');
    }
  };

  // ── Sekrety ─────────────────────────────────────────────────────────────
  const [secrets, setSecrets] = useState<SecretRow[]>([]);
  const [secretsLoading, setSecretsLoading] = useState(true);
  const [secName, setSecName] = useState('');
  const [secType, setSecType] = useState<SecretType>('password');
  const [secValue, setSecValue] = useState('');
  const [secGlobal, setSecGlobal] = useState(false);
  const [secSaving, setSecSaving] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [deleteSecretConfirm, setDeleteSecretConfirm] = useState<string | null>(null);

  const loadSecrets = useCallback(async () => {
    if (!userName) return;
    try {
      setError(null);
      const items = await minisApi.listSecrets(userName, CREDENTIALS_NS);
      setSecrets(items.map((s) => ({ rawKey: s.key, global: s.shared, updatedAt: s.updatedAt, ...parseSecretKey(s.key) }))
        .sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się wczytać sekretów');
    } finally { setSecretsLoading(false); }
  }, [userName]);

  const handleSaveSecret = async () => {
    const name = secName.trim();
    if (!name || !secValue) return;
    setSecSaving(true);
    try {
      await minisApi.setSecret(userName, CREDENTIALS_NS, `${secType}:${name}`, secValue, secGlobal);
      setSecName(''); setSecValue(''); setSecGlobal(false);
      await loadSecrets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zapisać sekretu');
    } finally { setSecSaving(false); }
  };

  const toggleReveal = async (rawKey: string) => {
    if (revealed[rawKey] !== undefined) {
      setRevealed((prev) => { const n = { ...prev }; delete n[rawKey]; return n; });
      return;
    }
    try {
      const r = await minisApi.getSecret(userName, CREDENTIALS_NS, rawKey);
      setRevealed((prev) => ({ ...prev, [rawKey]: r.value }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się odczytać sekretu');
    }
  };

  const copySecret = async (rawKey: string) => {
    try {
      const value = revealed[rawKey] ?? (await minisApi.getSecret(userName, CREDENTIALS_NS, rawKey)).value;
      handleCopy(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się skopiować sekretu');
    }
  };

  const handleDeleteSecret = async (rawKey: string) => {
    try {
      await minisApi.deleteSecret(userName, CREDENTIALS_NS, rawKey);
      setDeleteSecretConfirm(null);
      setRevealed((prev) => { const n = { ...prev }; delete n[rawKey]; return n; });
      await loadSecrets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się usunąć sekretu');
    }
  };

  // wczytaj oba zasoby przy otwarciu
  useEffect(() => {
    if (!open) return;
    setKeysLoading(true); setSecretsLoading(true);
    setRevealed({}); setCreatedRawKey(null); setError(null);
    loadKeys(); loadSecrets();
  }, [open, loadKeys, loadSecrets]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 0 }}>
        Settings
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={onClose}><Close fontSize="small" /></IconButton>
      </DialogTitle>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Tokeny API" />
        <Tab label="Sekrety" />
      </Tabs>

      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

        {/* ── TAB 0: Tokeny API ── */}
        {tab === 0 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Osobiste tokeny dostępu do backendu — działają jako
              {' '}<code>Authorization: Bearer &lt;token&gt;</code> na endpointach <code>/api/*</code>.
              Tokeny nie wygasają.
            </Typography>

            {createdRawKey && (
              <Alert
                severity="success" sx={{ mb: 2 }} onClose={() => setCreatedRawKey(null)}
                action={
                  <Tooltip title={copied ? 'Skopiowano!' : 'Kopiuj'}>
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

            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField
                size="small" fullWidth label="Nazwa tokenu" placeholder="np. Node-RED, skrypt"
                value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && newKeyName.trim() && handleCreateKey()}
              />
              <Button variant="contained" startIcon={<Add />} onClick={handleCreateKey}
                disabled={creating || !newKeyName.trim()}>
                {creating ? 'Tworzę…' : 'Generuj'}
              </Button>
            </Box>
            <Divider sx={{ mb: 2 }} />

            {keysLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress /></Box>
            ) : keys.length === 0 ? (
              <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
                <Typography color="text.secondary">Brak tokenów. Wygeneruj pierwszy powyżej.</Typography>
              </Paper>
            ) : (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead><TableRow>
                    <TableCell>Nazwa</TableCell><TableCell>Token</TableCell>
                    <TableCell>Utworzono</TableCell><TableCell width={48} />
                  </TableRow></TableHead>
                  <TableBody>
                    {keys.map((key) => (
                      <TableRow key={key.id}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {key.name}{key.isAdmin && <Chip label="Admin" size="small" color="primary" />}
                          </Box>
                        </TableCell>
                        <TableCell><Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{key.prefix}…</Typography></TableCell>
                        <TableCell>{formatDate(key.createdAt)}</TableCell>
                        <TableCell>
                          <IconButton size="small" color="error" onClick={() => setDeleteKeyConfirm(key.id)}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

        {/* ── TAB 1: Sekrety ── */}
        {tab === 1 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Hasła, tokeny i inne dane uwierzytelniające przechowywane bezpiecznie na
              backendzie (szyfrowane AES-256-GCM). Wartości nie są pokazywane na liście —
              odsłoń je przyciskiem oka. Sekret <strong>globalny</strong> jest publiczny —
              dostępny dla wszystkich (także anonimowo, np. w skryptach na stronie Markdown
              otwartej bez logowania).
            </Typography>

            <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Typ</InputLabel>
                <Select label="Typ" value={secType} onChange={(e) => setSecType(e.target.value as SecretType)}>
                  <MenuItem value="password">Hasło</MenuItem>
                  <MenuItem value="token">Token</MenuItem>
                  <MenuItem value="other">Inne</MenuItem>
                </Select>
              </FormControl>
              <TextField size="small" label="Nazwa" placeholder="np. Gmail, GitHub"
                value={secName} onChange={(e) => setSecName(e.target.value)} sx={{ flex: 1, minWidth: 140 }} />
            </Box>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField size="small" fullWidth type="password" label="Wartość" placeholder="hasło / token / sekret…"
                value={secValue} onChange={(e) => setSecValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && secName.trim() && secValue && handleSaveSecret()} />
              <Button variant="contained" startIcon={<Add />} onClick={handleSaveSecret}
                disabled={secSaving || !secName.trim() || !secValue}>
                {secSaving ? 'Zapis…' : 'Zapisz'}
              </Button>
            </Box>
            <FormControlLabel
              sx={{ mb: 1 }}
              control={<Switch size="small" checked={secGlobal} onChange={(e) => setSecGlobal(e.target.checked)} />}
              label={
                <Typography variant="body2" color="text.secondary">
                  Globalny — publiczny, dostępny dla wszystkich (także bez logowania)
                </Typography>
              }
            />
            <Divider sx={{ mb: 2 }} />

            {secretsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress /></Box>
            ) : secrets.length === 0 ? (
              <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
                <Typography color="text.secondary">Brak zapisanych sekretów. Dodaj pierwszy powyżej.</Typography>
              </Paper>
            ) : (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead><TableRow>
                    <TableCell>Typ</TableCell><TableCell>Nazwa</TableCell>
                    <TableCell>Wartość</TableCell><TableCell width={120} />
                  </TableRow></TableHead>
                  <TableBody>
                    {secrets.map((s) => (
                      <TableRow key={s.rawKey}>
                        <TableCell><Chip size="small" label={s.type} /></TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {s.name}
                            {s.global && <Chip size="small" color="warning" label="Global" />}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                            {revealed[s.rawKey] !== undefined ? revealed[s.rawKey] : '••••••••'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title={revealed[s.rawKey] !== undefined ? 'Ukryj' : 'Pokaż'}>
                            <IconButton size="small" onClick={() => toggleReveal(s.rawKey)}>
                              {revealed[s.rawKey] !== undefined ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={copied ? 'Skopiowano!' : 'Kopiuj'}>
                            <IconButton size="small" onClick={() => copySecret(s.rawKey)}><ContentCopy fontSize="small" /></IconButton>
                          </Tooltip>
                          <Tooltip title="Usuń">
                            <IconButton size="small" color="error" onClick={() => setDeleteSecretConfirm(s.rawKey)}>
                              <Delete fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Zamknij</Button>
      </DialogActions>

      {/* Potwierdzenia usunięcia */}
      <Dialog open={!!deleteKeyConfirm} onClose={() => setDeleteKeyConfirm(null)}>
        <DialogTitle>Usunąć token?</DialogTitle>
        <DialogContent>
          <Typography>Każda integracja używająca tego tokenu przestanie natychmiast działać.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteKeyConfirm(null)}>Anuluj</Button>
          <Button color="error" variant="contained" onClick={() => deleteKeyConfirm && handleDeleteKey(deleteKeyConfirm)}>Usuń</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!deleteSecretConfirm} onClose={() => setDeleteSecretConfirm(null)}>
        <DialogTitle>Usunąć sekret?</DialogTitle>
        <DialogContent>
          <Typography>Tej operacji nie można cofnąć.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteSecretConfirm(null)}>Anuluj</Button>
          <Button color="error" variant="contained" onClick={() => deleteSecretConfirm && handleDeleteSecret(deleteSecretConfirm)}>Usuń</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
