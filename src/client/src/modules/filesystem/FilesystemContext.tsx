import React, { createContext, useContext, useState, useCallback } from 'react';
import { DirData } from './data/DirData';
import { FileData } from './data/FileData';
import { filesystemService } from './FilesystemService';
import { FilesystemState } from './types';

interface FilesystemContextValue extends FilesystemState {
  loadDirectory: (path?: string) => Promise<void>;
  readFile: (path: string) => Promise<FileData | null>;
  writeFile: (path: string, content: string) => Promise<FileData | null>;
  deleteFile: (path: string) => Promise<boolean>;
  setSelectedFile: (file: FileData | null) => void;
  setCurrentPath: (path: string) => void;
}

const FilesystemContext = createContext<FilesystemContextValue | null>(null);

export const useFilesystem = (): FilesystemContextValue => {
  const context = useContext(FilesystemContext);
  if (!context) {
    throw new Error('useFilesystem must be used within FilesystemProvider');
  }
  return context;
};

interface FilesystemProviderProps {
  children: React.ReactNode;
}

export const FilesystemProvider: React.FC<FilesystemProviderProps> = ({ children }) => {
  const [rootDir, setRootDir] = useState<DirData | null>(null);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<FileData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = useCallback(async (path: string = '') => {
    setIsLoading(true);
    setError(null);
    try {
      const dir = await filesystemService.loadDirectory(path);
      setRootDir(dir);
      setCurrentPath(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const readFile = useCallback(async (path: string): Promise<FileData | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const file = await filesystemService.readFile(path);
      if (file) {
        setSelectedFile(file);
      }
      return file;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read file');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const writeFile = useCallback(async (path: string, content: string): Promise<FileData | null> => {
    setIsLoading(true);
    setError(null);
    try {
      return await filesystemService.writeFile(path, content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to write file');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteFile = useCallback(async (path: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const success = await filesystemService.deleteFile(path);
      if (success && selectedFile?.getPath() === path) {
        setSelectedFile(null);
      }
      return success;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete file');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [selectedFile]);

  const value: FilesystemContextValue = {
    rootDir,
    currentPath,
    selectedFile,
    isLoading,
    error,
    loadDirectory,
    readFile,
    writeFile,
    deleteFile,
    setSelectedFile,
    setCurrentPath,
  };

  return (
    <FilesystemContext.Provider value={value}>
      {children}
    </FilesystemContext.Provider>
  );
};
