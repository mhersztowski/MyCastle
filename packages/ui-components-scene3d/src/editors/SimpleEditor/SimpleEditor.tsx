import { useState, useMemo, useCallback, useEffect } from 'react';
import type { SimpleEditorProps, SelectedNodeData } from '@mhersztowski/ui-core';
import { SimpleViewer, SceneGraph, MeshNode, LightNode } from '@mhersztowski/core-scene3d';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Allotment } from 'allotment';
import { Toolbar } from '../../toolbar';
import { PropertiesPanel } from '../../panels';
import { CubeIcon, SphereIcon, DeleteIcon } from '../../icons';

export function SimpleEditor({ className, style }: SimpleEditorProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const sceneGraph = useMemo(() => {
    const graph = new SceneGraph();

    graph.addNode(new MeshNode({
      name: 'Box',
      geometry: { type: 'box' },
      material: { color: '#4fc3f7', opacity: 1, wireframe: false },
    }));

    graph.addNode(new LightNode({
      name: 'Sun',
      lightType: 'directional',
      position: [5, 10, 5],
      intensity: 1,
    }));

    return graph;
  }, []);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    sceneGraph.onChange = bump;
    return () => { sceneGraph.onChange = null; };
  }, [sceneGraph, bump]);

  const addBox = useCallback(() => {
    const node = new MeshNode({ name: 'Box', geometry: { type: 'box' }, material: { color: '#4fc3f7', opacity: 1, wireframe: false } });
    sceneGraph.addNode(node);
    setSelectedNodeId(node.id);
  }, [sceneGraph]);

  const addSphere = useCallback(() => {
    const node = new MeshNode({ name: 'Sphere', geometry: { type: 'sphere' }, material: { color: '#81c784', opacity: 1, wireframe: false } });
    sceneGraph.addNode(node);
    setSelectedNodeId(node.id);
  }, [sceneGraph]);

  const deleteSelected = useCallback(() => {
    if (!selectedNodeId) return;
    sceneGraph.removeNode(selectedNodeId);
    setSelectedNodeId(null);
  }, [sceneGraph, selectedNodeId]);

  const handlePropertyChange = useCallback((nodeId: string, property: string, value: unknown) => {
    const node = sceneGraph.findNode(nodeId);
    if (!node) return;
    node.setProperty(property, value);
  }, [sceneGraph]);

  const selectedNodeData: SelectedNodeData | null = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = sceneGraph.findNode(selectedNodeId);
    if (!node) return null;
    const meshNode = node.type === 'mesh' ? (node as unknown as MeshNode) : null;
    const lightNode = node.type === 'light' ? (node as unknown as LightNode) : null;
    return {
      id: node.id, name: node.name, type: node.type, visible: node.visible,
      transform: { position: [...node.position], rotation: [...node.rotation], scale: [...node.scale] },
      material: meshNode ? { color: meshNode.material.color, opacity: meshNode.material.opacity, wireframe: meshNode.material.wireframe } : undefined,
      light: lightNode ? { lightType: lightNode.lightType, color: lightNode.color, intensity: lightNode.intensity } : undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneGraph, selectedNodeId, version]);

  const toolbarItems = [
    { id: 'add-box', label: 'Box', icon: <CubeIcon />, onClick: addBox, tooltip: 'Add Box' },
    { id: 'add-sphere', label: 'Sphere', icon: <SphereIcon />, onClick: addSphere, tooltip: 'Add Sphere' },
    { id: 'sep-1', label: '', type: 'separator' as const },
    { id: 'delete', label: '', icon: <DeleteIcon />, onClick: deleteSelected, disabled: !selectedNodeId, tooltip: 'Delete' },
  ];

  return (
    <Box className={className} style={style} sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.default', color: 'text.primary' }}>
      <Toolbar items={toolbarItems} />
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <Allotment>
          <Allotment.Pane>
            <Box sx={{ width: '100%', height: '100%', bgcolor: '#2a2a2a' }}>
              <SimpleViewer sceneGraph={sceneGraph} version={version} />
            </Box>
          </Allotment.Pane>
          <Allotment.Pane preferredSize={280} minSize={200} maxSize={400}>
            <PropertiesPanel node={selectedNodeData} onPropertyChange={handlePropertyChange} />
          </Allotment.Pane>
        </Allotment>
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 1.5,
          bgcolor: 'background.paper',
          borderTop: 1,
          borderColor: 'divider',
          height: 24,
          userSelect: 'none',
          flexShrink: 0,
          fontSize: '0.65rem',
          color: 'text.secondary',
        }}
      >
        <Typography sx={{ fontSize: 'inherit', color: 'inherit' }}>
          Objects: {sceneGraph.root.children.length} | Selected: {selectedNodeData?.name ?? 'None'}
        </Typography>
      </Box>
    </Box>
  );
}
