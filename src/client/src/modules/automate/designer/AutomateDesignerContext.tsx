/**
 * Automate Designer Context - state management dla designera
 */

import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { AutomateFlowModel, createFlow } from '../models/AutomateFlowModel';
import { AutomateNodeModel, AutomateNodeType, createNode } from '../models/AutomateNodeModel';
import { AutomateEdgeModel } from '../models/AutomateEdgeModel';
import { NODE_TYPE_METADATA } from '../registry/nodeTypes';
import { AutomateEngine, ExecutionLog, ExecutionResult } from '../engine/AutomateEngine';
import { DataSource } from '../../filesystem/data/DataSource';
import { mqttClient } from '../../mqttclient';
import { v4 as uuidv4 } from 'uuid';

interface HistoryEntry {
  flow: AutomateFlowModel;
  description: string;
}

interface AutomateDesignerState {
  flow: AutomateFlowModel | null;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  isExecuting: boolean;
  executionLog: ExecutionLog[];
  executionResult: ExecutionResult | null;
  executingNodeIds: Set<string>;
  errorNodeIds: Set<string>;
}

interface AutomateDesignerActions {
  setFlow: (flow: AutomateFlowModel | null) => void;
  createNewFlow: (name: string) => void;

  addNode: (nodeType: AutomateNodeType, position: { x: number; y: number }) => AutomateNodeModel;
  updateNode: (nodeId: string, updates: Partial<AutomateNodeModel>) => void;
  deleteNode: (nodeId: string) => void;
  selectNode: (nodeId: string | null) => void;

  addEdge: (edge: AutomateEdgeModel) => void;
  deleteEdge: (edgeId: string) => void;
  selectEdge: (edgeId: string | null) => void;

  updateNodes: (nodes: AutomateNodeModel[]) => void;

  executeFlow: (dataSource: DataSource) => Promise<void>;
  stopExecution: () => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

interface AutomateDesignerContextType extends AutomateDesignerState, AutomateDesignerActions {}

const AutomateDesignerContext = createContext<AutomateDesignerContextType | null>(null);

interface AutomateDesignerProviderProps {
  children: ReactNode;
  initialFlow?: AutomateFlowModel | null;
  onChange?: (flow: AutomateFlowModel) => void;
}

export const AutomateDesignerProvider: React.FC<AutomateDesignerProviderProps> = ({
  children,
  initialFlow = null,
  onChange,
}) => {
  const [flow, setFlowState] = useState<AutomateFlowModel | null>(initialFlow);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionLog, setExecutionLog] = useState<ExecutionLog[]>([]);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [executingNodeIds, setExecutingNodeIds] = useState<Set<string>>(new Set());
  const [errorNodeIds, setErrorNodeIds] = useState<Set<string>>(new Set());

  const engineRef = useRef<AutomateEngine | null>(null);

  // Historia
  const historyRef = useRef<HistoryEntry[]>([]);
  const historyIndexRef = useRef(-1);
  const isUndoRedoRef = useRef(false);

