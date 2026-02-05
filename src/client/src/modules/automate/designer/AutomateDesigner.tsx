/**
 * AutomateDesigner - główny komponent designera automatyzacji
 */

import React, { useCallback, useRef, useMemo, useEffect, useState } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  Connection,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Box, Typography, List, ListItem, ListItemText, Chip } from '@mui/material';
import { v4 as uuidv4 } from 'uuid';
import { AutomateBaseNode } from './components';
import AutomateDesignerToolbox from './AutomateDesignerToolbox';
import AutomateDesignerProperties from './AutomateDesignerProperties';
import AutomateDesignerToolbar from './AutomateDesignerToolbar';
import { useAutomateDesigner } from './AutomateDesignerContext';
import { AutomateFlowModel, AutomateNodeType } from '../models';
import { DataSource } from '../../filesystem/data/DataSource';

const nodeTypes = {
  automateNode: AutomateBaseNode,
};

// Konwertuj model nodów na ReactFlow nodes
function flowToReactFlowNodes(flow: AutomateFlowModel | null, executingIds: Set<string>, errorIds: Set<string>): Node[] {
  if (!flow) return [];
  return flow.nodes.map(node => ({
    id: node.id,
    type: 'automateNode',
    position: node.position,
    data: {
      ...node,
      isExecuting: executingIds.has(node.id),
      hasError: errorIds.has(node.id),
    },
  }));
}

// Konwertuj model krawędzi na ReactFlow edges
function flowToReactFlowEdges(flow: AutomateFlowModel | null): Edge[] {
  if (!flow) return [];
  return flow.edges.map(edge => ({
    id: edge.id,
    source: edge.sourceNodeId,
    sourceHandle: edge.sourcePortId,
    target: edge.targetNodeId,
    targetHandle: edge.targetPortId,
    label: edge.label,
    animated: false,
    style: edge.disabled ? { stroke: '#bdbdbd', strokeDasharray: '5 5' } : undefined,
  }));
}

interface AutomateDesignerInnerProps {
  onSave: (flow: AutomateFlowModel) => void;
  saving?: boolean;
  dataSource: DataSource;
}

