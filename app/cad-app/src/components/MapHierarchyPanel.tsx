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
import type { MapNode, MapNodeType } from '../map/types'

// ── icons ────────────────────────────────────────────────────────────────────

function getNodeIcon(type: MapNodeType) {
  switch (type) {
    case 'tile-layer': return <LayersIcon sx={{ fontSize: 14, color: '#ffb74d' }} />
    case 'marker':     return <PlaceIcon sx={{ fontSize: 14, color: '#ef5350' }} />
    case 'polygon':    return <CropSquareIcon sx={{ fontSize: 14, color: '#4fc3f7' }} />
    case 'polyline':   return <TimelineIcon sx={{ fontSize: 14, color: '#66bb6a' }} />
    case 'circle':     return <RadioButtonUncheckedIcon sx={{ fontSize: 14, color: '#ce93d8' }} />
    case 'group':      return <FolderIcon sx={{ fontSize: 14, color: '#78909c' }} />
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
}

function TreeNode({
  node, depth, selectedIds, expandedIds, renamingId, renameValue,
  onSelect, onToggleExpand, onToggleVisibility, onContextMenu,
  onRenameValueChange, onRenameCommit, onRenameCancel,
}: TreeNodeProps) {
  const hasChildren = (node.children?.length ?? 0) > 0
  const isExpanded  = expandedIds.has(node.id)
  const isSelected  = selectedIds.has(node.id)
  const isPrimary   = selectedIds.size === 1 && isSelected
  const isRenaming  = node.id === renamingId
  const inputRef    = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isRenaming) inputRef.current?.focus()
  }, [isRenaming])

  return (
    <>
      <ListItemButton
        selected={isSelected}
        onClick={e => onSelect(node.id, e.ctrlKey || e.metaKey)}
        onDoubleClick={() => {
          // trigger rename via parent — fired via context-menu handler
        }}
        onContextMenu={e => { e.preventDefault(); onContextMenu(e, node.id) }}
        sx={{
          py: 0,
          pl: depth * 2 + 1,
          pr: 0.5,
          minHeight: 24,
          opacity: node.visible ? 1 : 0.38,
          touchAction: 'pan-y',
          WebkitTouchCallout: 'none',
          userSelect: 'none',
          '&.Mui-selected': {
            bgcolor: isPrimary ? 'action.selected' : 'action.selected',
            outline: isSelected && !isPrimary ? '1px solid rgba(79,195,247,0.4)' : 'none',
            outlineOffset: '-1px',
          },
          '&.Mui-selected:hover': { bgcolor: 'action.selected' },
          '&:hover .map-vis-btn': { opacity: 1 },
        }}
      >
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
  onSplit?: (id: string) => void
}

export function MapHierarchyPanel({ nodes, selectedId, selectedIds, onSelect, onToggleVisibility, onRename, onDelete, onAdd, onSplit }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(['root-group']))
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ pos: { left: number; top: number }; nodeId: string } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

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

  const handleAddFromMenu = (type: MapNodeType) => {
    // Add under selected node if it's a group, otherwise at root level
    const sel = selectedId ? findInTree(nodes, selectedId) : null
    const parentId = sel?.type === 'group' ? sel.id : null
    onAdd(type, parentId)
    setAddAnchor(null)
  }

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
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <List dense disablePadding>
          {nodes.map(node => (
            <TreeNode key={node.id} node={node} depth={0} {...treeProps} />
          ))}
        </List>
      </Box>

      {/* ── Add menu ───────────────────────────────────────── */}
      <Menu
        anchorEl={addAnchor}
        open={Boolean(addAnchor)}
        onClose={() => setAddAnchor(null)}
        slotProps={{ paper: { sx: { minWidth: 160 } } }}
      >
        {ADD_ITEMS.map((item, i) =>
          item === 'divider' ? (
            <Divider key={`div-${i}`} />
          ) : (
            <MenuItem
              key={item.type}
              dense
              onClick={() => handleAddFromMenu(item.type)}
              sx={{ fontSize: '0.75rem', minHeight: 28, py: 0.25 }}
            >
              <ListItemIcon sx={{ minWidth: 26 }}>
                {getNodeIcon(item.type)}
              </ListItemIcon>
              {item.label}
            </MenuItem>
          )
        )}
      </Menu>

      {/* ── Context menu ───────────────────────────────────── */}
      <Menu
        open={Boolean(ctxMenu)}
        onClose={() => setCtxMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={ctxMenu?.pos}
        slotProps={{ paper: { sx: { minWidth: 140 } } }}
      >
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
    </Box>
  )
}
