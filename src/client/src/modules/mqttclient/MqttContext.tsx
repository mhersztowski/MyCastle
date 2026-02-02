import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { MqttClient, mqttClient } from './MqttClient';
import { FileData, BinaryFileData, DirectoryTree } from './types';

interface MqttContextValue {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  readFile: (path: string) => Promise<FileData>;
  writeFile: (path: string, content: string) => Promise<FileData>;
  deleteFile: (path: string) => Promise<{ success: boolean }>;
  listDirectory: (path?: string) => Promise<DirectoryTree>;
  uploadFile: (path: string, file: File | Blob, onProgress?: (progress: number) => void) => Promise<BinaryFileData>;
  readBinaryFile: (path: string) => Promise<BinaryFileData>;
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
}

export const MqttProvider: React.FC<MqttProviderProps> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (isConnected || isConnecting) return;

    setIsConnecting(true);
    setError(null);

    try {
      await mqttClient.connect();
      setIsConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  }, [isConnected, isConnecting]);

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

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, []);

  const value: MqttContextValue = {
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    readFile,
    writeFile,
    deleteFile,
    listDirectory,
    uploadFile,
    readBinaryFile,
  };

  return <MqttContext.Provider value={value}>{children}</MqttContext.Provider>;
};
