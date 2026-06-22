import React, { useState, useRef, useEffect, useCallback } from 'react'
import Box from '@mui/material/Box'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import IconButton from '@mui/material/IconButton'
import Collapse from '@mui/material/Collapse'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Divider from '@mui/material/Divider'
import Tooltip from '@mui/material/Tooltip'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import AddIcon from '@mui/icons-material/Add'
import LayersIcon from '@mui/icons-material/Layers'
import PlaceIcon from '@mui/icons-material/Place'
import CropSquareIcon from '@mui/icons-material/CropSquare'
import TimelineIcon from '@mui/icons-material/Timeline'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import FolderIcon from '@mui/icons-material/Folder'
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline'
import ContentCutIcon from '@mui/icons-material/ContentCut'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import RouteIcon from '@mui/icons-material/Route'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import type { MapNode, MapNodeType } from '../map/types'
import type { DropPosition } from '../map/useMapLayers'

// ── icons ────────────────────────────────────────────────────────────────────

function getNodeIcon(type: MapNodeType) {
  switch (type) {
    case 'tile-layer': return <LayersIcon sx={{ fontSize: 14, color: '#ffb74d' }} />
    case 'marker':     return <PlaceIcon sx={{ fontSize: 14, color: '#ef5350' }} />
    case 'polygon':    return <CropSquareIcon sx={{ fontSize: 14, color: '#4fc3f7' }} />
    case 'polyline':   return <TimelineIcon sx={{ fontSize: 14, color: '#66bb6a' }} />
    case 'circle':     return <RadioButtonUncheckedIcon sx={{ fontSize: 14, color: '#ce93d8' }} />
    case 'group':      return <FolderIcon sx={{ fontSize: 14, color: '#78909c' }} />
    case 'route':      return <RouteIcon sx={{ fontSize: 14, color: '#42a5f5' }} />
  }
}

// ── add-menu items ────────────────────────────────────────────────────────────

const ADD_ITEMS: Array<{ type: MapNodeType; label: string } | 'divider'> = [
  { type: 'group',      label: 'Group' },
  'divider',
  { type: 'tile-layer', label: 'Tile Layer' },
  { type: 'marker',     label: 'Marker' },
  { type: 'polygon',    label: 'Polygon' },
  { type: 'polyline',   label: 'Polyline' },
  { type: 'circle',     label: 'Circle' },
]

// ── helpers ───────────────────────────────────────────────────────────────────

/** True when `id` is `node` itself or any of its descendants. */
function containsId(node: MapNode, id: string): boolean {
  if (node.id === id) return true
  return (node.children ?? []).some(c => containsId(c, id))
}

function findInTree(nodes: MapNode[], id: string): MapNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children) {
      const found = findInTree(n.children, id)
      if (found) return found
    }
  }
  return null
}

// ── TreeNode ──────────────────────────────────────────────────────────────────

