/**
 * FileRef — an inline "File" chip: icon + filename + two actions.
 *   • Otwórz  — opens the file like activating it in Drive (via the host's
 *               link-click handler, rendered as a wikilink <a>).
 *   • Options — a popover; for JSON files you set the ENV VAR name under which
 *               the file's parsed data is loaded into the document env on load.
 *
 * Round-trips through markdown as `@[file:path|env|format]`.
 */
import React, { useEffect, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import { Box, IconButton, Tooltip, Popover, TextField, MenuItem, Typography } from '@mui/material';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import LaunchIcon from '@mui/icons-material/Launch';
import SettingsIcon from '@mui/icons-material/Settings';
import { useMqtt } from '../../../modules/mqttclient';
import { useMdEnv } from './MdEnvContext';

const basename = (p: string) => (p || '').split('/').pop() || p;
const isJsonPath = (p: string) => /\.json$/i.test(p || '');

const FileNodeView: React.FC<NodeViewProps> = ({ node, editor, updateAttributes }) => {
  const path = (node.attrs.path as string) || '';
  const env = (node.attrs.env as string) || '';
  const format = (node.attrs.format as string) || (isJsonPath(path) ? 'json' : 'auto');
  const { readFile } = useMqtt();
  const mdEnv = useMdEnv();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  // On load: JSON file + env var name → fetch, parse, publish into the env store.
  useEffect(() => {
    if (!path || format !== 'json' || !env) return;
    let alive = true;
    (async () => {
      try {
        const res = await readFile(path);
        const parsed = JSON.parse(res?.content ?? 'null');
        if (alive) mdEnv.set(env, parsed);
      } catch {
        /* leave env unset on read/parse failure */
      }
    })();
    return () => { alive = false; };
  }, [path, env, format, readFile, mdEnv]);

  return (
    <NodeViewWrapper as="span" className="md-fileref">
      <Box component="span" className="md-fileref-chip" contentEditable={false}>
        <InsertDriveFileOutlinedIcon className="md-fileref-icon" sx={{ fontSize: 15 }} />
        <a href={path} data-wikilink="true" className="md-fileref-name" title={path}>{basename(path)}</a>
        {editor.isEditable && (
          <>
            <Tooltip title="Otwórz">
              <IconButton size="small" component="a" href={path} {...{ 'data-wikilink': 'true' }} className="md-fileref-btn">
                <LaunchIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Opcje">
              <IconButton size="small" className="md-fileref-btn" onClick={(e) => setAnchor(e.currentTarget)}>
                <SettingsIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Box>

      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 1.5, width: 300 }} contentEditable={false}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Opcje pliku</Typography>
          <TextField
            select fullWidth size="small" label="Format" value={format}
            onChange={(e) => updateAttributes({ format: e.target.value })}
            sx={{ mb: 1.5 }}
          >
            <MenuItem value="auto">Auto</MenuItem>
            <MenuItem value="json">JSON</MenuItem>
          </TextField>
          {format === 'json' && (
            <TextField
              fullWidth size="small" label="Zmienna env (dane pliku)"
              placeholder="np. config"
              value={env}
              onChange={(e) => updateAttributes({ env: e.target.value.replace(/[^\w]/g, '') })}
              helperText="Dane JSON zostaną wczytane do tej zmiennej env przy załadowaniu strony."
            />
          )}
        </Box>
      </Popover>
    </NodeViewWrapper>
  );
};

export const FileRef = Node.create({
  name: 'fileRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      path: { default: '', parseHTML: (el) => el.getAttribute('data-path') || '', renderHTML: (a) => ({ 'data-path': a.path }) },
      env: { default: '', parseHTML: (el) => el.getAttribute('data-env') || '', renderHTML: (a) => (a.env ? { 'data-env': a.env } : {}) },
      format: { default: '', parseHTML: (el) => el.getAttribute('data-format') || '', renderHTML: (a) => (a.format ? { 'data-format': a.format } : {}) },
    };
  },

  parseHTML() { return [{ tag: 'span[data-type="file-ref"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'file-ref' })]; },
  addNodeView() { return ReactNodeViewRenderer(FileNodeView); },
});

export default FileRef;
