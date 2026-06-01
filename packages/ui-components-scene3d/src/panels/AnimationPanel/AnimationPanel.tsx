import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import type { AnimationClip, AnimationTrack, EasingType } from '@mhersztowski/core-scene3d';
import { AnimationEngine } from '@mhersztowski/core-scene3d';
import type { SceneGraph } from '@mhersztowski/core-scene3d';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Popover from '@mui/material/Popover';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';

// ── Icons ─────────────────────────────────────────────────────────
const PlayIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
);
const PauseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
);
const StopIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z" /></svg>
);
const SkipStartIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
);
const LoopIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" /></svg>
);
const RecordIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8" /></svg>
);
const DeleteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
);
const AddIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
);
const KeyframeAddIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 12l10 10 10-10L12 2zm0 15l-5-5 5-5 5 5-5 5z" /></svg>
);

// ── Constants ─────────────────────────────────────────────────────
// TRACK_HEIGHT ≥ 40px — minimum for reliable stylus/touch targeting (Apple HIG: 44pt, Material: 48dp)
const TRACK_HEIGHT = 40;
const RULER_HEIGHT = 36;
const TRACK_LABEL_W = 200;
const PX_PER_SEC = 120;
// Keyframe hit area — transparent overlay, much larger than the visual diamond
const KF_HIT_SIZE = 36;

// ── Human-readable labels ─────────────────────────────────────────
function propLabel(property: string): string {
  const map: Record<string, string> = {
    'position.x': 'Pos X', 'position.y': 'Pos Y', 'position.z': 'Pos Z',
    'rotation.x': 'Rot X', 'rotation.y': 'Rot Y', 'rotation.z': 'Rot Z',
    'scale.x': 'Scale X', 'scale.y': 'Scale Y', 'scale.z': 'Scale Z',
    'visible': 'Visible',
    'material.color': 'Color', 'material.opacity': 'Opacity',
    'material.roughness': 'Roughness', 'material.metalness': 'Metalness',
    'material.emissive': 'Emissive', 'material.emissiveIntensity': 'Emissive Int.',
    'material.wireframe': 'Wireframe',
    'light.intensity': 'Intensity', 'light.color': 'Light Color',
  };
  return map[property] ?? property;
}

// Track accent color by property category
function trackColor(property: string): string {
  if (property.startsWith('position')) return '#4fc3f7';
  if (property.startsWith('rotation')) return '#ce93d8';
  if (property.startsWith('scale')) return '#80cbc4';
  if (property.startsWith('material')) return '#ffb74d';
  if (property.startsWith('light')) return '#fff176';
  if (property === 'visible') return '#a5d6a7';
  return '#90caf9';
}

const ANIM_PROPS_COMMON = [
  'position.x', 'position.y', 'position.z',
  'rotation.x', 'rotation.y', 'rotation.z',
  'scale.x', 'scale.y', 'scale.z',
  'visible',
];
const ANIM_PROPS_MESH = [
  ...ANIM_PROPS_COMMON,
  'material.color', 'material.opacity', 'material.roughness',
  'material.metalness', 'material.emissive', 'material.emissiveIntensity',
  'material.wireframe',
];
const ANIM_PROPS_LIGHT = [...ANIM_PROPS_COMMON, 'light.intensity', 'light.color'];

function getAnimProps(nodeType: string): string[] {
  if (nodeType === 'mesh') return ANIM_PROPS_MESH;
  if (nodeType === 'light') return ANIM_PROPS_LIGHT;
  return ANIM_PROPS_COMMON;
}

// ── Types ─────────────────────────────────────────────────────────

export interface AnimationPanelProps {
  clip: AnimationClip | null;
  currentTime: number;
  isPlaying: boolean;
  isRecording: boolean;
  loop: boolean;
  sceneGraph?: SceneGraph;
  selectedNodeId?: string | null;
  height?: number;
  onClipChange: (clip: AnimationClip | null) => void;
  onTimeChange: (t: number) => void;
  onPlayPause: () => void;
  onStop: () => void;
  onLoopToggle: () => void;
  onRecordToggle: () => void;
}

