import { useState, useCallback, useMemo } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Alert from '@mui/material/Alert';

import type { CompositeFS } from '@mhersztowski/core';
import type { VfsProviderDef } from './providerRegistry';

/* ── Types ── */

export interface VfsMountManagerProps {
  compositeFs: CompositeFS;
  providerRegistry: VfsProviderDef[];
  onMountsChanged: () => void;
}

interface MountDialogState {
  open: boolean;
  selectedType: string | null;
  mountPoint: string;
  config: Record<string, string>;
  error: string | null;
}

/* ── Icons (inline SVG to avoid @mui/icons-material dep in web-client) ── */

function AddIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/* ── Styling ── */

const dialogPaperSx = {
  bgcolor: '#252526',
  color: '#cccccc',
  minWidth: 360,
  border: '1px solid #3c3c3c',
} as const;

const textFieldSx = {
  '& .MuiInputBase-root': { color: '#cccccc', fontSize: 13 },
  '& .MuiInputLabel-root': { color: '#858585', fontSize: 13 },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3c3c3c' },
  '& .MuiInputBase-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#545454' },
  '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#0078d4' },
} as const;

const selectSx = {
  color: '#cccccc',
  fontSize: 13,
  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3c3c3c' },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#545454' },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#0078d4' },
  '& .MuiSvgIcon-root': { color: '#858585' },
} as const;

/* ── Component ── */

