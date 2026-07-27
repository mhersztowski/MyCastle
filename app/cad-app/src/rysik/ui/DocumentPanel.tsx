/**
 * Struktura dokumentu: akapity i bloki w kolejności, w jakiej trafią do pliku.
 * Zaznaczenie bloku jest stanem hosta — scena tylko renderuje podświetlenie.
 */

import { useState } from 'react';
import {
  Box, IconButton, List, ListItemButton, ListItemText, Menu, MenuItem, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import NotesIcon from '@mui/icons-material/Notes';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { allManifests, getManifest } from '../blocks/registry';
import { createBlock } from '../serialize';
import type { RysikStore } from '../store';
import type { DocSegment } from '../types';

interface Props {
  store: RysikStore;
  selectedUid: string | null;
  onSelectBlock: (uid: string | null) => void;
}

export function DocumentPanel({ store, selectedUid, onSelectBlock }: Props) {
  const doc = store.getDoc();
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);

  const setSegments = (segments: DocSegment[], label: string): void =>
    store.set(['segments'], segments, label);

  const addBlock = (type: string): void => {
    setAddAnchor(null);
    const manifest = getManifest(type);
    if (!manifest) return;
    const block = createBlock(manifest);
    const segments = [...doc.segments];
    // Blok bez otaczających pustych linii skleiłby się z akapitem w pliku.
    segments.push({ kind: 'markdown', text: '' }, { kind: 'block', block });
    setSegments(segments, `Dodaj blok: ${manifest.title}`);
    onSelectBlock(block.uid);
  };

  const addParagraph = (): void => {
    setSegments(
      [...doc.segments, { kind: 'markdown', text: '\nNowy akapit.\n' }],
      'Dodaj akapit',
    );
  };

  const move = (index: number, delta: number): void => {
    const target = index + delta;
    if (target < 0 || target >= doc.segments.length) return;
    const segments = [...doc.segments];
    [segments[index], segments[target]] = [segments[target], segments[index]];
    setSegments(segments, 'Przenieś fragment');
  };

  const remove = (index: number): void => {
    const seg = doc.segments[index];
    if (seg.kind === 'block' && seg.block.uid === selectedUid) onSelectBlock(null);
    setSegments(doc.segments.filter((_, i) => i !== index), 'Usuń fragment');
  };

  return (
    <Box sx={{ p: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
        <Typography sx={{ flex: 1, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'text.secondary' }}>
          Dokument
        </Typography>
        <Tooltip title="Dodaj akapit">
          <IconButton size="small" onClick={addParagraph}><NotesIcon sx={{ fontSize: 16 }} /></IconButton>
        </Tooltip>
        <Tooltip title="Dodaj blok">
          <IconButton size="small" onClick={e => setAddAnchor(e.currentTarget)}><AddIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Box>

      <Menu anchorEl={addAnchor} open={Boolean(addAnchor)} onClose={() => setAddAnchor(null)}>
        {allManifests().map(m => (
          <MenuItem key={m.type} onClick={() => addBlock(m.type)} dense>
            <ListItemText
              primary={m.title}
              secondary={m.type}
              primaryTypographyProps={{ fontSize: 12 }}
              secondaryTypographyProps={{ fontSize: 10 }}
            />
          </MenuItem>
        ))}
      </Menu>

      <List dense disablePadding>
        {doc.segments.map((seg, index) => (
          <ListItemButton
            key={seg.kind === 'block' ? seg.block.uid : `${seg.kind}-${index}`}
            selected={seg.kind === 'block' && seg.block.uid === selectedUid}
            onClick={() => seg.kind === 'block' && onSelectBlock(seg.block.uid)}
            sx={{ py: 0.25, pr: 0.5 }}
          >
            <ListItemText
              primary={segmentTitle(seg)}
              secondary={segmentSubtitle(seg)}
              primaryTypographyProps={{ fontSize: 12, noWrap: true }}
              secondaryTypographyProps={{ fontSize: 10, noWrap: true }}
            />
            <IconButton size="small" onClick={e => { e.stopPropagation(); move(index, -1); }}>
              <ArrowUpwardIcon sx={{ fontSize: 14 }} />
            </IconButton>
            <IconButton size="small" onClick={e => { e.stopPropagation(); move(index, 1); }}>
              <ArrowDownwardIcon sx={{ fontSize: 14 }} />
            </IconButton>
            <IconButton size="small" onClick={e => { e.stopPropagation(); remove(index); }}>
              <DeleteOutlineIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </ListItemButton>
        ))}
        {doc.segments.length === 0 && (
          <Typography sx={{ fontSize: 11, color: 'text.disabled', px: 1 }}>
            Pusty dokument — dodaj blok lub akapit.
          </Typography>
        )}
      </List>
    </Box>
  );
}

function segmentTitle(seg: DocSegment): string {
  if (seg.kind === 'vars') return 'Zmienne dokumentu';
  if (seg.kind === 'markdown') {
    const line = seg.text.split('\n').map(l => l.trim()).find(l => l !== '');
    return line ? line.slice(0, 40) : '(pusty akapit)';
  }
  const manifest = getManifest(seg.block.type);
  return seg.block.label ? `${manifest?.title ?? seg.block.type} · @${seg.block.label}` : (manifest?.title ?? seg.block.type);
}

function segmentSubtitle(seg: DocSegment): string {
  if (seg.kind === 'block') return seg.block.type;
  if (seg.kind === 'vars') return 'rysik-vars';
  return 'markdown';
}
