// QtUiSceneEditor — a dedicated editor/viewer dialog for *.qtui.json scenes.
//
// Left:   scene settings + a MinisQt widget tree (add / select / delete).
// Right:  a property panel for the selected widget.
// Toolbar "Build & Run (WASM)": generates a self-contained MinisQt sketch from
//   the scene, writes it (with a vendored MinisQt.h) into a hidden preview
//   sketch, and opens the real WASM simulator — so the preview is a faithful
//   compile of the Qt library with this exact scene.

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogContent, DialogTitle,
  Divider, FormControlLabel, IconButton, MenuItem, Menu, TextField, Tooltip, Typography,
} from '@mui/material';
import { Add, Build, Close, DeleteOutline, Save } from '@mui/icons-material';
import { CppWasmRuntime } from '@mhersztowski/web-cpp';
import { minisApi } from '../../services/MinisApiService';
import { useAuth } from '../../modules/auth';
import { MINIS_QT_H } from './minisQtHeader';
import { generateQtUiSketch } from './qtUiCodegen';
import {
  ADDABLE_WIDGETS, defaultScene, isContainer, makeNode, parseScene, serializeScene,
  type QtAlignment, type QtUiScene, type QtWidgetClass, type QtWidgetNode,
} from './QtUiTypes';
import { findNode, findParent, patchNode, removeNode, insertChild } from './qtTree';
import { QtUiCanvas } from './QtUiCanvas';
import type { ProjectAssetFs } from './ProjectAssetFs';

const PREVIEW_SKETCH = '__qtui_preview';
const dec = new TextDecoder();

interface Props {
  open: boolean;
  onClose: () => void;
  fs: ProjectAssetFs;
  path: string;
  userName: string;
  projectId: string;
  onSaved?: () => void;
}

const ALIGNMENTS: QtAlignment[] = ['AlignLeft', 'AlignHCenter', 'AlignCenter', 'AlignRight', 'AlignVCenter'];

