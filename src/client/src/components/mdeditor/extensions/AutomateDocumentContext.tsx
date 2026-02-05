/**
 * AutomateDocumentContext - wspoldzielony kontekst wykonawczy
 * dla blokow skryptowych w dokumencie Markdown
 */

import React, { createContext, useContext, useRef, useState, useCallback } from 'react';
import { AutomateSystemApi, LogEntry } from '../../../modules/automate/engine/AutomateSystemApi';
import { AutomateSandbox } from '../../../modules/automate/engine/AutomateSandbox';
import { useFilesystem } from '../../../modules/filesystem/FilesystemContext';

// Typy danych wyjsciowych display
export interface DisplayItem {
  type: 'text' | 'table' | 'list' | 'json';
  data: unknown;
  timestamp: number;
}

export interface DisplayApi {
  text: (str: string) => void;
  table: (data: Record<string, unknown>[] | unknown[][]) => void;
  list: (items: unknown[]) => void;
  json: (obj: unknown) => void;
}

export interface ScriptBlockState {
  id: string;
  code: string;
  output: DisplayItem[];
  logs: LogEntry[];
  status: 'idle' | 'running' | 'completed' | 'error';
  error?: string;
  result?: unknown;
}

export interface AutomateDocumentContextValue {
  variables: Record<string, unknown>;
  blocks: Map<string, ScriptBlockState>;

  registerBlock: (id: string) => void;
  unregisterBlock: (id: string) => void;
  updateBlockCode: (id: string, code: string) => void;

  runBlock: (id: string) => Promise<void>;
  runAllBlocks: () => Promise<void>;
  isRunningAll: boolean;

  getBlockState: (id: string) => ScriptBlockState | undefined;
  clearBlockOutput: (id: string) => void;
}

const AutomateDocumentContext = createContext<AutomateDocumentContextValue | null>(null);

export const useAutomateDocument = (): AutomateDocumentContextValue => {
  const context = useContext(AutomateDocumentContext);
  if (!context) {
    throw new Error('useAutomateDocument must be used within AutomateDocumentProvider');
  }
  return context;
};

interface AutomateDocumentProviderProps {
  children: React.ReactNode;
}

export const AutomateDocumentProvider: React.FC<AutomateDocumentProviderProps> = ({ children }) => {
  const { dataSource } = useFilesystem();
  const variablesRef = useRef<Record<string, unknown>>({});
  const [blocks, setBlocks] = useState<Map<string, ScriptBlockState>>(new Map());
  const blockOrderRef = useRef<string[]>([]);
  const [isRunningAll, setIsRunningAll] = useState(false);
  const apiRef = useRef<AutomateSystemApi | null>(null);

  const getOrCreateApi = useCallback(() => {
    if (!apiRef.current) {
      apiRef.current = new AutomateSystemApi(dataSource, variablesRef.current);
    }
    return apiRef.current;
  }, [dataSource]);

  const registerBlock = useCallback((id: string) => {
    setBlocks(prev => {
      const next = new Map(prev);
      if (!next.has(id)) {
        next.set(id, {
          id,
          code: '',
          output: [],
          logs: [],
          status: 'idle',
        });
      }
      return next;
    });
    if (!blockOrderRef.current.includes(id)) {
      blockOrderRef.current.push(id);
    }
  }, []);

  const unregisterBlock = useCallback((id: string) => {
    setBlocks(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    blockOrderRef.current = blockOrderRef.current.filter(bid => bid !== id);
  }, []);

  const updateBlockCode = useCallback((id: string, code: string) => {
    setBlocks(prev => {
      const next = new Map(prev);
      const block = next.get(id);
      if (block) {
        next.set(id, { ...block, code });
      }
      return next;
    });
  }, []);

  const clearBlockOutput = useCallback((id: string) => {
    setBlocks(prev => {
      const next = new Map(prev);
      const block = next.get(id);
      if (block) {
        next.set(id, { ...block, output: [], logs: [], error: undefined, result: undefined, status: 'idle' });
      }
      return next;
    });
  }, []);

  const createDisplayApi = useCallback((blockId: string): DisplayApi => {
    const pushOutput = (item: DisplayItem) => {
      setBlocks(prev => {
        const next = new Map(prev);
        const block = next.get(blockId);
        if (block) {
          next.set(blockId, { ...block, output: [...block.output, item] });
        }
        return next;
      });
    };

    return {
      text: (str: string) => pushOutput({ type: 'text', data: String(str), timestamp: Date.now() }),
      table: (data: Record<string, unknown>[] | unknown[][]) => pushOutput({ type: 'table', data, timestamp: Date.now() }),
      list: (items: unknown[]) => pushOutput({ type: 'list', data: items, timestamp: Date.now() }),
      json: (obj: unknown) => pushOutput({ type: 'json', data: obj, timestamp: Date.now() }),
    };
  }, []);

  const runBlock = useCallback(async (id: string) => {
    const block = blocks.get(id);
    if (!block || block.status === 'running') return;

    const code = block.code;
    const api = getOrCreateApi();

    // Reset API logs for this execution
    const prevLogsLength = api.logs.length;

    // Set running
    setBlocks(prev => {
      const next = new Map(prev);
      next.set(id, { ...block, status: 'running', output: [], logs: [], error: undefined, result: undefined });
      return next;
    });

    const displayApi = createDisplayApi(id);

    try {
      const wrappedScript = `const display = input.__display;\n${code}`;
      const result = await AutomateSandbox.execute(
        wrappedScript,
        api,
        { __display: displayApi },
        variablesRef.current,
      );

      // Collect new logs
      const newLogs = api.logs.slice(prevLogsLength);

      setBlocks(prev => {
        const next = new Map(prev);
        const current = next.get(id);
        if (current) {
          next.set(id, { ...current, status: 'completed', logs: newLogs, result });
        }
        return next;
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const newLogs = api.logs.slice(prevLogsLength);

      setBlocks(prev => {
        const next = new Map(prev);
        const current = next.get(id);
        if (current) {
          next.set(id, { ...current, status: 'error', error: errorMsg, logs: newLogs });
        }
        return next;
      });
    }
  }, [blocks, getOrCreateApi, createDisplayApi]);

  const runAllBlocks = useCallback(async () => {
    setIsRunningAll(true);
    for (const id of blockOrderRef.current) {
      if (blocks.has(id)) {
        await runBlock(id);
      }
    }
    setIsRunningAll(false);
  }, [blocks, runBlock]);

  const getBlockState = useCallback((id: string) => {
    return blocks.get(id);
  }, [blocks]);

  const value: AutomateDocumentContextValue = {
    variables: variablesRef.current,
    blocks,
    registerBlock,
    unregisterBlock,
    updateBlockCode,
    runBlock,
    runAllBlocks,
    isRunningAll,
    getBlockState,
    clearBlockOutput,
  };

  return (
    <AutomateDocumentContext.Provider value={value}>
      {children}
    </AutomateDocumentContext.Provider>
  );
};

export default AutomateDocumentContext;
