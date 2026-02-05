/**
 * Automate Script Extension - rozszerzenie Tiptap do wykonywalnych blokow skryptowych
 * Format markdown: ```automate:blockId\ncode\n```
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import {
  Box,
  Paper,
  IconButton,
  Tooltip,
  Typography,
  CircularProgress,
  Alert,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  List,
  ListItem,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import Editor from '@monaco-editor/react';
import type { Monaco } from '@monaco-editor/react';

import { setupAutomateMonaco } from '../../../modules/automate/designer/automateMonacoSetup';
import { useAutomateDocument, DisplayItem } from './AutomateDocumentContext';

const DISPLAY_API_TYPES = `
/**
 * API wyswietlania wynikow w panelu output bloku skryptowego.
 * Dostepne tylko w blokach skryptowych osadzonych w markdown.
 */
interface DisplayApi {
  /**
   * Wyswietl tekst w panelu output.
   * @param str - Tekst do wyswietlenia
   * @example display.text('Wynik: 42');
   */
  text(str: string): void;

  /**
   * Wyswietl tabele w panelu output.
   * @param data - Tablica obiektow lub tablica tablic
   * @example
   * display.table([
   *   { imie: 'Jan', wiek: 30 },
   *   { imie: 'Anna', wiek: 25 },
   * ]);
   */
  table(data: Record<string, any>[] | any[][]): void;

  /**
   * Wyswietl liste w panelu output.
   * @param items - Tablica elementow
   * @example display.list(['Element 1', 'Element 2', 'Element 3']);
   */
  list(items: any[]): void;

  /**
   * Wyswietl sformatowany JSON w panelu output.
   * @param obj - Obiekt do wyswietlenia
   * @example display.json({ klucz: 'wartosc', nested: { a: 1 } });
   */
  json(obj: any): void;
}

/**
 * API wyswietlania wynikow - renderuje dane bezposrednio pod blokiem skryptowym.
 *
 * Dostepne metody:
 * - \`display.text(str)\` - tekst
 * - \`display.table(data)\` - tabela
 * - \`display.list(items)\` - lista
 * - \`display.json(obj)\` - sformatowany JSON
 */
