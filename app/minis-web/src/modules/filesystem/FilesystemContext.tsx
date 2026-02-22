import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useMqtt } from '../mqttclient';
import { DirNode } from './nodes/DirNode';
import { FileNode } from './nodes/FileNode';
import type { DirModel } from './models/DirModel';
import type { FileModel } from './models/FileModel';
import type { DirectoryTree } from '@mhersztowski/core';

function treeToFileModel(node: DirectoryTree): FileModel {
  return {
    name: node.name,
    path: node.path,
    size: 0,
    modified: '',
  };
}

function treeToDirModel(node: DirectoryTree): DirModel {
  const children = node.children || [];
  return {
    name: node.name,
    path: node.path,
    files: children.filter((c) => c.type === 'file').map(treeToFileModel),
    dirs: children.filter((c) => c.type === 'directory').map(treeToDirModel),
  };
}

interface FilesystemContextValue {
  rootDir: DirNode | null;
  selectedFile: FileNode | null;
  loading: boolean;
  error: string | null;
  connected: boolean;
  loadDirectory: (path: string) => Promise<void>;
  selectFile: (file: FileNode) => Promise<void>;
  refreshDirectory: () => Promise<void>;
}

const FilesystemContext = createContext<FilesystemContextValue | null>(null);

interface FilesystemProviderProps {
  children: ReactNode;
}

export function FilesystemProvider({ children }: FilesystemProviderProps) {
  const { isConnected, listDirectory, readFile } = useMqtt();
  const [rootDir, setRootDir] = useState<DirNode | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string>('/');

  const loadDirectory = useCallback(
    async (path: string) => {
      if (!isConnected) return;

      setLoading(true);
      setError(null);

      try {
        const tree = await listDirectory(path);
        setRootDir(new DirNode(treeToDirModel(tree)));
        setCurrentPath(path);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load directory');
      } finally {
        setLoading(false);
      }
    },
    [isConnected, listDirectory]
  );

  const selectFile = useCallback(async (file: FileNode) => {
    if (!isConnected) return;

    try {
      const data = await readFile(file.path);
      file.content = data.content;
      setSelectedFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read file');
    }
  }, [isConnected, readFile]);

  const refreshDirectory = useCallback(async () => {
    await loadDirectory(currentPath);
  }, [loadDirectory, currentPath]);

  return (
    <FilesystemContext.Provider
      value={{
        rootDir,
        selectedFile,
        loading,
        error,
        connected: isConnected,
        loadDirectory,
        selectFile,
        refreshDirectory,
      }}
    >
      {children}
    </FilesystemContext.Provider>
  );
}

export function useFilesystem() {
  const context = useContext(FilesystemContext);
  if (!context) {
    throw new Error('useFilesystem must be used within a FilesystemProvider');
  }
  return context;
}

export default FilesystemContext;
