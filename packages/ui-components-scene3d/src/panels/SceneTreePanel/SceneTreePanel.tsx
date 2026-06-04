import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { SceneTreePanelProps, SceneTreeNodeData } from '@mhersztowski/ui-core';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import IconButton from '@mui/material/IconButton';
import Collapse from '@mui/material/Collapse';
import Typography from '@mui/material/Typography';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import Tooltip from '@mui/material/Tooltip';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import FileCopyIcon from '@mui/icons-material/FileCopy';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import AddIcon from '@mui/icons-material/Add';
import CodeIcon from '@mui/icons-material/Code';
import CategoryIcon from '@mui/icons-material/Category';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import {
  CubeIcon,
  SphereIcon,
  CylinderIcon,
  ConeIcon,
  PlaneIcon,
  TorusIcon,
  PointLightIcon,
  DirectionalLightIcon,
  AmbientLightIcon,
  CameraIcon,
  FolderIcon,
} from '../../icons';

function getNodeIcon(type: string, name?: string) {
  if (type === 'mesh') {
    const lower = name?.toLowerCase() ?? '';
    if (lower.includes('sphere')) return <SphereIcon size={14} />;
    if (lower.includes('cylinder') || lower.includes('cone')) return <CylinderIcon size={14} />;
    return <CubeIcon size={14} />;
  }
  if (type === 'light') {
    const lower = name?.toLowerCase() ?? '';
    if (lower.includes('ambient')) return <AmbientLightIcon size={14} />;
    if (lower.includes('point')) return <PointLightIcon size={14} />;
    return <DirectionalLightIcon size={14} />;
  }
  if (type === 'camera') return <CameraIcon size={14} />;
  if (type === 'audio') return <VolumeUpIcon sx={{ fontSize: 14 }} />;
  return <FolderIcon size={14} />;
}

const addMenuItems: Array<{ type: string; label?: string; icon?: React.ReactNode }> = [
  { type: 'box', label: 'Box', icon: <CubeIcon size={14} /> },
  { type: 'sphere', label: 'Sphere', icon: <SphereIcon size={14} /> },
  { type: 'cylinder', label: 'Cylinder', icon: <CylinderIcon size={14} /> },
  { type: 'cone', label: 'Cone', icon: <ConeIcon size={14} /> },
  { type: 'plane', label: 'Plane', icon: <PlaneIcon size={14} /> },
  { type: 'torus', label: 'Torus', icon: <TorusIcon size={14} /> },
  { type: 'procedural', label: 'Procedural Mesh', icon: <CodeIcon sx={{ fontSize: 14 }} /> },
  { type: 'nodes', label: 'Geometry Nodes', icon: <AccountTreeIcon sx={{ fontSize: 14 }} /> },
  { type: 'divider' },
  { type: 'ambient-light', label: 'Ambient Light', icon: <AmbientLightIcon size={14} /> },
  { type: 'point-light', label: 'Point Light', icon: <PointLightIcon size={14} /> },
  { type: 'directional-light', label: 'Directional Light', icon: <DirectionalLightIcon size={14} /> },
  { type: 'spot-light', label: 'Spot Light', icon: <PointLightIcon size={14} /> },
  { type: 'hemisphere-light', label: 'Hemisphere Light', icon: <AmbientLightIcon size={14} /> },
  { type: 'divider2' },
  { type: 'perspective-camera', label: 'Perspective Camera', icon: <CameraIcon size={14} /> },
  { type: 'orthographic-camera', label: 'Orthographic Camera', icon: <CameraIcon size={14} /> },
  { type: 'group', label: 'Group', icon: <FolderIcon size={14} /> },
  { type: 'divider3' },
  { type: 'audio', label: 'Audio Source', icon: <VolumeUpIcon sx={{ fontSize: 14 }} /> },
  { type: 'divider4' },
  { type: 'import-mesh', label: 'Import Mesh...', icon: <FileUploadIcon sx={{ fontSize: 14 }} /> },
];

const menuItemSx = {
  fontSize: '0.75rem',
  minHeight: 28,
  py: 0.25,
  '& .MuiListItemIcon-root': { minWidth: 28 },
};

const shortcutSx = {
  fontSize: '0.65rem',
  color: 'text.disabled',
  ml: 3,
};

