import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import type { FileSystemProvider } from '@mhersztowski/core';
import { decodeText, encodeText, mjdDocumentSchema, createMjdDocument } from '@mhersztowski/core';
import type { MjdDocument } from '@mhersztowski/core';
import { MjdDefEditor } from './MjdDefEditor';
import { MjdDataEditor } from './MjdDataEditor';

export interface MjdVfsLoaderProps {
  provider: FileSystemProvider;
  mjdPath: string;
  dataPath?: string;
  height?: string | number;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; definition: MjdDocument; data?: Record<string, unknown> };

export function MjdVfsLoader({ provider, mjdPath, dataPath, height }: MjdVfsLoaderProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load files from VFS
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ status: 'loading' });
      try {
        // Load .mjd definition
        const mjdBytes = await provider.readFile(mjdPath);
        const mjdJson = JSON.parse(decodeText(mjdBytes));
        const parsed = mjdDocumentSchema.safeParse(mjdJson);
        if (!parsed.success) {
          if (!cancelled) setState({ status: 'error', message: `Invalid .mjd file: ${parsed.error.message}` });
          return;
        }
        const definition = parsed.data as MjdDocument;

        // Load data file if path provided
        let data: Record<string, unknown> | undefined;
        if (dataPath) {
          try {
            const dataBytes = await provider.readFile(dataPath);
            data = JSON.parse(decodeText(dataBytes)) as Record<string, unknown>;
          } catch {
            // Data file doesn't exist yet — start with defaults from definition
            data = buildDefaults(definition);
          }
        }

        if (!cancelled) setState({ status: 'ready', definition, data });
      } catch (err) {
        if (!cancelled) {
          // .mjd file doesn't exist — create empty document for def editor
          if (!dataPath) {
            setState({ status: 'ready', definition: createMjdDocument() });
          } else {
            setState({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load files' });
          }
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [provider, mjdPath, dataPath]);

  // Debounced save to VFS
  const saveToVfs = useCallback((path: string, content: unknown) => {
    if (!provider.writeFile) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const json = JSON.stringify(content, null, 2);
      provider.writeFile!(path, encodeText(json), { create: true, overwrite: true });
    }, 500);
  }, [provider]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const handleDefinitionChange = useCallback((doc: MjdDocument) => {
    setState((prev) => {
      if (prev.status !== 'ready') return prev;
      return { ...prev, definition: doc };
    });
    saveToVfs(mjdPath, doc);
  }, [mjdPath, saveToVfs]);

  const handleDataChange = useCallback((data: Record<string, unknown>) => {
    setState((prev) => {
      if (prev.status !== 'ready') return prev;
      return { ...prev, data };
    });
    if (dataPath) saveToVfs(dataPath, data);
  }, [dataPath, saveToVfs]);

  if (state.status === 'loading') {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: height ?? 200 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (state.status === 'error') {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="error">{state.message}</Typography>
      </Box>
    );
  }

  const containerSx = height ? { height, overflow: 'auto' } : {};

  if (dataPath) {
    return (
      <Box sx={containerSx}>
        <MjdDataEditor
          definition={state.definition}
          value={state.data ?? {}}
          onChange={handleDataChange}
        />
      </Box>
    );
  }

  return (
    <Box sx={containerSx}>
      <MjdDefEditor
        value={state.definition}
        onChange={handleDefinitionChange}
      />
    </Box>
  );
}

function buildDefaults(doc: MjdDocument): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of doc.fields) {
    if (field.defaultValue !== undefined) {
      data[field.name] = field.defaultValue;
    }
  }
  return data;
}
