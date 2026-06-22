import { useRef, useEffect } from 'react';
import { useFilesystem } from '../../filesystem/FilesystemContext';
import { useAuth } from '../../auth/AuthContext';
import { AutomateSystemApi } from './AutomateSystemApi';

/**
 * Returns a stable AutomateSystemApi instance ("alli" — all-in-one api)
 * for the current user. The same api.* interface is injected into both
 * dash.json scripts and automate blocks in the Markdown editor.
 */
export function useAlliApi(
  getDocumentPath: () => string | undefined = () => undefined,
): AutomateSystemApi {
  const { dataSource } = useFilesystem();
  const { currentUser, token } = useAuth();
  const userNameRef = useRef<string | null>(currentUser?.name ?? null);
  const tokenRef = useRef<string | null>(token ?? null);
  useEffect(() => { userNameRef.current = currentUser?.name ?? null; }, [currentUser]);
  useEffect(() => { tokenRef.current = token ?? null; }, [token]);
  const variablesRef = useRef<Record<string, unknown>>({});
  const apiRef = useRef<AutomateSystemApi | null>(null);
  if (!apiRef.current) {
    apiRef.current = new AutomateSystemApi(
      dataSource,
      variablesRef.current,
      getDocumentPath,
      () => userNameRef.current,
      () => tokenRef.current,
    );
  }
  return apiRef.current;
}