function findNodeData(nodeList: SceneTreeNodeData[], id: string): SceneTreeNodeData | undefined {
  for (const n of nodeList) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNodeData(n.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

interface TreeNodeProps {
  node: SceneTreeNodeData;
  depth: number;
  selectedNodeId?: string | null;
  onNodeSelect?: (id: string) => void;
  onNodeVisibilityToggle?: (id: string) => void;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, nodeId: string) => void;
  renamingId: string | null;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onRenameStart: (nodeId: string, currentName: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  draggingId: string | null;
  dragOverId: string | null;
  onDragStart: (e: React.DragEvent, nodeId: string) => void;
  onDragEnd: () => void;
  onDragOverNode: (e: React.DragEvent, nodeId: string) => void;
  onDragLeaveNode: () => void;
  onDropOnNode: (e: React.DragEvent, targetNodeId: string) => void;
  // Touch handlers — open context menu via long-press. Mouse keeps using
  // the native onContextMenu (right click); touch devices have no right
  // click, so without these long-press the menu is unreachable.
  onRowPointerDown: (e: React.PointerEvent, nodeId: string) => void;
  onRowPointerMove: (e: React.PointerEvent) => void;
  onRowPointerUp: (e: React.PointerEvent) => void;
  onRowPointerCancel: (e: React.PointerEvent) => void;
}

function TreeNode({
  node,
  depth,
  selectedNodeId,
  onNodeSelect,
  onNodeVisibilityToggle,
  expandedIds,
  onToggleExpand,
  onContextMenu,
  renamingId,
  renameValue,
  onRenameValueChange,
  onRenameStart,
  onRenameCommit,
  onRenameCancel,
  draggingId,
  dragOverId,
  onDragStart,
  onDragEnd,
  onDragOverNode,
  onDragLeaveNode,
  onDropOnNode,
  onRowPointerDown,
  onRowPointerMove,
  onRowPointerUp,
  onRowPointerCancel,
}: TreeNodeProps) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = node.id === selectedNodeId;
  const isRenaming = node.id === renamingId;
  const isDragging = node.id === draggingId;
  const isDragOver = node.id === dragOverId && node.id !== draggingId;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  return (
    <>
      <ListItemButton
        selected={isSelected}
        draggable={!isRenaming}
        onClick={() => onNodeSelect?.(node.id)}
        onDoubleClick={() => onRenameStart(node.id, node.name)}
        onContextMenu={(e) => onContextMenu(e, node.id)}
        onDragStart={(e) => onDragStart(e, node.id)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => onDragOverNode(e, node.id)}
        onDragLeave={onDragLeaveNode}
        onDrop={(e) => onDropOnNode(e, node.id)}
        onPointerDown={(e) => onRowPointerDown(e, node.id)}
        onPointerMove={onRowPointerMove}
        onPointerUp={onRowPointerUp}
        onPointerCancel={onRowPointerCancel}
        data-tree-node-id={node.id}
        sx={{
          py: 0,
          pl: depth * 2 + 1,
          pr: 0.5,
          minHeight: 24,
          opacity: isDragging ? 0.35 : node.visible ? 1 : 0.4,
          // Allow vertical scroll on touch (browser-managed); we only need
          // pointer events for tap + long-press detection, not horizontal pan.
          touchAction: 'pan-y',
          // Disable iOS Safari's built-in long-press selection menu which
          // would otherwise show "Copy/Lookup" over our context menu.
          WebkitTouchCallout: 'none',
          userSelect: 'none',
          '&.Mui-selected': { bgcolor: 'action.selected' },
          '&.Mui-selected:hover': { bgcolor: 'action.selected' },
          ...(isDragOver && {
            bgcolor: 'primary.dark',
            borderLeft: '2px solid',
            borderColor: 'primary.main',
          }),
        }}
      >
        {hasChildren ? (
          <ListItemIcon
            sx={{ minWidth: 20, cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); onToggleExpand(node.id); }}
          >
            {isExpanded
              ? <ExpandMoreIcon sx={{ fontSize: 16 }} />
              : <ChevronRightIcon sx={{ fontSize: 16 }} />
            }
          </ListItemIcon>
        ) : (
          <Box sx={{ width: 20 }} />
        )}

        <ListItemIcon sx={{ minWidth: 22 }}>
          {getNodeIcon(node.type, node.name)}
        </ListItemIcon>

        {isRenaming ? (
          <TextField
            inputRef={inputRef}
            size="small"
            value={renameValue}
            onChange={(e) => onRenameValueChange(e.target.value)}
            onBlur={onRenameCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameCommit();
              if (e.key === 'Escape') onRenameCancel();
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            sx={{
              flex: 1,
              '& .MuiInputBase-root': { height: 20, fontSize: '0.75rem' },
              '& .MuiInputBase-input': { py: 0, px: 0.5 },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
            }}
          />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
              {node.name}
            </Typography>
            {Boolean(node.metadata?.prefabId) && (
              <Tooltip title={`Prefab: ${String(node.metadata?.prefabName ?? node.metadata?.prefabId ?? '')}`} placement="right">
                <Box sx={{
                  flexShrink: 0,
                  fontSize: '0.55rem',
                  fontWeight: 700,
                  lineHeight: 1,
                  px: 0.5,
                  py: 0.2,
                  borderRadius: 0.5,
                  bgcolor: 'rgba(255,165,0,0.18)',
                  color: '#ffaa44',
                  border: '1px solid rgba(255,165,0,0.35)',
                  letterSpacing: '0.02em',
                  userSelect: 'none',
                }}>
                  P
                </Box>
              </Tooltip>
            )}
          </Box>
        )}

        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); onNodeVisibilityToggle?.(node.id); }}
          sx={{
            opacity: node.visible ? 0 : 0.5,
            '.MuiListItemButton-root:hover &': { opacity: 0.5 },
            '&:hover': { opacity: '1 !important' },
            p: 0.25,
          }}
        >
          {node.visible
            ? <VisibilityIcon sx={{ fontSize: 14 }} />
            : <VisibilityOffIcon sx={{ fontSize: 14 }} />
          }
        </IconButton>
      </ListItemButton>

      {hasChildren && (
        <Collapse in={isExpanded}>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedNodeId={selectedNodeId}
              onNodeSelect={onNodeSelect}
              onNodeVisibilityToggle={onNodeVisibilityToggle}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              onContextMenu={onContextMenu}
              renamingId={renamingId}
              renameValue={renameValue}
              onRenameValueChange={onRenameValueChange}
              onRenameStart={onRenameStart}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
              draggingId={draggingId}
              dragOverId={dragOverId}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOverNode={onDragOverNode}
              onDragLeaveNode={onDragLeaveNode}
              onDropOnNode={onDropOnNode}
              onRowPointerDown={onRowPointerDown}
              onRowPointerMove={onRowPointerMove}
              onRowPointerUp={onRowPointerUp}
              onRowPointerCancel={onRowPointerCancel}
            />
          ))}
        </Collapse>
      )}
    </>
  );
}

