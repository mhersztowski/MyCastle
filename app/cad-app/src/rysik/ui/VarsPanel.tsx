/**
 * Zmienne dokumentu — wspólny punkt suwaka w tekście i parametru sceny.
 * Zmiana wartości przelicza wszystkie bloki, które ją wiążą (`ref`/`expr`).
 */

import { useState } from 'react';
import {
  Box, Collapse, IconButton, Slider, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SettingsIcon from '@mui/icons-material/Settings';
import { allBlocks } from '../serialize';
import { blockDeps } from '../props';
import { getManifest } from '../blocks/registry';
import type { RysikStore } from '../store';
import type { DocVar } from '../types';

interface Props {
  store: RysikStore;
}

export function VarsPanel({ store }: Props) {
  const doc = store.getDoc();
  const [editing, setEditing] = useState<string | null>(null);

  const usage = (name: string): number =>
    allBlocks(doc).filter(b => {
      const manifest = getManifest(b.type);
      return manifest ? blockDeps(manifest, b.props).includes(name) : false;
    }).length;

  const setVars = (vars: DocVar[], label: string): void => store.set(['vars'], vars, label);

  const addVar = (): void => {
    let n = doc.vars.length + 1;
    while (doc.vars.some(v => v.name === `v${n}`)) n++;
    setVars([...doc.vars, { name: `v${n}`, value: 1, min: 0, max: 10, step: 0.1 }], 'Nowa zmienna');
  };

  const patchVar = (name: string, patch: Partial<DocVar>): void => {
    setVars(doc.vars.map(v => (v.name === name ? { ...v, ...patch } : v)), 'Zmienna');
  };

  return (
    <Box sx={{ p: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
        <Typography sx={{ flex: 1, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'text.secondary' }}>
          Zmienne dokumentu
        </Typography>
        <Tooltip title="Dodaj zmienną">
          <IconButton size="small" onClick={addVar}><AddIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Box>

      {doc.vars.length === 0 && (
        <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>
          Brak. Zmienna pozwala związać suwak w tekście z parametrem sceny.
        </Typography>
      )}

      {doc.vars.map(v => (
        <Box key={v.name} sx={{ mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography sx={{ fontSize: 11, flex: 1, fontFamily: 'monospace' }}>
              {v.label ? `${v.label} · ` : ''}{v.name}
              <Typography component="span" sx={{ fontSize: 10, color: 'text.disabled', ml: 0.5 }}>
                ({usage(v.name)}×)
              </Typography>
            </Typography>
            <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: 'primary.main' }}>{String(v.value)}</Typography>
            <IconButton size="small" onClick={() => setEditing(editing === v.name ? null : v.name)}>
              <SettingsIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Box>

          {typeof v.value === 'number' && (
            <Slider
              size="small"
              value={v.value}
              min={v.min ?? 0}
              max={v.max ?? 100}
              step={v.step ?? 0.1}
              // Suwak zmiennej to jedna transakcja — tak samo jak pole w panelu.
              onChange={(_, value) => {
                if (!store.inTransaction) store.beginTransaction(`Zmienna ${v.name}`);
                store.set(['vars', v.name, 'value'], value as number);
              }}
              onChangeCommitted={() => store.commit()}
            />
          )}

          <Collapse in={editing === v.name}>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
              <TextField
                size="small" label="nazwa" value={v.name}
                onChange={e => patchVar(v.name, { name: e.target.value })}
                InputLabelProps={{ sx: { fontSize: 10 } }} inputProps={{ style: { fontSize: 11, padding: '4px 6px' } }}
              />
              <TextField
                size="small" label="opis" value={v.label ?? ''}
                onChange={e => patchVar(v.name, { label: e.target.value })}
                InputLabelProps={{ sx: { fontSize: 10 } }} inputProps={{ style: { fontSize: 11, padding: '4px 6px' } }}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              {(['min', 'max', 'step'] as const).map(field => (
                <TextField
                  key={field}
                  size="small" label={field} type="number" value={v[field] ?? ''}
                  onChange={e => patchVar(v.name, { [field]: Number(e.target.value) })}
                  InputLabelProps={{ sx: { fontSize: 10 } }} inputProps={{ style: { fontSize: 11, padding: '4px 6px' } }}
                />
              ))}
              <Tooltip title="Usuń zmienną">
                <IconButton
                  size="small"
                  onClick={() => setVars(doc.vars.filter(x => x.name !== v.name), `Usuń ${v.name}`)}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Collapse>
        </Box>
      ))}
    </Box>
  );
}
