/**
 * JsonTree - drzewo (TreeView) struktury JSON. Kliknięcie węzła → onPick(jsonPath).
 * Ścieżka w notacji z kropką (np. "data.items.0"); korzeń = '' (całość).
 */
import React, { useMemo, useState } from 'react';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import { Box, Typography, Chip } from '@mui/material';

export interface JsonTreeProps {
  root: unknown;
  selected: string;             // aktualny jsonPath ('' = całość)
  onPick: (jsonPath: string) => void;
  maxHeight?: number;
}

const ROOT_ID = '$root';

function typeLabel(v: unknown): string {
  if (Array.isArray(v)) return `tablica[${v.length}]`;
  if (v === null) return 'null';
  if (typeof v === 'object') return `obiekt{${Object.keys(v as object).length}}`;
  return typeof v;
}

function scalarPreview(v: unknown): string {
  const s = typeof v === 'string' ? `"${v}"` : String(v);
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
}

const JsonTree: React.FC<JsonTreeProps> = ({ root, selected, onPick, maxHeight = 240 }) => {
  const [expanded, setExpanded] = useState<string[]>([ROOT_ID]);

  const render = (value: unknown, path: string, keyLabel: string): React.ReactNode => {
    const isObj = value !== null && typeof value === 'object';
    const id = path === '' ? ROOT_ID : path;
    return (
      <TreeItem
        key={id}
        itemId={id}
        label={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography variant="body2" sx={{ fontSize: 13, fontWeight: isObj ? 600 : 400 }}>{keyLabel}</Typography>
            <Chip label={isObj ? typeLabel(value) : scalarPreview(value)} size="small" sx={{ height: 18, fontSize: 10 }} variant="outlined" />
          </Box>
        }
      >
        {isObj &&
          Object.entries(value as Record<string, unknown>).slice(0, 300).map(([k, v]) => {
            const childPath = path === '' ? k : `${path}.${k}`;
            const label = Array.isArray(value) ? `[${k}]` : k;
            return render(v, childPath, label);
          })}
      </TreeItem>
    );
  };

  const content = useMemo(() => render(root, '', 'root (całość)'), [root]);

  if (root === null || root === undefined) {
    return <Typography variant="caption" color="text.secondary">Wybierz plik JSON, aby zobaczyć strukturę.</Typography>;
  }

  return (
    <SimpleTreeView
      expandedItems={expanded}
      onExpandedItemsChange={(_e, ids) => setExpanded(ids)}
      selectedItems={selected === '' ? ROOT_ID : (selected || null)}
      onSelectedItemsChange={(_e, id) => onPick(id === ROOT_ID ? '' : (id || ''))}
      sx={{ maxHeight, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1, py: 0.5 }}
    >
      {content}
    </SimpleTreeView>
  );
};

export default JsonTree;
