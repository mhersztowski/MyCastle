import { useState, useCallback, useRef } from 'react';
import type { SyntheticEvent } from 'react';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import { normalize, dirname, encodeText } from '@mhersztowski/core';
import type { CompositeFS } from '@mhersztowski/core';

import { useVfsTree } from './useVfsTree';
import { useVfsClipboard } from './clipboard';
import { VfsBreadcrumbs } from './VfsBreadcrumbs';
import { VfsMountManager } from './VfsMountManager';
import { getFileIcon } from './icons';
import type { VfsExplorerProps, VfsTreeNode } from './types';
import './vfs-explorer.css';

/* ── Expand / Collapse chevrons ── */

function ChevronRightIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── VS Code-like tree styling ── */

const treeViewSx = {
  flexGrow: 1,
  overflowY: 'auto',
  py: 0.25,
  /* MUI X v8 uses data-* attributes for state, not .Mui-* classes */
  '& .MuiTreeItem-content': {
    borderRadius: 0,
    minHeight: '22px',
    py: 0,
    pl: '4px',
    pr: '8px',
    gap: '0px',
    cursor: 'pointer',
    /* Hover — subtle gray */
    '&:hover:not([data-selected])': {
      bgcolor: 'rgba(255, 255, 255, 0.04)',
    },
    /* Selected — VS Code blue */
    '&[data-selected]': {
      bgcolor: '#094771 !important',
      color: '#ffffff',
    },
    '&[data-selected]:hover': {
      bgcolor: '#094771 !important',
    },
    '&[data-selected][data-focused]': {
      bgcolor: '#094771 !important',
    },
    /* Drop target highlight */
    '&[data-drop-target]': {
      bgcolor: 'rgba(255, 255, 255, 0.08)',
      outline: '1px solid #0078d4',
      outlineOffset: '-1px',
    },
  },
  '& .MuiTreeItem-label': {
    fontSize: '13px !important',
    lineHeight: '22px',
    pl: '0 !important',
  },
  '& .MuiTreeItem-iconContainer': {
    width: '16px',
    minWidth: '16px !important',
    mr: '2px',
    color: '#cccccc',
  },
  '& .MuiTreeItem-groupTransition, & .MuiCollapse-root': {
    ml: 0,
    pl: '8px',
  },
} as const;

/* ── Context menu styling ── */

const menuSlotProps = {
  paper: {
    sx: {
      bgcolor: '#3c3c3c',
      color: '#cccccc',
      border: '1px solid #545454',
      borderRadius: '5px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.36)',
      minWidth: 180,
      py: 0.5,
      '& .MuiMenuItem-root': {
        fontSize: '13px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        minHeight: 26,
        py: 0.25,
        px: 1.5,
        '&:hover': {
          bgcolor: '#094771',
          color: '#ffffff',
        },
      },
      '& .MuiDivider-root': {
        borderColor: '#545454',
        my: 0.5,
      },
    },
  },
} as const;

/* ── Context menu state ── */

interface ContextMenuState {
  mouseX: number;
  mouseY: number;
  nodeId: string | null;
  isDirectory: boolean;
}

/* ── Helpers ── */

function findNode(nodes: VfsTreeNode[], id: string): VfsTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

function isDescendantOf(childPath: string, parentPath: string): boolean {
  return childPath === parentPath || childPath.startsWith(parentPath + '/');
}

/* ── Component ── */

