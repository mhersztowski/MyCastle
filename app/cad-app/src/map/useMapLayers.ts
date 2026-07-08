import { useState, useCallback, useRef } from 'react'
import type { MapNode, MapNodeType } from './types'

/** Where a dragged node lands relative to the drop target. */
export type DropPosition = 'before' | 'after' | 'inside'

const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

function uid(): string {
  return Math.random().toString(36).slice(2, 9)
}

const TYPE_DEFAULTS: Record<MapNodeType, Partial<MapNode>> = {
  'tile-layer': { url: OSM_URL, attribution: OSM_ATTR, opacity: 1 },
  marker: { lat: 52.2297, lng: 21.0122, popup: '' },
  polygon: {
    positions: [[52.235, 21.005], [52.235, 21.02], [52.225, 21.02], [52.225, 21.005]],
    color: '#4fc3f7', fillOpacity: 0.3, weight: 2,
  },
  polyline: {
    positions: [[52.22, 21.01], [52.24, 21.03]],
    color: '#ff7043', weight: 3,
  },
  circle: { lat: 52.2297, lng: 21.0122, radius: 800, color: '#66bb6a', fillOpacity: 0.3, weight: 2 },
  group: { children: [] },
  route: { color: '#42a5f5', weight: 4 },
  label: { lat: 52.2297, lng: 21.0122, text: '**Label**', color: '#ffffff', fontSize: 14 },
}

/** Current map viewport, used to spawn new objects where the user is looking
 *  (centre + degree spans of the visible area) instead of a fixed Warsaw default. */
export type ViewAt = { lat: number; lng: number; latSpan: number; lngSpan: number }

/** Geometry positioned at the current view centre, sized relative to the visible
 *  area so a fresh shape is always on-screen and reasonably sized at any zoom. */
function geomAt(type: MapNodeType, at: ViewAt): Partial<MapNode> {
  const { lat, lng, latSpan, lngSpan } = at
  const dh = latSpan * 0.15
  const dw = lngSpan * 0.15
  switch (type) {
    case 'marker':
    case 'label':
      return { lat, lng }
    case 'circle': {
      // ~metres per degree latitude ≈ 111320; make the circle span ~30% of the view.
      const radius = Math.max(20, Math.round(latSpan * 111320 * 0.15))
      return { lat, lng, radius }
    }
    case 'polygon':
      return { positions: [[lat + dh, lng - dw], [lat + dh, lng + dw], [lat - dh, lng + dw], [lat - dh, lng - dw]] }
    case 'polyline':
      return { positions: [[lat - dh, lng - dw], [lat + dh, lng + dw]] }
    default:
      return {}
  }
}

const INITIAL_NODES: MapNode[] = [
  { id: 'osm', name: 'OpenStreetMap', type: 'tile-layer', visible: true, ...TYPE_DEFAULTS['tile-layer'] },
  { id: 'root-group', name: 'Layers', type: 'group', visible: true, children: [] },
]

// ── tree helpers ──────────────────────────────────────────────────────────────

/** Depth-first list of node ids — matches the hierarchy's on-screen row order,
 *  used to resolve a Shift+click range (block) selection. */
function flattenIds(nodes: MapNode[], acc: string[] = []): string[] {
  for (const n of nodes) { acc.push(n.id); if (n.children) flattenIds(n.children, acc) }
  return acc
}

function findNode(nodes: MapNode[], id: string): MapNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children) {
      const found = findNode(n.children, id)
      if (found) return found
    }
  }
  return null
}

function insertUnder(nodes: MapNode[], parentId: string, child: MapNode): MapNode[] {
  return nodes.map(n => {
    if (n.id === parentId) return { ...n, children: [...(n.children ?? []), child] }
    if (n.children) return { ...n, children: insertUnder(n.children, parentId, child) }
    return n
  })
}

function removeNode(nodes: MapNode[], id: string): MapNode[] {
  return nodes
    .filter(n => n.id !== id)
    .map(n => n.children ? { ...n, children: removeNode(n.children, id) } : n)
}

function patchNode(nodes: MapNode[], id: string, changes: Partial<MapNode>): MapNode[] {
  return nodes.map(n => {
    if (n.id === id) return { ...n, ...changes }
    if (n.children) return { ...n, children: patchNode(n.children, id, changes) }
    return n
  })
}

function insertAfter(nodes: MapNode[], afterId: string, newNode: MapNode): MapNode[] {
  const idx = nodes.findIndex(n => n.id === afterId)
  if (idx !== -1) {
    const result = [...nodes]
    result.splice(idx + 1, 0, newNode)
    return result
  }
  return nodes.map(n =>
    n.children ? { ...n, children: insertAfter(n.children, afterId, newNode) } : n
  )
}

/** True when `id` is `node` itself or any of its descendants. */
function containsId(node: MapNode, id: string): boolean {
  if (node.id === id) return true
  return (node.children ?? []).some(c => containsId(c, id))
}

/** Insert `node` immediately before/after the sibling identified by `targetId`, anywhere in the tree. */
function insertRelative(
  nodes: MapNode[], targetId: string, node: MapNode, pos: 'before' | 'after',
): MapNode[] {
  const idx = nodes.findIndex(n => n.id === targetId)
  if (idx !== -1) {
    const result = [...nodes]
    result.splice(pos === 'before' ? idx : idx + 1, 0, node)
    return result
  }
  return nodes.map(n =>
    n.children ? { ...n, children: insertRelative(n.children, targetId, node, pos) } : n
  )
}

// ── hook ─────────────────────────────────────────────────────────────────────