export function SceneTreePanel({
  nodes = [],
  onNodeSelect,
  onNodeVisibilityToggle,
  selectedNodeId,
  onNodeAdd,
  onNodeDelete,
  onNodeRename,
  onNodeReparent,
  onNodeDuplicate,
  onNodeCut,
  onNodeCopy,
  onNodePaste,
  onImportMesh,
  onCreatePrefab,
  canPaste,
  className,
}: SceneTreePanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    function addAll(nodeList: SceneTreeNodeData[]) {
      for (const n of nodeList) {
        ids.add(n.id);
        if (n.children) addAll(n.children);
      }
    }
    addAll(nodes);
    return ids;
  });

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string | null } | null>(null);
  const [addSubmenuAnchor, setAddSubmenuAnchor] = useState<HTMLElement | null>(null);
  const submenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Inline rename state ──────────────────────────────────
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // ─── Drag & drop state ────────────────────────────────────
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // ─── Submenu hover helpers ────────────────────────────────

  const clearSubmenuTimer = useCallback(() => {
    if (submenuTimerRef.current) {
      clearTimeout(submenuTimerRef.current);
      submenuTimerRef.current = null;
    }
  }, []);

  const scheduleSubmenuClose = useCallback(() => {
    clearSubmenuTimer();
    submenuTimerRef.current = setTimeout(() => {
      setAddSubmenuAnchor(null);
    }, 150);
  }, [clearSubmenuTimer]);

  const handleNewItemEnter = useCallback((e: React.MouseEvent<HTMLLIElement>) => {
    clearSubmenuTimer();
    setAddSubmenuAnchor(e.currentTarget);
  }, [clearSubmenuTimer]);

  const handleOtherItemEnter = useCallback(() => {
    clearSubmenuTimer();
    setAddSubmenuAnchor(null);
  }, [clearSubmenuTimer]);

  // ─── Rename ───────────────────────────────────────────────

  const handleRenameStart = useCallback((nodeId: string, currentName: string) => {
    setRenamingId(nodeId);
    setRenameValue(currentName);
  }, []);

  const handleRenameCommit = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      onNodeRename?.(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  }, [renamingId, renameValue, onNodeRename]);

  const handleRenameCancel = useCallback(() => {
    setRenamingId(null);
    setRenameValue('');
  }, []);

  // ─── Expand / collapse ────────────────────────────────────

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ─── Context menu ─────────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    onNodeSelect?.(nodeId);
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId });
  }, [onNodeSelect]);

  const handleEmptyContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId: null });
  }, []);

  const closeMenu = useCallback(() => {
    setContextMenu(null);
    setAddSubmenuAnchor(null);
    clearSubmenuTimer();
  }, [clearSubmenuTimer]);

  const handleMenuAction = useCallback((action: string) => {
    const nodeId = contextMenu?.nodeId;
    closeMenu();

    if (action === 'import-mesh') {
      const contextNode = nodeId ? findNodeData(nodes, nodeId) : undefined;
      const parentId = contextNode?.type === 'group' ? nodeId! : undefined;
      if (parentId) {
        setExpandedIds((prev) => new Set([...prev, parentId]));
      }
      onImportMesh?.(parentId);
    } else if (action.startsWith('add:')) {
      // If context node is a group, create as child
      const contextNode = nodeId ? findNodeData(nodes, nodeId) : undefined;
      const parentId = contextNode?.type === 'group' ? nodeId! : undefined;
      if (parentId) {
        setExpandedIds((prev) => new Set([...prev, parentId]));
      }
      onNodeAdd?.(action.slice(4), parentId);
    } else if (action === 'duplicate' && nodeId) {
      onNodeDuplicate?.(nodeId);
    } else if (action === 'delete' && nodeId) {
      onNodeDelete?.(nodeId);
    } else if (action === 'cut' && nodeId) {
      onNodeCut?.(nodeId);
    } else if (action === 'copy' && nodeId) {
      onNodeCopy?.(nodeId);
    } else if (action === 'paste') {
      onNodePaste?.();
    } else if (action === 'rename' && nodeId) {
      const nd = findNodeData(nodes, nodeId);
      if (nd) handleRenameStart(nodeId, nd.name);
    } else if (action === 'create-prefab' && nodeId) {
      onCreatePrefab?.(nodeId);
    }
  }, [contextMenu, closeMenu, onNodeAdd, onNodeDelete, onNodeDuplicate, onNodeCut, onNodeCopy, onNodePaste, onImportMesh, onCreatePrefab, nodes, handleRenameStart]);

  // ─── Drag & drop handlers ─────────────────────────────────

  const handleDragStart = useCallback((e: React.DragEvent, nodeId: string) => {
    e.dataTransfer.setData('text/plain', nodeId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(nodeId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverId(null);
  }, []);

  const handleDragOverNode = useCallback((e: React.DragEvent, nodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(nodeId);
  }, []);

  const handleDragLeaveNode = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDropOnNode = useCallback((e: React.DragEvent, targetNodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const sourceId = e.dataTransfer.getData('text/plain');
    setDraggingId(null);
    setDragOverId(null);
    if (!sourceId || sourceId === targetNodeId) return;
    setExpandedIds((prev) => new Set([...prev, targetNodeId]));
    onNodeReparent?.(sourceId, targetNodeId);
  }, [onNodeReparent]);

  const handleDropOnRoot = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    setDraggingId(null);
    setDragOverId(null);
    if (!sourceId) return;
    onNodeReparent?.(sourceId, null);
  }, [onNodeReparent]);

  const handleDragOverRoot = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(null);
  }, []);

  // ─── Touch long-press → context menu ──────────────────────
  // Mobile devices have no right-click. Without this the cut/copy/paste menu
  // is unreachable on tablets/phones — and since touch ignores HTML5 DnD too,
  // the menu becomes the only way to reparent nodes (Cut on source, select
  // target group, Paste). Mouse stays on the native onContextMenu path.
  const longPressRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    nodeId: string;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  const cancelLongPress = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current.timer);
      longPressRef.current = null;
    }
  }, []);

  const handleRowPointerDown = useCallback((e: React.PointerEvent, nodeId: string) => {
    if (e.pointerType !== 'touch') return;
    // Don't intercept long-press if the touch started on an interactive child
    // (rename TextField, expand chevron, visibility eye) — those have their own
    // gestures that the user expects to win.
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, button')) return;

    const x = e.clientX;
    const y = e.clientY;
    cancelLongPress();
    const timer = setTimeout(() => {
      if (!longPressRef.current) return;
      onNodeSelect?.(nodeId);
      setContextMenu({ x, y, nodeId });
      longPressRef.current = null;
      // Subtle haptic confirmation where available (Android Chrome, some browsers).
      try { (navigator as Navigator & { vibrate?: (p: number) => void }).vibrate?.(15); } catch { /* unsupported */ }
    }, 500);
    longPressRef.current = { pointerId: e.pointerId, startX: x, startY: y, nodeId, timer };
  }, [onNodeSelect, cancelLongPress]);

  const handleRowPointerMove = useCallback((e: React.PointerEvent) => {
    const state = longPressRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    const dx = Math.abs(e.clientX - state.startX);
    const dy = Math.abs(e.clientY - state.startY);
    // Threshold high enough to tolerate jitter on capacitive screens but
    // low enough to cancel as soon as the user is actually scrolling.
    if (dx > 12 || dy > 12) cancelLongPress();
  }, [cancelLongPress]);

  const handleRowPointerUp = useCallback((e: React.PointerEvent) => {
    const state = longPressRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    cancelLongPress();
  }, [cancelLongPress]);

  const handleRowPointerCancel = useCallback((e: React.PointerEvent) => {
    const state = longPressRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    cancelLongPress();
  }, [cancelLongPress]);

  // Long-press on empty list area → "Add new" menu (mirror right-click).
  const handleEmptyPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    if ((e.target as HTMLElement).closest('[data-tree-node-id]')) return;  // hit a row → row handler wins
    const x = e.clientX;
    const y = e.clientY;
    cancelLongPress();
    const timer = setTimeout(() => {
      setContextMenu({ x, y, nodeId: null });
      longPressRef.current = null;
      try { (navigator as Navigator & { vibrate?: (p: number) => void }).vibrate?.(15); } catch { /* unsupported */ }
    }, 500);
    longPressRef.current = { pointerId: e.pointerId, startX: x, startY: y, nodeId: '', timer };
  }, [cancelLongPress]);

  const hasNodeSelected = contextMenu?.nodeId != null;

  return (
    <Box
      className={className}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: 'background.paper',
        borderRight: 1,
        borderColor: 'divider',
      }}
    >
      <Typography
        variant="overline"
        sx={{ px: 1.5, pt: 1, pb: 0.5, fontSize: '0.65rem', color: 'text.secondary', letterSpacing: '0.08em', flexShrink: 0 }}
      >
        Hierarchy
      </Typography>

      <List
        dense
        disablePadding
        sx={{ flex: 1, overflow: 'auto' }}
        onContextMenu={handleEmptyContextMenu}
        onPointerDown={handleEmptyPointerDown}
        onPointerMove={handleRowPointerMove}
        onPointerUp={handleRowPointerUp}
        onPointerCancel={handleRowPointerCancel}
        onDragOver={handleDragOverRoot}
        onDrop={handleDropOnRoot}
      >
        {nodes.length === 0 ? (
          <Typography variant="body2" sx={{ textAlign: 'center', py: 3, color: 'text.disabled', fontSize: '0.75rem' }}>
            Scene is empty
          </Typography>
        ) : (
          nodes.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              selectedNodeId={selectedNodeId}
              onNodeSelect={onNodeSelect}
              onNodeVisibilityToggle={onNodeVisibilityToggle}
              expandedIds={expandedIds}
              onToggleExpand={handleToggleExpand}
              onContextMenu={handleContextMenu}
              renamingId={renamingId}
              renameValue={renameValue}
              onRenameValueChange={setRenameValue}
              onRenameStart={handleRenameStart}
              onRenameCommit={handleRenameCommit}
              onRenameCancel={handleRenameCancel}
              draggingId={draggingId}
              dragOverId={dragOverId}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOverNode={handleDragOverNode}
              onDragLeaveNode={handleDragLeaveNode}
              onDropOnNode={handleDropOnNode}
              onRowPointerDown={handleRowPointerDown}
              onRowPointerMove={handleRowPointerMove}
              onRowPointerUp={handleRowPointerUp}
              onRowPointerCancel={handleRowPointerCancel}
            />
          ))
        )}
      </List>

      {/* ─── Main context menu ─────────────────────────────────── */}
      <Menu
        open={contextMenu !== null}
        onClose={closeMenu}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu ? { top: contextMenu.y, left: contextMenu.x } : undefined}
        slotProps={{ paper: { sx: { minWidth: 180 } } }}
      >
        <MenuItem
          onMouseEnter={handleNewItemEnter}
          onMouseLeave={scheduleSubmenuClose}
          sx={menuItemSx}
        >
          <ListItemIcon><AddIcon sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '0.75rem' }}>New</ListItemText>
          <ChevronRightIcon sx={{ fontSize: 14, color: 'text.disabled', ml: 2 }} />
        </MenuItem>
        <Divider onMouseEnter={handleOtherItemEnter} sx={{ my: 0.25 }} />
        <MenuItem onMouseEnter={handleOtherItemEnter} onClick={() => handleMenuAction('rename')} disabled={!hasNodeSelected} sx={menuItemSx}>
          <ListItemIcon><DriveFileRenameOutlineIcon sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '0.75rem' }}>Rename</ListItemText>
          <Typography sx={shortcutSx}>F2</Typography>
        </MenuItem>
        <MenuItem onMouseEnter={handleOtherItemEnter} onClick={() => handleMenuAction('cut')} disabled={!hasNodeSelected} sx={menuItemSx}>
          <ListItemIcon><ContentCutIcon sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '0.75rem' }}>Cut</ListItemText>
          <Typography sx={shortcutSx}>Ctrl+X</Typography>
        </MenuItem>
        <MenuItem onMouseEnter={handleOtherItemEnter} onClick={() => handleMenuAction('copy')} disabled={!hasNodeSelected} sx={menuItemSx}>
          <ListItemIcon><ContentCopyIcon sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '0.75rem' }}>Copy</ListItemText>
          <Typography sx={shortcutSx}>Ctrl+C</Typography>
        </MenuItem>
        <MenuItem onMouseEnter={handleOtherItemEnter} onClick={() => handleMenuAction('duplicate')} disabled={!hasNodeSelected} sx={menuItemSx}>
          <ListItemIcon><FileCopyIcon sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '0.75rem' }}>Duplicate</ListItemText>
          <Typography sx={shortcutSx}>Ctrl+D</Typography>
        </MenuItem>
        <MenuItem onMouseEnter={handleOtherItemEnter} onClick={() => handleMenuAction('paste')} disabled={!canPaste} sx={menuItemSx}>
          <ListItemIcon><ContentPasteIcon sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '0.75rem' }}>Paste</ListItemText>
          <Typography sx={shortcutSx}>Ctrl+V</Typography>
        </MenuItem>
        <Divider onMouseEnter={handleOtherItemEnter} sx={{ my: 0.25 }} />
        <MenuItem onMouseEnter={handleOtherItemEnter} onClick={() => handleMenuAction('create-prefab')} disabled={!hasNodeSelected} sx={menuItemSx}>
          <ListItemIcon><CategoryIcon sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '0.75rem' }}>Save as Prefab</ListItemText>
        </MenuItem>
        <Divider onMouseEnter={handleOtherItemEnter} sx={{ my: 0.25 }} />
        <MenuItem onMouseEnter={handleOtherItemEnter} onClick={() => handleMenuAction('delete')} disabled={!hasNodeSelected} sx={menuItemSx}>
          <ListItemIcon><DeleteOutlineIcon sx={{ fontSize: 16, color: 'error.main' }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '0.75rem', color: hasNodeSelected ? 'error.main' : undefined }}>Delete</ListItemText>
          <Typography sx={shortcutSx}>Del</Typography>
        </MenuItem>
      </Menu>

      {/* ─── "New" submenu (Popper-based, no backdrop) ─────────── */}
      <Popper
        open={addSubmenuAnchor !== null && contextMenu !== null}
        anchorEl={addSubmenuAnchor}
        placement="right-start"
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
      >
        <Paper
          elevation={8}
          sx={{ minWidth: 160 }}
          onMouseEnter={clearSubmenuTimer}
          onMouseLeave={scheduleSubmenuClose}
        >
          <MenuList dense>
            {addMenuItems.map((item, i) =>
              item.type === 'divider' || item.type === 'divider2' || item.type === 'divider3' || item.type === 'divider4' ? (
                <Divider key={`add-div-${i}`} sx={{ my: 0.25 }} />
              ) : (
                <MenuItem
                  key={item.type}
                  onClick={() => handleMenuAction(item.type === 'import-mesh' ? 'import-mesh' : `add:${item.type}`)}
                  sx={menuItemSx}
                >
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText primaryTypographyProps={{ fontSize: '0.75rem' }}>{item.label}</ListItemText>
                </MenuItem>
              ),
            )}
          </MenuList>
        </Paper>
      </Popper>
    </Box>
  );
}