export function VfsExplorer({
  provider,
  rootPath = '/',
  width,
  height,
  onFileSelect,
  onFileOpen,
  readOnly: readOnlyProp,
  showBreadcrumbs = true,
  className,
  providerRegistry,
}: VfsExplorerProps) {
  const clipboard = useVfsClipboard();
  const readOnly = readOnlyProp ?? provider.capabilities.readonly;
  const rp = normalize(rootPath);

  const tree = useVfsTree(provider, rp);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState(rp);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  /* ── Drag & drop ── */

  const dragNodeRef = useRef<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  /* ── Mount manager ── */

  const showMountManager = !readOnly && !!providerRegistry && providerRegistry.length > 0 && provider.scheme === 'composite';

  const handleMountsChanged = useCallback(() => {
    tree.refresh();
  }, [tree]);

  /* ── Selection ── */

  const handleSelectedItemsChange = useCallback(
    (_event: SyntheticEvent | null, itemIds: string[]) => {
      setSelectedItems(itemIds);
      if (itemIds.length > 0) {
        onFileSelect?.(itemIds[0]);
        const node = findNode(tree.items, itemIds[0]);
        if (node) {
          setCurrentPath(node.isDirectory ? node.id : dirname(node.id));
        }
      }
    },
    [onFileSelect, tree.items],
  );

  const handleExpandedItemsChange = useCallback(
    (_event: SyntheticEvent | null, itemIds: string[]) => {
      tree.setExpandedItems(itemIds);
    },
    [tree],
  );

  /* ── Context menu ── */

  const openContextMenu = useCallback(
    (event: React.MouseEvent, node: VfsTreeNode | null) => {
      event.preventDefault();
      event.stopPropagation();
      if (node) setSelectedItems([node.id]);
      setContextMenu({
        mouseX: event.clientX + 2,
        mouseY: event.clientY - 6,
        nodeId: node?.id ?? null,
        isDirectory: node?.isDirectory ?? true,
      });
    },
    [],
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleContainerContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.MuiTreeItem-root')) return;
      openContextMenu(e, null);
    },
    [openContextMenu],
  );

  /* ── Context menu actions ── */

  const getParentDir = useCallback(() => {
    if (!contextMenu) return currentPath;
    if (!contextMenu.nodeId) return currentPath;
    return contextMenu.isDirectory ? contextMenu.nodeId : dirname(contextMenu.nodeId);
  }, [contextMenu, currentPath]);

  const handleNewFile = useCallback(async () => {
    closeContextMenu();
    if (!provider.writeFile) return;
    const name = prompt('File name:');
    if (!name) return;
    const path = normalize(getParentDir() + '/' + name);
    await provider.writeFile(path, encodeText(''), { overwrite: false });
    tree.refresh();
  }, [getParentDir, provider, tree, closeContextMenu]);

  const handleNewFolder = useCallback(async () => {
    closeContextMenu();
    if (!provider.mkdir) return;
    const name = prompt('Folder name:');
    if (!name) return;
    const path = normalize(getParentDir() + '/' + name);
    await provider.mkdir(path);
    tree.refresh();
  }, [getParentDir, provider, tree, closeContextMenu]);

  const handleOpen = useCallback(() => {
    if (contextMenu?.nodeId) onFileOpen?.(contextMenu.nodeId);
    closeContextMenu();
  }, [contextMenu, onFileOpen, closeContextMenu]);

  const handleRenamePrompt = useCallback(() => {
    const nodeId = contextMenu?.nodeId;
    closeContextMenu();
    if (!nodeId || !provider.rename) return;
    const oldName = nodeId.split('/').pop() ?? '';
    const newName = prompt('Rename:', oldName);
    if (newName && newName !== oldName) {
      const parentDir = dirname(nodeId);
      const newPath = normalize(parentDir + '/' + newName);
      provider.rename(nodeId, newPath, { overwrite: false }).then(() => tree.refresh());
    }
  }, [contextMenu, provider, tree, closeContextMenu]);

  const handleCopy = useCallback(() => {
    if (contextMenu?.nodeId) clipboard.copy([contextMenu.nodeId]);
    closeContextMenu();
  }, [contextMenu, clipboard, closeContextMenu]);

  const handleCut = useCallback(() => {
    if (contextMenu?.nodeId) clipboard.cut([contextMenu.nodeId]);
    closeContextMenu();
  }, [contextMenu, clipboard, closeContextMenu]);

  const handlePaste = useCallback(async () => {
    closeContextMenu();
    await clipboard.paste(getParentDir(), provider);
    tree.refresh();
  }, [getParentDir, clipboard, provider, tree, closeContextMenu]);

  const handleDelete = useCallback(async () => {
    const nodeId = contextMenu?.nodeId;
    closeContextMenu();
    if (!provider.delete || !nodeId) return;
    await provider.delete(nodeId, { recursive: true });
    tree.refresh();
  }, [contextMenu, provider, tree, closeContextMenu]);

  /* ── Breadcrumb navigation ── */

  const handleBreadcrumbNavigate = useCallback(
    (path: string) => {
      setCurrentPath(path);
      const parts = path.split('/').filter(Boolean);
      const pathsToExpand: string[] = [];
      let current = '';
      for (const part of parts) {
        current = current ? current + '/' + part : '/' + part;
        pathsToExpand.push(current);
      }
      tree.setExpandedItems(prev => {
        const set = new Set([...prev, ...pathsToExpand]);
        return [...set];
      });
    },
    [tree],
  );

  /* ── Recursive tree rendering ── */

  const renderTree = useCallback(
    (nodes: VfsTreeNode[]) =>
      nodes.map(node => {
        // Directories with empty children array need a placeholder so they're expandable
        const hasLoadedChildren = node.children && node.children.length > 0;
        const isUnloadedDir = node.isDirectory && node.children && node.children.length === 0;
        const isDropTarget = dropTargetId === node.id;

        return (
          <TreeItem
            key={node.id}
            itemId={node.id}
            label={
              <span className="vfs-item-title">
                <span className="vfs-item-icon">
                  {getFileIcon(node.label, node.isDirectory, tree.expandedItems.includes(node.id))}
                </span>
                <span className="vfs-item-name">{node.label}</span>
              </span>
            }
            slotProps={{
              content: {
                draggable: !readOnly && !!provider.rename,
                onDragStart: (e: React.DragEvent) => {
                  dragNodeRef.current = node.id;
                  e.dataTransfer.effectAllowed = 'move';
                },
                onDragOver: (e: React.DragEvent) => {
                  if (!dragNodeRef.current || readOnly) return;
                  const dragId = dragNodeRef.current;
                  // Only directories are valid drop targets; can't drop on self or own subtree
                  if (!node.isDirectory || isDescendantOf(node.id, dragId)) return;
                  // Can't drop into same parent (no-op move)
                  if (dirname(dragId) === node.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDropTargetId(node.id);
                },
                onDragLeave: () => {
                  setDropTargetId(prev => (prev === node.id ? null : prev));
                },
                onDrop: (e: React.DragEvent) => {
                  e.preventDefault();
                  setDropTargetId(null);
                  const dragId = dragNodeRef.current;
                  dragNodeRef.current = null;
                  if (!dragId || !provider.rename || readOnly) return;
                  if (!node.isDirectory || isDescendantOf(node.id, dragId)) return;
                  const name = dragId.split('/').pop() ?? '';
                  const newPath = normalize(node.id + '/' + name);
                  if (dragId !== newPath) {
                    provider.rename(dragId, newPath, { overwrite: false }).then(() => tree.refresh());
                  }
                },
                onDragEnd: () => {
                  dragNodeRef.current = null;
                  setDropTargetId(null);
                },
                onContextMenu: (e: React.MouseEvent) => {
                  openContextMenu(e, node);
                },
                onDoubleClick: () => {
                  if (!node.isDirectory) onFileOpen?.(node.id);
                },
                ...(isDropTarget ? { 'data-drop-target': '' } : {}),
              } as Record<string, unknown>,
            }}
          >
            {hasLoadedChildren && renderTree(node.children!)}
            {isUnloadedDir && (
              <TreeItem
                itemId={`${node.id}/__placeholder__`}
                label=""
                disabled
                sx={{ display: 'none' }}
              />
            )}
          </TreeItem>
        );
      }),
    [tree.expandedItems, tree, openContextMenu, onFileOpen, readOnly, provider, dropTargetId],
  );

  /* ── Render ── */

  return (
    <div
      className={`vfs-explorer${className ? ` ${className}` : ''}`}
      style={{
        width: width ?? '100%',
        height: height ?? '100%',
      }}
    >
      {showBreadcrumbs && (
        <VfsBreadcrumbs path={currentPath} onNavigate={handleBreadcrumbNavigate} />
      )}
      {showMountManager && (
        <VfsMountManager
          compositeFs={provider as CompositeFS}
          providerRegistry={providerRegistry!}
          onMountsChanged={handleMountsChanged}
        />
      )}
      <div className="vfs-tree-container" onContextMenu={handleContainerContextMenu}>
        <SimpleTreeView
          expandedItems={tree.expandedItems}
          onExpandedItemsChange={handleExpandedItemsChange}
          onItemExpansionToggle={tree.handleItemExpansionToggle}
          selectedItems={selectedItems}
          onSelectedItemsChange={handleSelectedItemsChange}
          multiSelect
          slots={{
            expandIcon: ChevronRightIcon,
            collapseIcon: ChevronDownIcon,
          }}
          itemChildrenIndentation="8px"
          sx={treeViewSx}
        >
          {renderTree(tree.items)}
        </SimpleTreeView>
      </div>

      {/* ── Context Menu ── */}
      <Menu
        open={contextMenu !== null}
        onClose={closeContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined
        }
        slotProps={menuSlotProps}
      >
        {contextMenu?.nodeId && !contextMenu.isDirectory && (
          <MenuItem onClick={handleOpen}>
            <ListItemText>Open</ListItemText>
          </MenuItem>
        )}
        {!readOnly && (
          <MenuItem onClick={handleNewFile}>
            <ListItemText>New File...</ListItemText>
          </MenuItem>
        )}
        {!readOnly && (
          <MenuItem onClick={handleNewFolder}>
            <ListItemText>New Folder...</ListItemText>
          </MenuItem>
        )}
        {!readOnly && contextMenu?.nodeId && <Divider />}
        {!readOnly && contextMenu?.nodeId && (
          <MenuItem onClick={handleRenamePrompt}>
            <ListItemText>Rename</ListItemText>
          </MenuItem>
        )}
        {!readOnly && contextMenu?.nodeId && (
          <MenuItem onClick={handleCopy}>
            <ListItemText>Copy</ListItemText>
          </MenuItem>
        )}
        {!readOnly && contextMenu?.nodeId && (
          <MenuItem onClick={handleCut}>
            <ListItemText>Cut</ListItemText>
          </MenuItem>
        )}
        {!readOnly && clipboard.canPaste && (contextMenu?.isDirectory ?? true) && (
          <MenuItem onClick={handlePaste}>
            <ListItemText>Paste</ListItemText>
          </MenuItem>
        )}
        {!readOnly && contextMenu?.nodeId && <Divider />}
        {!readOnly && contextMenu?.nodeId && (
          <MenuItem onClick={handleDelete}>
            <ListItemText>Delete</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </div>
  );
}