interface TreeNodeProps {
  node: MapNode
  depth: number
  selectedIds: Set<string>
  expandedIds: Set<string>
  renamingId: string | null
  renameValue: string
  onSelect: (id: string, multi: boolean) => void
  onToggleExpand: (id: string) => void
  onToggleVisibility: (id: string) => void
  onContextMenu: (e: React.MouseEvent, id: string) => void
  onRenameValueChange: (v: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
  dropTarget: { id: string; pos: DropPosition } | null
  onHandlePointerDown: (e: React.PointerEvent, id: string) => void
  onHandlePointerMove: (e: React.PointerEvent) => void
  onHandlePointerUp: (e: React.PointerEvent) => void
  onShowInfo?: (id: string) => void
}

function TreeNode({
  node, depth, selectedIds, expandedIds, renamingId, renameValue,
  onSelect, onToggleExpand, onToggleVisibility, onContextMenu,
  onRenameValueChange, onRenameCommit, onRenameCancel,
  dropTarget, onHandlePointerDown, onHandlePointerMove, onHandlePointerUp, onShowInfo,
}: TreeNodeProps) {
  const hasChildren = (node.children?.length ?? 0) > 0
  const isExpanded  = expandedIds.has(node.id)
  const isSelected  = selectedIds.has(node.id)
  const isPrimary   = selectedIds.size === 1 && isSelected
  const isRenaming  = node.id === renamingId
  const inputRef    = useRef<HTMLInputElement>(null)
  const dropPos     = dropTarget?.id === node.id ? dropTarget.pos : null

  useEffect(() => {
    if (isRenaming) inputRef.current?.focus()
  }, [isRenaming])

  return (
    <>
      <ListItemButton
        selected={isSelected}
        data-node-id={node.id}
        onClick={e => onSelect(node.id, e.ctrlKey || e.metaKey)}
        onDoubleClick={() => {
          // trigger rename via parent — fired via context-menu handler
        }}
        onContextMenu={e => { e.preventDefault(); onContextMenu(e, node.id) }}
        sx={{
          py: 0,
          pl: depth * 2 + 0.5,
          pr: 0.5,
          minHeight: 24,
          opacity: node.visible ? 1 : 0.38,
          touchAction: 'pan-y',
          WebkitTouchCallout: 'none',
          userSelect: 'none',
          // Drag & drop drop indicators (box-shadow lines = no layout shift)
          boxShadow:
            dropPos === 'before' ? 'inset 0 2px 0 0 #4fc3f7'
            : dropPos === 'after' ? 'inset 0 -2px 0 0 #4fc3f7'
            : 'none',
          ...(dropPos === 'inside' && {
            bgcolor: 'rgba(79,195,247,0.16)',
            outline: '2px solid #4fc3f7',
            outlineOffset: '-2px',
          }),
          '&.Mui-selected': {
            bgcolor: isPrimary ? 'action.selected' : 'action.selected',
            outline: isSelected && !isPrimary ? '1px solid rgba(79,195,247,0.4)' : 'none',
            outlineOffset: '-1px',
          },
          '&.Mui-selected:hover': { bgcolor: 'action.selected' },
          '&:hover .map-vis-btn': { opacity: 1 },
        }}
      >
        {/* drag handle — pointer-based so it works with mouse, touch & stylus */}
        {!isRenaming && (
          <Box
            onPointerDown={e => onHandlePointerDown(e, node.id)}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onClick={e => e.stopPropagation()}
            sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 16, flexShrink: 0, alignSelf: 'stretch',
              cursor: 'grab', touchAction: 'none',
              color: 'text.disabled', opacity: 0.45,
              '&:hover': { opacity: 1 },
              '&:active': { cursor: 'grabbing' },
            }}
          >
            <DragIndicatorIcon sx={{ fontSize: 13 }} />
          </Box>
        )}

        {/* expand chevron */}
        {hasChildren ? (
          <ListItemIcon
            sx={{ minWidth: 20, cursor: 'pointer' }}
            onClick={e => { e.stopPropagation(); onToggleExpand(node.id) }}
          >
            {isExpanded
              ? <ExpandMoreIcon sx={{ fontSize: 16 }} />
              : <ChevronRightIcon sx={{ fontSize: 16 }} />
            }
          </ListItemIcon>
        ) : (
          <Box sx={{ width: 20, flexShrink: 0 }} />
        )}

        {/* type icon */}
        <ListItemIcon sx={{ minWidth: 22 }}>
          {getNodeIcon(node.type)}
        </ListItemIcon>

