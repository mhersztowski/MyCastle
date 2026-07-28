import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Snackbar, Alert } from '@mui/material';
import type { Project } from '@mhersztowski/core-cad';
import { exportDXF, exportGLTF, exportJSON, exportOBJ, exportSTEP, exportSTL, exportSVG, importDXF, importJSON, importSTL } from '../io/CadExporter';
import { ProjectBrowser } from './ProjectBrowser';
import { ServerFileBrowser } from './ServerFileBrowser';
import { SCENE_EXT, CAD3D_EXT, CAD_EXT, readFileAt, writeFileAt, buildViewerUrl } from '../vfs/cadProjectApi';
import { useRegisterFileOps, type FileOps } from '../fileops/FileOpsContext';

import { syncOpenUrl } from '../vfs/openTarget';
interface Props {
  project: Project;
  /** 'cad' or 'cad3d' — chooses the viewer route and registry key. */
  mode: string;
  getSceneData?: () => string | null;
  onSceneData?: (json: string) => void;
}

/**
 * Headless registrar for CAD / CAD 3D file operations. Hosts the CAD dialogs
 * (project browser, scene browser, local file inputs) and registers its actions
 * with the unified File menu. Renders no visible button itself.
 */
export function CadFileOps({ project, mode, getSceneData, onSceneData }: Props) {
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);
  const [browserMode, setBrowserMode] = useState<'open' | 'save' | null>(null);
  const [sceneSaveOpen, setSceneSaveOpen] = useState(false);
  const [sceneOpenOpen, setSceneOpenOpen] = useState(false);
  const [currentFile, setCurrentFile] = useState<{ dir: string; name: string } | null>(null);
  const currentName = currentFile?.name ?? null;
  // Ścieżka w kształcie, jakiego używają viewery i adresy `/open/…` (bez wiodącego `/`).
  const currentPath = currentFile
    ? `${currentFile.dir}/${currentFile.name}${mode === 'cad3d' ? CAD3D_EXT : CAD_EXT}`.replace(/^\/+/, '')
    : null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dxfInputRef = useRef<HTMLInputElement>(null);
  const stlImportRef = useRef<HTMLInputElement>(null);

  const hasSceneData = Boolean(getSceneData?.());

  function handleNew() {
    if (!window.confirm('Discard current project and start new?')) return;
    project.reset();
  }

  // Dla mode='cad3d' zapisujemy feature tree do .cad3d.json, dla pozostałych — Scene 3D data do .scene.json
  const sceneExtForMode = mode === 'cad3d' ? CAD3D_EXT : SCENE_EXT;

  async function handleWriteScene(dir: string, name: string) {
    const sceneJson = getSceneData?.();
    if (!sceneJson) {
      const what = mode === 'cad3d' ? 'CAD 3D feature tree' : 'Scene 3D data';
      throw new Error(`No ${what} to save — utwórz coś w scenie najpierw.`);
    }
    await writeFileAt(dir, name, sceneExtForMode, sceneJson);
  }
  async function handleReadScene(dir: string, name: string) {
    onSceneData?.(await readFileAt(dir, name, sceneExtForMode));
    syncOpenUrl(`${dir}/${name}${sceneExtForMode}`);
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try { await importJSON(file, project); setToast({ msg: 'Project loaded', severity: 'success' }); }
    catch (err) { setToast({ msg: (err as Error).message, severity: 'error' }); }
  }
  async function handleDxfFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try { await importDXF(file, project); setToast({ msg: 'DXF imported', severity: 'success' }); }
    catch (err) { setToast({ msg: (err as Error).message, severity: 'error' }); }
  }
  async function handleStlFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try { onSceneData?.(await importSTL(file)); setToast({ msg: `STL loaded into Scene 3D: ${file.name}`, severity: 'success' }); }
    catch (err) { setToast({ msg: (err as Error).message, severity: 'error' }); }
  }

  async function runExport(fn: () => void | Promise<void>, label: string) {
    setBusy(true);
    try { await fn(); }
    catch (err) { setToast({ msg: `${label} failed: ${(err as Error).message}`, severity: 'error' }); }
    finally { setBusy(false); }
  }

  const viewerUrl = currentFile
    ? buildViewerUrl(mode === 'cad3d' ? 'cad3d' : 'cad', currentFile.dir, currentFile.name)
    : null;

  // Mode-aware server actions:
  // - mode='cad3d' → CAD 3D feature tree jest primary (.cad3d.json); 2D CAD project (.cad.json)
  //   pozostaje dostępny bo w CAD 3D tab jest też 2D sketch project używany przez sketche.
  //   Scene 3D save/load jest z osobnego tab-a więc pomijamy.
  // - mode='cad' (2D CAD) → primary jest .cad.json, Scene 3D companion (.scene.json)
  const isCad3d = mode === 'cad3d';
  const serverActions = isCad3d
    ? [
        { label: 'Open CAD 3D from Server…', secondary: 'Reads .cad3d.json (feature tree)', run: () => setSceneOpenOpen(true) },
        { label: 'Save CAD 3D to Server…', secondary: 'Writes .cad3d.json (feature tree)', run: () => setSceneSaveOpen(true) },
        { label: 'Open 2D CAD from Server…', secondary: 'Reads .cad.json (2D project)', run: () => setBrowserMode('open') },
        { label: 'Save 2D CAD to Server…', secondary: 'Writes .cad.json (2D project)', run: () => setBrowserMode('save') },
      ]
    : [
        { label: 'Open CAD from Server…', secondary: 'Reads .cad.json', run: () => setBrowserMode('open') },
        { label: 'Save CAD to Server…', secondary: 'Writes .cad.json', run: () => setBrowserMode('save') },
        { label: 'Open Scene 3D from Server…', secondary: 'Reads .scene.json', run: () => setSceneOpenOpen(true) },
        { label: 'Save Scene 3D to Server…', secondary: hasSceneData ? 'Writes .scene.json' : 'No scene loaded', run: () => setSceneSaveOpen(true), disabled: !hasSceneData },
      ];

  const ops: FileOps = useMemo(() => ({
    currentName,
    currentPath,
    newDoc: handleNew,
    server: serverActions,
    importItems: [
      { label: 'Open JSON (local)…', run: () => fileInputRef.current?.click() },
      { label: 'Import DXF (local)…', secondary: 'Adds entities', run: () => dxfInputRef.current?.click() },
      { label: 'Import STL (local)…', secondary: 'Into Scene 3D', run: () => stlImportRef.current?.click() },
    ],
    exportItems: [
      { label: 'Save JSON (local)', run: () => exportJSON(project) },
      { label: 'Export SVG', secondary: '2D vector', run: () => exportSVG(project) },
      { label: 'Export DXF', secondary: '2D CAD', run: () => exportDXF(project) },
      { label: 'Export OBJ', secondary: '3D mesh', run: () => exportOBJ(project) },
      { label: 'Export STL', secondary: '3D mesh', run: () => exportSTL(project) },
      { label: 'Export STEP', secondary: '3D solid', disabled: busy, run: () => runExport(() => exportSTEP(project), 'STEP export') },
      { label: 'Export glTF', secondary: '3D scene', disabled: busy, run: () => runExport(() => exportGLTF(project, false), 'glTF export') },
      { label: 'Export glTF Binary', secondary: '.glb', disabled: busy, run: () => runExport(() => exportGLTF(project, true), 'glTF export') },
    ],
    viewerUrl,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [mode, hasSceneData, busy, viewerUrl, currentName, currentPath, project, serverActions]);

  useRegisterFileOps(mode, ops, [mode, hasSceneData, busy, viewerUrl, currentName, currentPath]);

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".json,.cad.json" style={{ display: 'none' }} onChange={handleFileChange} />
      <input ref={dxfInputRef} type="file" accept=".dxf" style={{ display: 'none' }} onChange={handleDxfFileChange} />
      <input ref={stlImportRef} type="file" accept=".stl" style={{ display: 'none' }} onChange={handleStlFileChange} />

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ width: '100%' }}>{toast.msg}</Alert> : undefined}
      </Snackbar>

      {browserMode && (
        <ProjectBrowser
          open={Boolean(browserMode)}
          mode={browserMode}
          project={project}
          onClose={() => setBrowserMode(null)}
          onFile={(dir, name) => setCurrentFile({ dir, name })}
          onDone={name => setToast({ msg: `${browserMode === 'open' ? 'Opened CAD' : 'Saved CAD'}: ${name}`, severity: 'success' })}
        />
      )}

      {sceneOpenOpen && (
        <ServerFileBrowser
          open mode="open"
          title={mode === 'cad3d' ? 'Open CAD 3D feature tree from Server' : 'Open Scene 3D from Server'}
          extension={sceneExtForMode} storageKey="cad.projectBrowser.dir"
          onClose={() => setSceneOpenOpen(false)} onOpen={handleReadScene}
          onDone={name => setToast({ msg: `Opened: ${name}`, severity: 'success' })}
        />
      )}
      {sceneSaveOpen && (
        <ServerFileBrowser
          open mode="save"
          title={mode === 'cad3d' ? 'Save CAD 3D feature tree to Server' : 'Save Scene 3D to Server'}
          extension={sceneExtForMode} storageKey="cad.projectBrowser.dir"
          onClose={() => setSceneSaveOpen(false)} onSave={handleWriteScene}
          onDone={name => setToast({ msg: `Saved: ${name}`, severity: 'success' })}
        />
      )}
    </>
  );
}
