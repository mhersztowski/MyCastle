/**
 * VfsFileTree - drzewo (TreeView) plików VFS. Kliknięcie pliku → onSelect(path).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import { Box, CircularProgress, Typography } from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { getVfsTree } from './vfsPicker';
import type { DirectoryTree } from '@mhersztowski/core';

export interface VfsFileTreeProps {
  selected: string;
  onSelect: (path: string) => void;
  maxHeight?: number;
}

function collectFilesAndDirs(node: DirectoryTree, files: Set<string>, dirs: string[]): void {
  if (node.type === 'file') files.add(node.path);
  else dirs.push(node.path);
  node.children?.forEach(c => collectFilesAndDirs(c, files, dirs));
}

const VfsFileTree: React.FC<VfsFileTreeProps> = ({ selected, onSelect, maxHeight = 300 }) => {
  const [tree, setTree] = useState<DirectoryTree | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);

  useEffect(() => {
    setLoading(true);
    getVfsTree()
      .then(t => {
        setTree(t);
        // rozwiń katalog główny + katalog wybranego pliku
        const exp: string[] = [t.path];
        if (selected) {
          const parts = selected.split('/');
          for (let i = 1; i < parts.length; i++) exp.push(parts.slice(0, i).join('/'));
        }
        setExpanded(Array.from(new Set(exp)));
      })
      .catch(() => setTree(null))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fileSet = useMemo(() => {
    const files = new Set<string>();
    if (tree) collectFilesAndDirs(tree, files, []);
    return files;
  }, [tree]);

  const renderNode = (node: DirectoryTree): React.ReactNode => {
    const isFile = node.type === 'file';
    return (
      <TreeItem
        key={node.path || 'root'}
        itemId={node.path || '__root__'}
        label={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            {isFile ? <InsertDriveFileIcon sx={{ fontSize: 16, color: 'text.secondary' }} /> : <FolderIcon sx={{ fontSize: 16, color: '#f0b429' }} />}
            <Typography variant="body2" sx={{ fontSize: 13 }}>{node.name || '/'}</Typography>
          </Box>
        }
      >
        {node.children?.map(renderNode)}
      </TreeItem>
    );
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={22} /></Box>;
  }
  if (!tree) {
    return <Typography variant="caption" color="text.secondary" sx={{ p: 1 }}>Nie udało się wczytać drzewa VFS.</Typography>;
  }

  return (
    <SimpleTreeView
      expandedItems={expanded}
      onExpandedItemsChange={(_e, ids) => setExpanded(ids)}
      selectedItems={selected || null}
      onSelectedItemsChange={(_e, id) => { if (id && fileSet.has(id)) onSelect(id); }}
      sx={{ maxHeight, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1, py: 0.5 }}
    >
      {tree.children ? tree.children.map(renderNode) : renderNode(tree)}
    </SimpleTreeView>
  );
};

export default VfsFileTree;
