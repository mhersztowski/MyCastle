/**
 * Generator panelu właściwości. Panel nie jest pisany ręcznie — powstaje
 * z manifestu bloku, więc dodanie właściwości do sceny natychmiast daje
 * kontrolkę, walidację i dokumentację.
 */

import { useMemo } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Divider, IconButton,
  List, ListItemButton, ListItemText, TextField, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { getManifest } from '../blocks/registry';
import { createChild } from '../serialize';
import { groupProps, isVisible, resolveProps, varsToScope } from '../props';
import { ParamField } from './ParamField';
import type { EditPhase } from './ParamField';
import type { RysikStore, Path } from '../store';
import type { BlockNode, ChildSpec, ParamValue, PropSpec } from '../types';

interface Props {
  store: RysikStore;
  block: BlockNode | null;
  /** Zaznaczenie w postaci `marker:barania` — stan hosta, nie sceny. */
  selection: string | null;
  onSelect: (id: string | null) => void;
}

export function PropertyPanel({ store, block, selection, onSelect }: Props) {
  const doc = store.getDoc();
  const manifest = block ? getManifest(block.type) : undefined;
  const scope = useMemo(() => varsToScope(doc.vars), [doc.vars, doc]);

  if (!block || !manifest) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
          Wybierz blok w dokumencie, aby zobaczyć jego właściwości.
        </Typography>
      </Box>
    );
  }

  const resolved = resolveProps(manifest.props, block.props, scope);

  /**
   * Jedna bramka mutacji dla panelu, gizmo i klawiatury. Fazy przeciągania
   * składają się w jedną transakcję, pojedyncze zmiany zamykają się od razu.
   */
  const edit = (path: Path, value: ParamValue | string, phase: EditPhase, label: string): void => {
    if (phase === 'single') {
      store.set(path, value, label);
      return;
    }
    if (!store.inTransaction) store.beginTransaction(label);
    store.set(path, value);
    if (phase === 'end') store.commit();
  };

  const selectedChild = parseSelection(block, selection);

  if (selectedChild) {
    const { collection, spec, childId } = selectedChild;
    const child = block.children[collection].find(c => c.id === childId)!;
    const childResolved = resolveProps(spec.props, child.props, scope);
    return (
      <Box sx={{ p: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
          <IconButton size="small" onClick={() => onSelect(null)}><ArrowBackIcon fontSize="small" /></IconButton>
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{spec.label} · {child.id}</Typography>
        </Box>
        {Object.entries(spec.props).map(([key, propSpec]) => (
          isVisible(propSpec.visibleIf, childResolved) && (
            <ParamField
              key={key}
              fieldKey={key}
              spec={propSpec}
              value={child.props[key]}
              resolved={childResolved[key]}
              vars={doc.vars}
              onEdit={(value, phase) => edit(
                ['blocks', block.uid, 'children', collection, child.id, 'props', key],
                value,
                phase,
                `${propSpec.label} (${child.id})`,
              )}
            />
          )
        ))}
      </Box>
    );
  }

  return (
    <Box sx={{ p: 1.5 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{manifest.title}</Typography>
      <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'monospace', mb: 1 }}>
        {manifest.type} · v{manifest.version}
      </Typography>

      <TextField
        size="small"
        fullWidth
        label="Etykieta (@ref)"
        value={block.label ?? ''}
        onChange={e => edit(['blocks', block.uid, 'label'], e.target.value, 'single', 'Etykieta bloku')}
        sx={{ mb: 1 }}
        InputLabelProps={{ sx: { fontSize: 11 } }}
        InputProps={{ sx: { fontSize: 12 } }}
      />
      <TextField
        size="small"
        fullWidth
        label="Podpis rysunku"
        value={block.caption ?? ''}
        onChange={e => edit(['blocks', block.uid, 'caption'], e.target.value, 'single', 'Podpis bloku')}
        sx={{ mb: 1 }}
        InputLabelProps={{ sx: { fontSize: 11 } }}
        InputProps={{ sx: { fontSize: 12 } }}
      />

      {groupProps(manifest.props).map(({ group, keys }) => (
        <Accordion key={group} defaultExpanded disableGutters sx={{ bgcolor: 'transparent', boxShadow: 'none', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={{ minHeight: 32, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Typography sx={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
              {group}
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0, px: 1 }}>
            {keys.map(key => {
              const spec: PropSpec = manifest.props[key];
              if (!isVisible(spec.visibleIf, resolved)) return null;
              return (
                <Box key={key}>
                  <ParamField
                    fieldKey={key}
                    spec={spec}
                    value={block.props[key]}
                    resolved={resolved[key]}
                    vars={doc.vars}
                    onEdit={(value, phase) => edit(['blocks', block.uid, 'props', key], value, phase, spec.label)}
                  />
                  {spec.doc && (
                    <Typography sx={{ fontSize: 10, color: 'text.disabled', mt: -0.75, mb: 1 }}>{spec.doc}</Typography>
                  )}
                </Box>
              );
            })}
          </AccordionDetails>
        </Accordion>
      ))}

      {Object.entries(manifest.children ?? {}).map(([collection, spec]) => (
        <Box key={collection} sx={{ mt: 1 }}>
          <Divider sx={{ mb: 1 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
            <Typography sx={{ flex: 1, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'text.secondary' }}>
              {spec.label}
            </Typography>
            <Tooltip title="Dodaj">
              <IconButton size="small" onClick={() => addChild(store, block, collection, spec)}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          <List dense disablePadding>
            {(block.children[collection] ?? []).map(child => (
              <ListItemButton
                key={child.id}
                selected={selection === `${spec.kind}:${child.id}`}
                onClick={() => onSelect(`${spec.kind}:${child.id}`)}
                sx={{ py: 0.25 }}
              >
                <ListItemText
                  primary={String((child.props.label as { value?: unknown })?.value ?? child.id)}
                  secondary={child.id}
                  primaryTypographyProps={{ fontSize: 12 }}
                  secondaryTypographyProps={{ fontSize: 10 }}
                />
                <IconButton
                  size="small"
                  onClick={e => {
                    e.stopPropagation();
                    removeChild(store, block, collection, child.id);
                    if (selection === `${spec.kind}:${child.id}`) onSelect(null);
                  }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </ListItemButton>
            ))}
            {(block.children[collection] ?? []).length === 0 && (
              <Typography sx={{ fontSize: 11, color: 'text.disabled', px: 1 }}>brak</Typography>
            )}
          </List>
        </Box>
      ))}

      {manifest.events && (
        <Box sx={{ mt: 2 }}>
          <Divider sx={{ mb: 1 }} />
          <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>
            Zdarzenia: {Object.keys(manifest.events).join(', ')}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function parseSelection(
  block: BlockNode,
  selection: string | null,
): { collection: string; spec: ChildSpec; childId: string } | null {
  if (!selection) return null;
  const [kind, childId] = selection.split(':');
  const manifest = getManifest(block.type);
  if (!manifest?.children) return null;
  for (const [collection, spec] of Object.entries(manifest.children)) {
    if (spec.kind !== kind) continue;
    if (!(block.children[collection] ?? []).some(c => c.id === childId)) return null;
    return { collection, spec, childId };
  }
  return null;
}

function addChild(store: RysikStore, block: BlockNode, collection: string, spec: ChildSpec): void {
  const list = block.children[collection] ?? [];
  let n = list.length + 1;
  while (list.some(c => c.id === `${spec.kind}-${n}`)) n++;
  store.set(
    ['blocks', block.uid, 'children', collection],
    [...list, createChild(spec, `${spec.kind}-${n}`)],
    `Dodaj: ${spec.label}`,
  );
}

function removeChild(store: RysikStore, block: BlockNode, collection: string, childId: string): void {
  const list = block.children[collection] ?? [];
  store.set(
    ['blocks', block.uid, 'children', collection],
    list.filter(c => c.id !== childId),
    `Usuń: ${childId}`,
  );
}
