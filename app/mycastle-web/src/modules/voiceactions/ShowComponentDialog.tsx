/**
 * Okno dialogowe konfiguracji bloczka „Wyświetl komponent":
 *  1. sposób wyświetlenia: osadzony (inline/span) albo popup przez przycisk,
 *  2. wybór komponentu z listy (wbudowane + Programming/Components).
 */
import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  FormControl, FormLabel, RadioGroup, FormControlLabel, Radio,
  List, ListItemButton, ListItemText, Chip, Box, CircularProgress, Typography,
} from '@mui/material';
import { listComponents, type ComponentListItem, type ShowComponentConfig } from './showComponentPicker';

interface Props {
  open: boolean;
  userName: string;
  initial: ShowComponentConfig | null;
  onCancel: () => void;
  onConfirm: (cfg: ShowComponentConfig) => void;
}

export const ShowComponentDialog: React.FC<Props> = ({ open, userName, initial, onCancel, onConfirm }) => {
  const [mode, setMode] = useState<'inline' | 'popup'>(initial?.mode ?? 'inline');
  const [selected, setSelected] = useState<ComponentListItem | null>(
    initial ? { id: initial.id, name: initial.name, kind: initial.kind, path: initial.path } : null,
  );
  const [items, setItems] = useState<ComponentListItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(initial?.mode ?? 'inline');
    setSelected(initial ? { id: initial.id, name: initial.name, kind: initial.kind, path: initial.path } : null);
    setLoading(true);
    listComponents(userName)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [open, userName, initial]);

  const confirm = () => {
    if (!selected) return;
    onConfirm({ mode, kind: selected.kind, id: selected.id, name: selected.name, path: selected.path });
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Wyświetl komponent</DialogTitle>
      <DialogContent dividers>
        <FormControl sx={{ mb: 2 }}>
          <FormLabel>Sposób wyświetlenia</FormLabel>
          <RadioGroup row value={mode} onChange={e => setMode(e.target.value as 'inline' | 'popup')}>
            <FormControlLabel value="inline" control={<Radio />} label="Osadzony (span)" />
            <FormControlLabel value="popup" control={<Radio />} label="Popup (przycisk)" />
          </RadioGroup>
        </FormControl>

        <FormLabel sx={{ display: 'block', mb: 1 }}>Komponent</FormLabel>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={28} /></Box>
        ) : items.length === 0 ? (
          <Typography variant="body2" color="text.secondary">Brak dostępnych komponentów.</Typography>
        ) : (
          <List dense sx={{ maxHeight: 320, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            {items.map(it => (
              <ListItemButton
                key={`${it.kind}:${it.id}`}
                selected={selected?.kind === it.kind && selected?.id === it.id}
                onClick={() => setSelected(it)}
              >
                <ListItemText primary={it.name} secondary={it.path} />
                <Chip
                  size="small"
                  label={it.kind === 'builtin' ? 'wbudowany' : 'kod'}
                  color={it.kind === 'builtin' ? 'primary' : 'default'}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Anuluj</Button>
        <Button variant="contained" onClick={confirm} disabled={!selected}>Zapisz</Button>
      </DialogActions>
    </Dialog>
  );
};
