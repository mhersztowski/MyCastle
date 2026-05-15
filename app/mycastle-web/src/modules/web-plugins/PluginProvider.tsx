import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth';
import { loadPlugins, unloadPlugins } from './PluginLoader';
import { setSecretsOwner } from './secretsOwner';

export interface PluginContextValue {
  /** Increments every time a plugin load cycle completes. 0 = not loaded yet. */
  pluginsVersion: number;
}

const PluginContext = createContext<PluginContextValue>({ pluginsVersion: 0 });

export function usePlugins(): PluginContextValue {
  return useContext(PluginContext);
}

export function PluginProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, token, isAdmin } = useAuth();
  const loadedForUser = useRef<string | null>(null);
  const [pluginsVersion, setPluginsVersion] = useState(0);

  // Default plugin-secrets owner = the logged-in user. Cross-user pages
  // override this for their subtree via <SecretsOwnerScope>.
  useEffect(() => {
    setSecretsOwner(currentUser?.name ?? null);
  }, [currentUser]);

  useEffect(() => {
    const userName = currentUser?.name ?? null;

    if (userName && token && loadedForUser.current !== userName) {
      loadedForUser.current = userName;
      loadPlugins(userName, token, isAdmin).then(() => {
        setPluginsVersion(v => v + 1);
      });
    }

    if (!userName && loadedForUser.current !== null) {
      loadedForUser.current = null;
      unloadPlugins();
      setPluginsVersion(0);
    }
  }, [currentUser, token, isAdmin]);

  return (
    <PluginContext.Provider value={{ pluginsVersion }}>
      {children}
    </PluginContext.Provider>
  );
}
