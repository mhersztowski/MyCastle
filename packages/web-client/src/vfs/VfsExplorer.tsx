import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { SyntheticEvent } from 'react';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import { normalize, dirname, encodeText, decodeText, WritableGitHubFS } from '@mhersztowski/core';
import type { CompositeFS } from '@mhersztowski/core';

import { useVfsTree } from './useVfsTree';
import { useVfsClipboard } from './clipboard';
import { VfsBreadcrumbs } from './VfsBreadcrumbs';
import { VfsMountManager } from './VfsMountManager';
import { VfsCommitDialog } from './VfsCommitDialog';
import { getFileIcon } from './icons';
import type { VfsExplorerProps, VfsProjectContext, VfsTreeNode } from './types';
import { platformToLanguage } from './types';
import { ProjectPanel, Spinner } from './ProjectPanel';
import type { ProjectPanelHandle } from './ProjectPanel';
import type { OutputLine } from './project/types';
import { classifyLine } from './project/types';
import { createProject } from './project/createProject';
import type { Project } from './project/Project';
import './vfs-explorer.css';

/* ── Toolbar action icons ── */

function IconCompile() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4l5 4-5 4" /><path d="M9 12h5" />
    </svg>
  );
}

function IconFlash() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
      <path d="M9 1L3 9h5l-1 6 7-8H9L9 1z" />
    </svg>
  );
}

function IconRun() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 2l10 6-10 6V2z" />
    </svg>
  );
}

/** Pick toolbar icon by action id */
function ActionIcon({ actionId }: { actionId: string }) {
  if (actionId === 'compile' || actionId === 'build' || actionId === 'build-web') return <IconCompile />;
  if (actionId === 'flash' || actionId === 'compile-flash') return <IconFlash />;
  return <IconRun />;
}

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
  color: '#cccccc',
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

/* ── Project context traversal ── */

/**
 * Walks up the path segment-by-segment and returns the parsed project.json
 * from the nearest ancestor directory that contains one. Returns null if none found.
 */
async function findProjectContext(
  path: string,
  provider: { readFile: (path: string) => Promise<Uint8Array> },
  cache: Map<string, VfsProjectContext | null>,
): Promise<VfsProjectContext | null> {
  // Build ancestor list starting from path itself down to root.
  // Starting at i=segments.length means we try "{path}/project.json" first —
  // that's a no-op for files (will throw, caught below) but correctly finds
  // project.json when path IS the project directory.
  const segments = path.split('/').filter(Boolean);
  const ancestors: string[] = [];
  for (let i = segments.length; i >= 0; i--) {
    ancestors.push(i === 0 ? '/' : '/' + segments.slice(0, i).join('/'));
  }
  // Deduplicate (handles trailing slash edge cases)
  const unique = [...new Set(ancestors)];

  for (const dir of unique) {
    const key = dir + '/project.json';
    if (cache.has(key)) {
      const cached = cache.get(key)!;
      if (cached !== null) return cached;
      continue; // null means "not found here", skip
    }
    try {
      const data = await provider.readFile(normalize(dir + '/project.json'));
      const json = JSON.parse(decodeText(data)) as Partial<VfsProjectContext>;
      if (json.id && json.name && json.platform) {
        const ctx: VfsProjectContext = {
          id: json.id,
          name: json.name,
          platform: json.platform,
          language: platformToLanguage(json.platform),
          boardProfileKey: json.boardProfileKey,
          projectJsonPath: normalize(dir + '/project.json'),
        };
        cache.set(key, ctx);
        return ctx;
      }
      cache.set(key, null);
    } catch {
      cache.set(key, null);
    }
  }
  return null;
}

/* ── Component ── */