export function VfsMountManager({ compositeFs, providerRegistry, onMountsChanged }: VfsMountManagerProps) {
  const [version, setVersion] = useState(0);
  const mounts = useMemo(() => compositeFs.getMounts(), [compositeFs, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const [dialog, setDialog] = useState<MountDialogState>({
    open: false,
    selectedType: null,
    mountPoint: '',
    config: {},
    error: null,
  });

  const selectedDef = useMemo(
    () => providerRegistry.find(d => d.type === dialog.selectedType) ?? null,
    [providerRegistry, dialog.selectedType],
  );

  const openDialog = useCallback(() => {
    setDialog({
      open: true,
      selectedType: providerRegistry.length > 0 ? providerRegistry[0].type : null,
      mountPoint: '/',
      config: {},
      error: null,
    });
  }, [providerRegistry]);

  const closeDialog = useCallback(() => {
    setDialog(prev => ({ ...prev, open: false, error: null }));
  }, []);

  const handleMount = useCallback(async () => {
    if (!selectedDef) return;
    const mp = dialog.mountPoint.trim();

    if (!mp || !mp.startsWith('/')) {
      setDialog(prev => ({ ...prev, error: 'Mount point must start with /' }));
      return;
    }

    for (const field of selectedDef.configFields ?? []) {
      if (field.required && !dialog.config[field.name]?.trim()) {
        setDialog(prev => ({ ...prev, error: `${field.label} is required` }));
        return;
      }
    }

    try {
      let provider;
      if (selectedDef.needsUserGesture && selectedDef.asyncFactory) {
        provider = await selectedDef.asyncFactory();
      } else {
        const config: Record<string, string> = {};
        for (const field of selectedDef.configFields ?? []) {
          config[field.name] = dialog.config[field.name]?.trim() || field.defaultValue || '';
        }
        provider = selectedDef.factory(config);
      }

      compositeFs.mount(mp, provider);
      setVersion(v => v + 1);
      onMountsChanged();
      closeDialog();
    } catch (err) {
      // User cancelled the directory picker — not an error
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setDialog(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [dialog, selectedDef, compositeFs, onMountsChanged, closeDialog]);

  const handleUnmount = useCallback(
    (mountPoint: string) => {
      try {
        compositeFs.unmount(mountPoint);
        setVersion(v => v + 1);
        onMountsChanged();
      } catch {
        // Already unmounted
      }
    },
    [compositeFs, onMountsChanged],
  );

  return (
    <>
      {/* ── Header ── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1,
          py: 0.25,
          borderBottom: '1px solid #3c3c3c',
          bgcolor: '#252526',
          fontSize: 11,
          color: '#858585',
          fontWeight: 600,
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        <span>Mounts</span>
        <IconButton size="small" onClick={openDialog} sx={{ color: '#cccccc', p: 0.25 }}>
          <AddIcon />
        </IconButton>
      </Box>

      {/* ── Mount list ── */}
      {mounts.map(m => (
        <Box
          key={m.mountPoint}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 1,
            py: 0.25,
            fontSize: 12,
            color: '#cccccc',
            borderBottom: '1px solid #2d2d2d',
            flexShrink: 0,
            '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.04)' },
          }}
        >
          <Chip
            label={m.provider.scheme}
            size="small"
            sx={{
              height: 16,
              fontSize: 10,
              bgcolor: '#3c3c3c',
              color: '#cccccc',
              '& .MuiChip-label': { px: 0.75 },
            }}
          />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {m.mountPoint}
          </span>
          <IconButton
            size="small"
            onClick={() => handleUnmount(m.mountPoint)}
            sx={{
              color: '#858585',
              p: 0.25,
              '&:hover': { color: '#f48771' },
            }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
      ))}

      {mounts.length === 0 && (
        <Box sx={{ px: 1, py: 1, fontSize: 11, color: '#666', flexShrink: 0 }}>
          No mounts. Click + to add a provider.
        </Box>
      )}

      {/* ── Mount Dialog ── */}
      <Dialog open={dialog.open} onClose={closeDialog} PaperProps={{ sx: dialogPaperSx }}>
        <DialogTitle sx={{ fontSize: 14, pb: 1, color: '#cccccc' }}>Mount Provider</DialogTitle>
        <DialogContent>
          <FormControl fullWidth size="small" sx={{ mb: 2, mt: 1 }}>
            <InputLabel sx={{ color: '#858585', fontSize: 13 }}>Provider Type</InputLabel>
            <Select
              value={dialog.selectedType ?? ''}
              label="Provider Type"
              onChange={e =>
                setDialog(prev => ({
                  ...prev,
                  selectedType: e.target.value,
                  config: {},
                  error: null,
                }))
              }
              sx={selectSx}
              MenuProps={{
                PaperProps: {
                  sx: { bgcolor: '#3c3c3c', color: '#cccccc', '& .MuiMenuItem-root:hover': { bgcolor: '#094771' } },
                },
              }}
            >
              {providerRegistry.map(def => (
                <MenuItem key={def.type} value={def.type} sx={{ fontSize: 13 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span>{def.label}</span>
                    {def.description && (
                      <span style={{ color: '#858585', fontSize: 11 }}>— {def.description}</span>
                    )}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            fullWidth
            size="small"
            label="Mount Point"
            value={dialog.mountPoint}
            onChange={e => setDialog(prev => ({ ...prev, mountPoint: e.target.value, error: null }))}
            placeholder="/my-mount"
            sx={{ ...textFieldSx, mb: 2 }}
          />

          {selectedDef?.configFields?.map(field => (
            <TextField
              key={field.name}
              fullWidth
              size="small"
              label={field.label + (field.required ? ' *' : '')}
              type={field.type === 'password' ? 'password' : 'text'}
              placeholder={field.placeholder}
              value={dialog.config[field.name] ?? field.defaultValue ?? ''}
              onChange={e =>
                setDialog(prev => ({
                  ...prev,
                  config: { ...prev.config, [field.name]: e.target.value },
                  error: null,
                }))
              }
              sx={{ ...textFieldSx, mb: 1.5 }}
            />
          ))}

          {dialog.error && (
            <Alert severity="error" sx={{ mt: 1, fontSize: 12 }}>
              {dialog.error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeDialog} size="small" sx={{ color: '#858585' }}>
            Cancel
          </Button>
          <Button onClick={handleMount} variant="contained" size="small">
            Mount
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