const AutomateDesignerInner: React.FC<AutomateDesignerInnerProps> = ({ onSave, saving, dataSource }) => {
  const {
    flow,
    selectedNodeId,
    executingNodeIds,
    errorNodeIds,
    executionLog,
    executionResult,
    addNode,
    deleteNode,
    selectNode,
    selectEdge,
    addEdge: addFlowEdge,
    deleteEdge,
    updateNodes,
    executeFlow,
  } = useAutomateDesigner();

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow();
  const [showLog, setShowLog] = useState(false);

  const rfNodes = useMemo(() => flowToReactFlowNodes(flow, executingNodeIds, errorNodeIds), [flow, executingNodeIds, errorNodeIds]);
  const rfEdges = useMemo(() => flowToReactFlowEdges(flow), [flow]);

  // Obsługa zmian nodów (przesuwanie)
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    if (!flow) return;

    // Obsłuż select
    for (const change of changes) {
      if (change.type === 'select') {
        if (change.selected) {
          selectNode(change.id);
        }
      }
      if (change.type === 'remove') {
        deleteNode(change.id);
        return;
      }
    }

    // Obsłuż position
    const positionChanges = changes.filter(c => c.type === 'position' && c.position);
    if (positionChanges.length > 0) {
      const updatedNodes = flow.nodes.map(node => {
        const posChange = positionChanges.find(c => c.type === 'position' && c.id === node.id);
        if (posChange && posChange.type === 'position' && posChange.position) {
          return { ...node, position: posChange.position };
        }
        return node;
      });
      updateNodes(updatedNodes);
    }
  }, [flow, selectNode, deleteNode, updateNodes]);

  // Obsługa zmian krawędzi
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    for (const change of changes) {
      if (change.type === 'remove') {
        deleteEdge(change.id);
      }
      if (change.type === 'select') {
        if (change.selected) {
          selectEdge(change.id);
        }
      }
    }
  }, [deleteEdge, selectEdge]);

  // Nowe połączenie
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    addFlowEdge({
      type: 'automate_edge',
      id: uuidv4(),
      sourceNodeId: connection.source,
      sourcePortId: connection.sourceHandle || 'out',
      targetNodeId: connection.target,
      targetPortId: connection.targetHandle || 'in',
    });
  }, [addFlowEdge]);

  // Kliknięcie na puste pole
  const onPaneClick = useCallback(() => {
    selectNode(null);
    selectEdge(null);
  }, [selectNode, selectEdge]);

  // Drop noda z toolboxu
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();

    const nodeType = event.dataTransfer.getData('application/automate-node-type') as AutomateNodeType;
    if (!nodeType) return;

    const position = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    addNode(nodeType, position);
  }, [screenToFlowPosition, addNode]);

  const handleDragStart = useCallback((_nodeType: AutomateNodeType, _event: React.DragEvent) => {
    // Opcjonalny callback
  }, []);

  // Save
  const handleSave = useCallback(() => {
    if (flow) {
      onSave({ ...flow, updatedAt: new Date().toISOString() });
    }
  }, [flow, onSave]);

  // Run
  const handleRun = useCallback(() => {
    setShowLog(true);
    executeFlow(dataSource);
  }, [executeFlow, dataSource]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') {
          e.preventDefault();
          handleSave();
        }
      }
      if (e.key === 'Delete' && selectedNodeId) {
        deleteNode(selectedNodeId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, selectedNodeId, deleteNode]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <AutomateDesignerToolbar
        onSave={handleSave}
        onRun={handleRun}
        onZoomIn={() => zoomIn()}
        onZoomOut={() => zoomOut()}
        onFitView={() => fitView()}
        saving={saving}
      />

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <AutomateDesignerToolbox onDragStart={handleDragStart} />

        <Box ref={reactFlowWrapper} sx={{ flex: 1 }}>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onPaneClick={onPaneClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[16, 16]}
            deleteKeyCode="Delete"
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls showInteractive={false} />
            <MiniMap
              nodeStrokeWidth={2}
              pannable
              zoomable
              style={{ width: 120, height: 80 }}
            />
          </ReactFlow>
        </Box>

        <AutomateDesignerProperties />
      </Box>

      {/* Execution Log */}
      {showLog && (
        <Box
          sx={{
            height: 150,
            borderTop: '1px solid',
            borderColor: 'divider',
            overflow: 'auto',
            bgcolor: 'background.paper',
          }}
        >
          <Box
            sx={{
              px: 1,
              py: 0.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: 'grey.50',
            }}
          >
            <Typography variant="caption" fontWeight={600}>
              Log wykonania
              {executionResult && (
                <Chip
                  label={executionResult.success ? 'OK' : 'Error'}
                  size="small"
                  color={executionResult.success ? 'success' : 'error'}
                  sx={{ ml: 1, height: 18, fontSize: '0.65rem' }}
                />
              )}
            </Typography>
            <Typography
              variant="caption"
              color="primary"
              sx={{ cursor: 'pointer' }}
              onClick={() => setShowLog(false)}
            >
              Zamknij
            </Typography>
          </Box>
          <List dense disablePadding>
            {executionLog.map((entry, i) => (
              <ListItem key={`${entry.nodeId}-${i}`} sx={{ py: 0 }}>
                <ListItemText
                  primary={
                    <Typography variant="caption" component="span">
                      <Chip
                        label={entry.status}
                        size="small"
                        color={
                          entry.status === 'completed' ? 'success' :
                          entry.status === 'error' ? 'error' :
                          entry.status === 'running' ? 'info' : 'default'
                        }
                        sx={{ mr: 0.5, height: 16, fontSize: '0.6rem' }}
                      />
                      {entry.nodeName} ({entry.nodeType})
                      {entry.endTime && (
                        <span style={{ color: '#999', marginLeft: 4 }}>
                          {entry.endTime - entry.startTime}ms
                        </span>
                      )}
                      {entry.error && (
                        <span style={{ color: '#f44336', marginLeft: 4 }}>
                          {entry.error}
                        </span>
                      )}
                    </Typography>
                  }
                />
              </ListItem>
            ))}
            {executionResult?.logs.map((log, i) => (
              <ListItem key={`log-${i}`} sx={{ py: 0 }}>
                <ListItemText
                  primary={
                    <Typography variant="caption" component="span" sx={{ fontFamily: 'monospace' }}>
                      [{log.level}] {log.message}
                    </Typography>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Box>
  );
};

// Wrapper z ReactFlowProvider
interface AutomateDesignerProps {
  initialFlow: AutomateFlowModel;
  onChange?: (flow: AutomateFlowModel) => void;
  onSave: (flow: AutomateFlowModel) => void;
  saving?: boolean;
  dataSource: DataSource;
}

export const AutomateDesigner: React.FC<AutomateDesignerProps> = ({
  onSave,
  saving,
  dataSource,
}) => {
  return (
    <ReactFlowProvider>
      <AutomateDesignerInner onSave={onSave} saving={saving} dataSource={dataSource} />
    </ReactFlowProvider>
  );
};

export default AutomateDesigner;
