/**
 * AutomateDesigner - główny komponent designera automatyzacji
 * Responsywny: desktop (3-panel layout) / mobile (fullscreen canvas + bottom drawers)
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
  applyNodeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Box, Typography, List, ListItem, ListItemText, Chip, Fab, Paper, IconButton, useMediaQuery, useTheme } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CloseIcon from '@mui/icons-material/Close';
import { v4 as uuidv4 } from 'uuid';
import { AutomateBaseNode } from './components';
import AutomateDesignerToolbox from './AutomateDesignerToolbox';
import AutomateDesignerProperties from './AutomateDesignerProperties';
import AutomateDesignerToolbar from './AutomateDesignerToolbar';
import {
  AutomateMobileToolbar,
  AutomateMobileToolbox,
  AutomateMobileProperties,
  AutomateMobileLog,
} from './mobile';
import { useAutomateDesigner } from './AutomateDesignerContext';
import { AutomateFlowModel, AutomateNodeType } from '@mhersztowski/core';
import { DataSource } from '../../filesystem/data/DataSource';
import { useNotification } from '../../notification';

const nodeTypes = {
  automateNode: AutomateBaseNode,
};

type MobileDrawer = 'none' | 'toolbox' | 'properties' | 'log';

// Konwertuj model nodów na ReactFlow nodes
function flowToReactFlowNodes(
  flow: AutomateFlowModel | null,
  executingIds: Set<string>,
  errorIds: Set<string>,
  isMobile: boolean,
): Node[] {
  if (!flow) return [];
  return flow.nodes.map(node => ({
    id: node.id,
    type: 'automateNode',
    position: node.position,
    data: {
      ...node,
      isExecuting: executingIds.has(node.id),
      hasError: errorIds.has(node.id),
      isMobile,
    },
  }));
}

// Konwertuj model krawędzi na ReactFlow edges
function flowToReactFlowEdges(flow: AutomateFlowModel | null, selectedEdgeId?: string | null, isMobile?: boolean): Edge[] {
  if (!flow) return [];
  return flow.edges.map(edge => {
    const isSelected = edge.id === selectedEdgeId;
    let style: React.CSSProperties | undefined;
    if (edge.disabled) {
      style = { stroke: '#bdbdbd', strokeDasharray: '5 5' };
    } else if (isSelected) {
      style = { stroke: '#1976d2', strokeWidth: 3 };
    }
    return {
      id: edge.id,
      source: edge.sourceNodeId,
      sourceHandle: edge.sourcePortId,
      target: edge.targetNodeId,
      targetHandle: edge.targetPortId,
      label: edge.label,
      animated: false,
      style,
      selected: isSelected, // Required for ReactFlow delete key to work
      // Wider touch target on mobile for easier edge selection
      interactionWidth: isMobile ? 30 : undefined,
    };
  });
}

interface AutomateDesignerInnerProps {
  onSave: (flow: AutomateFlowModel) => void;
  saving?: boolean;
  dataSource: DataSource;
}

const AutomateDesignerInner: React.FC<AutomateDesignerInnerProps> = ({ onSave, saving, dataSource }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const {
    flow,
    selectedNodeId,
    selectedEdgeId,
    isExecuting,
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
    executeFromNode,
  } = useAutomateDesigner();

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, zoomIn, zoomOut, fitView, setNodes } = useReactFlow();
  const [showLog, setShowLog] = useState(false);
  const { notify } = useNotification();

  // Mobile drawer state
  const [activeDrawer, setActiveDrawer] = useState<MobileDrawer>('none');
  const isDraggingRef = useRef(false);
  const propsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialFitDoneRef = useRef(false);

  // Derive RF nodes from model
  const rfNodesMemo = useMemo(
    () => flowToReactFlowNodes(flow, executingNodeIds, errorNodeIds, isMobile),
    [flow, executingNodeIds, errorNodeIds, isMobile],
  );
  const rfEdges = useMemo(() => flowToReactFlowEdges(flow, selectedEdgeId, isMobile), [flow, isMobile, selectedEdgeId]);

  // Mobile: separate RF nodes state - managed by applyNodeChanges, synced to model on drag end
  const [mobileRfNodes, setMobileRfNodes] = useState<Node[]>([]);

  // Force sync nodes to ReactFlow internal state when model changes
  // This ensures ReactFlow sees changes to node data (like outputs for switch node)
  useEffect(() => {
    if (isMobile) {
      if (!isDraggingRef.current) {
        const newNodes = flowToReactFlowNodes(flow, executingNodeIds, errorNodeIds, true);
        setMobileRfNodes(newNodes);
        setNodes(newNodes);
      }
    } else {
      setNodes(rfNodesMemo);
    }
  }, [isMobile, flow, executingNodeIds, errorNodeIds, rfNodesMemo, setNodes]);

  // Use appropriate nodes for current mode
  const rfNodes = isMobile ? mobileRfNodes : rfNodesMemo;

  // Mobile: fitView only once on mount
  useEffect(() => {
    if (isMobile && !initialFitDoneRef.current && flow && flow.nodes.length > 0) {
      initialFitDoneRef.current = true;
      setTimeout(() => fitView(), 100);
    }
  }, [isMobile, flow, fitView]);

  // Auto-open properties drawer on mobile when a node is selected (debounced)
  useEffect(() => {
    if (propsTimerRef.current) {
      clearTimeout(propsTimerRef.current);
      propsTimerRef.current = null;
    }

    if (isMobile && selectedNodeId) {
      propsTimerRef.current = setTimeout(() => {
        if (!isDraggingRef.current) {
          setActiveDrawer('properties');
        }
        propsTimerRef.current = null;
      }, 400);
    }

    return () => {
      if (propsTimerRef.current) {
        clearTimeout(propsTimerRef.current);
        propsTimerRef.current = null;
      }
    };
  }, [isMobile, selectedNodeId]);

  // Auto-open log drawer on mobile when execution starts
  useEffect(() => {
    if (isMobile && isExecuting) {
      setActiveDrawer('log');
    }
  }, [isMobile, isExecuting]);

  // Process notifications from executionResult - track by timestamp to avoid duplicates
  const processedTimestampsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (executionResult?.notifications && executionResult.notifications.length > 0) {
      for (const n of executionResult.notifications) {
        if (!processedTimestampsRef.current.has(n.timestamp)) {
          processedTimestampsRef.current.add(n.timestamp);
          notify(n.message, n.severity || 'info');
        }
      }
    }
  }, [executionResult, notify]);

  // Reset processed timestamps when execution starts
  useEffect(() => {
    if (isExecuting) {
      processedTimestampsRef.current = new Set();
    }
  }, [isExecuting]);

  // Obsługa zmian nodów - MOBILE: use applyNodeChanges for smooth drag
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    if (!flow) return;

    // Handle select
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

    if (isMobile) {
      // Mobile: let ReactFlow handle position via applyNodeChanges (smooth drag)
      setMobileRfNodes(nds => applyNodeChanges(changes, nds));

      // Track drag state
      const hasDragStart = changes.some(c => c.type === 'position' && c.dragging === true);
      const hasDragEnd = changes.some(c => c.type === 'position' && c.dragging === false);

      if (hasDragStart) {
        isDraggingRef.current = true;
        if (propsTimerRef.current) {
          clearTimeout(propsTimerRef.current);
          propsTimerRef.current = null;
        }
      }

      if (hasDragEnd) {
        isDraggingRef.current = false;
        // Sync final positions back to model
        setMobileRfNodes(currentNodes => {
          const updatedModelNodes = flow.nodes.map(node => {
            const rfNode = currentNodes.find(n => n.id === node.id);
            if (rfNode && rfNode.position) {
              return { ...node, position: rfNode.position };
            }
            return node;
          });
          updateNodes(updatedModelNodes);
          return currentNodes;
        });
      }
    } else {
      // Desktop: update model directly (original behavior)
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
    }
  }, [flow, selectNode, deleteNode, updateNodes, isMobile]);

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

  // Double-click on trigger nodes to run flow
  const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    const nodeType = (node.data as { nodeType?: string })?.nodeType;
    if (nodeType === 'start') {
      // Start node: execute entire flow from all start nodes
      if (isMobile) {
        setActiveDrawer('log');
      } else {
        setShowLog(true);
      }
      executeFlow(dataSource);
    } else if (nodeType === 'manual_trigger') {
      // Manual trigger: execute flow starting from this specific node
      if (isMobile) {
        setActiveDrawer('log');
      } else {
        setShowLog(true);
      }
      executeFromNode(dataSource, node.id);
    }
  }, [executeFlow, executeFromNode, dataSource, isMobile]);

  // Drop noda z toolboxu (desktop only)
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

  // Mobile: tap-to-add node at viewport center
  const handleMobileAddNode = useCallback((nodeType: AutomateNodeType) => {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const position = screenToFlowPosition({ x: centerX, y: centerY });
    // Random offset to avoid stacking
    position.x += (Math.random() - 0.5) * 50;
    position.y += (Math.random() - 0.5) * 50;
    const newNode = addNode(nodeType, position);
    selectNode(newNode.id);
  }, [screenToFlowPosition, addNode, selectNode]);

  // Save
  const handleSave = useCallback(() => {
    if (flow) {
      onSave({ ...flow, updatedAt: new Date().toISOString() });
    }
  }, [flow, onSave]);

  // Run
  const handleRun = useCallback(() => {
    if (isMobile) {
      setActiveDrawer('log');
    } else {
      setShowLog(true);
    }
    executeFlow(dataSource);
  }, [executeFlow, dataSource, isMobile]);

  // Keyboard shortcuts (desktop)
  useEffect(() => {
    if (isMobile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in an input field
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') {
          e.preventDefault();
          handleSave();
        }
      }
      // Only delete nodes/edges if not typing in an input field
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInputField && selectedNodeId) {
        deleteNode(selectedNodeId);
      }
      // Edge deletion - also handle in custom handler for reliability
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInputField && selectedEdgeId && !selectedNodeId) {
        deleteEdge(selectedEdgeId);
        selectEdge(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, selectedNodeId, selectedEdgeId, deleteNode, deleteEdge, selectEdge, isMobile]);

  // === MOBILE LAYOUT ===
  if (isMobile) {
    return (
      <>
        <Box ref={reactFlowWrapper} sx={{ height: '100%' }}>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onPaneClick={onPaneClick}
            onNodeDoubleClick={onNodeDoubleClick}
            nodeTypes={nodeTypes}
            snapToGrid
            snapGrid={[16, 16]}
            minZoom={0.1}
            maxZoom={2}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          </ReactFlow>
        </Box>

        {/* Floating toolbar - fixed position, independent of ReactFlow */}
        <Box sx={{ position: 'fixed', top: 56, right: 8, zIndex: 1100 }}>
          <AutomateMobileToolbar
            onSave={handleSave}
            onRun={handleRun}
            onZoomIn={() => zoomIn()}
            onZoomOut={() => zoomOut()}
            onFitView={() => fitView()}
            onToggleLog={() => setActiveDrawer(activeDrawer === 'log' ? 'none' : 'log')}
            saving={saving}
          />
        </Box>

        {/* Edge delete action bar - visible when edge is selected */}
        {selectedEdgeId && (
          <Paper
            elevation={3}
            sx={{
              position: 'fixed',
              bottom: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1100,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1.5,
              py: 0.5,
              borderRadius: 2,
            }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
              Połączenie
            </Typography>
            <IconButton
              size="small"
              color="error"
              onClick={() => { deleteEdge(selectedEdgeId); selectEdge(null); }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => selectEdge(null)}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Paper>
        )}

        {/* FAB - add node - fixed position */}
        <Fab
          color="primary"
          size="medium"
          sx={{ position: 'fixed', bottom: 24, right: 16, zIndex: 1100 }}
          onClick={() => setActiveDrawer('toolbox')}
        >
          <AddIcon />
        </Fab>

        {/* Bottom drawers (one at a time) */}
        <AutomateMobileToolbox
          open={activeDrawer === 'toolbox'}
          onClose={() => setActiveDrawer('none')}
          onAddNode={handleMobileAddNode}
        />
        <AutomateMobileProperties
          open={activeDrawer === 'properties'}
          onClose={() => setActiveDrawer('none')}
        />
        <AutomateMobileLog
          open={activeDrawer === 'log'}
          onClose={() => setActiveDrawer('none')}
        />
      </>
    );
  }

  // === DESKTOP LAYOUT ===
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
            onNodeDoubleClick={onNodeDoubleClick}
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