        {/* name / rename input */}
        {isRenaming ? (
          <TextField
            inputRef={inputRef}
            size="small"
            value={renameValue}
            onChange={e => onRenameValueChange(e.target.value)}
            onBlur={onRenameCommit}
            onKeyDown={e => {
              if (e.key === 'Enter') onRenameCommit()
              if (e.key === 'Escape') onRenameCancel()
            }}
            onClick={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
            sx={{
              flex: 1,
              '& .MuiInputBase-root': { height: 20, fontSize: '0.75rem' },
              '& .MuiInputBase-input': { py: 0, px: 0.5 },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
            }}
          />
        ) : (
          <ListItemText
            primary={node.name}
            sx={{
              m: 0,
              '& .MuiListItemText-primary': {
                fontSize: '0.75rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              },
            }}
          />
        )}

        {/* info button — shown when the node has a description */}
        {!isRenaming && node.info?.trim() && onShowInfo && (
          <Tooltip title="Show info" placement="right">
            <IconButton
              size="small"
              onClick={e => { e.stopPropagation(); onShowInfo(node.id) }}
              sx={{ p: 0.25, flexShrink: 0, color: '#4fc3f7' }}
            >
              <InfoOutlinedIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        )}

        {/* visibility toggle — visible on hover (or when hidden) */}
        {!isRenaming && (
          <Tooltip title={node.visible ? 'Hide' : 'Show'} placement="right">
            <IconButton
              size="small"
              className="map-vis-btn"
              onClick={e => { e.stopPropagation(); onToggleVisibility(node.id) }}
              sx={{
                opacity: node.visible ? 0 : 1,
                p: 0.25,
                transition: 'opacity 0.15s',
                flexShrink: 0,
              }}
            >
              {node.visible
                ? <VisibilityIcon sx={{ fontSize: 13 }} />
                : <VisibilityOffIcon sx={{ fontSize: 13 }} />
              }
            </IconButton>
          </Tooltip>
        )}
      </ListItemButton>

      {/* children */}
      {hasChildren && (
        <Collapse in={isExpanded} unmountOnExit>
          <List disablePadding>
            {(node.children ?? []).map(child => (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                selectedIds={selectedIds}
                expandedIds={expandedIds}
                renamingId={renamingId}
                renameValue={renameValue}
                onSelect={onSelect}
                onToggleExpand={onToggleExpand}
                onToggleVisibility={onToggleVisibility}
                onContextMenu={onContextMenu}
                onRenameValueChange={onRenameValueChange}
                onRenameCommit={onRenameCommit}
                onRenameCancel={onRenameCancel}
                dropTarget={dropTarget}
                onHandlePointerDown={onHandlePointerDown}
                onHandlePointerMove={onHandlePointerMove}
                onHandlePointerUp={onHandlePointerUp}
                onShowInfo={onShowInfo}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  )
}

// ── MapHierarchyPanel ─────────────────────────────────────────────────────────

function canSplit(nodes: MapNode[], id: string): boolean {
  const n = findInTree(nodes, id)
  if (!n) return false
  if ((n.type === 'polyline' || n.type === 'polygon') && (n.positions?.length ?? 0) >= 4) return true
  if (n.type === 'group') {
    const pathChildren = (n.children ?? []).filter(c => c.type === 'polyline' || c.type === 'polygon')
    return pathChildren.length >= 2
  }
  return false
}

interface Props {
  nodes: MapNode[]
  selectedId: string | null
  selectedIds: Set<string>
  onSelect: (id: string, multi: boolean) => void
  onToggleVisibility: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onAdd: (type: MapNodeType, parentId?: string | null) => void
  onAddRoute?: () => void
  onSplit?: (id: string) => void
  onMove: (dragId: string, targetId: string, pos: DropPosition) => void
  onShowInfo?: (id: string) => void
}

export function MapHierarchyPanel({ nodes, selectedId, selectedIds, onSelect, onToggleVisibility, onRename, onDelete, onAdd, onAddRoute, onSplit, onMove, onShowInfo }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(['root-group']))
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null)
  const [addCtxPos, setAddCtxPos] = useState<{ left: number; top: number } | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ pos: { left: number; top: number }; nodeId: string } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // ── drag & drop state (pointer-based: works with mouse, touch & stylus) ─────
  const dragIdRef = useRef<string | null>(null)
  const dragStartRef = useRef<{ x: number; y: number; started: boolean } | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: DropPosition } | null>(null)
  const [dragGhost, setDragGhost] = useState<{ name: string; x: number; y: number } | null>(null)

  // Resolve the row under the pointer into a valid drop {id, pos}, or null.
  const computeDrop = useCallback((clientX: number, clientY: number): { id: string; pos: DropPosition } | null => {
    const drag = dragIdRef.current
    if (!drag) return null
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    const rowEl = el?.closest('[data-node-id]') as HTMLElement | null
    if (!rowEl) return null
    const id = rowEl.dataset.nodeId
    if (!id || id === drag) return null
    // Disallow dropping a node into its own subtree.
    const dragged = findInTree(nodes, drag)
    if (dragged && containsId(dragged, id)) return null
    const rect = rowEl.getBoundingClientRect()
    const y = clientY - rect.top
    const target = findInTree(nodes, id)
    const pos: DropPosition = target?.type === 'group'
      ? (y < rect.height * 0.3 ? 'before' : y > rect.height * 0.7 ? 'after' : 'inside')
      : (y < rect.height / 2 ? 'before' : 'after')
    return { id, pos }
  }, [nodes])

  const handleHandlePointerDown = useCallback((e: React.PointerEvent, id: string) => {
    // Don't let the press scroll the list, start a click, or select text.
    e.stopPropagation()
    e.preventDefault()
    dragIdRef.current = id
    dragStartRef.current = { x: e.clientX, y: e.clientY, started: false }
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* ignore */ }
  }, [])

  const handleHandlePointerMove = useCallback((e: React.PointerEvent) => {
    const start = dragStartRef.current
    if (!dragIdRef.current || !start) return
    // Require a small movement before treating it as a drag (so taps still select).
    if (!start.started) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5) return
      start.started = true
      const dn = findInTree(nodes, dragIdRef.current)
      setDragGhost({ name: dn?.name ?? '', x: e.clientX, y: e.clientY })
    }
    setDropTarget(computeDrop(e.clientX, e.clientY))
    setDragGhost(g => (g ? { ...g, x: e.clientX, y: e.clientY } : g))
  }, [nodes, computeDrop])

  const handleHandlePointerUp = useCallback((e: React.PointerEvent) => {
    const drag = dragIdRef.current
    const started = dragStartRef.current?.started ?? false
    const drop = started ? computeDrop(e.clientX, e.clientY) : null
    dragIdRef.current = null
    dragStartRef.current = null
    setDragGhost(null)
    setDropTarget(null)
    if (drag && drop) {
      onMove(drag, drop.id, drop.pos)
      if (drop.pos === 'inside') setExpandedIds(prev => new Set(prev).add(drop.id))
    }
  }, [computeDrop, onMove])

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const startRename = useCallback((id: string) => {
    const node = findInTree(nodes, id)
    if (!node) return
    setRenamingId(id)
    setRenameValue(node.name)
    setCtxMenu(null)
  }, [nodes])

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) onRename(renamingId, renameValue.trim())
    setRenamingId(null)
  }, [renamingId, renameValue, onRename])

  const handleContextMenu = useCallback((e: React.MouseEvent, nodeId: string) => {
    setCtxMenu({ pos: { left: e.clientX, top: e.clientY }, nodeId })
    // right-click selects without clearing multiselect if already selected
    if (!selectedIds.has(nodeId)) onSelect(nodeId, false)
  }, [onSelect, selectedIds])

  // Right-click on empty tree space → Add menu at the cursor (adds at root).
  const handleTreeContextMenu = (e: React.MouseEvent) => {
    // Row right-clicks are handled per-node; only react to empty space.
    if ((e.target as HTMLElement).closest('[data-node-id]')) return
    e.preventDefault()
    setAddCtxPos({ left: e.clientX, top: e.clientY })
  }

  const ADD_ITEM_SX = { fontSize: '0.75rem', minHeight: 28, py: 0.25 }

  // Build the shared "Add layer" menu items for a given parent (null = root).
  const buildAddItems = (parentId: string | null, close: () => void): React.ReactNode[] => {
    const items: React.ReactNode[] = []
    ADD_ITEMS.forEach((item, i) => {
      if (item === 'divider') { items.push(<Divider key={`add-div-${i}`} />); return }
      items.push(
        <MenuItem key={`add-${item.type}`} dense onClick={() => { close(); onAdd(item.type, parentId) }} sx={ADD_ITEM_SX}>
          <ListItemIcon sx={{ minWidth: 26 }}>{getNodeIcon(item.type)}</ListItemIcon>
          {item.label}
        </MenuItem>,
      )
    })
    if (onAddRoute) {
      items.push(<Divider key="add-div-route" />)
      items.push(
        <MenuItem key="add-route" dense onClick={() => { close(); onAddRoute() }} sx={ADD_ITEM_SX}>
          <ListItemIcon sx={{ minWidth: 26 }}><RouteIcon sx={{ fontSize: 14, color: '#42a5f5' }} /></ListItemIcon>
          Route…
        </MenuItem>,
      )
    }
    return items
  }

  // Parent for the header "+" button: selected group, else root.
  const headerSel = selectedId ? findInTree(nodes, selectedId) : null
  const headerAddParent = headerSel?.type === 'group' ? headerSel.id : null

  // Parent for the node context menu's Add section: that node if a group, else root.
  const ctxNode = ctxMenu ? findInTree(nodes, ctxMenu.nodeId) : null
  const ctxAddParent = ctxNode?.type === 'group' ? ctxNode.id : null

  const treeProps = {
    selectedIds,
    expandedIds,
    renamingId,
    renameValue,
    onSelect,
    onToggleExpand: toggleExpand,
    onToggleVisibility,
    onContextMenu: handleContextMenu,
    onRenameValueChange: setRenameValue,
    onRenameCommit: commitRename,
    onRenameCancel: () => setRenamingId(null),
    dropTarget,
    onHandlePointerDown: handleHandlePointerDown,
    onHandlePointerMove: handleHandlePointerMove,
    onHandlePointerUp: handleHandlePointerUp,
    onShowInfo,
  }

  return (
    <Box sx={{
      width: 220,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      bgcolor: 'background.paper',
      borderRight: '1px solid rgba(255,255,255,0.08)',
      overflow: 'hidden',
    }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        px: 1.5,
        height: 28,
        flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <Typography sx={{
          fontSize: '0.7rem',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'text.secondary',
          flex: 1,
        }}>
          Hierarchy
        </Typography>
        <Tooltip title="Add layer">
          <IconButton size="small" onClick={e => setAddAnchor(e.currentTarget)} sx={{ p: 0.25 }}>
            <AddIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* ── Tree ───────────────────────────────────────────── */}
      <Box sx={{ flex: 1, overflow: 'auto' }} onContextMenu={handleTreeContextMenu}>
        <List dense disablePadding>
          {nodes.map(node => (
            <TreeNode key={node.id} node={node} depth={0} {...treeProps} />
          ))}
        </List>
      </Box>

      {/* ── Add menu (from header "+" button) ──────────────── */}
      <Menu
        anchorEl={addAnchor}
        open={Boolean(addAnchor)}
        onClose={() => setAddAnchor(null)}
        slotProps={{ paper: { sx: { minWidth: 160 } } }}
      >
        {buildAddItems(headerAddParent, () => setAddAnchor(null))}
      </Menu>

      {/* ── Add menu (right-click on empty tree space) ─────── */}
      <Menu
        open={Boolean(addCtxPos)}
        onClose={() => setAddCtxPos(null)}
        anchorReference="anchorPosition"
        anchorPosition={addCtxPos ?? undefined}
        slotProps={{ paper: { sx: { minWidth: 160 } } }}
      >
        {buildAddItems(null, () => setAddCtxPos(null))}
      </Menu>

      {/* ── Context menu ───────────────────────────────────── */}
      <Menu
        open={Boolean(ctxMenu)}
        onClose={() => setCtxMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={ctxMenu?.pos}
        slotProps={{ paper: { sx: { minWidth: 150 } } }}
      >
        <Typography sx={{
          px: 2, py: 0.25, fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.07em',
          textTransform: 'uppercase', color: 'text.disabled',
        }}>
          {ctxAddParent ? 'Add inside' : 'Add layer'}
        </Typography>
        {buildAddItems(ctxAddParent, () => setCtxMenu(null))}
        <Divider />

        <MenuItem
          dense
          onClick={() => { ctxMenu && startRename(ctxMenu.nodeId) }}
          sx={{ fontSize: '0.75rem', minHeight: 28, py: 0.25 }}
        >
          <ListItemIcon sx={{ minWidth: 26 }}>
            <DriveFileRenameOutlineIcon sx={{ fontSize: 14 }} />
          </ListItemIcon>
          Rename
        </MenuItem>
        {ctxMenu && onSplit && canSplit(nodes, ctxMenu.nodeId) && (
          <MenuItem
            dense
            onClick={() => { onSplit(ctxMenu.nodeId); setCtxMenu(null) }}
            sx={{ fontSize: '0.75rem', minHeight: 28, py: 0.25 }}
          >
            <ListItemIcon sx={{ minWidth: 26 }}>
              <ContentCutIcon sx={{ fontSize: 14 }} />
            </ListItemIcon>
            Extract Segment
          </MenuItem>
        )}
        <Divider />
        <MenuItem
          dense
          onClick={() => { ctxMenu && onDelete(ctxMenu.nodeId); setCtxMenu(null) }}
          sx={{ fontSize: '0.75rem', minHeight: 28, py: 0.25, color: 'error.main' }}
        >
          <ListItemIcon sx={{ minWidth: 26 }}>
            <DeleteOutlineIcon sx={{ fontSize: 14, color: 'error.main' }} />
          </ListItemIcon>
          Delete
        </MenuItem>
      </Menu>

      {/* ── Floating drag label ────────────────────────────── */}
      {dragGhost && (
        <Box sx={{
          position: 'fixed',
          left: dragGhost.x + 12,
          top: dragGhost.y + 8,
          zIndex: 2000,
          pointerEvents: 'none',
          px: 1,
          py: 0.25,
          borderRadius: 1,
          bgcolor: 'rgba(79,195,247,0.92)',
          color: '#06222e',
          fontSize: '0.7rem',
          fontWeight: 600,
          boxShadow: 3,
          maxWidth: 180,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {dragGhost.name}
        </Box>
      )}
    </Box>
  )
}
