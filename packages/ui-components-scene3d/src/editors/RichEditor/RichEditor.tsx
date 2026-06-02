import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { RichEditorProps, SceneTreeNodeData, SelectedNodeData, TransformMode, ToolbarItem, CameraPresetName, SceneSettings, SceneGeometryEntry } from '@mhersztowski/ui-core';
import { useDialog, DEFAULT_SCENE_SETTINGS } from '@mhersztowski/ui-core';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { SimpleViewer, SceneGraph, SceneSerializer, SceneDeserializer, MeshNode, LightNode, GroupNode, CameraNode, AudioNode, parseOBJText, parseSTLBuffer, parseGLTFBuffer, FBXImporter, GLTFExporter, OBJExporter, STLExporter, CAMERA_PRESETS, AnimationEngine, PrefabStore } from '@mhersztowski/core-scene3d';
import type { SceneNode, LightType, BufferGeometryData, SceneRenderMode, AnimationClip, PrefabEntry } from '@mhersztowski/core-scene3d';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import SaveAsIcon from '@mui/icons-material/SaveAs';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import SettingsIcon from '@mui/icons-material/Settings';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import DownloadingIcon from '@mui/icons-material/Downloading';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import { Allotment } from 'allotment';
import { Toolbar } from '../../toolbar';
import { SceneTreePanel, PropertiesPanel, AnimationPanel, PrefabsPanel } from '../../panels';
import type { ProjectPrefabGroup } from '../../panels';
import { Dialog } from '../../components';
import {
  MoveIcon,
  RotateIcon,
  ScaleIcon,
  GridIcon,
} from '../../icons';

function buildTreeNodes(node: SceneNode): SceneTreeNodeData {
  const meshNode = node.type === 'mesh' ? (node as unknown as MeshNode) : null;
  const lightNode = node.type === 'light' ? (node as unknown as LightNode) : null;

  let name = node.name;
  if (meshNode) {
    const geoType = meshNode.geometry.type;
    if (!name || name.startsWith('mesh-')) {
      name = geoType.charAt(0).toUpperCase() + geoType.slice(1);
    }
  }
  if (lightNode) {
    if (!name || name.startsWith('light-')) {
      name = lightNode.lightType.charAt(0).toUpperCase() + lightNode.lightType.slice(1) + ' Light';
    }
  }
  if (node.type === 'group') {
    if (!name || name.startsWith('group-')) {
      name = 'Group';
    }
  }
  if (node.type === 'audio') {
    if (!name || name.startsWith('audio-')) {
      name = 'Audio Source';
    }
  }

  return {
    id: node.id,
    name,
    type: node.type,
    visible: node.visible,
    children: node.children.map(buildTreeNodes),
    metadata: Object.keys(node.metadata).length > 0 ? node.metadata : undefined,
  };
}

function buildSelectedNodeData(node: SceneNode): SelectedNodeData {
  const meshNode = node.type === 'mesh' ? (node as unknown as MeshNode) : null;
  const lightNode = node.type === 'light' ? (node as unknown as LightNode) : null;
  const cameraNode = node.type === 'camera' ? (node as unknown as CameraNode) : null;
  const audioNode = node.type === 'audio' ? (node as unknown as AudioNode) : null;

  return {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible,
    transform: {
      position: [...node.position],
      rotation: [...node.rotation],
      scale: [...node.scale],
    },
    object: {
      castShadow: node.castShadow,
      receiveShadow: node.receiveShadow,
      frustumCulled: node.frustumCulled,
      renderOrder: node.renderOrder,
      userData: node.userData,
    },
    geometry: meshNode
      ? (() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const threeGeo = (meshNode as any)._threeObject?.geometry as any;
          const attributes = threeGeo
            ? {
                indexCount: threeGeo.index?.count as number | undefined,
                positionCount: threeGeo.attributes?.position?.count as number | undefined,
                normalCount: threeGeo.attributes?.normal?.count as number | undefined,
                uvCount: threeGeo.attributes?.uv?.count as number | undefined,
              }
            : undefined;
          let bounds: [number, number, number] | undefined;
          if (threeGeo && typeof threeGeo.computeBoundingBox === 'function') {
            threeGeo.computeBoundingBox();
            const bb = threeGeo.boundingBox;
            if (bb) {
              bounds = [
                parseFloat((bb.max.x - bb.min.x).toFixed(4)),
                parseFloat((bb.max.y - bb.min.y).toFixed(4)),
                parseFloat((bb.max.z - bb.min.z).toFixed(4)),
              ];
            }
          }
          return {
            geoId: meshNode.geometry.id,
            geoType: meshNode.geometry.type,
            params: { ...(meshNode.geometry.params ?? {}) },
            code: meshNode.geometry.code,
            nodesGraph: meshNode.geometry.nodesGraph,
            vertexCount: meshNode.geometry.bufferData ? Math.floor(meshNode.geometry.bufferData.positions.length / 3) : undefined,
            indexCount: meshNode.geometry.bufferData?.indices?.length,
            fileName: meshNode.geometry.fileName,
            attributes,
            bounds,
          };
        })()
      : undefined,
    material: meshNode
      ? {
          matId: meshNode.material.id,
          matType: meshNode.material.type,
          color: meshNode.material.color,
          opacity: meshNode.material.opacity,
          transparent: meshNode.material.transparent,
          wireframe: meshNode.material.wireframe,
          side: meshNode.material.side,
          blending: meshNode.material.blending,
          depthTest: meshNode.material.depthTest,
          depthWrite: meshNode.material.depthWrite,
          alphaTest: meshNode.material.alphaTest,
          vertexColors: meshNode.material.vertexColors,
          forceSinglePass: meshNode.material.forceSinglePass,
          emissive: meshNode.material.emissive,
          emissiveIntensity: meshNode.material.emissiveIntensity,
          reflectivity: meshNode.material.reflectivity,
          flatShading: meshNode.material.flatShading,
          specular: meshNode.material.specular,
          shininess: meshNode.material.shininess,
          roughness: meshNode.material.roughness,
          metalness: meshNode.material.metalness,
          ior: meshNode.material.ior,
          clearcoat: meshNode.material.clearcoat,
          clearcoatRoughness: meshNode.material.clearcoatRoughness,
          dispersion: meshNode.material.dispersion,
          iridescence: meshNode.material.iridescence,
          iridescenceIOR: meshNode.material.iridescenceIOR,
          thinFilmThicknessMin: meshNode.material.thinFilmThicknessMin,
          thinFilmThicknessMax: meshNode.material.thinFilmThicknessMax,
          sheen: meshNode.material.sheen,
          sheenRoughness: meshNode.material.sheenRoughness,
          sheenColor: meshNode.material.sheenColor,
          transmission: meshNode.material.transmission,
          attenuationDistance: meshNode.material.attenuationDistance,
          attenuationColor: meshNode.material.attenuationColor,
          thickness: meshNode.material.thickness,
          depthPacking: meshNode.material.depthPacking,
        }
      : undefined,
    camera: cameraNode
      ? { cameraType: cameraNode.cameraType, fov: cameraNode.fov, near: cameraNode.near, far: cameraNode.far, left: cameraNode.left, right: cameraNode.right, top: cameraNode.top, bottom: cameraNode.bottom }
      : undefined,
    light: lightNode
      ? {
          lightType: lightNode.lightType,
          color: lightNode.color,
          groundColor: lightNode.groundColor,
          intensity: lightNode.intensity,
          distance: lightNode.distance,
          decay: lightNode.decay,
          angle: lightNode.angle,
          penumbra: lightNode.penumbra,
          shadowIntensity: lightNode.shadowIntensity,
          shadowBias: lightNode.shadowBias,
          shadowNormalBias: lightNode.shadowNormalBias,
          shadowRadius: lightNode.shadowRadius,
        }
      : undefined,
    audio: audioNode
      ? {
          src: audioNode.src,
          volume: audioNode.volume,
          loop: audioNode.loop,
          autoplay: audioNode.autoplay,
          positional: audioNode.positional ?? true,
          rolloffFactor: audioNode.rolloffFactor,
          maxDistance: audioNode.maxDistance,
          refDistance: audioNode.refDistance,
          distanceModel: audioNode.distanceModel,
          coneInnerAngle: audioNode.coneInnerAngle,
          coneOuterAngle: audioNode.coneOuterAngle,
          coneOuterGain: audioNode.coneOuterGain,
        }
      : undefined,
  };
}

