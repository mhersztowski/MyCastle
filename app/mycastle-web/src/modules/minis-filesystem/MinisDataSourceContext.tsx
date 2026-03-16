import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useMqtt } from '../mqttclient';
import {
  MemoryDataSource,
  type MinisDeviceDefsModel,
} from '@mhersztowski/core';

interface MinisDataSourceContextValue {
  dataSource: MemoryDataSource;
  loading: boolean;
  error: string | null;
  connected: boolean;
  reload: () => Promise<void>;
}

const dataSource = new MemoryDataSource();

const MinisDataSourceContext = createContext<MinisDataSourceContextValue | null>(null);

interface MinisDataSourceProviderProps {
  children: ReactNode;
}

const DATA_FILES: Record<string, (ds: MemoryDataSource, data: unknown) => void> = {
  'DeviceDefList.json': (ds, data) => ds.loadMinisDeviceDefs(data as MinisDeviceDefsModel),
};

export function MinisDataSourceProvider({ children }: MinisDataSourceProviderProps) {
  const { isConnected, readFile } = useMqtt();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!isConnected) return;

    setLoading(true);
    setError(null);

    try {
      for (const [path, loader] of Object.entries(DATA_FILES)) {
        try {
          const file = await readFile(path);
          const data = JSON.parse(file.content || '{}');
          loader(dataSource, data);
        } catch (err) {
          const msg = err instanceof Error ? err.message : '';
          if (msg.includes('not found') || msg.includes('ENOENT') || msg.includes('no such file')) {
            continue;
          }
          throw err;
        }
      }
      dataSource.setLoaded(true);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [isConnected, readFile]);

  useEffect(() => {
    if (isConnected && !loaded) {
      reload();
    }
  }, [isConnected, loaded, reload]);

  return (
    <MinisDataSourceContext.Provider
      value={{
        dataSource,
        loading,
        error,
        connected: isConnected,
        reload,
      }}
    >
      {children}
    </MinisDataSourceContext.Provider>
  );
}

export function useMinisDataSource() {
  const context = useContext(MinisDataSourceContext);
  if (!context) {
    throw new Error('useMinisDataSource must be used within a MinisDataSourceProvider');
  }
  return context;
}

export default MinisDataSourceContext;