export function useMapLayers() {
  const [nodes, setNodes] = useState<MapNode[]>(INITIAL_NODES)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Latest tree (for range resolution) + the anchor of the current selection.
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const anchorRef = useRef<string | null>(null)

  // Selection: plain click → single; Ctrl/Cmd (multi) → toggle one; Shift (range)
  // → select the whole block between the anchor and this row (Ctrl+Shift extends).
  const toggleSelect = useCallback((id: string, multi: boolean, range = false) => {
    if (range && anchorRef.current) {
      const flat = flattenIds(nodesRef.current)
      const a = flat.indexOf(anchorRef.current)
      const b = flat.indexOf(id)
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a <= b ? [a, b] : [b, a]
        const block = flat.slice(lo, hi + 1)
        setSelectedIds(prev => {
          const next = multi ? new Set(prev) : new Set<string>()
          block.forEach(x => next.add(x))
          return next
        })
        setSelectedId(id) // keep the anchor so the block can be re-dragged
        return
      }
    }
    if (multi) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id); else next.add(id)
        return next
      })
      setSelectedId(id)
      anchorRef.current = id
    } else {
      setSelectedIds(new Set([id]))
      setSelectedId(id)
      anchorRef.current = id
    }
  }, [])

  const addLayer = useCallback((type: MapNodeType, parentId?: string | null, at?: ViewAt) => {
    const baseName = type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    const node: MapNode = {
      id: uid(),
      name: baseName,
      type,
      visible: true,
      ...TYPE_DEFAULTS[type],
      // Spawn geometry at the current camera view instead of the fixed default.
      ...(at ? geomAt(type, at) : {}),
    }
    setNodes(prev => parentId ? insertUnder(prev, parentId, node) : [...prev, node])
    setSelectedId(node.id)
    return node.id
  }, [])

  const placeNode = useCallback((type: MapNodeType, props: Partial<MapNode>, parentId?: string | null) => {
    let n = 1
    const baseName = type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    const node: MapNode = {
      id: uid(),
      name: `${baseName} ${n++}`,
      type,
      visible: true,
      ...TYPE_DEFAULTS[type],
      ...props,
    }
    setNodes(prev => {
      // auto-number name to avoid duplicates
      const existing = prev.filter(nd => nd.name.startsWith(baseName)).length
      node.name = `${baseName} ${existing + 1}`
      return parentId ? insertUnder(prev, parentId, node) : [...prev, node]
    })
    setSelectedId(node.id)
    return node.id
  }, [])

  const deleteLayer = useCallback((id: string) => {
    setNodes(prev => removeNode(prev, id))
    setSelectedId(prev => prev === id ? null : prev)
  }, [])

  const renameLayer = useCallback((id: string, name: string) => {
    setNodes(prev => patchNode(prev, id, { name }))
  }, [])

  const toggleVisibility = useCallback((id: string) => {
    setNodes(prev => {
      const node = findNode(prev, id)
      if (!node) return prev
      return patchNode(prev, id, { visible: !node.visible })
    })
  }, [])

  const updateLayer = useCallback((id: string, changes: Partial<MapNode>) => {
    setNodes(prev => patchNode(prev, id, changes))
  }, [])

  // Bulk update: applies the same changes to all given ids
  const updateLayers = useCallback((ids: string[], changes: Partial<MapNode>) => {
    setNodes(prev => ids.reduce((acc, id) => patchNode(acc, id, changes), prev))
  }, [])

  const selectedNode = selectedId ? findNode(nodes, selectedId) : null

  const importAsGroup = useCallback((groupName: string, children: MapNode[]) => {
    const group: MapNode = {
      id: uid(),
      name: groupName,
      type: 'group',
      visible: true,
      children,
    }
    setNodes(prev => [...prev, group])
    setSelectedId(group.id)
  }, [])

  const addSibling = useCallback((afterId: string, newNode: MapNode) => {
    setNodes(prev => insertAfter(prev, afterId, newNode))
    setSelectedId(newNode.id)
  }, [])

  // Drag & drop reparent/reorder. `pos`: drop before/after the target, or inside it (groups only).
  const moveNode = useCallback((dragId: string, targetId: string, pos: DropPosition) => {
    setNodes(prev => {
      if (dragId === targetId) return prev
      const dragged = findNode(prev, dragId)
      const target = findNode(prev, targetId)
      if (!dragged || !target) return prev
      // Never drop a node into its own subtree.
      if (containsId(dragged, targetId)) return prev
      // Only groups can contain children.
      if (pos === 'inside' && target.type !== 'group') return prev
      const without = removeNode(prev, dragId)
      return pos === 'inside'
        ? insertUnder(without, targetId, dragged)
        : insertRelative(without, targetId, dragged, pos)
    })
    setSelectedId(dragId)
  }, [])

  // Add a route node (geometry already computed by the caller).
  const placeRoute = useCallback((props: Partial<MapNode>) => {
    const node: MapNode = {
      id: uid(),
      name: props.name ?? 'Route',
      type: 'route',
      visible: true,
      weight: 4,
      ...props,
    }
    setNodes(prev => [...prev, node])
    setSelectedId(node.id)
    return node.id
  }, [])

  // Replace entire scene (used by file open)
  const loadNodes = useCallback((newNodes: MapNode[]) => {
    setNodes(newNodes)
    setSelectedId(null)
    setSelectedIds(new Set())
  }, [])

  return {
    nodes,
    selectedId,
    selectedIds,
    selectedNode,
    setSelectedId,
    toggleSelect,
    addLayer,
    placeNode,
    deleteLayer,
    renameLayer,
    toggleVisibility,
    updateLayer,
    updateLayers,
    importAsGroup,
    addSibling,
    moveNode,
    placeRoute,
    loadNodes,
  }
}