function getNodePath(node: SceneNode, root: SceneNode): string {
  const parts: string[] = [];
  let cur: SceneNode | null | undefined = node;
  while (cur && cur !== root) {
    parts.unshift(cur.name || cur.type);
    cur = cur.parent;
  }
  return parts.join(' / ') || node.name || node.type;
}

function collectSceneGeometries(sceneGraph: SceneGraph): SceneGeometryEntry[] {
  const entries: SceneGeometryEntry[] = [];
  sceneGraph.root.traverse((node) => {
    if (node.type !== 'mesh') return;
    const meshNode = node as unknown as MeshNode;
    if (!meshNode.geometry.id) return;
    entries.push({
      nodeId: node.id,
      nodeName: getNodePath(node, sceneGraph.root),
      geoId: meshNode.geometry.id,
      geoType: meshNode.geometry.type,
    });
  });
  return entries;
}

interface ClipboardData {
  type: 'mesh' | 'light' | 'audio';
  data: Record<string, unknown>;
  isCut: boolean;
  sourceId: string;
}

const MESH_COLORS = ['#4fc3f7', '#81c784', '#ffb74d', '#e57373', '#ba68c8', '#4dd0e1', '#aed581', '#ff8a65'];
const HISTORY_MAX = 50;

interface RichEditorExtendedProps extends RichEditorProps {
  onOpenFromServer?: () => void;
  onSaveToServer?: () => void;
  onImportFromCad?: () => void;
  cadEntityCount?: number;
  debugLog?: boolean;
  onBrowseAudioFile?: () => Promise<string | null>;
  resolveAudioSrc?: (src: string) => Promise<string>;
  currentProject?: string;
  currentFile?: string;
  otherProjectsPrefabs?: ProjectPrefabGroup[];
  // onEditMesh and getNodeGeometryRef are inherited from RichEditorProps (ui-core)
}

