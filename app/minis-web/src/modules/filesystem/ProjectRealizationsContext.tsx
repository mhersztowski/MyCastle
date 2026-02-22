import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { useMqtt } from '../mqttclient';
import { ProjectRealizationNode } from './nodes/ProjectRealizationNode';
import { ProjectDefinitionNode } from './nodes/ProjectDefinitionNode';
import type { ProjectRealizationModel } from './models/ProjectRealizationModel';
import { useProjectDefinitions } from './ProjectDefinitionsContext';

const REALIZATIONS_PATH = 'realizations.json';

function generateId(): string {
  return `realization_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

interface ProjectRealizationsContextValue {
  realizations: ProjectRealizationNode[];
  loading: boolean;
  error: string | null;
  connected: boolean;
  loadRealizations: () => Promise<void>;
  saveRealization: (model: ProjectRealizationModel) => Promise<void>;
  deleteRealization: (id: string) => Promise<void>;
  getRealizationById: (id: string) => ProjectRealizationNode | undefined;
  findRealizations: (query: string) => ProjectRealizationNode[];
  createRealizationFromDefinition: (definition: ProjectDefinitionNode) => Promise<ProjectRealizationNode>;
}

const ProjectRealizationsContext = createContext<ProjectRealizationsContextValue | null>(null);

interface ProjectRealizationsProviderProps {
  children: ReactNode;
}

export function ProjectRealizationsProvider({ children }: ProjectRealizationsProviderProps) {
  const { isConnected, readFile, writeFile } = useMqtt();
  const { definitions } = useProjectDefinitions();
  const [realizations, setRealizations] = useState<ProjectRealizationNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const linkedDefsRef = useRef<string>('');

  const linkDefinitions = useCallback((nodes: ProjectRealizationNode[], defs: ProjectDefinitionNode[]) => {
    for (const node of nodes) {
      const def = defs.find(d => d.id === node.definitionId);
      if (def) {
        node.setDefinitionRef(def);
      }
    }
  }, []);

  const loadRealizations = useCallback(async () => {
    if (!isConnected) return;

    setLoading(true);
    setError(null);

    try {
      const file = await readFile(REALIZATIONS_PATH);
      const data = JSON.parse(file.content || '{"realizations":[]}');
      const nodes = (data.realizations || []).map(
        (m: ProjectRealizationModel) => ProjectRealizationNode.fromModel(m)
      );
      linkDefinitions(nodes, definitions);
      setRealizations(nodes);
      setLoaded(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load realizations';
      if (msg.includes('not found') || msg.includes('ENOENT') || msg.includes('no such file')) {
        setRealizations([]);
        setLoaded(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [isConnected, readFile, definitions, linkDefinitions]);

  useEffect(() => {
    if (isConnected && !loaded) {
      loadRealizations();
    }
  }, [isConnected, loaded, loadRealizations]);

  // Re-link definition refs when definitions change
  useEffect(() => {
    const defIds = definitions.map(d => d.id).sort().join(',');
    if (defIds && defIds !== linkedDefsRef.current && realizations.length > 0) {
      linkDefinitions(realizations, definitions);
      linkedDefsRef.current = defIds;
      setRealizations([...realizations]);
    }
  }, [definitions, realizations, linkDefinitions]);

  const writeAll = useCallback(async (nodes: ProjectRealizationNode[]) => {
    if (!isConnected) throw new Error('Not connected');

    const data = { realizations: nodes.map(n => n.toModel()) };
    await writeFile(REALIZATIONS_PATH, JSON.stringify(data, null, 2));
  }, [isConnected, writeFile]);

  const saveRealization = useCallback(async (model: ProjectRealizationModel) => {
    setLoading(true);
    setError(null);

    try {
      const existing = realizations.findIndex(r => r.id === model.id);
      let updated: ProjectRealizationNode[];
      const node = ProjectRealizationNode.fromModel(model);
      const def = definitions.find(d => d.id === model.definitionId);
      if (def) node.setDefinitionRef(def);

      if (existing >= 0) {
        updated = realizations.map(r => r.id === model.id ? node : r);
      } else {
        updated = [...realizations, node];
      }
      await writeAll(updated);
      setRealizations(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save realization';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [realizations, definitions, writeAll]);

  const deleteRealization = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const updated = realizations.filter(r => r.id !== id);
      await writeAll(updated);
      setRealizations(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete realization';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [realizations, writeAll]);

  const getRealizationById = useCallback((id: string) => {
    return realizations.find(r => r.id === id);
  }, [realizations]);

  const findRealizations = useCallback((query: string) => {
    if (!query.trim()) return realizations;
    return realizations.filter(r => r.matches(query));
  }, [realizations]);

  const createRealizationFromDefinition = useCallback(async (definition: ProjectDefinitionNode): Promise<ProjectRealizationNode> => {
    const allTasks = definition.getAllTasks();
    const now = new Date().toISOString();
    const model: ProjectRealizationModel = {
      id: generateId(),
      definitionId: definition.id,
      status: 'pending',
      taskRealizations: allTasks.map(task => ({
        taskId: task.id,
        status: 'pending' as const,
      })),
      created: now,
      modified: now,
    };

    await saveRealization(model);

    const node = ProjectRealizationNode.fromModel(model);
    node.setDefinitionRef(definition);
    return node;
  }, [saveRealization]);

  return (
    <ProjectRealizationsContext.Provider
      value={{
        realizations,
        loading,
        error,
        connected: isConnected,
        loadRealizations,
        saveRealization,
        deleteRealization,
        getRealizationById,
        findRealizations,
        createRealizationFromDefinition,
      }}
    >
      {children}
    </ProjectRealizationsContext.Provider>
  );
}

export function useProjectRealizations() {
  const context = useContext(ProjectRealizationsContext);
  if (!context) {
    throw new Error('useProjectRealizations must be used within a ProjectRealizationsProvider');
  }
  return context;
}

export default ProjectRealizationsContext;
