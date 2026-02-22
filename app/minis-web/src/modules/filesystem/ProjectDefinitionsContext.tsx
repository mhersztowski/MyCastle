import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useMqtt } from '../mqttclient';
import { ProjectDefinitionNode } from './nodes/ProjectDefinitionNode';
import type { ProjectDefinitionModel } from './models/ProjectDefinitionModel';

const DEFINITIONS_PATH = 'definitions.json';

interface ProjectDefinitionsContextValue {
  definitions: ProjectDefinitionNode[];
  loading: boolean;
  error: string | null;
  connected: boolean;
  loadDefinitions: () => Promise<void>;
  saveDefinition: (model: ProjectDefinitionModel) => Promise<void>;
  deleteDefinition: (id: string) => Promise<void>;
  getDefinitionById: (id: string) => ProjectDefinitionNode | undefined;
  findDefinitions: (query: string) => ProjectDefinitionNode[];
}

const ProjectDefinitionsContext = createContext<ProjectDefinitionsContextValue | null>(null);

interface ProjectDefinitionsProviderProps {
  children: ReactNode;
}

export function ProjectDefinitionsProvider({ children }: ProjectDefinitionsProviderProps) {
  const { isConnected, readFile, writeFile } = useMqtt();
  const [definitions, setDefinitions] = useState<ProjectDefinitionNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadDefinitions = useCallback(async () => {
    if (!isConnected) return;

    setLoading(true);
    setError(null);

    try {
      const file = await readFile(DEFINITIONS_PATH);
      const data = JSON.parse(file.content || '{"definitions":[]}');
      const nodes = (data.definitions || []).map(
        (m: ProjectDefinitionModel) => ProjectDefinitionNode.fromModel(m)
      );
      setDefinitions(nodes);
      setLoaded(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load definitions';
      if (msg.includes('not found') || msg.includes('ENOENT') || msg.includes('no such file')) {
        setDefinitions([]);
        setLoaded(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [isConnected, readFile]);

  useEffect(() => {
    if (isConnected && !loaded) {
      loadDefinitions();
    }
  }, [isConnected, loaded, loadDefinitions]);

  const writeAll = useCallback(async (nodes: ProjectDefinitionNode[]) => {
    if (!isConnected) throw new Error('Not connected');

    const data = { definitions: nodes.map(n => n.toModel()) };
    await writeFile(DEFINITIONS_PATH, JSON.stringify(data, null, 2));
  }, [isConnected, writeFile]);

  const saveDefinition = useCallback(async (model: ProjectDefinitionModel) => {
    setLoading(true);
    setError(null);

    try {
      const existing = definitions.findIndex(d => d.id === model.id);
      let updated: ProjectDefinitionNode[];
      if (existing >= 0) {
        updated = definitions.map(d =>
          d.id === model.id ? ProjectDefinitionNode.fromModel(model) : d
        );
      } else {
        updated = [...definitions, ProjectDefinitionNode.fromModel(model)];
      }
      await writeAll(updated);
      setDefinitions(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save definition';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [definitions, writeAll]);

  const deleteDefinition = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const updated = definitions.filter(d => d.id !== id);
      await writeAll(updated);
      setDefinitions(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete definition';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [definitions, writeAll]);

  const getDefinitionById = useCallback((id: string) => {
    return definitions.find(d => d.id === id);
  }, [definitions]);

  const findDefinitions = useCallback((query: string) => {
    if (!query.trim()) return definitions;
    return definitions.filter(d => d.matches(query));
  }, [definitions]);

  return (
    <ProjectDefinitionsContext.Provider
      value={{
        definitions,
        loading,
        error,
        connected: isConnected,
        loadDefinitions,
        saveDefinition,
        deleteDefinition,
        getDefinitionById,
        findDefinitions,
      }}
    >
      {children}
    </ProjectDefinitionsContext.Provider>
  );
}

export function useProjectDefinitions() {
  const context = useContext(ProjectDefinitionsContext);
  if (!context) {
    throw new Error('useProjectDefinitions must be used within a ProjectDefinitionsProvider');
  }
  return context;
}

export default ProjectDefinitionsContext;
