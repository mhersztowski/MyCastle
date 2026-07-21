/**
 * VfsJsonQueryDialog - konfiguracja zapytania JSON z VFS:
 *  - wybór pliku JSON (TreeView),
 *  - ścieżka wewnątrz JSON wybierana z GUI (TreeView struktury JSON),
 *  - filtry (ma atrybut, nie ma, zawiera tekst, jest liczbą/bool/tekstem, =, ≠, >, <),
 *  - podgląd wyniku na żywo.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Box, Typography, Select, MenuItem, IconButton, Divider, FormControl, InputLabel, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import VfsFileTree from './VfsFileTree';
import JsonTree from './JsonTree';
import { readVfsJson, navigateJsonPath, applyFilters } from './vfsPicker';
import type { VfsJsonQueryConfig, VfsJsonFilter, VfsFilterOp } from './vfsPicker';

export interface VfsJsonQueryDialogProps {
  open: boolean;
  current: VfsJsonQueryConfig | null;
  onClose: (config: VfsJsonQueryConfig | null) => void;
}

const OPS: { op: VfsFilterOp; label: string; needsValue: boolean }[] = [
  { op: 'has', label: 'ma atrybut', needsValue: false },
  { op: 'not_has', label: 'nie ma atrybutu', needsValue: false },
  { op: 'is_string', label: 'jest tekstem', needsValue: false },
  { op: 'is_number', label: 'jest liczbą', needsValue: false },
  { op: 'is_bool', label: 'jest bool', needsValue: false },
  { op: 'is_array', label: 'jest tablicą', needsValue: false },
  { op: 'contains', label: 'zawiera tekst', needsValue: true },
  { op: 'eq', label: '= wartość', needsValue: true },
  { op: 'neq', label: '≠ wartość', needsValue: true },
  { op: 'gt', label: '> wartość', needsValue: true },
  { op: 'lt', label: '< wartość', needsValue: true },
];

const opNeedsValue = (op: VfsFilterOp) => OPS.find(o => o.op === op)?.needsValue ?? false;

const VfsJsonQueryDialog: React.FC<VfsJsonQueryDialogProps> = ({ open, current, onClose }) => {
  const [path, setPath] = useState('');
  const [jsonPath, setJsonPath] = useState('');
  const [filters, setFilters] = useState<VfsJsonFilter[]>([]);

  const [root, setRoot] = useState<unknown>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [loadingJson, setLoadingJson] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPath(current?.path || '');
    setJsonPath(current?.jsonPath || '');
    setFilters(current?.filters ? [...current.filters] : []);
  }, [open, current]);

  useEffect(() => {
    if (!open || !path) { setRoot(null); setParseError(null); return; }
    setLoadingJson(true);
    setParseError(null);
    readVfsJson(path)
      .then(r => setRoot(r))
      .catch(e => { setRoot(null); setParseError(e instanceof Error ? e.message : String(e)); })
      .finally(() => setLoadingJson(false));
  }, [open, path]);

  const scoped = useMemo(() => navigateJsonPath(root, jsonPath), [root, jsonPath]);
  const result = useMemo(() => applyFilters(scoped, filters), [scoped, filters]);

  const attrKeys = useMemo(() => {
    const arr = Array.isArray(scoped) ? scoped : (Array.isArray(result) ? result : []);
    const first = arr.find(x => x && typeof x === 'object');
    return first ? Object.keys(first as object) : [];
  }, [scoped, result]);

  const resultInfo = useMemo(() => {
    if (Array.isArray(result)) return `tablica: ${result.length} elementów`;
    if (result === undefined) return 'ścieżka nie istnieje';
    if (result === null) return 'null';
    return typeof result;
  }, [result]);

  const previewText = useMemo(() => {
    try {
      const sample = Array.isArray(result) ? result.slice(0, 3) : result;
      return JSON.stringify(sample, null, 2).slice(0, 1200);
    } catch { return ''; }
  }, [result]);

  const addFilter = () => setFilters(prev => [...prev, { op: 'has', key: attrKeys[0] || '', value: '' }]);
  const updateFilter = (i: number, patch: Partial<VfsJsonFilter>) =>
    setFilters(prev => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const removeFilter = (i: number) => setFilters(prev => prev.filter((_, idx) => idx !== i));

  const confirm = () => onClose({ path, jsonPath: jsonPath.trim(), filters });

  return (
    <Dialog open={open} onClose={() => onClose(null)} maxWidth="md" fullWidth>
      <DialogTitle>Zapytanie JSON z VFS</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {/* Lewa: wybór pliku (drzewo) */}
          <Box sx={{ width: 320, flexShrink: 0 }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>1. Plik JSON</Typography>
            {open && <VfsFileTree selected={path} onSelect={setPath} maxHeight={220} />}
            <TextField fullWidth size="small" label="Ścieżka pliku" value={path} onChange={e => setPath(e.target.value)} sx={{ mt: 1 }} />

            <Typography variant="subtitle2" fontWeight={600} sx={{ mt: 2 }} gutterBottom>2. Ścieżka wewnątrz JSON</Typography>
            {loadingJson ? (
              <Typography variant="caption" color="text.secondary">Wczytywanie...</Typography>
            ) : (
              <JsonTree root={root} selected={jsonPath} onPick={setJsonPath} maxHeight={220} />
            )}
            <TextField
              fullWidth size="small" label="Ścieżka JSON" value={jsonPath}
              onChange={e => setJsonPath(e.target.value)} sx={{ mt: 1 }}
              helperText="Kliknij węzeł w drzewie lub wpisz (np. data.items)"
            />
          </Box>

          {/* Prawa: filtry + podgląd */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {parseError && <Alert severity="error" sx={{ mb: 1 }}>Błąd parsowania JSON: {parseError}</Alert>}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>3. Filtry (dla tablicy — wszystkie muszą pasować)</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={addFilter}>Dodaj filtr</Button>
            </Box>
            {filters.map((f, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
                <FormControl size="small" sx={{ minWidth: 90 }}>
                  <InputLabel>atrybut</InputLabel>
                  <Select label="atrybut" value={f.key} onChange={e => updateFilter(i, { key: e.target.value })}>
                    {attrKeys.map(k => <MenuItem key={k} value={k}>{k}</MenuItem>)}
                    {!attrKeys.includes(f.key) && f.key && <MenuItem value={f.key}>{f.key}</MenuItem>}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <InputLabel>warunek</InputLabel>
                  <Select label="warunek" value={f.op} onChange={e => updateFilter(i, { op: e.target.value as VfsFilterOp })}>
                    {OPS.map(o => <MenuItem key={o.op} value={o.op}>{o.label}</MenuItem>)}
                  </Select>
                </FormControl>
                {opNeedsValue(f.op) && (
                  <TextField size="small" label="wartość" value={f.value || ''} onChange={e => updateFilter(i, { value: e.target.value })} sx={{ flex: 1 }} />
                )}
                <IconButton size="small" onClick={() => removeFilter(i)}><DeleteIcon fontSize="small" /></IconButton>
              </Box>
            ))}
            {filters.length === 0 && <Typography variant="caption" color="text.secondary">Brak filtrów — zwraca całą wartość/tablicę.</Typography>}

            <Divider sx={{ my: 1.5 }} />
            <Typography variant="subtitle2" fontWeight={600}>Podgląd wyniku</Typography>
            <Typography variant="caption" color="text.secondary">{resultInfo}</Typography>
            <Box component="pre" sx={{ mt: 0.5, p: 1, bgcolor: 'grey.900', color: 'grey.100', borderRadius: 1, fontSize: 11, maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
              {previewText || '—'}
            </Box>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(null)}>Anuluj</Button>
        <Button variant="contained" disabled={!path} onClick={confirm}>Zapisz zapytanie</Button>
      </DialogActions>
    </Dialog>
  );
};

export default VfsJsonQueryDialog;
