/**
 * VfsFileDialog - okno wyboru pliku z VFS (drzewo TreeView).
 */
import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
} from '@mui/material';
import VfsFileTree from './VfsFileTree';

export interface VfsFileDialogProps {
  open: boolean;
  current: string;
  onClose: (path: string | null) => void;
}

const VfsFileDialog: React.FC<VfsFileDialogProps> = ({ open, current, onClose }) => {
  const [selected, setSelected] = useState<string>(current || '');

  useEffect(() => { if (open) setSelected(current || ''); }, [open, current]);

  return (
    <Dialog open={open} onClose={() => onClose(null)} maxWidth="sm" fullWidth>
      <DialogTitle>Wybierz plik z VFS</DialogTitle>
      <DialogContent dividers>
        {open && <VfsFileTree selected={selected} onSelect={setSelected} maxHeight={360} />}
        <TextField
          fullWidth size="small" label="Ścieżka pliku" value={selected}
          onChange={e => setSelected(e.target.value)} sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(null)}>Anuluj</Button>
        <Button variant="contained" disabled={!selected} onClick={() => onClose(selected)}>Wybierz</Button>
      </DialogActions>
    </Dialog>
  );
};

export default VfsFileDialog;