export function QtUiSceneEditor({ open, onClose, fs, path, userName, projectId, onSaved }: Props) {
  const { token } = useAuth();
  const [scene, setScene] = useState<QtUiScene | null>(null);
  const [selectedId, setSelectedId] = useState<string>('root');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addAnchor, setAddAnchor] = useState<{ el: HTMLElement; parentId: string } | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<{ build: string; js: string } | null>(null);

  // Load the scene when the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const bytes = await fs.readFile(path);
        const text = dec.decode(bytes).trim();
        const parsed = text ? parseScene(text) : defaultScene();
        if (!cancelled) { setScene(parsed); setSelectedId(parsed.root.id); setDirty(!text); }
      } catch (e) {
        if (!cancelled) { setScene(defaultScene()); setSelectedId('root'); setDirty(true); setError(e instanceof Error ? e.message : 'Load failed'); }
      }
    })();
    return () => { cancelled = true; };
  }, [open, path, fs]);

  const update = useCallback((patch: Partial<QtWidgetNode>) => {
    setScene((s) => (s ? { ...s, root: patchNode(s.root, selectedId, patch) } : s));
    setDirty(true);
  }, [selectedId]);

  const updateScene = useCallback((patch: Partial<QtUiScene>) => {
    setScene((s) => (s ? { ...s, ...patch } : s));
    setDirty(true);
  }, []);

  const handleAdd = (cls: QtWidgetClass, parentId: string) => {
    const node = makeNode(cls);
    setScene((s) => (s ? { ...s, root: insertChild(s.root, parentId, node, -1) } : s));
    setSelectedId(node.id);
    setDirty(true);
    setAddAnchor(null);
  };

  const handleDelete = (id: string) => {
    if (!scene || id === scene.root.id) return;
    setScene((s) => (s ? { ...s, root: removeNode(s.root, id) } : s));
    if (selectedId === id) setSelectedId(scene.root.id);
    setDirty(true);
  };

  const handleSave = async () => {
    if (!scene) return;
    setBusy(true); setError(null);
    try {
      await fs.writeFile(path, new TextEncoder().encode(serializeScene(scene)));
      await fs.refresh();
      setDirty(false);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const handleBuildRun = async () => {
    if (!scene) return;
    setBusy(true); setError(null);
    try {
      // Persist the scene, then drop a self-contained MinisQt sketch into a
      // hidden preview sketch and open the WASM simulator on it.
      await fs.writeFile(path, new TextEncoder().encode(serializeScene(scene)));
      await fs.refresh();
      setDirty(false);
      const ino = generateQtUiSketch(scene);
      await minisApi.writeSketchFile(userName, projectId, PREVIEW_SKETCH, `${PREVIEW_SKETCH}.ino`, ino);
      await minisApi.writeSketchFile(userName, projectId, PREVIEW_SKETCH, 'MinisQt.h', MINIS_QT_H);
      setPreviewUrls({
        build: minisApi.getArduinoWasmBuildSseUrl(userName, projectId, PREVIEW_SKETCH),
        js: minisApi.getArduinoWasmJsUrl(userName, projectId, PREVIEW_SKETCH),
      });
      setPreviewOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Build failed');
    } finally {
      setBusy(false);
    }
  };

  const selected = scene ? findNode(scene.root, selectedId) : null;
  const selParent = scene ? findParent(scene.root, selectedId) : null;
  const selAbsolute = !!selected && !!scene && selected.id !== scene.root.id
    && (!selParent?.layout || selParent.layout === 'none');

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth
      PaperProps={{ sx: { height: '88vh' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
        <Typography variant="subtitle1" sx={{ flexGrow: 0, mr: 1 }}>UI Scene</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1, minWidth: 0 }} noWrap>
          {path}{dirty ? ' •' : ''}
        </Typography>
        <Button size="small" startIcon={busy ? <CircularProgress size={14} /> : <Save />} onClick={() => void handleSave()} disabled={busy || !scene || !dirty}>
          Save
        </Button>
        <Button size="small" variant="contained" startIcon={<Build />} onClick={() => void handleBuildRun()} disabled={busy || !scene}>
          Build &amp; Run (WASM)
        </Button>
        <IconButton size="small" onClick={onClose}><Close /></IconButton>
      </DialogTitle>

      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mx: 2, mb: 1 }}>{error}</Alert>}

      <DialogContent dividers sx={{ p: 0, display: 'flex', overflow: 'hidden' }}>
        {!scene ? (
          <Box sx={{ p: 4, display: 'flex', alignItems: 'center', gap: 1 }}><CircularProgress size={18} /> Loading…</Box>
        ) : (
          <>
            {/* Left: scene settings + widget tree */}
            <Box sx={{ width: 240, flexShrink: 0, borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Box sx={{ p: 1.5 }}>
                <Typography variant="overline" color="text.secondary">Scene</Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                  <NumField label="Width" value={scene.width} onChange={(v) => updateScene({ width: v })} />
                  <NumField label="Height" value={scene.height} onChange={(v) => updateScene({ height: v })} />
                </Box>
                <ColorField label="Background" value={scene.background ?? '#181c20'} onChange={(v) => updateScene({ background: v })} sx={{ mt: 1 }} />
              </Box>
              <Divider />
              <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.5 }}>
                <Typography variant="overline" color="text.secondary" sx={{ flexGrow: 1 }}>Widgets</Typography>
              </Box>
              <Box sx={{ flexGrow: 1, overflow: 'auto', px: 0.5, pb: 1 }}>
                <TreeRow
                  node={scene.root} depth={0} selectedId={selectedId} rootId={scene.root.id}
                  onSelect={setSelectedId}
                  onAdd={(el, parentId) => setAddAnchor({ el, parentId })}
                  onDelete={handleDelete}
                />
              </Box>
            </Box>

            {/* Center: drag-and-drop canvas designer */}
            <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <QtUiCanvas
                scene={scene}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onChange={(s) => { setScene(s); setDirty(true); }}
              />
            </Box>

            {/* Right: properties of the selected widget */}
            <Box sx={{ width: 320, flexShrink: 0, borderLeft: 1, borderColor: 'divider', overflow: 'auto', p: 2 }}>
              {selected ? (
                <PropertyPanel node={selected} onChange={update} showGeometry={selAbsolute} />
              ) : (
                <Typography color="text.secondary">Select a widget.</Typography>
              )}
            </Box>
          </>
        )}
      </DialogContent>

      {/* Add-widget menu */}
      <Menu open={!!addAnchor} anchorEl={addAnchor?.el} onClose={() => setAddAnchor(null)}>
        {ADDABLE_WIDGETS.map((w) => (
          <MenuItem key={w.class} onClick={() => addAnchor && handleAdd(w.class, addAnchor.parentId)}>
            {w.label}
          </MenuItem>
        ))}
      </Menu>

      {/* Faithful WASM preview — compiles MinisQt + this scene */}
      {previewOpen && previewUrls && (
        <CppWasmRuntime
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          title={`Preview — ${path.split('/').pop()}`}
          buildSseUrl={previewUrls.build}
          wasmJsUrl={previewUrls.js}
          token={token}
        />
      )}
    </Dialog>
  );
}

