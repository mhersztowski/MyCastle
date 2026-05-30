import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { mqttClient } from './MqttClient';
import { FileData, BinaryFileData, DirectoryTree } from './types';

export interface FileChangeEvent {
  path: string;
  action: string;
  timestamp: number;
}

interface MqttContextValue {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  lastFileChange: FileChangeEvent | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  readFile: (path: string) => Promise<FileData>;
  writeFile: (path: string, content: string) => Promise<FileData>;
  deleteFile: (path: string) => Promise<{ success: boolean }>;
  listDirectory: (path?: string) => Promise<DirectoryTree>;
  uploadFile: (path: string, file: File | Blob, onProgress?: (progress: number) => void) => Promise<BinaryFileData>;
  readBinaryFile: (path: string) => Promise<BinaryFileData>;
  syncDirinfo: (path: string) => Promise<unknown>;
  rawPublish: (topic: string, payload: string) => void;
  rawSubscribe: (topic: string, callback: (payload: string) => void) => () => void;
}

const MqttContext = createContext<MqttContextValue | null>(null);

export const useMqtt = (): MqttContextValue => {
  const context = useContext(MqttContext);
  if (!context) {
    throw new Error('useMqtt must be used within MqttProvider');
  }
  return context;
};

interface MqttProviderProps {
  children: React.ReactNode;
  mqttUsername?: string;
  mqttPassword?: string;
  userBasePath?: string;
}

export const MqttProvider: React.FC<MqttProviderProps> = ({ children, mqttUsername, mqttPassword, userBasePath }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFileChange, setLastFileChange] = useState<FileChangeEvent | null>(null);

  const connect = useCallback(async () => {
    if (isConnected || isConnecting) return;

    setIsConnecting(true);
    setError(null);

    try {
      const options = mqttUsername && mqttPassword ? { username: mqttUsername, password: mqttPassword } : undefined;
      await mqttClient.connect(undefined, options);
      setIsConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  }, [isConnected, isConnecting, mqttUsername, mqttPassword]);

  const disconnect = useCallback(() => {
    mqttClient.disconnect();
    setIsConnected(false);
  }, []);

  const readFile = useCallback(async (path: string): Promise<FileData> => {
    if (!isConnected) {
      throw new Error('Not connected');
    }
    return mqttClient.readFile(path);
  }, [isConnected]);

  const writeFile = useCallback(async (path: string, content: string): Promise<FileData> => {
    if (!isConnected) {
      throw new Error('Not connected');
    }
    return mqttClient.writeFile(path, content);
  }, [isConnected]);

  const deleteFile = useCallback(async (path: string): Promise<{ success: boolean }> => {
    if (!isConnected) {
      throw new Error('Not connected');
    }
    return mqttClient.deleteFile(path);
  }, [isConnected]);

  const listDirectory = useCallback(async (path?: string): Promise<DirectoryTree> => {
    if (!isConnected) {
      throw new Error('Not connected');
    }
    return mqttClient.listDirectory(path);
  }, [isConnected]);

  const uploadFile = useCallback(async (
    path: string,
    file: File | Blob,
    onProgress?: (progress: number) => void
  ): Promise<BinaryFileData> => {
    if (!isConnected) {
      throw new Error('Not connected');
    }
    return mqttClient.uploadFile(path, file, onProgress);
  }, [isConnected]);

  const readBinaryFile = useCallback(async (path: string): Promise<BinaryFileData> => {
    if (!isConnected) {
      throw new Error('Not connected');
    }
    return mqttClient.readBinaryFile(path);
  }, [isConnected]);

  const syncDirinfo = useCallback(async (path: string): Promise<unknown> => {
    if (!isConnected) {
      throw new Error('Not connected');
    }
    return mqttClient.syncDirinfo(path);
  }, [isConnected]);

  // Apply the path prefix BEFORE (re)connecting so the first read/write that
  // fires once isConnected flips true already uses the correct user scope.
  useEffect(() => {
    mqttClient.setUserBasePath(userBasePath ?? '');
  }, [userBasePath]);

  // Hook up the file-change listener once; cleaned up when the provider unmounts.
  useEffect(() => {
    const handleFileChanged = (path: string, action: string) => {
      setLastFileChange({ path, action, timestamp: Date.now() });
    };
    mqttClient.onFileChanged(handleFileChanged);
    return () => mqttClient.offFileChanged(handleFileChanged);
  }, []);

  // (Re)connect whenever credentials change — login/logout drops the anonymous
  // session and brings a fresh one up with the new JWT. The cleanup disconnects
  // so the next render starts from a clean slate.
  useEffect(() => {
    let cancelled = false;
    setIsConnecting(true);
    setError(null);

    (async () => {
      try {
        // Make sure a stale session isn't reused under different credentials.
        mqttClient.disconnect();
        setIsConnected(false);
        const options = mqttUsername && mqttPassword
          ? { username: mqttUsername, password: mqttPassword }
          : undefined;
        await mqttClient.connect(undefined, options);
        if (!cancelled) setIsConnected(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Connection failed');
      } finally {
        if (!cancelled) setIsConnecting(false);
      }
    })();

    return () => {
      cancelled = true;
      mqttClient.disconnect();
      setIsConnected(false);
    };
  }, [mqttUsername, mqttPassword]);

  const value: MqttContextValue = {
    isConnected,
    isConnecting,
    error,
    lastFileChange,
    connect,
    disconnect,
    readFile,
    writeFile,
    deleteFile,
    listDirectory,
    uploadFile,
    readBinaryFile,
    syncDirinfo,
    rawPublish: useCallback((topic: string, payload: string) => mqttClient.rawPublish(topic, payload), []),
    rawSubscribe: useCallback((topic: string, callback: (payload: string) => void) => mqttClient.rawSubscribe(topic, callback), []),
  };

  return <MqttContext.Provider value={value}>{children}</MqttContext.Provider>;
};