export function VfsExplorer({
  provider,
  rootPath = '/',
  width,
  height,
  onFileSelect,
  onFileOpen,
  onDirectoryChange,
  onProjectContext,
  projectDeps,
  onExecuteAction,
  onOutputLine,
  onActionRunningChange,
  hideOutput = false,
  readOnly: readOnlyProp,
  showBreadcrumbs = true,
  className,
  providerRegistry,
  onMountsChanged: onMountsChangedProp,
  selectedPath: externalSelectedPath,
}: VfsExplorerProps) {
  const clipboard = useVfsClipboard();
  const readOnly = readOnlyProp ?? provider.capabilities.readonly;
  const rp = normalize(rootPath);

  const tree = useVfsTree(provider, rp);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState(rp);

  useEffect(() => {
    onDirectoryChange?.(currentPath);
  }, [currentPath, onDirectoryChange]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /* ── Project context cache (keyed by "dir/project.json") ── */

  const projectCacheRef = useRef<Map<string, VfsProjectContext | null>>(new Map());
  const [activeProject, setActiveProject] = useState<VfsProjectContext | null>(null);

  // Invalidate cache when provider changes (e.g. new mount)
  useEffect(() => {
    projectCacheRef.current.clear();
    setActiveProject(null);
  }, [provider]);

  // Propagate to external consumer whenever activeProject changes
  useEffect(() => {
    onProjectContext?.(activeProject);
  }, [activeProject, onProjectContext]);

  // Sync tree selection when externalSelectedPath changes (e.g. active editor tab)
  useEffect(() => {
    if (!externalSelectedPath) return;
    setSelectedItems([externalSelectedPath]);

    // Expand all ancestor directories so the item is visible
    const segments = externalSelectedPath.split('/').filter(Boolean);
    const toExpand: string[] = [];
    for (let i = 1; i <= segments.length - 1; i++) {
      toExpand.push('/' + segments.slice(0, i).join('/'));
    }
    if (toExpand.length > 0) {
      tree.setExpandedItems(prev => {
        const set = new Set([...prev, ...toExpand]);
        return [...set];
      });
    }

    // Update breadcrumb path
    const node = findNode(tree.items, externalSelectedPath);
    const dir = node ? (node.isDirectory ? node.id : dirname(externalSelectedPath)) : dirname(externalSelectedPath);
    setCurrentPath(dir);

    // Detect project context
    findProjectContext(externalSelectedPath, provider, projectCacheRef.current)
      .then(ctx => setActiveProject(ctx))
      .catch(() => setActiveProject(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSelectedPath, provider]);

  /* ── Project instance (with execute() wired to deps) ── */

  const activeProjectInstance = useMemo<Project | null>(
    () => activeProject ? createProject(activeProject, projectDeps) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProject, projectDeps],
  );

  /* ── Action execution state ── */

  const [outputLines, setOutputLines] = useState<OutputLine[]>([]);
  const [actionRunning, setActionRunning] = useState(false);
  const [lastStatus, setLastStatus] = useState<'success' | 'error' | null>(null);
  const [outputOpen, setOutputOpen] = useState(false);
  const actionAbortRef = useRef<AbortController | null>(null);
  const outputEndRef = useRef<HTMLDivElement | null>(null);
  const projectPanelRef = useRef<ProjectPanelHandle | null>(null);

  // Auto-scroll output
  useEffect(() => {
    if (outputOpen) outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [outputLines, outputOpen]);

  // Reset when project changes
  useEffect(() => {
    setOutputLines([]);
    setLastStatus(null);
    setOutputOpen(false);
    actionAbortRef.current?.abort();
    setActionRunning(false);
  }, [activeProject?.id]);

  const appendLine = useCallback((text: string) => {
    const line = { text, timestamp: Date.now(), type: classifyLine(text) };
    setOutputLines(prev => [...prev, line]);
    onOutputLine?.(line);
  }, [onOutputLine]);

  const handleRunAction = useCallback(async (actionId: string, hasOutput: boolean) => {
    const ctx = activeProject;
    if (!ctx) return;

    actionAbortRef.current?.abort();
    const ctrl = new AbortController();
    actionAbortRef.current = ctrl;

    if (hasOutput) {
      setOutputLines([]);
      setLastStatus(null);
      setOutputOpen(true);
    }
    const actionLabel = activeProjectInstance?.getActions().find(a => a.id === actionId)?.label;
    setActionRunning(true);
    onActionRunningChange?.(true, actionLabel);

    try {
      let result: { success: boolean; error?: string };

      if (onExecuteAction) {
        // External override takes priority
        result = await onExecuteAction(actionId, ctx, selectedItems[0] ?? null, appendLine, ctrl.signal);
      } else if (activeProjectInstance) {
        // Built-in execute() from Project class
        result = await activeProjectInstance.execute(actionId, selectedItems[0] ?? null, appendLine, ctrl.signal);
      } else {
        appendLine('Error: no executor configured (provide projectDeps or onExecuteAction)');
        result = { success: false };
      }

      if (!ctrl.signal.aborted) {
        setLastStatus(result.success ? 'success' : 'error');
        if (result.error) appendLine(`Error: ${result.error}`);
        if (hasOutput) appendLine(result.success ? '✓ Done' : '✗ Failed');
      }
    } catch (err) {
      if (!ctrl.signal.aborted) {
        setLastStatus('error');
        appendLine(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      if (!actionAbortRef.current?.signal.aborted) {
        setActionRunning(false);
        onActionRunningChange?.(false);
      }
    }
  }, [activeProject, activeProjectInstance, onExecuteAction, onActionRunningChange, selectedItems, appendLine]);

  const handleStopAction = useCallback(() => {
    actionAbortRef.current?.abort();
    setActionRunning(false);
    appendLine('— Aborted —');
  }, [appendLine]);

  /* ── Drag & drop ── */

  const dragNodeRef = useRef<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  /* ── Mount manager ── */

  const showMountManager = !readOnly && !!providerRegistry && providerRegistry.length > 0 && provider.scheme === 'composite';

  /* ── Writable GitHub commit bar ── */

  const [mountVersion, setMountVersion] = useState(0);

  const writableGitHub = useMemo(() => {
    if (provider instanceof WritableGitHubFS) return provider;
    if (provider.scheme === 'composite') {
      const mounts = (provider as CompositeFS).getMounts();
      for (const m of mounts) {
        if (m.provider instanceof WritableGitHubFS) return m.provider as WritableGitHubFS;
      }
    }
    return null;
  }, [provider, mountVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const [pendingCount, setPendingCount] = useState(0);
  const [showCommitDialog, setShowCommitDialog] = useState(false);

  useEffect(() => {
    if (!writableGitHub) return;
    setPendingCount(writableGitHub.pendingCount());
    const disposable = writableGitHub.onDidChangeFile(() => {
      setPendingCount(writableGitHub.pendingCount());
    });
    return () => disposable.dispose();
  }, [writableGitHub]);

  const handleCommit = useCallback(async (message: string) => {
    if (!writableGitHub) return;
    await writableGitHub.commit(message);
    setPendingCount(0);
    tree.refresh();
  }, [writableGitHub, tree]);

  const handleDiscard = useCallback(() => {
    if (!writableGitHub) return;
    writableGitHub.discardPending();
    setPendingCount(0);
    tree.refresh();
  }, [writableGitHub, tree]);

  const handleMountsChanged = useCallback(() => {
    tree.refresh();
    setMountVersion(v => v + 1);
    onMountsChangedProp?.();
  }, [tree, onMountsChangedProp]);

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
        findProjectContext(itemIds[0], provider, projectCacheRef.current)
          .then(ctx => setActiveProject(ctx))
          .catch(() => setActiveProject(null));
      } else {
        setActiveProject(null);
      }
    },
    [onFileSelect, provider, tree.items],
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

  /* ── Long-press (mobile context menu) ── */

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchMovedRef = useRef(false);
  // Blocks the synthetic click that browsers fire after a long-press touchend
  const longPressOccurredRef = useRef(false);
  // Detected once on first touch — disables onContextMenu (which fires on single tap on touch devices)
  const isTouchDeviceRef = useRef(false);

  const startLongPress = useCallback((e: React.TouchEvent, node: VfsTreeNode | null) => {
    isTouchDeviceRef.current = true;
    touchMovedRef.current = false;
    longPressOccurredRef.current = false;
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;
    longPressTimerRef.current = setTimeout(() => {
      if (!touchMovedRef.current) {
        longPressOccurredRef.current = true;
        openContextMenu(
          { clientX: x, clientY: y, preventDefault: () => {}, stopPropagation: () => {} } as unknown as React.MouseEvent,
          node,
        );
      }
    }, 500);
  }, [openContextMenu]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const onTouchMove = useCallback(() => {
    touchMovedRef.current = true;
    cancelLongPress();
  }, [cancelLongPress]);

  // Swallows the synthetic click generated after a long-press touchend
  const blockPostLongPressClick = useCallback((e: React.MouseEvent) => {
    if (longPressOccurredRef.current) {
      longPressOccurredRef.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  const handleContainerContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (isTouchDeviceRef.current) { e.preventDefault(); return; }
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

  const handleCopyPath = useCallback(() => {
    if (contextMenu?.nodeId) navigator.clipboard.writeText(contextMenu.nodeId).catch(() => {});
    closeContextMenu();
  }, [contextMenu, closeContextMenu]);

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

  const handleDeleteRequest = useCallback(() => {
    const nodeId = contextMenu?.nodeId;
    closeContextMenu();
    if (!nodeId) return;
    setDeleteTarget(nodeId);
  }, [contextMenu, closeContextMenu]);

  const handleDeleteConfirm = useCallback(async () => {
    const nodeId = deleteTarget;
    setDeleteTarget(null);
    if (!provider.delete || !nodeId) return;
    try {
      await provider.delete(nodeId, { recursive: true });
      await tree.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    }
  }, [deleteTarget, provider, tree]);

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
                  if (isTouchDeviceRef.current) { e.preventDefault(); return; }
                  openContextMenu(e, node);
                },
                onTouchStart: (e: React.TouchEvent) => startLongPress(e, node),
                onTouchEnd: cancelLongPress,
                onTouchMove: onTouchMove,
                onClickCapture: blockPostLongPressClick,
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
    [tree.expandedItems, tree, openContextMenu, onFileOpen, readOnly, provider, dropTargetId, startLongPress, cancelLongPress, onTouchMove, blockPostLongPressClick],
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
      {writableGitHub && pendingCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 8px',
          background: '#1e3a1e', borderBottom: '1px solid #2d5a2d',
          fontSize: 12, color: '#89d185',
        }}>
          <span style={{ flex: 1 }}>{pendingCount} pending change{pendingCount !== 1 ? 's' : ''}</span>
          <button
            onClick={() => setShowCommitDialog(true)}
            style={{
              padding: '2px 8px', fontSize: 11, cursor: 'pointer',
              background: '#2d7a2d', color: '#fff', border: 'none', borderRadius: 3,
            }}
          >
            Commit…
          </button>
          <button
            onClick={handleDiscard}
            style={{
              padding: '2px 6px', fontSize: 11, cursor: 'pointer',
              background: 'transparent', color: '#89d185', border: '1px solid #2d5a2d', borderRadius: 3,
            }}
          >
            Discard
          </button>
        </div>
      )}
      {showCommitDialog && writableGitHub && (
        <VfsCommitDialog
          provider={writableGitHub}
          onClose={() => setShowCommitDialog(false)}
          onCommit={handleCommit}
        />
      )}
      {/* ── Project action toolbar ── */}
      {activeProjectInstance && activeProjectInstance.getActions().length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2,
          padding: '3px 6px',
          background: '#252526', borderBottom: '1px solid #3c3c3c',
          flexShrink: 0,
        }}>
          {activeProjectInstance.getActions().map(action => (
            <button
              key={action.id}
              title={action.description ?? action.label}
              disabled={actionRunning}
              onClick={() => handleRunAction(action.id, action.hasOutput)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 6px', fontSize: 11, cursor: actionRunning ? 'not-allowed' : 'pointer',
                background: 'none', border: '1px solid transparent', borderRadius: 3,
                color: actionRunning ? '#555' : '#ccc',
                opacity: actionRunning ? 0.5 : 1,
              }}
              onMouseEnter={e => { if (!actionRunning) (e.currentTarget as HTMLButtonElement).style.borderColor = '#555'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; }}
            >
              <ActionIcon actionId={action.id} />
              {action.label}
            </button>
          ))}
          {actionRunning && (
            <span style={{ marginLeft: 'auto', color: '#888', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <Spinner />
              Running…
            </span>
          )}
        </div>
      )}

      <div
        className="vfs-tree-container"
        onContextMenu={handleContainerContextMenu}
        onTouchStart={e => startLongPress(e, null)}
        onTouchEnd={cancelLongPress}
        onTouchMove={onTouchMove}
        onClickCapture={blockPostLongPressClick}
      >
        {tree.loading && (
          <LinearProgress
            sx={{ height: 2, position: 'sticky', top: 0, zIndex: 1, bgcolor: 'transparent' }}
          />
        )}
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
          itemChildrenIndentation={0}
          sx={treeViewSx}
        >
          {renderTree(tree.items)}
        </SimpleTreeView>
      </div>

      {/* ── Project panel ── */}
      <ProjectPanel
        ref={projectPanelRef}
        context={activeProject}
        outputLines={outputLines}
        running={actionRunning}
        lastStatus={lastStatus}
        outputOpen={!hideOutput && outputOpen}
        onToggleOutput={() => setOutputOpen(o => !o)}
        onClearOutput={() => { setOutputLines([]); setOutputOpen(false); }}
        onStop={handleStopAction}
        outputEndRef={outputEndRef}
      />

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
        {contextMenu?.nodeId && (
          <MenuItem onClick={handleCopyPath}>
            <ListItemText>Copy Path</ListItemText>
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
          <MenuItem onClick={handleDeleteRequest}>
            <ListItemText>Delete</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#252526', border: '1px solid #3c3c3c', borderRadius: 4,
            padding: '20px 24px', minWidth: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <div style={{ color: '#cccccc', marginBottom: 8, fontWeight: 600 }}>Delete</div>
            <div style={{ color: '#999', fontSize: 13, marginBottom: 20, wordBreak: 'break-all' }}>
              Are you sure you want to delete<br />
              <span style={{ color: '#cccccc' }}>{deleteTarget}</span>?
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{
                  background: 'transparent', border: '1px solid #555', color: '#ccc',
                  borderRadius: 3, padding: '5px 14px', cursor: 'pointer', fontSize: 13,
                }}
              >Cancel</button>
              <button
                onClick={handleDeleteConfirm}
                style={{
                  background: '#c5231c', border: 'none', color: '#fff',
                  borderRadius: 3, padding: '5px 14px', cursor: 'pointer', fontSize: 13,
                }}
              >Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Error toast */}
      {deleteError && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: '#c5231c', color: '#fff',
          borderRadius: 4, padding: '10px 20px', fontSize: 13,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)', maxWidth: 480,
        }}>
          Delete failed: {deleteError}
          <button
            onClick={() => setDeleteError(null)}
            style={{
              marginLeft: 12, background: 'transparent', border: 'none',
              color: '#fff', cursor: 'pointer', fontSize: 16, lineHeight: 1,
            }}
          >×</button>
        </div>
      )}
    </div>
  );
}