export function RichEditor({ className, style, initialSceneData, initialPrefabs, onSavePrefab, onDeletePrefab, fitSceneRef: externalFitRef, mergeSceneRef: externalMergeRef, onSceneChange, onPlaneClick, propertyChangeRef, getNodeGeometryRef, onOpenFromServer, onSaveToServer, onImportFromCad, cadEntityCount, debugLog, onBrowseAudioFile, resolveAudioSrc, onEditGeometryNodes, onEditMesh, currentProject, currentFile, otherProjectsPrefabs }: RichEditorExtendedProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [transformMode, setTransformMode] = useState<TransformMode>('translate');
  const [showGrid, setShowGrid] = useState(true);
  const internalFitRef = useRef<(() => void) | null>(null);
  // Merge internal and external ref: when SimpleViewer sets internalFitRef.current,
  // propagate to externalFitRef so callers can trigger fit from outside.
  const fitSceneRef = useMemo(() => ({
    get current() { return internalFitRef.current; },
    set current(fn) {
      internalFitRef.current = fn;
      if (externalFitRef) externalFitRef.current = fn;
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [externalFitRef]) as React.MutableRefObject<(() => void) | null>;
  const historyRef = useRef<string[]>([]);
  const historyPointerRef = useRef(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // ── Animation ──────────────────────────────────────────────────────────────
  const [animVersion, setAnimVersion] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [animLoop, setAnimLoop] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showAnimPanel, setShowAnimPanel] = useState(false);
  const [showHierarchyPanel, setShowHierarchyPanel] = useState(true);
  const [showInspectorPanel, setShowInspectorPanel] = useState(true);
  const [animPanelHeight, setAnimPanelHeight] = useState(200);
  const [leftTab, setLeftTab] = useState<'scene' | 'prefabs'>('scene');
  const [prefabNameDialogOpen, setPrefabNameDialogOpen] = useState(false);
  const pendingPrefabNodeIdRef = useRef<string | null>(null);
  const [prefabNameInput, setPrefabNameInput] = useState('');
  const [prefabVersionInput, setPrefabVersionInput] = useState('1.0.0');
  const [prefabAuthorInput, setPrefabAuthorInput] = useState('');
  const rafRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const currentTimeRef = useRef(0);
  const isLoopRef = useRef(false);
  const isRecordingRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sceneGraphRef = useRef<SceneGraph>(null as any); // synced after sceneGraph is declared below
  useEffect(() => { isLoopRef.current = animLoop; }, [animLoop]);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  // ──────────────────────────────────────────────────────────────────────────

  const containerRef = useRef<HTMLDivElement>(null);
  const clipboardRef = useRef<ClipboardData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stlFileInputRef = useRef<HTMLInputElement>(null);
  const fbxFileInputRef = useRef<HTMLInputElement>(null);
  const sceneFileInputRef = useRef<HTMLInputElement>(null);
  const importParentIdRef = useRef<string | undefined>(undefined);
  const [canPaste, setCanPaste] = useState(false);
  const [activeCameraNodeId, setActiveCameraNodeId] = useState<string | null>(null);
  const [renderMode, setRenderMode] = useState<SceneRenderMode>('realistic');
  const [sceneSettings, setSceneSettings] = useState<SceneSettings>(DEFAULT_SCENE_SETTINGS);
  const [fileMenuAnchor, setFileMenuAnchor] = useState<HTMLElement | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPresetName>(() =>
    (localStorage.getItem('scene3d-camera-preset') as CameraPresetName) || 'standard',
  );
  const settingsDialog = useDialog();
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down('md'));

  const [sceneGraph, setSceneGraph] = useState(() => {
    let graph: SceneGraph | undefined;
    if (initialSceneData) {
      try { graph = SceneDeserializer.deserialize(initialSceneData); } catch { /* fall through */ }
    }
    if (!graph) {
      graph = new SceneGraph();

      graph.addNode(new MeshNode({
        name: 'Box',
        geometry: { type: 'box' },
        material: { color: '#4fc3f7', opacity: 1, wireframe: false },
      }));

      graph.addNode(new MeshNode({
        name: 'Sphere',
        position: [3, 0, 0],
        geometry: { type: 'sphere' },
        material: { color: '#81c784', opacity: 1, wireframe: false },
      }));

      graph.addNode(new MeshNode({
        name: 'Cylinder',
        position: [-3, 0, 0],
        geometry: { type: 'cylinder' },
        material: { color: '#ffb74d', opacity: 1, wireframe: false },
      }));

      graph.addNode(new LightNode({
        name: 'Ambient Light',
        lightType: 'ambient',
        intensity: 0.4,
      }));

      graph.addNode(new LightNode({
        name: 'Sun',
        lightType: 'directional',
        position: [5, 10, 5],
        intensity: 0.8,
      }));
    }

    if (initialPrefabs) {
      try { graph.prefabs = JSON.parse(initialPrefabs) as PrefabEntry[]; } catch { /* ignore */ }
    }

    return graph;
  });

  // Keep sceneGraphRef in sync (declared above sceneGraph to maintain hooks order)
  useEffect(() => { sceneGraphRef.current = sceneGraph; }, [sceneGraph]);

  // Seed history with the initial snapshot on mount / when sceneGraph object is replaced
  useEffect(() => {
    const initial = SceneSerializer.serialize(sceneGraph);
    historyRef.current = [initial];
    historyPointerRef.current = 0;
    setCanUndo(false);
    setCanRedo(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneGraph]);

  const bump = useCallback(() => {
    setVersion((v) => v + 1);
    const current = SceneSerializer.serialize(sceneGraph);
    onSceneChange?.(current);

    const pointer = historyPointerRef.current;
    let history = historyRef.current.slice(0, pointer + 1);
    history = [...history, current];
    if (history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);
    historyRef.current = history;
    historyPointerRef.current = history.length - 1;
    setCanUndo(historyPointerRef.current > 0);
    setCanRedo(false);
  }, [sceneGraph, onSceneChange]);

  const mergeScene = useCallback((json: string) => {
    try {
      // Regenerate all node IDs to avoid conflicts when inserting same template multiple times
      const data = JSON.parse(json);
      function reId(node: Record<string, unknown>) {
        node.id = crypto.randomUUID();
        if (Array.isArray(node.children)) (node.children as Record<string, unknown>[]).forEach(reId);
      }
      if (data.root) reId(data.root);
      const templateGraph = SceneDeserializer.deserialize(JSON.stringify(data));
      for (const child of [...templateGraph.root.children]) {
        sceneGraph.addNode(child, sceneGraph.root.id);
      }
      bump();
    } catch (e) {
      console.error('[RichEditor] mergeScene failed', e);
    }
  }, [sceneGraph, bump]);

  useEffect(() => {
    if (!externalMergeRef) return;
    externalMergeRef.current = mergeScene;
    return () => { externalMergeRef.current = null; };
  }, [externalMergeRef, mergeScene]);

  // Emit initial scene JSON on mount so the parent always has up-to-date data
  useEffect(() => {
    onSceneChange?.(SceneSerializer.serialize(sceneGraph));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneGraph.onChange = bump;
    return () => { sceneGraph.onChange = null; };
  }, [sceneGraph, bump]);

  const undo = useCallback(() => {
    const pointer = historyPointerRef.current;
    if (pointer <= 0) return;
    const newPointer = pointer - 1;
    const snapshot = historyRef.current[newPointer];
    try {
      const newGraph = SceneDeserializer.deserialize(snapshot);
      historyPointerRef.current = newPointer;
      setSceneGraph(newGraph);
      setSelectedNodeId(null);
      setCanUndo(newPointer > 0);
      setCanRedo(true);
      onSceneChange?.(snapshot);
    } catch { /* invalid snapshot, skip */ }
  }, [onSceneChange]);

  const redo = useCallback(() => {
    const pointer = historyPointerRef.current;
    if (pointer >= historyRef.current.length - 1) return;
    const newPointer = pointer + 1;
    const snapshot = historyRef.current[newPointer];
    try {
      const newGraph = SceneDeserializer.deserialize(snapshot);
      historyPointerRef.current = newPointer;
      setSceneGraph(newGraph);
      setSelectedNodeId(null);
      setCanUndo(true);
      setCanRedo(newPointer < historyRef.current.length - 1);
      onSceneChange?.(snapshot);
    } catch { /* invalid snapshot, skip */ }
  }, [onSceneChange]);

  // ── Animation engine integration ───────────────────────────────────────────

  const applyAnimatedValues = useCallback((time: number) => {
    const clip = sceneGraphRef.current.animation;
    if (!clip) return;
    const values = AnimationEngine.evaluate(clip, time);
    values.forEach((props, nodeId) => {
      const node = sceneGraphRef.current.findNode(nodeId);
      if (!node) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const obj3d = (node as any)._threeObject as any;

      Object.entries(props).forEach(([prop, val]) => {
        const parts = prop.split('.');
        if (parts[0] === 'position') {
          const i = parts[1] === 'x' ? 0 : parts[1] === 'y' ? 1 : 2;
          node.position[i] = val as number;
          // push directly to Three.js — same array ref won't trigger R3F applyProps
          obj3d?.position.set(node.position[0], node.position[1], node.position[2]);
        } else if (parts[0] === 'rotation') {
          const i = parts[1] === 'x' ? 0 : parts[1] === 'y' ? 1 : 2;
          node.rotation[i] = val as number;
          obj3d?.rotation.set(node.rotation[0], node.rotation[1], node.rotation[2]);
        } else if (parts[0] === 'scale') {
          const i = parts[1] === 'x' ? 0 : parts[1] === 'y' ? 1 : 2;
          node.scale[i] = val as number;
          obj3d?.scale.set(node.scale[0], node.scale[1], node.scale[2]);
        } else if (parts[0] === 'material' && node.type === 'mesh') {
          (node as unknown as MeshNode).material = { ...(node as unknown as MeshNode).material, [parts[1]]: val };
          const mat = obj3d?.material;
          if (mat) {
            if (parts[1] === 'color' && mat.color?.set) mat.color.set(val);
            else if (parts[1] === 'emissive' && mat.emissive?.set) mat.emissive.set(val);
            else if (parts[1] in mat) mat[parts[1]] = val;
          }
        } else if (parts[0] === 'light' && node.type === 'light') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (node as any)[parts[1]] = val;
          if (obj3d && parts[1] in obj3d) obj3d[parts[1]] = val;
        } else if (prop === 'visible') {
          node.visible = val as boolean;
          if (obj3d) obj3d.visible = val as boolean;
        }
      });
    });
    setAnimVersion(v => v + 1);
  }, []);

  // RAF playback loop
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTimestampRef.current = null;
      return;
    }

    const tick = (timestamp: number) => {
      if (lastTimestampRef.current === null) lastTimestampRef.current = timestamp;
      const dt = (timestamp - lastTimestampRef.current) / 1000;
      lastTimestampRef.current = timestamp;

      const clip = sceneGraphRef.current.animation;
      const duration = clip?.duration ?? 5;
      let newTime = currentTimeRef.current + dt;

      if (newTime >= duration) {
        if (isLoopRef.current) {
          newTime = newTime % duration;
        } else {
          newTime = duration;
          setIsPlaying(false);
          currentTimeRef.current = newTime;
          setCurrentTime(newTime);
          applyAnimatedValues(newTime);
          return;
        }
      }

      currentTimeRef.current = newTime;
      setCurrentTime(newTime);
      applyAnimatedValues(newTime);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, applyAnimatedValues]);

  // Called by SimpleViewer after gizmo drag ends — insert keyframes when recording
  const handleGizmoTransformEnd = useCallback((nodeId: string, mode: 'translate' | 'rotate' | 'scale', value: [number, number, number]) => {
    if (!isRecordingRef.current) return;
    const clip = sceneGraphRef.current.animation;
    if (!clip) return;
    const time = currentTimeRef.current;
    const propMap: Record<string, [string, string, string]> = {
      translate: ['position.x', 'position.y', 'position.z'],
      rotate: ['rotation.x', 'rotation.y', 'rotation.z'],
      scale: ['scale.x', 'scale.y', 'scale.z'],
    };
    const props = propMap[mode];
    let newClip = clip;
    props.forEach((prop, i) => {
      const { clip: withTrack, track } = AnimationEngine.getOrCreateTrack(newClip, nodeId, prop);
      const updatedTrack = AnimationEngine.setKeyframe(track, time, value[i]);
      newClip = AnimationEngine.updateTrack(withTrack, updatedTrack);
    });
    sceneGraphRef.current.animation = newClip;
    bump();
  }, [bump]);

  const handleAnimClipChange = useCallback((clip: AnimationClip | null) => {
    sceneGraph.animation = clip ?? null;
    bump();
  }, [sceneGraph, bump]);

  const handleAnimTimeChange = useCallback((time: number) => {
    currentTimeRef.current = time;
    setCurrentTime(time);
    applyAnimatedValues(time);
  }, [applyAnimatedValues]);

  const handlePlayPause = useCallback(() => setIsPlaying(p => !p), []);

  const handleStop = useCallback(() => {
    setIsPlaying(false);
    currentTimeRef.current = 0;
    setCurrentTime(0);
    applyAnimatedValues(0);
  }, [applyAnimatedValues]);

  // ── Prefabs ────────────────────────────────────────────────────────────────

  const handleCreatePrefab = useCallback((nodeId: string) => {
    const node = sceneGraph.findNode(nodeId);
    if (!node) return;
    pendingPrefabNodeIdRef.current = nodeId;
    setPrefabNameInput(node.name);
    setPrefabNameDialogOpen(true);
  }, [sceneGraph]);

  const handlePrefabNameConfirm = useCallback(() => {
    const nodeId = pendingPrefabNodeIdRef.current;
    if (!nodeId || !prefabNameInput.trim()) return;
    const node = sceneGraph.findNode(nodeId);
    if (!node) return;
    const entry = PrefabStore.create(prefabNameInput.trim(), node, {
      version: prefabVersionInput,
      author: prefabAuthorInput,
    });
    sceneGraph.prefabs = [...sceneGraph.prefabs, entry];
    bump();
    setPrefabNameDialogOpen(false);
    onSavePrefab?.(entry.id, entry.name, JSON.stringify(entry)).catch(console.error);
  }, [sceneGraph, prefabNameInput, prefabVersionInput, prefabAuthorInput, bump, onSavePrefab]);

  const handleInstantiatePrefab = useCallback((entry: PrefabEntry) => {
    const node = PrefabStore.instantiate(entry);
    sceneGraph.addNode(node);
    setSelectedNodeId(node.id);
    bump();
  }, [sceneGraph, bump]);

  const handleDeletePrefab = useCallback((id: string) => {
    sceneGraph.prefabs = sceneGraph.prefabs.filter(e => e.id !== id);
    bump();
    onDeletePrefab?.(id).catch(console.error);
  }, [sceneGraph, bump, onDeletePrefab]);

  const handleRenamePrefab = useCallback((id: string, name: string) => {
    const updated = sceneGraph.prefabs.map(e => e.id === id ? { ...e, name } : e);
    sceneGraph.prefabs = updated;
    bump();
    const entry = updated.find(e => e.id === id);
    if (entry) onSavePrefab?.(id, name, JSON.stringify(entry)).catch(console.error);
  }, [sceneGraph, bump, onSavePrefab]);

  // ──────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const el = containerRef.current;
      if (!el || !el.getBoundingClientRect().width) return; // hidden (display:none)
      if ((e.target as HTMLElement).matches?.('input, textarea, [contenteditable]')) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [undo, redo]);

  // ─── Add operations ─────────────────────────────────────────

  const addMesh = useCallback((type: 'box' | 'sphere' | 'cylinder' | 'cone' | 'plane' | 'torus' | 'procedural' | 'nodes', parentId?: string) => {
    const color = MESH_COLORS[sceneGraph.root.children.length % MESH_COLORS.length];
    const name = type === 'procedural' ? 'Procedural Mesh' : type === 'nodes' ? 'Geometry Nodes' : type.charAt(0).toUpperCase() + type.slice(1);
    const node = new MeshNode({
      name,
      geometry: type === 'procedural'
        ? { type: 'procedural', code: `// Return a THREE.BufferGeometry\nconst geo = new THREE.SphereGeometry(1, 32, 16);\nreturn geo;` }
        : type === 'nodes'
          ? { type: 'nodes', nodesGraph: { nodes: [{ id: 'n1', type: 'box', x: 80, y: 100, params: { width: 1, height: 1, depth: 1 } }, { id: 'out', type: 'output', x: 400, y: 100, params: {} }], edges: [{ id: 'e1', source: 'n1', sourceHandle: 'geo-out', target: 'out', targetHandle: 'geo-in' }] } }
          : { type },
      material: { color, opacity: 1, wireframe: false },
    });
    sceneGraph.addNode(node, parentId);
    setSelectedNodeId(node.id);
  }, [sceneGraph]);

  const addLight = useCallback((lightType: 'ambient' | 'point' | 'directional' | 'spot' | 'hemisphere', parentId?: string) => {
    const nameMap: Record<string, string> = {
      ambient: 'Ambient Light', point: 'Point Light', directional: 'Directional Light',
      spot: 'Spot Light', hemisphere: 'Hemisphere Light',
    };
    const posMap: Record<string, [number, number, number]> = {
      ambient: [0, 0, 0], directional: [5, 10, 5], hemisphere: [0, 10, 0],
      point: [0, 3, 0], spot: [5, 10, 7.5],
    };
    const node = new LightNode({
      name: nameMap[lightType],
      lightType,
      position: posMap[lightType],
      intensity: lightType === 'point' || lightType === 'spot' ? 1 : 0.8,
    });
    sceneGraph.addNode(node, parentId);
    setSelectedNodeId(node.id);
  }, [sceneGraph]);

  const addCamera = useCallback((cameraType: 'perspective' | 'orthographic', parentId?: string) => {
    const node = new CameraNode({
      name: cameraType === 'orthographic' ? 'Orthographic Camera' : 'Perspective Camera',
      cameraType,
      position: [0, 5, 10],
    });
    sceneGraph.addNode(node, parentId);
    setSelectedNodeId(node.id);
  }, [sceneGraph]);

  const addGroup = useCallback((parentId?: string) => {
    const node = new GroupNode({ name: 'Group' });
    sceneGraph.addNode(node, parentId);
    setSelectedNodeId(node.id);
  }, [sceneGraph]);

  const addAudio = useCallback((parentId?: string) => {
    const node = new AudioNode({ name: 'Audio Source' });
    sceneGraph.addNode(node, parentId);
    setSelectedNodeId(node.id);
  }, [sceneGraph]);

  const handleNodeAdd = useCallback((type: string, parentId?: string) => {
    if (type === 'ambient-light') {
      addLight('ambient', parentId);
    } else if (type === 'point-light') {
      addLight('point', parentId);
    } else if (type === 'directional-light') {
      addLight('directional', parentId);
    } else if (type === 'spot-light') {
      addLight('spot', parentId);
    } else if (type === 'hemisphere-light') {
      addLight('hemisphere', parentId);
    } else if (type === 'perspective-camera') {
      addCamera('perspective', parentId);
    } else if (type === 'orthographic-camera') {
      addCamera('orthographic', parentId);
    } else if (type === 'group') {
      addGroup(parentId);
    } else if (type === 'audio') {
      addAudio(parentId);
    } else if (type === 'procedural') {
      addMesh('procedural', parentId);
    } else if (type === 'nodes') {
      addMesh('nodes', parentId);
    } else {
      addMesh(type as 'box' | 'sphere' | 'cylinder' | 'cone' | 'plane' | 'torus', parentId);
    }
  }, [addMesh, addLight, addCamera, addGroup, addAudio]);

  // ─── Delete / Duplicate ─────────────────────────────────────

  const handleSetActiveCamera = useCallback((nodeId: string | null) => {
    setActiveCameraNodeId(nodeId);
  }, []);

  const deleteNode = useCallback((nodeId: string) => {
    sceneGraph.removeNode(nodeId);
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    if (activeCameraNodeId === nodeId) setActiveCameraNodeId(null);
  }, [sceneGraph, selectedNodeId, activeCameraNodeId]);

  const handleDuplicate = useCallback((nodeId: string) => {
    const node = sceneGraph.findNode(nodeId);
    if (!node) return;

    let clone: SceneNode;
    if (node.type === 'mesh') {
      const meshNode = node as unknown as MeshNode;
      clone = new MeshNode({
        name: node.name + ' Copy',
        position: [node.position[0] + 1.5, node.position[1], node.position[2]],
        rotation: [node.rotation[0], node.rotation[1], node.rotation[2]],
        scale: [node.scale[0], node.scale[1], node.scale[2]],
        geometry: { ...meshNode.geometry },
        material: { ...meshNode.material },
      });
    } else if (node.type === 'light') {
      const lightNode = node as unknown as LightNode;
      clone = new LightNode({
        name: node.name + ' Copy',
        position: [node.position[0] + 1.5, node.position[1], node.position[2]],
        lightType: lightNode.lightType,
        color: lightNode.color,
        intensity: lightNode.intensity,
      });
    } else if (node.type === 'audio') {
      const an = node as unknown as AudioNode;
      clone = new AudioNode({
        name: node.name + ' Copy',
        position: [node.position[0] + 1.5, node.position[1], node.position[2]],
        src: an.src,
        volume: an.volume,
        loop: an.loop,
        autoplay: false,
        rolloffFactor: an.rolloffFactor,
        maxDistance: an.maxDistance,
        refDistance: an.refDistance,
        distanceModel: an.distanceModel,
        coneInnerAngle: an.coneInnerAngle,
        coneOuterAngle: an.coneOuterAngle,
        coneOuterGain: an.coneOuterGain,
      });
    } else {
      return;
    }

    const parentId = node.parent && node.parent !== sceneGraph.root ? node.parent.id : undefined;
    sceneGraph.addNode(clone, parentId);
    setSelectedNodeId(clone.id);
  }, [sceneGraph]);

  // ─── Clipboard operations ───────────────────────────────────

  const serializeNode = useCallback((nodeId: string): ClipboardData | null => {
    const node = sceneGraph.findNode(nodeId);
    if (!node) return null;

    if (node.type === 'mesh') {
      const meshNode = node as unknown as MeshNode;
      return {
        type: 'mesh',
        sourceId: nodeId,
        isCut: false,
        data: {
          name: node.name,
          position: [...node.position],
          rotation: [...node.rotation],
          scale: [...node.scale],
          geometry: { ...meshNode.geometry },
          material: { ...meshNode.material },
        },
      };
    }
    if (node.type === 'light') {
      const lightNode = node as unknown as LightNode;
      return {
        type: 'light',
        sourceId: nodeId,
        isCut: false,
        data: {
          name: node.name,
          position: [...node.position],
          lightType: lightNode.lightType,
          color: lightNode.color,
          intensity: lightNode.intensity,
        },
      };
    }
    return null;
  }, [sceneGraph]);

  const handleCopy = useCallback((nodeId: string) => {
    const data = serializeNode(nodeId);
    if (data) {
      data.isCut = false;
      clipboardRef.current = data;
      setCanPaste(true);
    }
  }, [serializeNode]);

  const handleCut = useCallback((nodeId: string) => {
    const data = serializeNode(nodeId);
    if (data) {
      data.isCut = true;
      clipboardRef.current = data;
      setCanPaste(true);
    }
  }, [serializeNode]);

  const handlePaste = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip) return;

    if (clip.isCut) {
      sceneGraph.removeNode(clip.sourceId);
      if (selectedNodeId === clip.sourceId) setSelectedNodeId(null);
    }

    let newNode: SceneNode;
    if (clip.type === 'mesh') {
      const d = clip.data;
      const pos = (d['position'] as number[]) ?? [0, 0, 0];
      newNode = new MeshNode({
        name: ((d['name'] as string) ?? 'Mesh') + (clip.isCut ? '' : ' Copy'),
        position: clip.isCut ? [pos[0], pos[1], pos[2]] : [pos[0] + 1.5, pos[1], pos[2]],
        rotation: (d['rotation'] as [number, number, number]) ?? [0, 0, 0],
        scale: (d['scale'] as [number, number, number]) ?? [1, 1, 1],
        geometry: d['geometry'] as MeshNode['geometry'],
        material: d['material'] as MeshNode['material'],
      });
    } else {
      const d = clip.data;
      const pos = (d['position'] as number[]) ?? [0, 3, 0];
      newNode = new LightNode({
        name: ((d['name'] as string) ?? 'Light') + (clip.isCut ? '' : ' Copy'),
        position: clip.isCut ? [pos[0], pos[1], pos[2]] : [pos[0] + 1.5, pos[1], pos[2]],
        lightType: (d['lightType'] as LightType) ?? 'point',
        color: (d['color'] as string) ?? '#ffffff',
        intensity: (d['intensity'] as number) ?? 1,
      });
    }

    sceneGraph.addNode(newNode);
    setSelectedNodeId(newNode.id);

    if (clip.isCut) {
      clipboardRef.current = null;
      setCanPaste(false);
    }

  }, [sceneGraph, selectedNodeId]);

  // ─── Visibility & property changes ──────────────────────────

  const handleVisibilityToggle = useCallback((nodeId: string) => {
    const node = sceneGraph.findNode(nodeId);
    if (node) {
      node.setVisible(!node.visible);
    }
  }, [sceneGraph]);

  const handlePropertyChange = useCallback((nodeId: string, property: string, value: unknown) => {
    const node = sceneGraph.findNode(nodeId);
    if (!node) return;
    node.setProperty(property, value);
    if (property === '__regenerateId') {
      setSelectedNodeId(node.id);
    }
  }, [sceneGraph]);

  // Expose handlePropertyChange so external dialogs (e.g. geometry node editor) can write back.
  useEffect(() => {
    if (propertyChangeRef) propertyChangeRef.current = handlePropertyChange;
    return () => { if (propertyChangeRef) propertyChangeRef.current = null; };
  }, [propertyChangeRef, handlePropertyChange]);

  // Expose a geometry reader so external dialogs (e.g. mesh edit mode) can fetch the current GeometryDescriptor.
  useEffect(() => {
    if (!getNodeGeometryRef) return;
    getNodeGeometryRef.current = (nodeId: string) => {
      const n = sceneGraph.findNode(nodeId);
      if (n?.type !== 'mesh') return null;
      return (n as unknown as MeshNode).geometry;
    };
    return () => { getNodeGeometryRef.current = null; };
  }, [sceneGraph, getNodeGeometryRef]);

  // ─── Geometry linking ──────────────────────────────────────

  const sceneGeometries = useMemo(
    () => collectSceneGeometries(sceneGraph),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sceneGraph, version],
  );

  const handleAssignGeometry = useCallback((targetNodeId: string, sourceNodeId: string) => {
    const target = sceneGraph.findNode(targetNodeId);
    const source = sceneGraph.findNode(sourceNodeId);
    if (!target || target.type !== 'mesh' || !source || source.type !== 'mesh') return;
    const sourceMesh = source as unknown as MeshNode;
    const targetMesh = target as unknown as MeshNode;
    targetMesh.setGeometry({ ...sourceMesh.geometry });
    bump();
  }, [sceneGraph, bump]);

  // ─── Viewport selection ─────────────────────────────────────

  const handleViewportSelect = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  // ─── Rename ────────────────────────────────────────────────

  const handleNodeRename = useCallback((nodeId: string, newName: string) => {
    const node = sceneGraph.findNode(nodeId);
    if (node) {
      node.setName(newName);
    }
  }, [sceneGraph]);

  // ─── Reparent (drag & drop) ───────────────────────────────

  const handleNodeReparent = useCallback((nodeId: string, newParentId: string | null) => {
    const node = sceneGraph.findNode(nodeId);
    if (!node || !node.parent) return;

    const newParent = newParentId ? sceneGraph.findNode(newParentId) : sceneGraph.root;
    if (!newParent) return;

    // Prevent circular: check if newParent is a descendant of node
    let check: SceneNode | null = newParent;
    while (check) {
      if (check.id === nodeId) return;
      check = check.parent;
    }

    // Same parent, no-op
    if (node.parent.id === newParent.id) return;

    // Detach and re-attach
    node.parent.removeChild(nodeId);
    newParent.addChild(node);
  }, [sceneGraph]);

  // ─── Import mesh ──────────────────────────────────────────

  const handleImportMesh = useCallback((parentId?: string) => {
    importParentIdRef.current = parentId;
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();

    // FBX: full scene import — hierarchy, materials, animations
    if (ext === 'fbx') {
      try {
        const buffer = await file.arrayBuffer();
        const result = FBXImporter.importFromBuffer(buffer);
        const importedRoots = [...result.graph.root.children];
        if (importedRoots.length > 0) {
          const baseName = file.name.replace(/\.[^.]+$/, '');
          const label = result.animationCount > 0
            ? `${baseName} (${result.animationCount} anim)`
            : baseName;
          const wrapper = new GroupNode({ name: label });
          sceneGraph.addNode(wrapper, importParentIdRef.current);
          for (const node of importedRoots) {
            sceneGraph.addNode(node, wrapper.id);
          }
          setSelectedNodeId(wrapper.id);
        } else {
          console.warn('[FBX Import] No nodes were extracted from', file.name);
        }
      } catch (error) {
        console.error('[FBX Import] Failed to parse', file.name, error);
      }
      e.target.value = '';
      return;
    }

    let bufferData: BufferGeometryData;

    try {
      if (ext === 'obj') {
        const text = await file.text();
        bufferData = parseOBJText(text);
      } else if (ext === 'stl') {
        const buffer = await file.arrayBuffer();
        bufferData = parseSTLBuffer(buffer);
      } else if (ext === 'gltf' || ext === 'glb') {
        const buffer = await file.arrayBuffer();
        bufferData = await parseGLTFBuffer(buffer);
      } else {
        return;
      }
    } catch {
      return;
    }

    const name = file.name.replace(/\.[^.]+$/, '');
    const node = new MeshNode({
      name,
      geometry: { type: 'custom', bufferData, fileName: file.name },
      material: { color: '#cccccc', opacity: 1, wireframe: false },
    });

    sceneGraph.addNode(node, importParentIdRef.current);
    setSelectedNodeId(node.id);

    e.target.value = '';
  }, [sceneGraph]);

  // ─── File menu operations ──────────────────────────────────

  const handleImportSTLFromMenu = useCallback(() => {
    setFileMenuAnchor(null);
    stlFileInputRef.current?.click();
  }, []);

  const handleImportFBXFromMenu = useCallback(() => {
    setFileMenuAnchor(null);
    fbxFileInputRef.current?.click();
  }, []);

  const handleSaveAs = useCallback(() => {
    setFileMenuAnchor(null);
    const json = SceneSerializer.serialize(sceneGraph);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scene.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [sceneGraph]);

  const handleOpen = useCallback(() => {
    setFileMenuAnchor(null);
    sceneFileInputRef.current?.click();
  }, []);

  const handleSceneFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const newGraph = SceneDeserializer.deserialize(text);
      setSceneGraph(newGraph);
      setSelectedNodeId(null);
      setVersion(0);
      clipboardRef.current = null;
      setCanPaste(false);
      // History is seeded by the useEffect on sceneGraph change
    } catch {
      // Invalid scene file — ignore
    }

    e.target.value = '';
  }, []);

  const downloadBlob = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleExportOBJ = useCallback(() => {
    setFileMenuAnchor(null);
    const text = OBJExporter.export(sceneGraph);
    downloadBlob(new Blob([text], { type: 'text/plain' }), 'scene.obj');
  }, [sceneGraph, downloadBlob]);

  const handleExportSTL = useCallback(() => {
    setFileMenuAnchor(null);
    const dataView = STLExporter.export(sceneGraph);
    downloadBlob(new Blob([dataView.buffer as ArrayBuffer], { type: 'model/stl' }), 'scene.stl');
  }, [sceneGraph, downloadBlob]);

  const handleExportGLTF = useCallback(async () => {
    setFileMenuAnchor(null);
    const blob = await GLTFExporter.export(sceneGraph);
    downloadBlob(blob, 'scene.gltf');
  }, [sceneGraph, downloadBlob]);

  // ─── Camera preset ─────────────────────────────────────────

  const handleCameraPresetChange = useCallback((preset: CameraPresetName) => {
    setCameraPreset(preset);
    localStorage.setItem('scene3d-camera-preset', preset);
  }, []);

  // ─── Derived data ───────────────────────────────────────────

  const treeNodes = useMemo(() => {
    return sceneGraph.root.children.map(buildTreeNodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneGraph, version]);

  const selectedNodeData = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = sceneGraph.findNode(selectedNodeId);
    if (!node) return null;
    return buildSelectedNodeData(node);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneGraph, selectedNodeId, version]);

  const objectCount = sceneGraph.root.children.length;

  const toolbarItems: ToolbarItem[] = [
    { id: 'move', label: '', icon: <MoveIcon />, onClick: () => setTransformMode('translate'), active: transformMode === 'translate', tooltip: 'Move (W)' },
    { id: 'rotate', label: '', icon: <RotateIcon />, onClick: () => setTransformMode('rotate'), active: transformMode === 'rotate', tooltip: 'Rotate (E)' },
    { id: 'scale', label: '', icon: <ScaleIcon />, onClick: () => setTransformMode('scale'), active: transformMode === 'scale', tooltip: 'Scale (R)' },
    { id: 'sep-1', label: '', type: 'separator' },
    { id: 'grid', label: '', icon: <GridIcon />, onClick: () => setShowGrid(!showGrid), active: showGrid, tooltip: 'Toggle Grid' },
    { id: 'sep-2', label: '', type: 'separator' },
    { id: 'render-realistic', label: 'Realistic', onClick: () => setRenderMode('realistic'), active: renderMode === 'realistic', tooltip: 'Realistic — PBR materials with lighting' },
    { id: 'render-solid', label: 'Solid', onClick: () => setRenderMode('solid'), active: renderMode === 'solid', tooltip: 'Solid — flat diffuse shading' },
    { id: 'render-normal', label: 'Normal', onClick: () => setRenderMode('normal'), active: renderMode === 'normal', tooltip: 'Normal — visualize vertex normals as color' },
    { id: 'render-wire', label: 'Wire', onClick: () => setRenderMode('wireframe'), active: renderMode === 'wireframe', tooltip: 'Wireframe — show geometry edges only' },
    { id: 'sep-3', label: '', type: 'separator' },
    { id: 'settings', label: '', icon: <SettingsIcon sx={{ fontSize: 16 }} />, onClick: settingsDialog.open, tooltip: 'Settings' },
    { id: 'sep-4', label: '', type: 'separator' },
    { id: 'hierarchy', label: 'Hier',    onClick: () => setShowHierarchyPanel(p => !p), active: showHierarchyPanel, tooltip: 'Toggle Hierarchy panel' },
    { id: 'inspector', label: 'Inspect', onClick: () => setShowInspectorPanel(p => !p), active: showInspectorPanel, tooltip: 'Toggle Inspector panel' },
    { id: 'animation', label: 'Anim',    onClick: () => setShowAnimPanel(p => !p),     active: showAnimPanel,      tooltip: 'Toggle Animation panel' },
  ];

  return (
    <Box ref={containerRef} className={className} style={style} sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.default', color: 'text.primary' }}>
      {/* ─── Menu bar ──────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 0.5,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
          height: 28,
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <Button
          size="small"
          onClick={(e) => setFileMenuAnchor(e.currentTarget)}
          sx={{
            textTransform: 'none',
            fontSize: '0.75rem',
            color: 'text.primary',
            minWidth: 0,
            px: 1,
            py: 0.25,
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          File
        </Button>
        <Tooltip title="Undo (Ctrl+Z)" placement="bottom">
          <span>
            <IconButton size="small" onClick={undo} disabled={!canUndo} sx={{ p: 0.5 }}>
              <UndoIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Redo (Ctrl+Y)" placement="bottom">
          <span>
            <IconButton size="small" onClick={redo} disabled={!canRedo} sx={{ p: 0.5 }}>
              <RedoIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>

        {/* ── Breadcrumb: project / file ── */}
        {currentProject ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1.5, overflow: 'hidden', flex: 1 }}>
            <FolderIcon sx={{ fontSize: 12, color: '#4fc3f7', flexShrink: 0 }} />
            <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
              {currentProject}
            </Typography>
            {currentFile && (
              <>
                <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled', lineHeight: 1, flexShrink: 0 }}>/</Typography>
                <InsertDriveFileIcon sx={{ fontSize: 12, color: 'text.disabled', flexShrink: 0 }} />
                <Typography sx={{ fontSize: '0.68rem', color: 'text.primary', fontWeight: 500, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                  {currentFile}.json
                </Typography>
              </>
            )}
          </Box>
        ) : (
          <Box sx={{ flex: 1 }} />
        )}

        <Menu
          anchorEl={fileMenuAnchor}
          open={fileMenuAnchor !== null}
          onClose={() => setFileMenuAnchor(null)}
          slotProps={{ paper: { sx: { minWidth: 180 } } }}
        >
          <MenuItem onClick={handleOpen} sx={{ fontSize: '0.75rem', minHeight: 32, py: 0.5, '& .MuiListItemIcon-root': { minWidth: 28 } }}>
            <ListItemIcon><FolderOpenIcon sx={{ fontSize: 16 }} /></ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: '0.75rem' }}>Open</ListItemText>
            <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled', ml: 3 }}>Ctrl+O</Typography>
          </MenuItem>
          <MenuItem onClick={handleSaveAs} sx={{ fontSize: '0.75rem', minHeight: 32, py: 0.5, '& .MuiListItemIcon-root': { minWidth: 28 } }}>
            <ListItemIcon><SaveAsIcon sx={{ fontSize: 16 }} /></ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: '0.75rem' }}>Save As</ListItemText>
            <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled', ml: 3 }}>Ctrl+Shift+S</Typography>
          </MenuItem>
          {(onOpenFromServer || onSaveToServer) && <Divider />}
          {onOpenFromServer && (
            <MenuItem onClick={() => { setFileMenuAnchor(null); onOpenFromServer(); }} sx={{ fontSize: '0.75rem', minHeight: 32, py: 0.5, '& .MuiListItemIcon-root': { minWidth: 28 } }}>
              <ListItemIcon><CloudDownloadOutlinedIcon sx={{ fontSize: 16, color: 'primary.main' }} /></ListItemIcon>
              <ListItemText primaryTypographyProps={{ fontSize: '0.75rem' }}>Open Scene from Server…</ListItemText>
            </MenuItem>
          )}
          {onSaveToServer && (
            <MenuItem onClick={() => { setFileMenuAnchor(null); onSaveToServer(); }} sx={{ fontSize: '0.75rem', minHeight: 32, py: 0.5, '& .MuiListItemIcon-root': { minWidth: 28 } }}>
              <ListItemIcon><CloudUploadOutlinedIcon sx={{ fontSize: 16, color: 'primary.main' }} /></ListItemIcon>
              <ListItemText primaryTypographyProps={{ fontSize: '0.75rem' }}>Save Scene to Server…</ListItemText>
            </MenuItem>
          )}
          {onImportFromCad && (
            <>
              <Divider />
              <MenuItem
                onClick={() => { setFileMenuAnchor(null); onImportFromCad(); }}
                disabled={!cadEntityCount}
                sx={{ fontSize: '0.75rem', minHeight: 32, py: 0.5, '& .MuiListItemIcon-root': { minWidth: 28 } }}
              >
                <ListItemIcon><DownloadingIcon sx={{ fontSize: 16, color: 'success.main' }} /></ListItemIcon>
                <ListItemText primaryTypographyProps={{ fontSize: '0.75rem' }}>
                  Import from CAD{cadEntityCount ? ` (${cadEntityCount})` : ''}
                </ListItemText>
              </MenuItem>
            </>
          )}
          <Divider />
          <MenuItem onClick={handleImportSTLFromMenu} sx={{ fontSize: '0.75rem', minHeight: 32, py: 0.5, '& .MuiListItemIcon-root': { minWidth: 28 } }}>
            <ListItemIcon><FileUploadIcon sx={{ fontSize: 16 }} /></ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: '0.75rem' }}>Import STL…</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleImportFBXFromMenu} sx={{ fontSize: '0.75rem', minHeight: 32, py: 0.5, '& .MuiListItemIcon-root': { minWidth: 28 } }}>
            <ListItemIcon><FileUploadIcon sx={{ fontSize: 16 }} /></ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: '0.75rem' }}>Import FBX…</ListItemText>
          </MenuItem>
          <Divider />
          <MenuItem onClick={handleExportOBJ} sx={{ fontSize: '0.75rem', minHeight: 32, py: 0.5, '& .MuiListItemIcon-root': { minWidth: 28 } }}>
            <ListItemIcon><FileDownloadIcon sx={{ fontSize: 16 }} /></ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: '0.75rem' }}>Export as OBJ</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleExportSTL} sx={{ fontSize: '0.75rem', minHeight: 32, py: 0.5, '& .MuiListItemIcon-root': { minWidth: 28 } }}>
            <ListItemIcon><FileDownloadIcon sx={{ fontSize: 16 }} /></ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: '0.75rem' }}>Export as STL</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleExportGLTF} sx={{ fontSize: '0.75rem', minHeight: 32, py: 0.5, '& .MuiListItemIcon-root': { minWidth: 28 } }}>
            <ListItemIcon><FileDownloadIcon sx={{ fontSize: 16 }} /></ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: '0.75rem' }}>Export as GLTF</ListItemText>
          </MenuItem>
        </Menu>
      </Box>
      <Toolbar items={toolbarItems} />
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {isCompact ? (
          /* ── Compact (mobile/tablet): viewport | [tree / properties] ── */
          <Allotment>
            <Allotment.Pane>
              <Box sx={{ position: 'relative', width: '100%', height: '100%', bgcolor: '#2a2a2a' }}>
                <SimpleViewer
                  sceneGraph={sceneGraph}
                  version={version + animVersion}
                  showGrid={showGrid}
                  selectedNodeId={selectedNodeId}
                  transformMode={transformMode}
                  cameraPreset={cameraPreset}
                  gizmoSize={1.4}
                  onNodeSelect={handleViewportSelect}
                  fitSceneRef={fitSceneRef}
                  activeCameraNodeId={activeCameraNodeId}
                  renderMode={renderMode}
                  sceneSettings={sceneSettings}
                  onPlaneClick={onPlaneClick}
                  debugLog={debugLog}
                  resolveAudioSrc={resolveAudioSrc}
                  onGizmoTransformEnd={handleGizmoTransformEnd}
                />
                <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, p: '4px 10px', pointerEvents: 'none' }}>
                  <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Perspective
                  </Typography>
                </Box>
              </Box>
            </Allotment.Pane>
            {(showHierarchyPanel || showInspectorPanel) && (
            <Allotment.Pane preferredSize={280} minSize={180} maxSize={440}>
              <Allotment vertical>
                {showHierarchyPanel && (
                <Allotment.Pane preferredSize="45%" minSize={120}>
                  <SceneTreePanel
                    nodes={treeNodes}
                    selectedNodeId={selectedNodeId}
                    onNodeSelect={setSelectedNodeId}
                    onNodeVisibilityToggle={handleVisibilityToggle}
                    onNodeAdd={handleNodeAdd}
                    onNodeDelete={deleteNode}
                    onNodeRename={handleNodeRename}
                    onNodeReparent={handleNodeReparent}
                    onNodeDuplicate={handleDuplicate}
                    onImportMesh={handleImportMesh}
                    onNodeCut={handleCut}
                    onNodeCopy={handleCopy}
                    onNodePaste={handlePaste}
                    canPaste={canPaste}
                    onCreatePrefab={handleCreatePrefab}
                  />
                </Allotment.Pane>
                )}
                {showInspectorPanel && (
                <Allotment.Pane minSize={120}>
                  <PropertiesPanel
                    node={selectedNodeData}
                    onPropertyChange={handlePropertyChange}
                    onNodeRename={handleNodeRename}
                    activeCameraNodeId={activeCameraNodeId}
                    onSetActiveCamera={handleSetActiveCamera}
                    sceneSettings={sceneSettings}
                    onSceneSettingsChange={setSceneSettings}
                    onBrowseAudioFile={onBrowseAudioFile}
                    onEditGeometryNodes={onEditGeometryNodes}
                    onEditMesh={onEditMesh}
                    sceneGeometries={sceneGeometries}
                    onAssignGeometry={handleAssignGeometry}
                  />
                </Allotment.Pane>
                )}
              </Allotment>
            </Allotment.Pane>
            )}
          </Allotment>
        ) : (
          /* ── Desktop: tree | viewport | properties ── */
          <Allotment>
            {showHierarchyPanel && (
            <Allotment.Pane preferredSize={220} minSize={150} maxSize={400}>
              <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Tab bar */}
                <Box sx={{ display: 'flex', borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
                  <Button
                    size="small"
                    onClick={() => setLeftTab('scene')}
                    sx={{
                      flex: 1, borderRadius: 0, fontSize: '0.68rem', textTransform: 'none', py: 0.5,
                      color: leftTab === 'scene' ? 'primary.main' : 'text.secondary',
                      borderBottom: 2,
                      borderBottomColor: leftTab === 'scene' ? 'primary.main' : 'transparent',
                    }}
                  >
                    Hierarchy
                  </Button>
                  <Button
                    size="small"
                    onClick={() => setLeftTab('prefabs')}
                    sx={{
                      flex: 1, borderRadius: 0, fontSize: '0.68rem', textTransform: 'none', py: 0.5,
                      color: leftTab === 'prefabs' ? 'primary.main' : 'text.secondary',
                      borderBottom: 2,
                      borderBottomColor: leftTab === 'prefabs' ? 'primary.main' : 'transparent',
                    }}
                  >
                    Prefabs
                  </Button>
                </Box>
                <Box sx={{ flex: 1, overflow: 'hidden' }}>
                  {leftTab === 'scene' ? (
                    <SceneTreePanel
                      nodes={treeNodes}
                      selectedNodeId={selectedNodeId}
                      onNodeSelect={setSelectedNodeId}
                      onNodeVisibilityToggle={handleVisibilityToggle}
                      onNodeAdd={handleNodeAdd}
                      onNodeDelete={deleteNode}
                      onNodeRename={handleNodeRename}
                      onNodeReparent={handleNodeReparent}
                      onNodeDuplicate={handleDuplicate}
                      onImportMesh={handleImportMesh}
                      onNodeCut={handleCut}
                      onNodeCopy={handleCopy}
                      onNodePaste={handlePaste}
                      canPaste={canPaste}
                      onCreatePrefab={handleCreatePrefab}
                    />
                  ) : (
                    <PrefabsPanel
                      prefabs={sceneGraph.prefabs}
                      currentProject={currentProject}
                      otherProjectsPrefabs={otherProjectsPrefabs}
                      onInstantiate={handleInstantiatePrefab}
                      onDelete={handleDeletePrefab}
                      onRename={handleRenamePrefab}
                    />
                  )}
                </Box>
              </Box>
            </Allotment.Pane>
            )}
            <Allotment.Pane>
              <Box sx={{ position: 'relative', width: '100%', height: '100%', bgcolor: '#2a2a2a' }}>
                <SimpleViewer
                  sceneGraph={sceneGraph}
                  version={version + animVersion}
                  showGrid={showGrid}
                  selectedNodeId={selectedNodeId}
                  transformMode={transformMode}
                  cameraPreset={cameraPreset}
                  gizmoSize={1.4}
                  onNodeSelect={handleViewportSelect}
                  fitSceneRef={fitSceneRef}
                  activeCameraNodeId={activeCameraNodeId}
                  renderMode={renderMode}
                  sceneSettings={sceneSettings}
                  onPlaneClick={onPlaneClick}
                  debugLog={debugLog}
                  resolveAudioSrc={resolveAudioSrc}
                  onGizmoTransformEnd={handleGizmoTransformEnd}
                />
                <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, p: '4px 10px', pointerEvents: 'none' }}>
                  <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Perspective
                  </Typography>
                </Box>
              </Box>
            </Allotment.Pane>
            {showInspectorPanel && (
            <Allotment.Pane preferredSize={260} minSize={200} maxSize={400}>
              <PropertiesPanel
                node={selectedNodeData}
                onPropertyChange={handlePropertyChange}
                onNodeRename={handleNodeRename}
                activeCameraNodeId={activeCameraNodeId}
                onSetActiveCamera={handleSetActiveCamera}
                sceneSettings={sceneSettings}
                onSceneSettingsChange={setSceneSettings}
                onBrowseAudioFile={onBrowseAudioFile}
                onEditGeometryNodes={onEditGeometryNodes}
                onEditMesh={onEditMesh}
                sceneGeometries={sceneGeometries}
                onAssignGeometry={handleAssignGeometry}
              />
            </Allotment.Pane>
            )}
          </Allotment>
        )}
      </Box>
      {/* ─── Animation Panel ──────────────────────────────────────────── */}
      {showAnimPanel && (
        <>
          <Box
            onMouseDown={(e) => {
              e.preventDefault();
              const startY = e.clientY;
              const startH = animPanelHeight;
              const onMove = (ev: MouseEvent) =>
                setAnimPanelHeight(Math.max(120, Math.min(600, startH - (ev.clientY - startY))));
              const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
            sx={{
              height: 4,
              bgcolor: 'divider',
              cursor: 'row-resize',
              flexShrink: 0,
              '&:hover': { bgcolor: 'primary.main' },
            }}
          />
          <AnimationPanel
            clip={sceneGraph.animation ?? null}
            currentTime={currentTime}
            isPlaying={isPlaying}
            isRecording={isRecording}
            loop={animLoop}
            sceneGraph={sceneGraph}
            selectedNodeId={selectedNodeId}
            height={animPanelHeight}
            onClipChange={handleAnimClipChange}
            onTimeChange={handleAnimTimeChange}
            onPlayPause={handlePlayPause}
            onStop={handleStop}
            onLoopToggle={() => setAnimLoop(p => !p)}
            onRecordToggle={() => setIsRecording(p => !p)}
          />
        </>
      )}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1.5,
          bgcolor: 'background.paper',
          borderTop: 1,
          borderColor: 'divider',
          height: 24,
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', gap: 1, fontSize: '0.65rem', color: 'text.secondary' }}>
          <span>Objects: {objectCount}</span>
          <span style={{ opacity: 0.3 }}>|</span>
          <span>Mode: {transformMode}</span>
        </Box>
        <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
          Selected: {selectedNodeData?.name ?? 'None'}
        </Typography>
      </Box>
      <input
        ref={fileInputRef}
        type="file"
        accept=".obj,.stl,.fbx,.gltf,.glb"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />
      <input
        ref={stlFileInputRef}
        type="file"
        accept=".stl"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />
      <input
        ref={fbxFileInputRef}
        type="file"
        accept=".fbx"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />
      <input
        ref={sceneFileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleSceneFileSelected}
      />
      {/* ─── Prefab name dialog ──────────────────────────────────── */}
      <Dialog
        open={prefabNameDialogOpen}
        onClose={() => setPrefabNameDialogOpen(false)}
        title="Save as Prefab"
        maxWidth="sm"
        actions={
          <>
            <Button size="small" onClick={() => setPrefabNameDialogOpen(false)} sx={{ textTransform: 'none', fontSize: '0.75rem' }}>Cancel</Button>
            <Button size="small" variant="contained" onClick={handlePrefabNameConfirm} disabled={!prefabNameInput.trim()} sx={{ textTransform: 'none', fontSize: '0.75rem' }}>Save</Button>
          </>
        }
      >
        <TextField
          autoFocus
          fullWidth
          size="small"
          label="Prefab name"
          value={prefabNameInput}
          onChange={(e) => setPrefabNameInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handlePrefabNameConfirm(); }}
          sx={{ mt: 1 }}
        />
        <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
          <TextField
            fullWidth
            size="small"
            label="Version"
            value={prefabVersionInput}
            onChange={(e) => setPrefabVersionInput(e.target.value)}
            placeholder="1.0.0"
          />
          <TextField
            fullWidth
            size="small"
            label="Author"
            value={prefabAuthorInput}
            onChange={(e) => setPrefabAuthorInput(e.target.value)}
          />
        </Box>
      </Dialog>
      {/* ─── Settings dialog ──────────────────────────────────────── */}
      <Dialog
        open={settingsDialog.isOpen}
        onClose={settingsDialog.close}
        title="Settings"
        maxWidth="sm"
        actions={
          <Button size="small" variant="contained" onClick={settingsDialog.close} sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
            Close
          </Button>
        }
      >
        <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, mb: 1 }}>Camera Controls</Typography>
        <RadioGroup
          value={cameraPreset}
          onChange={(e) => handleCameraPresetChange(e.target.value as CameraPresetName)}
        >
          {(Object.entries(CAMERA_PRESETS) as [CameraPresetName, typeof CAMERA_PRESETS[CameraPresetName]][]).map(
            ([key, preset]) => (
              <FormControlLabel
                key={key}
                value={key}
                control={<Radio size="small" />}
                label={
                  <Box>
                    <Typography sx={{ fontSize: '0.8rem' }}>{preset.label}</Typography>
                    <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>{preset.description}</Typography>
                  </Box>
                }
                sx={{ alignItems: 'flex-start', mb: 0.5, '& .MuiRadio-root': { pt: 0.25 } }}
              />
            ),
          )}
        </RadioGroup>
      </Dialog>
    </Box>
  );
}