  const saveToHistory = useCallback((newFlow: AutomateFlowModel, description: string) => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push({ flow: JSON.parse(JSON.stringify(newFlow)), description });
    historyIndexRef.current = historyRef.current.length - 1;
    if (historyRef.current.length > 50) {
      historyRef.current = historyRef.current.slice(-50);
      historyIndexRef.current = historyRef.current.length - 1;
    }
  }, []);

  const updateFlow = useCallback((newFlow: AutomateFlowModel, description: string = 'Update') => {
    saveToHistory(newFlow, description);
    setFlowState(newFlow);
    onChange?.(newFlow);
  }, [onChange, saveToHistory]);

  // === FLOW ===

  const setFlow = useCallback((newFlow: AutomateFlowModel | null) => {
    setFlowState(newFlow);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    if (newFlow) {
      historyRef.current = [{ flow: JSON.parse(JSON.stringify(newFlow)), description: 'Initial' }];
      historyIndexRef.current = 0;
    }
  }, []);

  const createNewFlow = useCallback((name: string) => {
    const newFlow = createFlow(uuidv4(), name);
    setFlow(newFlow);
  }, [setFlow]);

  // === NODES ===

  const addNode = useCallback((nodeType: AutomateNodeType, position: { x: number; y: number }): AutomateNodeModel => {
    const meta = NODE_TYPE_METADATA[nodeType];
    const newNode = createNode(
      uuidv4(),
      nodeType,
      meta.label,
      position,
      meta.defaultInputs.map(p => ({ ...p })),
      meta.defaultOutputs.map(p => ({ ...p })),
      { ...meta.defaultConfig },
    );

    if (meta.hasScript) {
      newNode.script = '';
    }

    if (flow) {
      const newFlow = { ...flow, nodes: [...flow.nodes, newNode] };
      updateFlow(newFlow, `Add ${meta.label}`);
    }

    return newNode;
  }, [flow, updateFlow]);

  const updateNode = useCallback((nodeId: string, updates: Partial<AutomateNodeModel>) => {
    if (!flow) return;
    const newNodes = flow.nodes.map(n => n.id === nodeId ? { ...n, ...updates } : n);
    updateFlow({ ...flow, nodes: newNodes }, 'Update node');
  }, [flow, updateFlow]);

  const deleteNode = useCallback((nodeId: string) => {
    if (!flow) return;
    const newNodes = flow.nodes.filter(n => n.id !== nodeId);
    const newEdges = flow.edges.filter(e => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId);
    updateFlow({ ...flow, nodes: newNodes, edges: newEdges }, 'Delete node');
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  }, [flow, selectedNodeId, updateFlow]);

  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
    if (nodeId) setSelectedEdgeId(null);
  }, []);

  const updateNodes = useCallback((nodes: AutomateNodeModel[]) => {
    if (!flow) return;
    // Aktualizuj pozycje nodów bez dodawania do historii (drag)
    setFlowState({ ...flow, nodes });
    onChange?.({ ...flow, nodes });
  }, [flow, onChange]);

  // === EDGES ===

  const addEdge = useCallback((edge: AutomateEdgeModel) => {
    if (!flow) return;
    updateFlow({ ...flow, edges: [...flow.edges, edge] }, 'Add edge');
  }, [flow, updateFlow]);

  const deleteEdge = useCallback((edgeId: string) => {
    if (!flow) return;
    const newEdges = flow.edges.filter(e => e.id !== edgeId);
    updateFlow({ ...flow, edges: newEdges }, 'Delete edge');
    if (selectedEdgeId === edgeId) setSelectedEdgeId(null);
  }, [flow, selectedEdgeId, updateFlow]);

  const selectEdge = useCallback((edgeId: string | null) => {
    setSelectedEdgeId(edgeId);
    if (edgeId) setSelectedNodeId(null);
  }, []);

  // === EXECUTION ===

  const executeFlow = useCallback(async (dataSource: DataSource) => {
    if (!flow || isExecuting) return;

    setIsExecuting(true);
    setExecutionLog([]);
    setExecutionResult(null);
    setExecutingNodeIds(new Set());
    setErrorNodeIds(new Set());

    if (flow.runtime === 'backend' || flow.runtime === 'universal') {
      // Remote execution on backend via MQTT
      try {
        const result = await mqttClient.runAutomateFlow(flow.id) as ExecutionResult;
        setExecutionResult(result);
        if (result.executionLog) {
          setExecutionLog(result.executionLog);
        }
        if (!result.success) {
          // Mark error nodes from execution log
          const errorIds = new Set<string>();
          for (const entry of result.executionLog || []) {
            if (entry.status === 'error') {
              errorIds.add(entry.nodeId);
            }
          }
          setErrorNodeIds(errorIds);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setExecutionResult({
          success: false,
          executionLog: [],
          logs: [],
          notifications: [],
          variables: {},
          error: errorMsg,
        });
      }
      setIsExecuting(false);
      return;
    }

    // Local execution (client / universal)
    const engine = new AutomateEngine();
    engineRef.current = engine;

    engine.onNodeStart = (nodeId: string) => {
      setExecutingNodeIds(prev => new Set(prev).add(nodeId));
    };

    engine.onNodeComplete = (nodeId: string) => {
      setExecutingNodeIds(prev => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    };

    engine.onNodeError = (nodeId: string) => {
      setExecutingNodeIds(prev => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
      setErrorNodeIds(prev => new Set(prev).add(nodeId));
    };

    engine.onLog = (entry: ExecutionLog) => {
      setExecutionLog(prev => {
        const existing = prev.findIndex(e => e.nodeId === entry.nodeId && e.startTime === entry.startTime);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = entry;
          return updated;
        }
        return [...prev, entry];
      });
    };

    const result = await engine.executeFlow(flow, dataSource);
    setExecutionResult(result);
    setIsExecuting(false);
    setExecutingNodeIds(new Set());
    engineRef.current = null;
  }, [flow, isExecuting]);

  const stopExecution = useCallback(() => {
    engineRef.current?.abort();
    setIsExecuting(false);
    setExecutingNodeIds(new Set());
  }, []);

  // === HISTORY ===

  const canUndo = useCallback(() => historyIndexRef.current > 0, []);
  const canRedo = useCallback(() => historyIndexRef.current < historyRef.current.length - 1, []);

  const undo = useCallback(() => {
    if (!canUndo()) return;
    isUndoRedoRef.current = true;
    historyIndexRef.current--;
    const entry = historyRef.current[historyIndexRef.current];
    const restored = JSON.parse(JSON.stringify(entry.flow));
    setFlowState(restored);
    onChange?.(restored);
  }, [canUndo, onChange]);

  const redo = useCallback(() => {
    if (!canRedo()) return;
    isUndoRedoRef.current = true;
    historyIndexRef.current++;
    const entry = historyRef.current[historyIndexRef.current];
    const restored = JSON.parse(JSON.stringify(entry.flow));
    setFlowState(restored);
    onChange?.(restored);
  }, [canRedo, onChange]);

  const value: AutomateDesignerContextType = {
    flow,
    selectedNodeId,
    selectedEdgeId,
    isExecuting,
    executionLog,
    executionResult,
    executingNodeIds,
    errorNodeIds,
    setFlow,
    createNewFlow,
    addNode,
    updateNode,
    deleteNode,
    selectNode,
    addEdge,
    deleteEdge,
    selectEdge,
    updateNodes,
    executeFlow,
    stopExecution,
    undo,
    redo,
    canUndo,
    canRedo,
  };

  return (
    <AutomateDesignerContext.Provider value={value}>
      {children}
    </AutomateDesignerContext.Provider>
  );
};

export const useAutomateDesigner = () => {
  const context = useContext(AutomateDesignerContext);
  if (!context) {
    throw new Error('useAutomateDesigner must be used within AutomateDesignerProvider');
  }
  return context;
};

export default AutomateDesignerContext;
