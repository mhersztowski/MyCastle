import { useState, useCallback } from 'react'
import type { MapNode, MapNodeType } from './types'

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
}

const INITIAL_NODES: MapNode[] = [
  { id: 'osm', name: 'OpenStreetMap', type: 'tile-layer', visible: true, ...TYPE_DEFAULTS['tile-layer'] },
  { id: 'root-group', name: 'Layers', type: 'group', visible: true, children: [] },
]

// ── tree helpers ──────────────────────────────────────────────────────────────

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

// ── hook ─────────────────────────────────────────────────────────────────────

export function useMapLayers() {
  const [nodes, setNodes] = useState<MapNode[]>(INITIAL_NODES)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Toggle selection: multi=false → single select; multi=true → Ctrl-click add/remove
  const toggleSelect = useCallback((id: string, multi: boolean) => {
    if (multi) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
        return next
      })
      setSelectedId(id)
    } else {
      setSelectedIds(new Set([id]))
      setSelectedId(id)
    }
  }, [])

  const addLayer = useCallback((type: MapNodeType, parentId?: string | null) => {
    const baseName = type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    const node: MapNode = {
      id: uid(),
      name: baseName,
      type,
      visible: true,
      ...TYPE_DEFAULTS[type],
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
    loadNodes,
  }
}