// ── Widget tree row (recursive) ──────────────────────────────────────────────
function TreeRow({ node, depth, selectedId, rootId, onSelect, onAdd, onDelete }: {
  node: QtWidgetNode; depth: number; selectedId: string; rootId: string;
  onSelect: (id: string) => void;
  onAdd: (el: HTMLElement, parentId: string) => void;
  onDelete: (id: string) => void;
}) {
  const sel = node.id === selectedId;
  return (
    <Box>
      <Box
        onClick={() => onSelect(node.id)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5, pr: 0.5, py: 0.25, borderRadius: 1,
          pl: 0.5 + depth * 1.5, cursor: 'pointer',
          bgcolor: sel ? 'action.selected' : 'transparent', '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }} noWrap>
          <Box component="span" sx={{ color: 'primary.main' }}>{node.class.replace('Q', '')}</Box>
          <Box component="span" sx={{ color: 'text.secondary', ml: 0.5, fontSize: 11 }}>#{node.id}</Box>
        </Typography>
        {isContainer(node) && (
          <Tooltip title="Add child widget">
            <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => { e.stopPropagation(); onAdd(e.currentTarget, node.id); }}>
              <Add sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        )}
        {node.id !== rootId && (
          <Tooltip title="Delete">
            <IconButton size="small" sx={{ p: 0.25, opacity: 0.5, '&:hover': { opacity: 1, color: 'error.main' } }}
              onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}>
              <DeleteOutline sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      {(node.children ?? []).map((c) => (
        <TreeRow key={c.id} node={c} depth={depth + 1} selectedId={selectedId} rootId={rootId}
          onSelect={onSelect} onAdd={onAdd} onDelete={onDelete} />
      ))}
    </Box>
  );
}

// ── Property panel (per widget class) ────────────────────────────────────────
function PropertyPanel({ node, onChange, showGeometry }: { node: QtWidgetNode; onChange: (patch: Partial<QtWidgetNode>) => void; showGeometry?: boolean }) {
  const geom = node.geometry ?? [8, 8, 120, 28];
  const setGeom = (i: number, v: number) => {
    const g = [...geom] as [number, number, number, number];
    g[i] = v;
    onChange({ geometry: g });
  };
  return (
    <Box sx={{ maxWidth: 520 }}>
      <Typography variant="overline" color="text.secondary">
        {node.class} <Box component="span" sx={{ color: 'text.secondary' }}>#{node.id}</Box>
      </Typography>

      {/* Absolute position & size (only when the parent has no layout) */}
      {showGeometry && (
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary" display="block">Position &amp; size</Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
            <NumField label="X" value={geom[0]} onChange={(v) => setGeom(0, v)} />
            <NumField label="Y" value={geom[1]} onChange={(v) => setGeom(1, v)} />
          </Box>
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            <NumField label="Width" value={geom[2]} onChange={(v) => setGeom(2, v)} />
            <NumField label="Height" value={geom[3]} onChange={(v) => setGeom(3, v)} />
          </Box>
          <Divider sx={{ my: 1.5 }} />
        </Box>
      )}

      {/* Text (QLabel / QPushButton / QCheckBox) */}
      {(node.class === 'QLabel' || node.class === 'QPushButton' || node.class === 'QCheckBox') && (
        <StrField label="Text" value={node.text ?? ''} onChange={(v) => onChange({ text: v })} />
      )}

      {/* QLabel */}
      {node.class === 'QLabel' && (
        <>
          <SelectField label="Alignment" value={node.alignment ?? 'AlignLeft'} options={ALIGNMENTS}
            onChange={(v) => onChange({ alignment: v as QtAlignment })} />
          <ColorField label="Text color" value={node.color ?? '#ffffff'} onChange={(v) => onChange({ color: v })} />
        </>
      )}

      {/* QPushButton */}
      {node.class === 'QPushButton' && (
        <ColorField label="Button color" value={node.color ?? '#3c78c8'} onChange={(v) => onChange({ color: v })} />
      )}

      {/* QSlider / QProgressBar */}
      {(node.class === 'QSlider' || node.class === 'QProgressBar') && (
        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
          <NumField label="Min" value={node.min ?? 0} onChange={(v) => onChange({ min: v })} />
          <NumField label="Max" value={node.max ?? 100} onChange={(v) => onChange({ max: v })} />
          <NumField label="Value" value={node.value ?? 0} onChange={(v) => onChange({ value: v })} />
        </Box>
      )}
      {node.class === 'QProgressBar' && (
        <FormControlLabel sx={{ mt: 0.5 }} control={
          <Checkbox size="small" checked={node.textVisible !== false} onChange={(e) => onChange({ textVisible: e.target.checked })} />
        } label="Show percentage" />
      )}

      {/* QCheckBox */}
      {node.class === 'QCheckBox' && (
        <FormControlLabel sx={{ mt: 0.5 }} control={
          <Checkbox size="small" checked={!!node.checked} onChange={(e) => onChange({ checked: e.target.checked })} />
        } label="Checked" />
      )}

      {/* Container (QWidget) */}
      {node.class === 'QWidget' && (
        <>
          <SelectField label="Layout" value={node.layout ?? 'none'} options={['none', 'QVBoxLayout', 'QHBoxLayout']}
            onChange={(v) => onChange({ layout: v as QtWidgetNode['layout'] })} />
          {node.layout && node.layout !== 'none' && (
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <NumField label="Spacing" value={node.spacing ?? 6} onChange={(v) => onChange({ spacing: v })} />
              <NumField label="Margin" value={node.margin ?? 6} onChange={(v) => onChange({ margin: v })} />
            </Box>
          )}
        </>
      )}

      {/* Common: background + font */}
      <Divider sx={{ my: 1.5 }} />
      <ColorField label="Background (optional)" value={node.background ?? ''} onChange={(v) => onChange({ background: v || undefined })} allowEmpty />
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1 }}>
        <NumField label="Font px" value={node.font?.pixelSize ?? 16} onChange={(v) => onChange({ font: { ...node.font, pixelSize: v } })} />
        <FormControlLabel control={
          <Checkbox size="small" checked={!!node.font?.bold} onChange={(e) => onChange({ font: { ...node.font, bold: e.target.checked } })} />
        } label="Bold" />
      </Box>
    </Box>
  );
}

// ── Small field helpers ──────────────────────────────────────────────────────
function StrField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <TextField size="small" fullWidth label={label} value={value} onChange={(e) => onChange(e.target.value)} sx={{ mt: 1 }} />;
}
function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <TextField size="small" type="number" label={label} value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)} sx={{ flex: 1 }} />
  );
}
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <TextField select size="small" fullWidth label={label} value={value} onChange={(e) => onChange(e.target.value)} sx={{ mt: 1 }}>
      {options.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
    </TextField>
  );
}
function ColorField({ label, value, onChange, allowEmpty, sx }: { label: string; value: string; onChange: (v: string) => void; allowEmpty?: boolean; sx?: object }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1, ...sx }}>
      <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)} style={{ width: 32, height: 32, border: 'none', background: 'none', padding: 0 }} />
      <TextField size="small" fullWidth label={label} value={value}
        placeholder={allowEmpty ? '(none)' : undefined}
        onChange={(e) => onChange(e.target.value)} />
    </Box>
  );
}

export default QtUiSceneEditor;
