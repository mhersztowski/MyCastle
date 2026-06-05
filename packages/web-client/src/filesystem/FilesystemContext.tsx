import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { DirData } from './data/DirData';
import { FileData } from './data/FileData';
import { Calendar } from './data/Calendar';
import { DataSource } from './data/DataSource';
import { filesystemService } from './FilesystemService';
import { FilesystemState } from './types';
import { useMqtt } from '../mqtt/MqttContext';

interface FilesystemContextValue extends FilesystemState {
  loadDirectory: (path?: string) => Promise<void>;
  loadAllData: () => Promise<void>;
  readFile: (path: string) => Promise<FileData | null>;
  writeFile: (path: string, content: string) => Promise<FileData | null>;
  deleteFile: (path: string) => Promise<boolean>;
  setSelectedFile: (file: FileData | null) => void;
  setCurrentPath: (path: string) => void;
  syncDirinfo: (dirinfoPath: string, content: string) => boolean;
  calendar: Calendar;
  dataSource: DataSource;
  dataVersion: number;
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
  const { isConnected, lastFileChange } = useMqtt();
  const [rootDir, setRootDir] = useState<DirData | null>(null);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<FileData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendar, setCalendar] = useState<Calendar>(new Calendar());
  const [dataSource, setDataSource] = useState<DataSource>(new DataSource());
  const [dataVersion, setDataVersion] = useState(0);
  const loadingRef = useRef(false);

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

  const loadAllData = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    setIsLoading(true);
    setIsDataLoaded(false);
    setError(null);

    // Race against a hard timeout — if MQTT-driven loadAllData takes longer
    // than 10s (broken backend, dropped websocket, network on a phone in a
    // basement), give up so the rest of the app can still render. Pages
    // checking isDataLoaded should never spin forever; an empty DataSource
    // is a strictly better failure mode than an infinite CircularProgress.
    const TIMEOUT_MS = 10_000;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`loadAllData timed out after ${TIMEOUT_MS}ms`)),
        TIMEOUT_MS,
      );
    });

    try {
      const dir = await Promise.race([filesystemService.loadAllData(), timeoutPromise]);
      setRootDir(dir);
      setCalendar(filesystemService.getCalendar());
      setDataSource(filesystemService.getDataSource());
      console.log('FilesystemContext: All data loaded successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load all data');
      console.error('FilesystemContext: Failed to load all data:', err);
      // Try to surface any partial state already collected by the service so
      // pages reading dataSource/calendar see whatever did load before the
      // failure (better than empty).
      try {
        setCalendar(filesystemService.getCalendar());
        setDataSource(filesystemService.getDataSource());
      } catch { /* ignore — service may not expose partial state */ }
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      // Always flip the gate so pages depending on `isDataLoaded` render
      // something — either the loaded data, partial state, or "empty".
      // Without this, a single MQTT/load error froze the whole app's PIM
      // surface (Calendar/ToDo/Shopping/Persons/Projects all checked the
      // same gate and spun forever).
      setIsDataLoaded(true);
      setIsLoading(false);
      loadingRef.current = false;
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
      const result = await filesystemService.writeFile(path, content);
      // Trigger re-render for consumers of dataSource/calendar (datasource was already updated in-memory)
      setDataVersion(v => v + 1);
      return result;
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

  const syncDirinfo = useCallback((dirinfoPath: string, content: string): boolean => {
    return filesystemService.syncDirinfo(dirinfoPath, content);
  }, []);

  // Reset the loaded gate whenever MQTT drops. A reconnect (e.g. after login)
  // raises isConnected again, which re-triggers loadAllData below — this time
  // through the user-scoped path prefix that the new session installed.
  useEffect(() => {
    if (!isConnected) {
      setIsDataLoaded(false);
      setRootDir(null);
    }
  }, [isConnected]);

  // Auto-load all data when MQTT connects
  useEffect(() => {
    if (isConnected && !isDataLoaded && !loadingRef.current) {
      loadAllData();
    }
  }, [isConnected, isDataLoaded, loadAllData]);

  // Smart reload when backend notifies about file changes
  useEffect(() => {
    if (!lastFileChange || !isDataLoaded) return;

    const reload = async () => {
      const reloaded = await filesystemService.reloadDataFile(
        lastFileChange.path,
        lastFileChange.action
      );
      if (reloaded) {
        setDataVersion(v => v + 1);
      }
    };

    reload();
  }, [lastFileChange, isDataLoaded]);

  const value: FilesystemContextValue = {
    rootDir,
    currentPath,
    selectedFile,
    isLoading,
    isDataLoaded,
    error,
    calendar,
    dataSource,
    dataVersion,
    loadDirectory,
    loadAllData,
    readFile,
    writeFile,
    deleteFile,
    setSelectedFile,
    setCurrentPath,
    syncDirinfo,
  };

  return (
    <FilesystemContext.Provider value={value}>
      {children}
    </FilesystemContext.Provider>
  );
};