function readNodeValue(sceneGraph: SceneGraph, nodeId: string, property: string): number | string | boolean | null {
  const node = sceneGraph.findNode(nodeId);
  if (!node) return null;
  if (property === 'position.x') return node.position[0];
  if (property === 'position.y') return node.position[1];
  if (property === 'position.z') return node.position[2];
  if (property === 'rotation.x') return node.rotation[0];
  if (property === 'rotation.y') return node.rotation[1];
  if (property === 'rotation.z') return node.rotation[2];
  if (property === 'scale.x') return node.scale[0];
  if (property === 'scale.y') return node.scale[1];
  if (property === 'scale.z') return node.scale[2];
  if (property === 'visible') return node.visible;
  if (property.startsWith('material.') && node.type === 'mesh') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (node as any).material?.[property.slice(9)] ?? null;
  }
  if (property.startsWith('light.') && node.type === 'light') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (node as any)[property.slice(6)] ?? null;
  }
  return null;
}

// ── Main component ────────────────────────────────────────────────

export function AnimationPanel({
  clip,
  currentTime,
  isPlaying,
  isRecording,
  loop,
  sceneGraph,
  selectedNodeId,
  height = 220,
  onClipChange,
  onTimeChange,
  onPlayPause,
  onStop,
  onLoopToggle,
  onRecordToggle,
}: AnimationPanelProps) {
  const duration = clip?.duration ?? 5;
  const timelineW = duration * PX_PER_SEC;

  const timelineRef = useRef<HTMLDivElement>(null);
  const [dragKf, setDragKf] = useState<{ trackId: string; kfId: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; trackId: string; kfId?: string;
  } | null>(null);
  const [addTrackAnchor, setAddTrackAnchor] = useState<HTMLElement | null>(null);
  const [addTrackNodeId, setAddTrackNodeId] = useState<string>('');
  const [durationInput, setDurationInput] = useState(String(duration));
  const [selectedKf, setSelectedKf] = useState<{ trackId: string; kfId: string } | null>(null);

  // Long-press detection for context menu (stylus / touch — no right-click)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressDataRef = useRef<{ x: number; y: number; trackId: string; kfId?: string } | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressDataRef.current = null;
  }, []);

  const startLongPress = useCallback((x: number, y: number, trackId: string, kfId?: string) => {
    clearLongPress();
    longPressDataRef.current = { x, y, trackId, kfId };
    longPressTimerRef.current = setTimeout(() => {
      if (longPressDataRef.current) {
        setContextMenu(longPressDataRef.current);
      }
      longPressTimerRef.current = null;
    }, 500);
  }, [clearLongPress]);

  useEffect(() => { setDurationInput(String(clip?.duration ?? 5)); }, [clip?.duration]);

  const sceneNodes = useMemo(() => {
    if (!sceneGraph) return [];
    const nodes: { id: string; name: string; type: string }[] = [];
    sceneGraph.traverse((n) => {
      if (n === sceneGraph.root) return;
      nodes.push({ id: n.id, name: n.name, type: n.type });
    });
    return nodes;
  }, [sceneGraph]);

  useEffect(() => {
    if (selectedNodeId) setAddTrackNodeId(selectedNodeId);
    else if (sceneNodes.length > 0) setAddTrackNodeId(sceneNodes[0].id);
  }, [selectedNodeId, sceneNodes]);

  // ── Ruler seek ───────────────────────────────────────────────────
  const handleRulerPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = timelineRef.current.getBoundingClientRect();
    const t = Math.max(0, Math.min(duration, (e.clientX - rect.left) / PX_PER_SEC));
    onTimeChange(t);
  }, [duration, onTimeChange]);

  const handleRulerPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1 || !timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const t = Math.max(0, Math.min(duration, (e.clientX - rect.left) / PX_PER_SEC));
    onTimeChange(t);
  }, [duration, onTimeChange]);

  // ── Context menu ─────────────────────────────────────────────────
  // onContextMenu handles mouse right-click; long-press covers stylus/touch
  const handleKfContextMenu = useCallback((e: React.MouseEvent, trackId: string, kfId: string) => {
    e.preventDefault();
    clearLongPress();
    setContextMenu({ x: e.clientX, y: e.clientY, trackId, kfId });
  }, [clearLongPress]);

  const handleTrackContextMenu = useCallback((e: React.MouseEvent, trackId: string) => {
    e.preventDefault();
    clearLongPress();
    setContextMenu({ x: e.clientX, y: e.clientY, trackId });
  }, [clearLongPress]);

  const closeContext = useCallback(() => setContextMenu(null), []);

  const handleDeleteKf = useCallback(() => {
    if (!clip || !contextMenu?.kfId) return;
    const track = clip.tracks.find(t => t.id === contextMenu.trackId);
    if (!track) return;
    onClipChange(AnimationEngine.updateTrack(clip, AnimationEngine.removeKeyframe(track, contextMenu.kfId)));
    setContextMenu(null);
  }, [clip, contextMenu, onClipChange]);

  const handleDeleteTrack = useCallback(() => {
    if (!clip || !contextMenu) return;
    onClipChange(AnimationEngine.removeTrack(clip, contextMenu.trackId));
    setContextMenu(null);
  }, [clip, contextMenu, onClipChange]);

  const handleInsertKfHere = useCallback(() => {
    if (!clip || !contextMenu || !sceneGraph) return;
    const track = clip.tracks.find(t => t.id === contextMenu.trackId);
    if (!track) return;
    const value = readNodeValue(sceneGraph, track.nodeId, track.property);
    if (value === null) { setContextMenu(null); return; }
    onClipChange(AnimationEngine.updateTrack(clip, AnimationEngine.setKeyframe(track, currentTime, value)));
    setContextMenu(null);
  }, [clip, contextMenu, sceneGraph, currentTime, onClipChange]);

  // ── Keyframe drag ─────────────────────────────────────────────────
  const kfDragStartX = useRef(0);
  const kfDragStartTime = useRef(0);

  const handleKfPointerDown = useCallback((e: React.PointerEvent, trackId: string, kfId: string, kfTime: number) => {
    e.stopPropagation();
    clearLongPress();
    // Start long-press only for non-primary pointer (stylus secondary) or pen
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      startLongPress(e.clientX, e.clientY, trackId, kfId);
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    kfDragStartX.current = e.clientX;
    kfDragStartTime.current = kfTime;
    setDragKf({ trackId, kfId });
    setSelectedKf({ trackId, kfId });
  }, [clearLongPress, startLongPress]);

  const handleKfPointerMove = useCallback((e: React.PointerEvent, trackId: string) => {
    if (!dragKf || dragKf.trackId !== trackId || !clip) return;
    // Cancel long-press if user moved
    if (Math.abs(e.clientX - kfDragStartX.current) > 5) clearLongPress();
    const dt = (e.clientX - kfDragStartX.current) / PX_PER_SEC;
    const newTime = Math.max(0, Math.min(duration, kfDragStartTime.current + dt));
    const track = clip.tracks.find(t => t.id === trackId);
    if (!track) return;
    const updatedKfs = track.keyframes.map(k =>
      k.id === dragKf.kfId ? { ...k, time: Math.round(newTime * 1000) / 1000 } : k,
    ).sort((a, b) => a.time - b.time);
    onClipChange(AnimationEngine.updateTrack(clip, { ...track, keyframes: updatedKfs }));
  }, [dragKf, clip, duration, clearLongPress, onClipChange]);

  const handleKfPointerUp = useCallback(() => {
    clearLongPress();
    setDragKf(null);
  }, [clearLongPress]);

  // ── Track row long-press ─────────────────────────────────────────
  const handleTrackRowPointerDown = useCallback((e: React.PointerEvent, trackId: string) => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      startLongPress(e.clientX, e.clientY, trackId);
    }
  }, [startLongPress]);

  // ── Add track ─────────────────────────────────────────────────────
  const handleAddTrack = useCallback((property: string) => {
    const activeClip = clip ?? AnimationEngine.createClip();
    if (!addTrackNodeId) return;
    const { clip: newClip } = AnimationEngine.getOrCreateTrack(activeClip, addTrackNodeId, property);
    onClipChange(newClip);
    setAddTrackAnchor(null);
  }, [clip, addTrackNodeId, onClipChange]);

  const handleInsertKfOnSelected = useCallback((track: AnimationTrack) => {
    if (!clip || !sceneGraph) return;
    const value = readNodeValue(sceneGraph, track.nodeId, track.property);
    if (value === null) return;
    onClipChange(AnimationEngine.updateTrack(clip, AnimationEngine.setKeyframe(track, currentTime, value)));
  }, [clip, sceneGraph, currentTime, onClipChange]);

  // ── Duration edit ─────────────────────────────────────────────────
  const handleDurationBlur = useCallback(() => {
    const val = parseFloat(durationInput);
    if (!isNaN(val) && val > 0 && clip) {
      onClipChange({ ...clip, duration: Math.round(val * 100) / 100 });
    } else {
      setDurationInput(String(duration));
    }
  }, [durationInput, clip, duration, onClipChange]);

  // ── Selected keyframe helpers ─────────────────────────────────────
  const selectedTrack = selectedKf ? clip?.tracks.find(t => t.id === selectedKf.trackId) : null;
  const selectedKeyframe = selectedTrack?.keyframes.find(k => k.id === selectedKf?.kfId);

  const handleEasingChange = useCallback((easing: EasingType) => {
    if (!clip || !selectedKf || !selectedTrack || !selectedKeyframe) return;
    const updatedKfs = selectedTrack.keyframes.map(k =>
      k.id === selectedKf.kfId ? { ...k, easing } : k,
    );
    onClipChange(AnimationEngine.updateTrack(clip, { ...selectedTrack, keyframes: updatedKfs }));
  }, [clip, selectedKf, selectedTrack, selectedKeyframe, onClipChange]);

  const handleKfValueChange = useCallback((newValue: number | string | boolean) => {
    if (!clip || !selectedKf || !selectedTrack || !selectedKeyframe) return;
    const updatedKfs = selectedTrack.keyframes.map(k =>
      k.id === selectedKf.kfId ? { ...k, value: newValue } : k,
    );
    onClipChange(AnimationEngine.updateTrack(clip, { ...selectedTrack, keyframes: updatedKfs }));
  }, [clip, selectedKf, selectedTrack, selectedKeyframe, onClipChange]);

  // ── Ruler ticks ───────────────────────────────────────────────────
  const ticks = useMemo(() => {
    const step = duration <= 5 ? 0.5 : duration <= 20 ? 1 : 2;
    const result: { time: number; major: boolean }[] = [];
    let t = 0;
    while (t <= duration + 0.001) {
      result.push({ time: Math.round(t * 100) / 100, major: Math.round(t * 10) % 10 === 0 });
      t += step / 2;
    }
    return result;
  }, [duration]);

  const nodeName = useCallback((nodeId: string) => {
    return sceneNodes.find(n => n.id === nodeId)?.name ?? nodeId.slice(0, 6);
  }, [sceneNodes]);

  const addTrackNode = sceneNodes.find(n => n.id === addTrackNodeId);
  const playheadX = (currentTime / duration) * timelineW;

  // ── Ctrl bar button sx ────────────────────────────────────────────
  const btnSx = { p: 0.75, minWidth: 36, minHeight: 36 };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height,
        bgcolor: 'background.paper',
        borderTop: 1,
        borderColor: 'divider',
        userSelect: 'none',
        touchAction: 'none',
        flexShrink: 0,
      }}
    >
      {/* ── Control bar (48px tall for touch) ─────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          minHeight: 48,
          flexShrink: 0,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.default',
          flexWrap: 'wrap',
        }}
      >
        <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', letterSpacing: 1, textTransform: 'uppercase', mr: 0.5 }}>
          Animation
        </Typography>

        <Tooltip title="Go to Start">
          <IconButton size="small" sx={btnSx} onClick={() => { onStop(); onTimeChange(0); }}>
            <SkipStartIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title={isPlaying ? 'Pause' : 'Play'}>
          <IconButton size="small" sx={btnSx} onClick={onPlayPause}>
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </IconButton>
        </Tooltip>

        <Tooltip title="Stop">
          <IconButton size="small" sx={btnSx} onClick={onStop}>
            <StopIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title={loop ? 'Loop On' : 'Loop Off'}>
          <IconButton size="small" sx={{ ...btnSx, color: loop ? 'primary.main' : 'text.secondary' }} onClick={onLoopToggle}>
            <LoopIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title={isRecording ? 'Recording — tap to stop' : 'Record keyframes on gizmo move'}>
          <IconButton size="small" sx={{ ...btnSx, color: isRecording ? '#ef5350' : 'text.secondary' }} onClick={onRecordToggle}>
            <RecordIcon />
          </IconButton>
        </Tooltip>

        <Box sx={{ width: '1px', bgcolor: 'divider', height: 20, mx: 0.25 }} />

        {/* Time / duration */}
        <Typography sx={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'text.primary', whiteSpace: 'nowrap' }}>
          {currentTime.toFixed(2)}s&nbsp;/
        </Typography>
        <Box
          component="input"
          value={durationInput}
          onChange={e => setDurationInput(e.target.value)}
          onBlur={handleDurationBlur}
          onKeyDown={e => { if (e.key === 'Enter') handleDurationBlur(); }}
          sx={{
            width: 52,
            height: 32,
            background: 'transparent',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '4px',
            color: 'text.primary',
            fontSize: '0.72rem',
            fontFamily: 'monospace',
            outline: 'none',
            textAlign: 'center',
            px: 0.5,
            '&:focus': { borderColor: 'primary.main' },
          }}
        />
        <Typography sx={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'text.secondary' }}>s</Typography>

        {/* Selected keyframe editors */}
        {selectedKeyframe && (
          <>
            <Box sx={{ width: '1px', bgcolor: 'divider', height: 20, mx: 0.25 }} />
            <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
              {propLabel(selectedTrack?.property ?? '')}:
            </Typography>
            {typeof selectedKeyframe.value === 'boolean' ? (
              <Select
                size="small"
                value={String(selectedKeyframe.value)}
                onChange={e => handleKfValueChange(e.target.value === 'true')}
                sx={{ fontSize: '0.7rem', height: 32, '.MuiSelect-select': { py: 0.5, pl: 0.75 } }}
              >
                <MenuItem value="true" sx={{ fontSize: '0.75rem' }}>true</MenuItem>
                <MenuItem value="false" sx={{ fontSize: '0.75rem' }}>false</MenuItem>
              </Select>
            ) : typeof selectedKeyframe.value === 'string' && selectedKeyframe.value.startsWith('#') ? (
              <Box
                component="input"
                type="color"
                value={selectedKeyframe.value}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleKfValueChange(e.target.value)}
                sx={{ width: 40, height: 32, border: '1px solid', borderColor: 'divider', borderRadius: '4px', p: 0.25, cursor: 'pointer', bgcolor: 'transparent' }}
              />
            ) : (
              <Box
                component="input"
                type="number"
                value={typeof selectedKeyframe.value === 'number' ? selectedKeyframe.value : 0}
                step={0.01}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) handleKfValueChange(v);
                }}
                sx={{
                  width: 72,
                  height: 32,
                  background: 'transparent',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: '4px',
                  color: 'text.primary',
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  outline: 'none',
                  textAlign: 'right',
                  px: 0.75,
                  '&:focus': { borderColor: 'primary.main' },
                }}
              />
            )}
            <Box sx={{ width: '1px', bgcolor: 'divider', height: 20, mx: 0.25 }} />
            <Select
              size="small"
              value={selectedKeyframe.easing}
              onChange={e => handleEasingChange(e.target.value as EasingType)}
              sx={{ fontSize: '0.7rem', height: 32, '.MuiSelect-select': { py: 0.5, pl: 0.75 } }}
            >
              {(['linear', 'ease-in', 'ease-out', 'ease-in-out', 'step'] as EasingType[]).map(e => (
                <MenuItem key={e} value={e} sx={{ fontSize: '0.75rem' }}>{e}</MenuItem>
              ))}
            </Select>
          </>
        )}

        <Box sx={{ flex: 1 }} />

        <Tooltip title="Add Track">
          <IconButton size="small" sx={btnSx} onClick={e => setAddTrackAnchor(e.currentTarget)}>
            <AddIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* ── Track area ───────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Track labels */}
        <Box
          sx={{
            width: TRACK_LABEL_W,
            flexShrink: 0,
            borderRight: 1,
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Ruler spacer */}
          <Box sx={{ height: RULER_HEIGHT, flexShrink: 0, borderBottom: 1, borderColor: 'divider' }} />

          {/* Empty state hint */}
          {(clip?.tracks ?? []).length === 0 && (
            <Box sx={{ p: 1.5 }}>
              <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled', lineHeight: 1.5 }}>
                1. Select a node in the scene<br />
                2. Tap <b>+</b> to add a track<br />
                3. Move playhead, pose object<br />
                4. Tap ◆ to insert keyframe
              </Typography>
            </Box>
          )}

          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            {(clip?.tracks ?? []).map((track, idx) => {
              const color = trackColor(track.property);
              return (
                <Box
                  key={track.id}
                  sx={{
                    height: TRACK_HEIGHT,
                    display: 'flex',
                    alignItems: 'center',
                    px: 0.75,
                    gap: 0.75,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    bgcolor: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                    '&:hover': { bgcolor: 'action.hover' },
                    touchAction: 'none',
                  }}
                  onContextMenu={e => handleTrackContextMenu(e, track.id)}
                  onPointerDown={e => handleTrackRowPointerDown(e, track.id)}
                  onPointerUp={clearLongPress}
                  onPointerCancel={clearLongPress}
                >
                  {/* Color strip */}
                  <Box sx={{ width: 3, height: 24, borderRadius: 1, bgcolor: color, flexShrink: 0 }} />

                  {/* Insert keyframe — large touch target */}
                  <Tooltip title="Insert keyframe — captures current node value at playhead">
                    <Box
                      component="span"
                      sx={{
                        cursor: 'pointer',
                        color: 'text.secondary',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 32,
                        height: 32,
                        borderRadius: 1,
                        flexShrink: 0,
                        '&:hover': { color: '#ffd54f', bgcolor: 'rgba(255,213,79,0.1)' },
                        touchAction: 'none',
                      }}
                      onClick={() => handleInsertKfOnSelected(track)}
                    >
                      <KeyframeAddIcon />
                    </Box>
                  </Tooltip>

                  <Box sx={{ flex: 1, overflow: 'hidden' }}>
                    <Typography noWrap sx={{ fontSize: '0.7rem', color: 'text.primary', lineHeight: 1.3, fontWeight: 500 }}>
                      {nodeName(track.nodeId)}
                    </Typography>
                    <Typography noWrap sx={{ fontSize: '0.62rem', color, lineHeight: 1.1 }}>
                      {propLabel(track.property)}
                    </Typography>
                  </Box>

                  {/* Delete — large touch target */}
                  <Tooltip title="Remove track">
                    <Box
                      component="span"
                      sx={{
                        cursor: 'pointer',
                        color: 'error.main',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 32,
                        height: 32,
                        borderRadius: 1,
                        flexShrink: 0,
                        opacity: 0.4,
                        '&:hover': { opacity: 1, bgcolor: 'rgba(239,83,80,0.1)' },
                        touchAction: 'none',
                      }}
                      onClick={() => clip && onClipChange(AnimationEngine.removeTrack(clip, track.id))}
                    >
                      <DeleteIcon />
                    </Box>
                  </Tooltip>
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* Timeline scroll area */}
        <Box sx={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          <Box
            ref={timelineRef}
            sx={{ position: 'relative', width: Math.max(timelineW + 40, 400), minHeight: '100%' }}
          >
            {/* Ruler */}
            <Box
              sx={{
                position: 'sticky',
                top: 0,
                zIndex: 2,
                height: RULER_HEIGHT,
                bgcolor: 'background.default',
                borderBottom: 1,
                borderColor: 'divider',
                cursor: 'crosshair',
                userSelect: 'none',
                touchAction: 'none',
              }}
              onPointerDown={handleRulerPointerDown}
              onPointerMove={handleRulerPointerMove}
            >
              {ticks.map(tick => (
                <Box
                  key={tick.time}
                  sx={{
                    position: 'absolute',
                    left: tick.time * PX_PER_SEC,
                    top: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    pointerEvents: 'none',
                  }}
                >
                  <Box
                    sx={{
                      width: '1px',
                      bgcolor: tick.major ? 'text.secondary' : 'divider',
                      height: tick.major ? RULER_HEIGHT : RULER_HEIGHT / 2,
                      mt: tick.major ? 0 : `${RULER_HEIGHT / 2}px`,
                    }}
                  />
                  {tick.major && (
                    <Typography
                      sx={{
                        position: 'absolute',
                        top: 4,
                        left: 4,
                        fontSize: '0.62rem',
                        color: 'text.secondary',
                        lineHeight: 1,
                        pointerEvents: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {tick.time}s
                    </Typography>
                  )}
                </Box>
              ))}

              {/* Playhead header */}
              <Box
                sx={{
                  position: 'absolute',
                  left: playheadX,
                  top: 0,
                  transform: 'translateX(-50%)',
                  pointerEvents: 'none',
                  zIndex: 3,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <Box sx={{
                  bgcolor: '#ff9800',
                  borderRadius: '2px 2px 0 0',
                  px: 0.75,
                  lineHeight: 1.4,
                  fontSize: '0.6rem',
                  fontFamily: 'monospace',
                  color: '#000',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}>
                  {currentTime.toFixed(2)}s
                </Box>
                <Box sx={{
                  width: 0, height: 0,
                  borderLeft: '5px solid transparent',
                  borderRight: '5px solid transparent',
                  borderTop: '6px solid #ff9800',
                }} />
              </Box>
            </Box>

            {/* Track rows */}
            {(clip?.tracks ?? []).map((track, idx) => {
              const color = trackColor(track.property);
              return (
                <Box
                  key={track.id}
                  sx={{
                    position: 'relative',
                    height: TRACK_HEIGHT,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    bgcolor: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                    cursor: 'crosshair',
                    touchAction: 'none',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
                  }}
                  onContextMenu={e => handleTrackContextMenu(e, track.id)}
                  onPointerDown={e => handleTrackRowPointerDown(e, track.id)}
                  onPointerMove={e => handleKfPointerMove(e, track.id)}
                  onPointerUp={handleKfPointerUp}
                  onPointerCancel={handleKfPointerUp}
                >
                  {/* Keyframes */}
                  {track.keyframes.map(kf => {
                    const x = kf.time * PX_PER_SEC;
                    const isSelected = selectedKf?.trackId === track.id && selectedKf.kfId === kf.id;
                    return (
                      // Large transparent hit area — critical for stylus precision
                      <Box
                        key={kf.id}
                        sx={{
                          position: 'absolute',
                          left: x,
                          top: '50%',
                          width: KF_HIT_SIZE,
                          height: KF_HIT_SIZE,
                          transform: 'translate(-50%, -50%)',
                          cursor: 'grab',
                          zIndex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          touchAction: 'none',
                          '&:active': { cursor: 'grabbing' },
                        }}
                        onPointerDown={e => handleKfPointerDown(e, track.id, kf.id, kf.time)}
                        onContextMenu={e => handleKfContextMenu(e, track.id, kf.id)}
                      >
                        {/* Visual diamond */}
                        <Box
                          sx={{
                            width: 14,
                            height: 14,
                            transform: 'rotate(45deg)',
                            bgcolor: isSelected ? '#ffd54f' : color,
                            border: '2px solid',
                            borderColor: isSelected ? '#ffcc02' : 'rgba(0,0,0,0.3)',
                            boxShadow: isSelected ? `0 0 6px ${color}` : 'none',
                            transition: 'box-shadow 0.1s',
                          }}
                        />
                      </Box>
                    );
                  })}
                </Box>
              );
            })}

            {/* Playhead vertical line */}
            <Box
              sx={{
                position: 'absolute',
                left: playheadX,
                top: 0,
                bottom: 0,
                width: '2px',
                bgcolor: '#ff9800',
                transform: 'translateX(-1px)',
                pointerEvents: 'none',
                zIndex: 2,
              }}
            />
          </Box>
        </Box>
      </Box>

      {/* ── Context menu ─────────────────────────────────────────── */}
      {contextMenu && (
        <Box
          sx={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 9999,
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            boxShadow: 8,
            py: 0.5,
            minWidth: 180,
          }}
          onPointerDown={e => e.stopPropagation()}
        >
          {contextMenu.kfId && (
            <Box
              sx={{ px: 2, py: 1, cursor: 'pointer', fontSize: '0.8rem', '&:hover': { bgcolor: 'action.hover' } }}
              onClick={handleDeleteKf}
            >
              Delete Keyframe
            </Box>
          )}
          <Box
            sx={{ px: 2, py: 1, cursor: 'pointer', fontSize: '0.8rem', '&:hover': { bgcolor: 'action.hover' } }}
            onClick={handleInsertKfHere}
          >
            Insert Keyframe Here
          </Box>
          <Divider sx={{ my: 0.5 }} />
          <Box
            sx={{ px: 2, py: 1, cursor: 'pointer', fontSize: '0.8rem', color: 'error.main', '&:hover': { bgcolor: 'action.hover' } }}
            onClick={handleDeleteTrack}
          >
            Remove Track
          </Box>
          <Divider sx={{ my: 0.5 }} />
          <Box
            sx={{ px: 2, py: 1, cursor: 'pointer', fontSize: '0.8rem', color: 'text.secondary', '&:hover': { bgcolor: 'action.hover' } }}
            onClick={closeContext}
          >
            Cancel
          </Box>
        </Box>
      )}

      {/* ── Add Track popover ─────────────────────────────────────── */}
      <Popover
        open={Boolean(addTrackAnchor)}
        anchorEl={addTrackAnchor}
        onClose={() => setAddTrackAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        PaperProps={{ sx: { width: 280, maxHeight: 480 } }}
      >
        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 1 }}>Add Animation Track</Typography>
          <TextField
            select
            size="small"
            fullWidth
            label="Node"
            value={addTrackNodeId}
            onChange={e => setAddTrackNodeId(e.target.value)}
            SelectProps={{ sx: { fontSize: '0.8rem' } }}
            InputLabelProps={{ sx: { fontSize: '0.8rem' } }}
          >
            {sceneNodes.map(n => (
              <MenuItem key={n.id} value={n.id} sx={{ fontSize: '0.8rem', minHeight: 40 }}>
                {n.name}
                <Typography component="span" sx={{ fontSize: '0.7rem', color: 'text.secondary', ml: 0.5 }}>
                  ({n.type})
                </Typography>
              </MenuItem>
            ))}
          </TextField>
        </Box>
        <List dense sx={{ py: 0.5, maxHeight: 320, overflow: 'auto' }}>
          {getAnimProps(addTrackNode?.type ?? 'group').map(prop => {
            const alreadyExists = clip?.tracks.some(t => t.nodeId === addTrackNodeId && t.property === prop);
            const color = trackColor(prop);
            return (
              <ListItem key={prop} disablePadding>
                <ListItemButton
                  dense
                  disabled={alreadyExists}
                  onClick={() => handleAddTrack(prop)}
                  sx={{ py: 0.75, minHeight: 44 }}
                >
                  <Box sx={{ width: 3, height: 20, borderRadius: 0.5, bgcolor: color, mr: 1.5, flexShrink: 0 }} />
                  <ListItemText
                    primary={propLabel(prop)}
                    secondary={prop}
                    primaryTypographyProps={{ fontSize: '0.8rem' }}
                    secondaryTypographyProps={{ fontSize: '0.65rem' }}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Popover>
    </Box>
  );
}