declare const display: DisplayApi;
`;

let displayTypesRegistered = false;

function setupAutomateMonacoWithDisplay(monaco: Monaco): void {
  setupAutomateMonaco(monaco);

  if (displayTypesRegistered) return;
  displayTypesRegistered = true;

  monaco.languages.typescript.javascriptDefaults.addExtraLib(
    DISPLAY_API_TYPES,
    'automate-display-api.d.ts',
  );
}

// Komponent renderujacy wyniki display
const DisplayOutput: React.FC<{ items: DisplayItem[] }> = ({ items }) => {
  if (items.length === 0) return null;

  return (
    <Box sx={{ p: 1 }}>
      {items.map((item, i) => {
        switch (item.type) {
          case 'text':
            return (
              <Typography key={i} variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                {String(item.data)}
              </Typography>
            );

          case 'table': {
            const data = item.data as Record<string, unknown>[] | unknown[][];
            if (!Array.isArray(data) || data.length === 0) return null;

            // Detect if array of objects or array of arrays
            const isObjectArray = typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0]);
            const headers = isObjectArray
              ? Object.keys(data[0] as Record<string, unknown>)
              : (data[0] as unknown[]).map((_, idx) => `${idx}`);

            return (
              <Table key={i} size="small" sx={{ my: 0.5 }}>
                <TableHead>
                  <TableRow>
                    {headers.map((h, hi) => (
                      <TableCell key={hi} sx={{ fontWeight: 600, fontSize: '0.75rem', py: 0.5 }}>
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.map((row, ri) => (
                    <TableRow key={ri}>
                      {isObjectArray
                        ? headers.map((h, hi) => (
                            <TableCell key={hi} sx={{ fontSize: '0.75rem', py: 0.25 }}>
                              {String((row as Record<string, unknown>)[h] ?? '')}
                            </TableCell>
                          ))
                        : (row as unknown[]).map((cell, ci) => (
                            <TableCell key={ci} sx={{ fontSize: '0.75rem', py: 0.25 }}>
                              {String(cell ?? '')}
                            </TableCell>
                          ))
                      }
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            );
          }

          case 'list': {
            const listItems = item.data as unknown[];
            if (!Array.isArray(listItems)) return null;

            return (
              <List key={i} dense disablePadding sx={{ my: 0.5 }}>
                {listItems.map((li, idx) => (
                  <ListItem key={idx} disablePadding sx={{ pl: 1 }}>
                    <ListItemText
                      primary={String(li)}
                      primaryTypographyProps={{ variant: 'body2', fontFamily: 'monospace' }}
                    />
                  </ListItem>
                ))}
              </List>
            );
          }

          case 'json':
            return (
              <Box
                key={i}
                sx={{
                  bgcolor: '#f5f5f5',
                  borderRadius: 0.5,
                  p: 1,
                  my: 0.5,
                  overflow: 'auto',
                  maxHeight: 200,
                }}
              >
                <Typography
                  variant="body2"
                  component="pre"
                  sx={{ fontFamily: 'monospace', fontSize: '0.75rem', m: 0, whiteSpace: 'pre-wrap' }}
                >
                  {JSON.stringify(item.data, null, 2)}
                </Typography>
              </Box>
            );

          default:
            return null;
        }
      })}
    </Box>
  );
};

// Node View Component
const AutomateScriptNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes, selected }) => {
  const blockId = useRef(node.attrs.blockId || crypto.randomUUID?.() || Math.random().toString(36).substr(2, 9));
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    registerBlock,
    unregisterBlock,
    updateBlockCode,
    runBlock,
    getBlockState,
    clearBlockOutput,
  } = useAutomateDocument();

  const [code, setCode] = useState(node.attrs.code as string || '');
  const [editorDialogOpen, setEditorDialogOpen] = useState(false);
  const [dialogCode, setDialogCode] = useState('');

  // Assign blockId if not set
  useEffect(() => {
    if (!node.attrs.blockId) {
      updateAttributes({ blockId: blockId.current });
    }
  }, [node.attrs.blockId, updateAttributes]);

  // Register block on mount
  useEffect(() => {
    const id = blockId.current;
    registerBlock(id);
    return () => unregisterBlock(id);
  }, [registerBlock, unregisterBlock]);

  // Sync code to context when it changes
  useEffect(() => {
    updateBlockCode(blockId.current, code);
  }, [code, updateBlockCode]);

  const blockState = getBlockState(blockId.current);
  const status = blockState?.status || 'idle';
  const output = blockState?.output || [];
  const logs = blockState?.logs || [];
  const error = blockState?.error;
  const result = blockState?.result;

  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newCode = e.target.value;
    setCode(newCode);
    updateAttributes({ code: newCode });
  }, [updateAttributes]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter - run script
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      runBlock(blockId.current);
      return;
    }

    // Tab - insert 2 spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newCode = code.substring(0, start) + '  ' + code.substring(end);
      setCode(newCode);
      updateAttributes({ code: newCode });
      // Restore cursor position
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
      return;
    }

    // Prevent Tiptap from capturing keys while typing
    e.stopPropagation();
  }, [code, updateAttributes, runBlock]);

  const handleRun = useCallback(() => {
    runBlock(blockId.current);
  }, [runBlock]);

  const handleClear = useCallback(() => {
    clearBlockOutput(blockId.current);
  }, [clearBlockOutput]);

  const openEditorDialog = useCallback(() => {
    setDialogCode(code);
    setEditorDialogOpen(true);
  }, [code]);

  const handleEditorDialogSave = useCallback(() => {
    setCode(dialogCode);
    updateAttributes({ code: dialogCode });
    setEditorDialogOpen(false);
  }, [dialogCode, updateAttributes]);

  const hasOutput = output.length > 0 || logs.length > 0 || !!error || result !== undefined;

  return (
    <NodeViewWrapper>
      <Paper
        elevation={selected ? 3 : 1}
        sx={{
          border: selected ? '2px solid' : '1px solid',
          borderColor: selected ? 'success.main' : 'grey.300',
          overflow: 'hidden',
          my: 1,
        }}
        className="automate-script-wrapper"
      >
        {/* Header bar */}
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          px: 1,
          py: 0.5,
          bgcolor: '#1e1e1e',
          color: '#d4d4d4',
        }}>
          <SmartToyIcon sx={{ fontSize: 16, mr: 0.5, color: '#4caf50' }} />
          <Typography variant="caption" sx={{ flex: 1, color: '#d4d4d4' }}>
            Skrypt automatyzacji
          </Typography>
          <Tooltip title="Uruchom (Ctrl+Enter)">
            <span>
              <IconButton
                size="small"
                onClick={handleRun}
                disabled={status === 'running'}
                sx={{ color: '#4caf50', '&:hover': { bgcolor: 'rgba(76,175,80,0.1)' } }}
              >
                {status === 'running' ? (
                  <CircularProgress size={14} sx={{ color: '#4caf50' }} />
                ) : (
                  <PlayArrowIcon fontSize="small" />
                )}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Edytor z podpowiedziami">
            <IconButton
              size="small"
              onClick={openEditorDialog}
              sx={{ color: '#d4d4d4', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
            >
              <OpenInFullIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Wyczysc wyjscie">
            <span>
              <IconButton
                size="small"
                onClick={handleClear}
                disabled={!hasOutput}
                sx={{ color: '#d4d4d4', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        {/* Code editor */}
        <Box sx={{ position: 'relative' }}>
          <textarea
            ref={textareaRef}
            value={code}
            onChange={handleCodeChange}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            style={{
              width: '100%',
              minHeight: 80,
              maxHeight: 400,
              padding: '12px',
              fontFamily: "'Fira Code', 'Monaco', 'Consolas', 'Courier New', monospace",
              fontSize: '0.875em',
              lineHeight: 1.6,
              backgroundColor: '#1e1e1e',
              color: '#d4d4d4',
              border: 'none',
              outline: 'none',
              resize: 'vertical',
              tabSize: 2,
              boxSizing: 'border-box',
              display: 'block',
            }}
          />
        </Box>

        {/* Output panel */}
        {hasOutput && (
          <Box sx={{ borderTop: '1px solid', borderColor: 'divider', maxHeight: 300, overflow: 'auto' }}>
            {error && (
              <Alert severity="error" sx={{ borderRadius: 0, py: 0.25 }}>
                {error}
              </Alert>
            )}
            <DisplayOutput items={output} />
            {result !== undefined && output.length === 0 && !error && (
              <Box sx={{ p: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  Wynik: {typeof result === 'object' ? JSON.stringify(result) : String(result)}
                </Typography>
              </Box>
            )}
            {logs.length > 0 && (
              <Box sx={{ p: 1, bgcolor: '#fafafa', borderTop: '1px solid', borderColor: 'divider' }}>
                {logs.map((log, i) => (
                  <Typography
                    key={i}
                    variant="caption"
                    sx={{
                      display: 'block',
                      fontFamily: 'monospace',
                      fontSize: '0.7rem',
                      color: log.level === 'error' ? 'error.main'
                        : log.level === 'warn' ? 'warning.main'
                        : log.level === 'debug' ? 'info.main'
                        : 'text.secondary',
                    }}
                  >
                    [{log.level}] {log.message}
                  </Typography>
                ))}
              </Box>
            )}
          </Box>
        )}
      </Paper>

      {/* Monaco editor dialog */}
      <Dialog
        open={editorDialogOpen}
        onClose={() => setEditorDialogOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { height: '80vh' } }}
      >
        <DialogTitle sx={{ py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <SmartToyIcon sx={{ color: '#4caf50' }} />
          <Typography variant="subtitle1" fontWeight={600}>
            Edytor skryptu
          </Typography>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Editor
            height="100%"
            defaultLanguage="javascript"
            value={dialogCode}
            onChange={value => setDialogCode(value || '')}
            beforeMount={setupAutomateMonacoWithDisplay}
            options={{
              minimap: { enabled: true },
              fontSize: 14,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
              automaticLayout: true,
            }}
            theme="vs-dark"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditorDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleEditorDialogSave} variant="contained">Zapisz</Button>
        </DialogActions>
      </Dialog>
    </NodeViewWrapper>
  );
};

// Tiptap Extension
export const AutomateScriptBlock = Node.create({
  name: 'automateScriptBlock',

  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      blockId: { default: '' },
      code: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="automate-script-block"]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          const element = node as HTMLElement;
          return {
            blockId: element.getAttribute('data-block-id') || '',
            code: element.getAttribute('data-code')
              ? decodeURIComponent(element.getAttribute('data-code') || '')
              : '',
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const attrs: Record<string, string> = {
      'data-type': 'automate-script-block',
    };

    if (node.attrs.blockId) {
      attrs['data-block-id'] = node.attrs.blockId;
    }
    if (node.attrs.code) {
      attrs['data-code'] = encodeURIComponent(node.attrs.code);
    }

    return ['div', attrs];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AutomateScriptNodeView);
  },

  addCommands() {
    return {
      insertAutomateScript: (code: string = '', blockId?: string) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: {
            code,
            blockId: blockId || crypto.randomUUID?.() || Math.random().toString(36).substr(2, 9),
          },
        });
      },
    };
  },
});

// Deklaracja typow dla komend
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    automateScriptBlock: {
      insertAutomateScript: (code?: string, blockId?: string) => ReturnType;
    };
  }
}

export default AutomateScriptBlock;
