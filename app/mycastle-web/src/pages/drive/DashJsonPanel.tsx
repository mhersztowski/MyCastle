/**
 * DashJsonPanel — a live JSON source view for the dash scene (the same Monaco
 * editor Drive uses for text files). Two-way bound: edits are parsed and applied
 * to the scene (debounced, only on valid JSON); external scene changes refresh
 * the text while the editor isn't focused. Handy as a right-side split of the
 * fullscreen dash editor.
 */
import { useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import Editor from '@monaco-editor/react';

interface Props {
  scene: unknown;
  onApply: (parsed: unknown) => void;
}

export function DashJsonPanel({ scene, onApply }: Props) {
  const [draft, setDraft] = useState<string>(() => JSON.stringify(scene, null, 2));
  const [err, setErr] = useState<string | null>(null);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reflect external scene changes (visual edits) — but not while the user is
  // typing here, so we never yank their cursor / clobber an in-progress edit.
  useEffect(() => {
    if (focused.current) return;
    setDraft(JSON.stringify(scene, null, 2));
    setErr(null);
  }, [scene]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onChange = (value?: string) => {
    const v = value ?? '';
    setDraft(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        const parsed = JSON.parse(v);
        setErr(null);
        onApply(parsed);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    }, 600);
  };

  return (
    <Box sx={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', borderLeft: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ px: 1, py: 0.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'background.paper' }}>
        <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>JSON</Typography>
        {err && <Typography variant="caption" color="error" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{err}</Typography>}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <Editor
          language="json"
          theme="vs-dark"
          value={draft}
          onChange={onChange}
          onMount={(ed) => {
            ed.onDidFocusEditorText(() => { focused.current = true; });
            ed.onDidBlurEditorText(() => { focused.current = false; });
          }}
          options={{
            fontSize: 12, minimap: { enabled: false }, lineNumbers: 'on',
            scrollBeyondLastLine: false, tabSize: 2, wordWrap: 'on', automaticLayout: true,
          }}
        />
      </Box>
    </Box>
  );
}

export default DashJsonPanel;
