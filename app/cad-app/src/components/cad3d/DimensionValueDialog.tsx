import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, InputAdornment, FormControlLabel, Checkbox } from '@mui/material';
import type { DimensionEntity, Entity, Project } from '@mhersztowski/core-cad';
import { applyDimensionValue, dimRefs, measuredValue } from '../../tools/dimensionDrive';

interface Props {
  project: Project;
  dimId: string;
  onClose: () => void;
}

/**
 * Okno edycji wartości wymiaru. Zmiana pola napędza geometrię NA ŻYWO (jeszcze przed OK).
 * OK → wymiar staje się constraintem napędzającym (driving, utrzymuje wartość). Anuluj → przywraca.
 */
export function DimensionValueDialog({ project, dimId, onClose }: Props) {
  const dim = project.entityRegistry.get(dimId) as DimensionEntity | undefined;
  const [text, setText] = useState<string>(() => (dim ? (dim.value ?? measuredValue(dim)).toFixed(2) : ''));
  const [driving, setDriving] = useState<boolean>(() => !!dim?.driving);
  // Migawka referencyjnych encji do przywrócenia po Anuluj.
  const origRef = useRef<Map<string, Entity>>(new Map());
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!dim) return;
    const m = new Map<string, Entity>();
    for (const id of dimRefs(dim)) { const e = project.entityRegistry.get(id); if (e) m.set(id, { ...e }); }
    origRef.current = m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimId]);

  if (!dim) return null;

  // Zawsze pobieraj świeży wymiar (encja jest zastępowana po każdej edycji na żywo).
  const freshDim = (): DimensionEntity | undefined =>
    project.entityRegistry.get(dimId) as DimensionEntity | undefined;

  const onChange = (raw: string) => {
    setText(raw);
    const v = parseFloat(raw);
    const d = freshDim();
    if (d && isFinite(v) && v > 0) applyDimensionValue(project, d, v); // live drive
  };

  const revert = () => {
    for (const [id, e] of origRef.current) {
      project.entityRegistry.update(id, e as unknown as Record<string, unknown>);
      const cur = project.entityRegistry.get(id);
      if (cur) project.eventBus.emit('entity:updated', cur);
    }
  };

  const handleOk = () => {
    const v = parseFloat(text);
    const d = freshDim();
    if (d && isFinite(v) && v > 0) {
      applyDimensionValue(project, d, v);
      project.entityRegistry.update(dimId, { driving, value: v });
      const upd = project.entityRegistry.get(dimId);
      if (upd) project.eventBus.emit('entity:updated', upd);
    }
    onClose();
  };

  const handleCancel = () => { revert(); onClose(); };

  return (
    <Dialog
      open
      // Ignoruj kliknięcie tła (i „ghost click" na mobile tuż po otwarciu) — zamknięcie tylko
      // przez Cancel/OK/Escape. Zapobiega miganiu (otwiera się i od razu znika).
      onClose={(_e, reason) => { if (reason === 'backdropClick') return; handleCancel(); }}
      maxWidth="xs"
      fullWidth
      // Skup i zaznacz pole po wjeździe dialogu (od razu można wpisywać / nadpisać wartość).
      TransitionProps={{ onEntered: () => { inputRef.current?.focus(); inputRef.current?.select(); } }}
    >
      <DialogTitle sx={{ fontSize: 16 }}>Dimension value</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          inputRef={inputRef}
          fullWidth
          type="number"
          label="Value"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => { if (e.key === 'Enter') handleOk(); }}
          inputProps={{ step: 'any', min: 0 }}
          InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
          sx={{ mt: 1 }}
        />
        <FormControlLabel
          sx={{ mt: 1 }}
          control={<Checkbox checked={driving} onChange={(e) => setDriving(e.target.checked)} />}
          label="Driving constraint (utrzymuje wartość)"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button variant="contained" onClick={handleOk}>OK</Button>
      </DialogActions>
    </Dialog>
  );
}
