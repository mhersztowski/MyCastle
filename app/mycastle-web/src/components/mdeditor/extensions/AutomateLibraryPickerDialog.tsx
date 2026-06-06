/**
 * Library picker for Automate Script — lists everything in the central
 * `LIBRARIES` catalog and shows which ones the current script already uses.
 * Adding inserts a `// @library: foo` marker at the top of the body; the
 * runtime preloader and the IntelliSense registration both react to those
 * markers, so a single insert wires up both type completions and the CDN
 * load when the script runs.
 */

import React, { useMemo } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, List, ListItemButton, ListItemText, Stack, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd';
import { LIBRARIES, addLibraryToCode, parseLibrariesFromCode } from './automateLibraries';

export interface AutomateLibraryPickerDialogProps {
  open: boolean;
  onClose: () => void;
  /** Current script body — needed to show which libraries are already in use. */
  code: string;
  /** Called with the new code (with the `// @library: …` marker inserted at top). */
  onChange: (newCode: string) => void;
}

const AutomateLibraryPickerDialog: React.FC<AutomateLibraryPickerDialogProps> = ({
  open, onClose, code, onChange,
}) => {
  // Recompute on every render — `code` is the single source of truth, and the
  // catalog is small. No need to memoise into state.
  const inUse = useMemo(() => new Set(parseLibrariesFromCode(code)), [code]);

  const handleToggle = (libraryId: string) => {
    if (inUse.has(libraryId)) return; // already added — no-op for now
    const next = addLibraryToCode(code, libraryId);
    onChange(next);
  };

  const entries = Object.values(LIBRARIES);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ py: 1.25, pr: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <LibraryAddIcon sx={{ color: '#4caf50' }} />
          <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 600 }}>
            Użyj biblioteki
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        <List dense sx={{ py: 0 }}>
          {entries.map(lib => {
            const active = inUse.has(lib.id);
            return (
              <ListItemButton
                key={lib.id}
                onClick={() => handleToggle(lib.id)}
                disabled={active}
                sx={{ gap: 1.5, py: 1.5 }}
              >
                <Box sx={{ minWidth: 30 }}>
                  {active
                    ? <CheckCircleIcon fontSize="small" sx={{ color: '#4caf50' }} />
                    : <LibraryAddIcon fontSize="small" sx={{ color: 'text.disabled' }} />}
                </Box>
                <ListItemText
                  primary={
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography variant="body2" fontWeight={600}>{lib.label}</Typography>
                      <Chip
                        label={lib.globalName}
                        size="small"
                        sx={{ fontFamily: 'monospace', fontSize: '0.7em', height: 18 }}
                      />
                      {active && (
                        <Chip
                          label="dodana"
                          size="small"
                          color="success"
                          sx={{ fontSize: '0.7em', height: 18 }}
                        />
                      )}
                    </Stack>
                  }
                  secondary={lib.description}
                  slotProps={{ secondary: { fontSize: '0.78em' } }}
                />
              </ListItemButton>
            );
          })}
        </List>

        <Box sx={{ p: 2, bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Jak to działa:
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75em', display: 'block' }}>
            Wybór biblioteki wstawia komentarz <code>// @library: …</code> na początku skryptu.
            Przy uruchomieniu skrypt automatycznie ładuje bibliotekę z CDN i wystawia ją jako globalną
            zmienną (np. <code>THREE</code>). W edytorze biblioteka jest też dostępna dla podpowiedzi typów.
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions>
        <Tooltip title="Zamknij — zmiany w kodzie są zapisywane automatycznie">
          <Button onClick={onClose} variant="contained">Gotowe</Button>
        </Tooltip>
      </DialogActions>
    </Dialog>
  );
};

export default AutomateLibraryPickerDialog;
