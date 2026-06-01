import { useRef, useMemo, useEffect, useCallback, useState, MutableRefObject, useLayoutEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, TransformControls, GizmoHelper, GizmoViewport, PerspectiveCamera as DreiPerspectiveCamera, OrthographicCamera as DreiOrthographicCamera, Environment } from '@react-three/drei';
import * as THREE from 'three';
import type { SceneGraph } from '../scene/SceneGraph';
import type { SceneNode } from '../scene/SceneNode';
import type { MeshNode, BufferGeometryData } from '../nodes/MeshNode';
import type { LightNode } from '../nodes/LightNode';
import type { CameraNode } from '../nodes/CameraNode';
import type { AudioNode as SceneAudioNode } from '../nodes/AudioNode';
import type { CSSProperties, ReactElement, RefObject } from 'react';
import type { CameraPresetName, SceneSettings } from '@mhersztowski/ui-core';
import { CAMERA_PRESETS } from './cameraPresets';

export type SceneRenderMode = 'realistic' | 'solid' | 'normal' | 'wireframe';

export interface SimpleViewerProps {
  sceneGraph?: SceneGraph;
  version?: number;
  showGrid?: boolean;
  selectedNodeId?: string | null;
  transformMode?: 'translate' | 'rotate' | 'scale';
  cameraPreset?: CameraPresetName;
  onNodeSelect?: (nodeId: string | null) => void;
  width?: number | string;
  height?: number | string;
  backgroundColor?: string;
  className?: string;
  style?: CSSProperties;
  /** Fit camera to encompass all scene meshes on mount / when sceneGraph changes. */
  autoFit?: boolean;
  /** Pass a ref; its `.current` will be set to a `fitScene()` function for imperative triggering. */
  fitSceneRef?: MutableRefObject<(() => void) | null>;
  /** Show orientation gizmo in the bottom-left corner. Default true. */
  showAxesGizmo?: boolean;
  /** ID of a scene CameraNode to use as the viewport camera; null = editor camera. */
  activeCameraNodeId?: string | null;
  /** Viewport shading mode. Default 'realistic'. */
  renderMode?: SceneRenderMode;
  /** Scene-level settings: background, environment, fog. */
  sceneSettings?: SceneSettings;
  /** Called when the user clicks on the Y=0 floor plane (for template placement). wx/wz = world X/Z coordinates. */
  onPlaneClick?: (wx: number, wz: number) => void;
  /** Show a floating debug log overlay — useful for diagnosing gizmo / touch issues on mobile. */
  debugLog?: boolean;
  /** Resolves a VFS path (e.g. /users/default/projects/audio.mp3) to a playable URL (e.g. blob:). */
  resolveAudioSrc?: (src: string) => Promise<string>;
  /** Size of the transform gizmo handles. Default 0.7. */
  gizmoSize?: number;
}

function SelectableMesh({
  node,
  meshNode,
  isSelected,
  onSelect,
  renderMode = 'realistic',
}: {
  node: SceneNode;
  meshNode: MeshNode;
  isSelected: boolean;
  onSelect?: (nodeId: string) => void;
  renderMode?: SceneRenderMode;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    node._threeObject = meshRef.current;
    return () => { node._threeObject = null; };
  }, [node]);

  return (
    <mesh
      ref={meshRef}
      name={node.id}
      position={node.position}
      rotation={node.rotation}
      scale={node.scale}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(node.id);
      }}
    >
      <MeshGeometry type={meshNode.geometry.type} params={meshNode.geometry.params} bufferData={meshNode.geometry.bufferData} />
      {renderMode === 'solid' && (
        <meshLambertMaterial color={isSelected ? '#4fc3f7' : '#888888'} />
      )}
      {renderMode === 'normal' && (
        <meshNormalMaterial />
      )}
      {renderMode === 'wireframe' && (
        <meshBasicMaterial wireframe color={isSelected ? '#4fc3f7' : '#aaaaaa'} />
      )}
      {(renderMode === 'realistic' || renderMode == null) && (
        <meshStandardMaterial
          color={meshNode.material.color}
          opacity={meshNode.material.opacity}
          transparent={meshNode.material.opacity < 1}
          wireframe={meshNode.material.wireframe}
          emissive={isSelected ? '#4fc3f7' : '#000000'}
          emissiveIntensity={isSelected ? 0.15 : 0}
        />
      )}
    </mesh>
  );
}


function GizmoControls({
  sceneGraph,
  selectedNodeId,
  transformMode,
  onObjectChange,
  isDraggingGizmoRef,
  addLog,
  gizmoSize = 0.7,
}: {
  sceneGraph: SceneGraph;
  selectedNodeId: string;
  transformMode: 'translate' | 'rotate' | 'scale';
  onObjectChange?: (obj: THREE.Object3D) => void;
  isDraggingGizmoRef?: MutableRefObject<boolean>;
  addLog?: (msg: string) => void;
  gizmoSize?: number;
}) {
  const { scene } = useThree();
  const controlsRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const targetObject = useMemo(() => {
    return scene.getObjectByName(selectedNodeId) as THREE.Mesh | undefined;
  }, [scene, selectedNodeId]);

  const handleDragEnd = useCallback(() => {
    if (!targetObject) return;
    const node = sceneGraph.findNode(selectedNodeId);
    if (!node) return;

    if (transformMode === 'translate') {
      const p = targetObject.position;
      node.setPosition([p.x, p.y, p.z]);
      addLog?.(`pos saved (${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)})`);
    } else if (transformMode === 'rotate') {
      const r = targetObject.rotation;
      node.setRotation([r.x, r.y, r.z]);
      addLog?.(`rot saved (${r.x.toFixed(2)},${r.y.toFixed(2)},${r.z.toFixed(2)})`);
    } else if (transformMode === 'scale') {
      const s = targetObject.scale;
      node.setScale([s.x, s.y, s.z]);
      addLog?.(`scale saved (${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)})`);
    }
  }, [targetObject, sceneGraph, selectedNodeId, transformMode, addLog]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const callback = () => { addLog?.('gizmo mouseUp'); handleDragEnd(); };
    controls.addEventListener('mouseUp', callback);
    return () => controls.removeEventListener('mouseUp', callback);
  }, [handleDragEnd, addLog]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const callback = () => { if (targetObject) onObjectChange?.(targetObject); };
    controls.addEventListener('change', callback);
    return () => controls.removeEventListener('change', callback);
  }, [onObjectChange, targetObject]);

  // Guard onPointerMissed from deselecting during drag.
  // Grace-period timeout on drag-end covers stylus/pen brief lifts between strokes.
  const dragEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const onDraggingChanged = (e: { value: boolean }) => {
      addLog?.(`dragging-changed ${e.value}`);
      if (e.value) {
        if (dragEndTimerRef.current) { clearTimeout(dragEndTimerRef.current); dragEndTimerRef.current = null; }
        if (isDraggingGizmoRef) isDraggingGizmoRef.current = true;
      } else {
        // Delay clearing so a stylus re-contact within 250ms doesn't fire onPointerMissed
        dragEndTimerRef.current = setTimeout(() => {
          if (isDraggingGizmoRef) isDraggingGizmoRef.current = false;
          dragEndTimerRef.current = null;
          addLog?.('dragging guard cleared');
        }, 250);
      }
    };
    controls.addEventListener('dragging-changed', onDraggingChanged);
    return () => {
      controls.removeEventListener('dragging-changed', onDraggingChanged);
      if (dragEndTimerRef.current) { clearTimeout(dragEndTimerRef.current); dragEndTimerRef.current = null; }
      if (isDraggingGizmoRef) isDraggingGizmoRef.current = false;
    };
  }, [isDraggingGizmoRef, addLog]);

  if (!targetObject) return null;

  return (
    <TransformControls
      ref={controlsRef}
      object={targetObject}
      mode={transformMode}
      size={gizmoSize}
    />
  );
}

function CameraGizmoShape({
  color,
  cameraType,
  fov,
  near,
  far,
  left,
  right,
  top,
  bottom,
}: {
  color: string;
  cameraType: 'perspective' | 'orthographic';
  fov: number;
  near: number;
  far: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}) {
  const frustumGeo = useMemo(() => {
    let nL: number, nR: number, nT: number, nB: number;
    let fL: number, fR: number, fT: number, fB: number;

    if (cameraType === 'orthographic') {
      nL = left;  nR = right; nT = top;   nB = bottom;
      fL = left;  fR = right; fT = top;   fB = bottom;
    } else {
      const aspect = 16 / 9;
      const tanV = Math.tan((fov * Math.PI / 180) / 2);
      const tanH = tanV * aspect;
      nL = -near * tanH; nR = near * tanH; nT = near * tanV; nB = -near * tanV;
      fL = -far * tanH;  fR = far * tanH;  fT = far * tanV;  fB = -far * tanV;
    }

    const verts = new Float32Array([
      // 4 corner rays near → far
      nR, nT, -near,  fR, fT, -far,
      nL, nT, -near,  fL, fT, -far,
      nR, nB, -near,  fR, fB, -far,
      nL, nB, -near,  fL, fB, -far,
      // near rect
      nR, nT, -near,  nL, nT, -near,
      nL, nT, -near,  nL, nB, -near,
      nL, nB, -near,  nR, nB, -near,
      nR, nB, -near,  nR, nT, -near,
      // far rect
      fR, fT, -far,   fL, fT, -far,
      fL, fT, -far,   fL, fB, -far,
      fL, fB, -far,   fR, fB, -far,
      fR, fB, -far,   fR, fT, -far,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    return geo;
  }, [cameraType, fov, near, far, left, right, top, bottom]);

  useEffect(() => () => frustumGeo.dispose(), [frustumGeo]);

  return (
    <>
      <mesh>
        <boxGeometry args={[0.32, 0.22, 0.14]} />
        <meshBasicMaterial color={color} wireframe />
      </mesh>
      <mesh position={[0, 0, -0.09]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.05, 12]} />
        <meshBasicMaterial color={color} wireframe />
      </mesh>
      <lineSegments geometry={frustumGeo}>
        <lineBasicMaterial color={color} />
      </lineSegments>
    </>
  );
}

function SceneCamera({
  node,
  cameraNode,
  isSelected,
  onSelect,
}: {
  node: SceneNode;
  cameraNode: CameraNode;
  isSelected: boolean;
  onSelect?: (nodeId: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    node._threeObject = groupRef.current;
    return () => { node._threeObject = null; };
  }, [node]);

  return (
    <group
      ref={groupRef}
      name={node.id}
      position={node.position}
      rotation={node.rotation as [number, number, number]}
      scale={node.scale}
      onClick={(e) => { e.stopPropagation(); onSelect?.(node.id); }}
    >
      <CameraGizmoShape
        color={isSelected ? '#4fc3f7' : '#66aaff'}
        cameraType={cameraNode.cameraType}
        fov={cameraNode.fov}
        near={cameraNode.near}
        far={cameraNode.far}
        left={cameraNode.left}
        right={cameraNode.right}
        top={cameraNode.top}
        bottom={cameraNode.bottom}
      />
    </group>
  );
}

function SceneLight({
  node,
  lightNode,
}: {
  node: SceneNode;
  lightNode: LightNode;
}) {
  const ref = useRef<THREE.Light>(null);

  useEffect(() => {
    node._threeObject = ref.current;
    return () => { node._threeObject = null; };
  }, [node]);

  // Sync shadow sub-properties imperatively after every render (point / directional lights)
  useEffect(() => {
    const light = ref.current as THREE.PointLight | THREE.DirectionalLight | null;
    if (!light?.shadow) return;
    light.shadow.bias = lightNode.shadowBias;
    light.shadow.normalBias = lightNode.shadowNormalBias;
    light.shadow.radius = lightNode.shadowRadius;
    // shadow.intensity added in Three.js r166
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ('intensity' in light.shadow) (light.shadow as any).intensity = lightNode.shadowIntensity;
  });

  switch (lightNode.lightType) {
    case 'ambient':
      return (
        <ambientLight
          ref={ref as RefObject<THREE.AmbientLight>}
          color={lightNode.color}
          intensity={lightNode.intensity}
        />
      );
    case 'point':
      return (
        <pointLight
          ref={ref as RefObject<THREE.PointLight>}
          position={node.position}
          color={lightNode.color}
          intensity={lightNode.intensity}
          distance={lightNode.distance}
          decay={lightNode.decay}
          castShadow={node.castShadow}
        />
      );
    case 'spot':
      return (
        <spotLight
          ref={ref as RefObject<THREE.SpotLight>}
          position={node.position}
          color={lightNode.color}
          intensity={lightNode.intensity}
          distance={lightNode.distance}
          angle={lightNode.angle}
          penumbra={lightNode.penumbra}
          decay={lightNode.decay}
          castShadow={node.castShadow}
        />
      );
    case 'hemisphere':
      return (
        <hemisphereLight
          ref={ref as RefObject<THREE.HemisphereLight>}
          position={node.position}
          color={lightNode.color}
          groundColor={lightNode.groundColor}
          intensity={lightNode.intensity}
        />
      );
    case 'directional':
    default:
      return (
        <directionalLight
          ref={ref as RefObject<THREE.DirectionalLight>}
          position={node.position}
          color={lightNode.color}
          intensity={lightNode.intensity}
        />
      );
  }
}

// Shared AudioListener — one per browser context, attached to active camera
let _sharedAudioListener: THREE.AudioListener | null = null;
function getSharedAudioListener(): THREE.AudioListener {
  if (!_sharedAudioListener) _sharedAudioListener = new THREE.AudioListener();
  return _sharedAudioListener;
}

function AudioListenerEffect() {
  const { camera } = useThree();
  useEffect(() => {
    const listener = getSharedAudioListener();
    camera.add(listener);
    return () => { camera.remove(listener); };
  }, [camera]);
  return null;
}

function SceneAudio({
  node,
  audioNode,
  isSelected,
  onSelect,
  resolveAudioSrc,
}: {
  node: SceneNode;
  audioNode: SceneAudioNode;
  isSelected: boolean;
  onSelect?: (nodeId: string) => void;
  resolveAudioSrc?: (src: string) => Promise<string>;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    node._threeObject = groupRef.current;
    return () => { node._threeObject = null; };
  }, [node]);

  useEffect(() => {
    if (!audioNode.src) return;
    const group = groupRef.current;
    if (!group) return;

    const listener = getSharedAudioListener();
    const positional = audioNode.positional ?? true;
    const sound: THREE.Audio<GainNode> | THREE.PositionalAudio = positional
      ? new THREE.PositionalAudio(listener)
      : new THREE.Audio<GainNode>(listener);
    let mounted = true;
    const blobRef = { url: null as string | null };

    const doLoad = async () => {
      let url = audioNode.src;
      if (resolveAudioSrc) {
        try {
          const resolved = await resolveAudioSrc(url);
          if (resolved.startsWith('blob:')) blobRef.url = resolved;
          url = resolved;
        } catch { /* fallback to original src */ }
      }
      if (!mounted) {
        if (blobRef.url) { URL.revokeObjectURL(blobRef.url); blobRef.url = null; }
        return;
      }
      const loader = new THREE.AudioLoader();
      loader.load(url, (buffer: AudioBuffer) => {
        if (!mounted) return;
        sound.setBuffer(buffer);
        sound.setVolume(audioNode.volume);
        sound.setLoop(audioNode.loop);
        if (positional) {
          const ps = sound as unknown as THREE.PositionalAudio;
          ps.setRefDistance(audioNode.refDistance);
          ps.setRolloffFactor(audioNode.rolloffFactor);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (ps as any).setDistanceModel?.(audioNode.distanceModel);
          ps.setMaxDistance(audioNode.maxDistance);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pa = ps as any;
          pa.setConeInnerAngle?.(audioNode.coneInnerAngle);
          pa.setConeOuterAngle?.(audioNode.coneOuterAngle);
          pa.setConeOuterGain?.(audioNode.coneOuterGain);
        }
        group.add(sound);
        if (audioNode.autoplay) sound.play();
      }, undefined, () => { /* ignore load errors */ });
    };

    doLoad();

    return () => {
      mounted = false;
      if (sound.isPlaying) sound.stop();
      try { sound.disconnect(); } catch { /* ignore */ }
      group.remove(sound);
      if (blobRef.url) { URL.revokeObjectURL(blobRef.url); blobRef.url = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioNode.src, audioNode.positional, audioNode.refDistance, audioNode.distanceModel,
      audioNode.maxDistance, audioNode.rolloffFactor, audioNode.volume, audioNode.loop,
      audioNode.autoplay, audioNode.coneInnerAngle, audioNode.coneOuterAngle,
      audioNode.coneOuterGain, resolveAudioSrc]);

  return (
    <group
      ref={groupRef}
      name={node.id}
      position={node.position}
      rotation={node.rotation as [number, number, number]}
      scale={node.scale}
      onClick={(e) => { e.stopPropagation(); onSelect?.(node.id); }}
    >
      {/* Speaker visual: wireframe octahedron */}
      <mesh>
        <octahedronGeometry args={[0.18, 0]} />
        <meshBasicMaterial color={isSelected ? '#4fc3f7' : '#ffd54f'} wireframe />
      </mesh>
      {/* Transparent fill for easier hit testing */}
      <mesh>
        <octahedronGeometry args={[0.18, 0]} />
        <meshBasicMaterial color={isSelected ? '#4fc3f7' : '#ffd54f'} transparent opacity={0.06} />
      </mesh>
    </group>
  );
}

function SceneRenderer({
  sceneGraph,
  version,
  selectedNodeId,
  onNodeSelect,
  renderMode = 'realistic',
  resolveAudioSrc,
}: {
  sceneGraph?: SceneGraph;
  version?: number;
  selectedNodeId?: string | null;
  onNodeSelect?: (nodeId: string) => void;
  renderMode?: SceneRenderMode;
  resolveAudioSrc?: (src: string) => Promise<string>;
}) {
  const objects = useMemo(() => {
    if (!sceneGraph) return [];
    const result: ReactElement[] = [];

    sceneGraph.traverse((node: SceneNode) => {
      if (node === sceneGraph.root) return;
      if (!node.visible) return;

      if (node.type === 'mesh') {
        const meshNode = node as unknown as MeshNode;
        result.push(
          <SelectableMesh
            key={node.id}
            node={node}
            meshNode={meshNode}
            isSelected={node.id === selectedNodeId}
            onSelect={onNodeSelect}
            renderMode={renderMode}
          />,
        );
      } else if (node.type === 'light') {
        const lightNode = node as unknown as LightNode;
        result.push(
          <SceneLight
            key={node.id}
            node={node}
            lightNode={lightNode}
          />,
        );
      } else if (node.type === 'camera') {
        const cameraNode = node as unknown as CameraNode;
        result.push(
          <SceneCamera
            key={node.id}
            node={node}
            cameraNode={cameraNode}
            isSelected={node.id === selectedNodeId}
            onSelect={onNodeSelect}
          />,
        );
      } else if (node.type === 'audio') {
        const audioNode = node as unknown as SceneAudioNode;
        result.push(
          <SceneAudio
            key={node.id}
            node={node}
            audioNode={audioNode}
            isSelected={node.id === selectedNodeId}
            onSelect={onNodeSelect}
            resolveAudioSrc={resolveAudioSrc}
          />,
        );
      }
    });

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneGraph, version, selectedNodeId, onNodeSelect, renderMode, resolveAudioSrc]);

  return <group>{objects}</group>;
}

function CustomBufferGeometry({ data }: { data: BufferGeometryData }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    if (data.normals) {
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
    }
    if (data.indices) {
      geo.setIndex(data.indices);
    }
    if (!data.normals) {
      geo.computeVertexNormals();
    }
    return geo;
  }, [data]);

  return <primitive object={geometry} attach="geometry" />;
}

function MeshGeometry({
  type,
  params,
  bufferData,
}: {
  type: string;
  params?: Record<string, number>;
  bufferData?: BufferGeometryData;
}) {
  switch (type) {
    case 'custom':
      if (!bufferData) return <boxGeometry />;
      return <CustomBufferGeometry data={bufferData} />;
    case 'sphere':
      return <sphereGeometry args={[params?.['radius'] ?? 1, params?.['widthSegments'] ?? 32, params?.['heightSegments'] ?? 32]} />;
    case 'cylinder':
      return (
        <cylinderGeometry
          args={[
            params?.['radiusTop'] ?? 1,
            params?.['radiusBottom'] ?? 1,
            params?.['height'] ?? 2,
            params?.['radialSegments'] ?? 32,
          ]}
        />
      );
    case 'plane':
      return (
        <planeGeometry args={[params?.['width'] ?? 10, params?.['height'] ?? 10, params?.['widthSegments'] ?? 1, params?.['heightSegments'] ?? 1]} />
      );
    case 'cone':
      return (
        <coneGeometry args={[params?.['radius'] ?? 1, params?.['height'] ?? 2, params?.['radialSegments'] ?? 32]} />
      );
    case 'torus':
      return (
        <torusGeometry
          args={[params?.['radius'] ?? 1, params?.['tube'] ?? 0.4, params?.['radialSegments'] ?? 16, params?.['tubularSegments'] ?? 100]}
        />
      );
    case 'box':
    default:
      return (
        <boxGeometry
          args={[
            params?.['width'] ?? 1,
            params?.['height'] ?? 1,
            params?.['depth'] ?? 1,
            params?.['widthSegments'] ?? 1,
            params?.['heightSegments'] ?? 1,
            params?.['depthSegments'] ?? 1,
          ]}
        />
      );
  }
}

/** Fits the perspective camera to encompass all meshes in the scene. */
function FitCameraEffect({
  sceneGraph,
  autoFit,
  fitSceneRef,
}: {
  sceneGraph?: SceneGraph;
  autoFit?: boolean;
  fitSceneRef?: MutableRefObject<(() => void) | null>;
}) {
  const { camera, controls, scene } = useThree();

  const doFit = useCallback(() => {
    const box = new THREE.Box3();
    let hasMesh = false;
    scene.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        // ensure world matrices are up to date
        obj.updateWorldMatrix(true, false);
        obj.geometry.computeBoundingBox();
        if (obj.geometry.boundingBox) {
          box.union(obj.geometry.boundingBox.clone().applyMatrix4(obj.matrixWorld));
          hasMesh = true;
        }
      }
    });
    if (!hasMesh) return;

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
    const dist = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.8;

    // Keep current view direction, just move along it to fit
    const dir = camera.position.clone().sub(center);
    if (dir.lengthSq() < 0.001) dir.set(1, 1, 1);
    dir.normalize();

    camera.position.copy(center.clone().addScaledVector(dir, dist));
    camera.near = dist * 0.01;
    camera.far = dist * 100;
    camera.updateProjectionMatrix();

    if (controls && 'target' in controls) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orbitControls = controls as unknown as { target: THREE.Vector3; update(): void };
      orbitControls.target.copy(center);
      orbitControls.update();
    }
  }, [camera, controls, scene]);

  // Expose imperative handle to parent
  useEffect(() => {
    if (fitSceneRef) fitSceneRef.current = doFit;
    return () => { if (fitSceneRef) fitSceneRef.current = null; };
  }, [fitSceneRef, doFit]);

  // Auto-fit when sceneGraph is loaded or changes
  const childCount = sceneGraph?.root?.children?.length ?? 0;
  useEffect(() => {
    if (!autoFit || !sceneGraph) return;
    // Delay one frame so Three.js finishes building geometry
    const id = requestAnimationFrame(doFit);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFit, sceneGraph, childCount]);

  return null;
}

function ActiveSceneCamera({
  sceneGraph,
  activeCameraNodeId,
}: {
  sceneGraph: SceneGraph;
  activeCameraNodeId: string;
}) {
  const node = sceneGraph.findNode(activeCameraNodeId);
  if (!node || node.type !== 'camera') return null;
  const cam = node as unknown as CameraNode;

  if (cam.cameraType === 'orthographic') {
    return (
      <DreiOrthographicCamera
        makeDefault
        position={node.position}
        rotation={node.rotation as [number, number, number]}
        near={cam.near}
        far={cam.far}
        left={cam.left}
        right={cam.right}
        top={cam.top}
        bottom={cam.bottom}
      />
    );
  }
  return (
    <DreiPerspectiveCamera
      makeDefault
      position={node.position}
      rotation={node.rotation as [number, number, number]}
      fov={cam.fov}
      near={cam.near}
      far={cam.far}
    />
  );
}


function PlacementPlane({ onPlaneClick }: { onPlaneClick: (wx: number, wz: number) => void }) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        onPlaneClick(e.point.x, e.point.z);
      }}
    >
      <planeGeometry args={[10000, 10000]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function SceneContent({
  sceneGraph,
  version,
  showGrid,
  selectedNodeId,
  transformMode,
  cameraPreset = 'standard',
  onNodeSelect,
  autoFit,
  fitSceneRef,
  showAxesGizmo,
  activeCameraNodeId,
  renderMode = 'realistic',
  sceneSettings,
  onObjectChange,
  onPlaneClick,
  isDraggingGizmoRef,
  addLog,
  resolveAudioSrc,
  gizmoSize = 0.7,
}: {
  sceneGraph?: SceneGraph;
  version?: number;
  showGrid: boolean;
  selectedNodeId?: string | null;
  transformMode: 'translate' | 'rotate' | 'scale';
  cameraPreset?: CameraPresetName;
  onNodeSelect?: (nodeId: string | null) => void;
  autoFit?: boolean;
  fitSceneRef?: MutableRefObject<(() => void) | null>;
  showAxesGizmo?: boolean;
  activeCameraNodeId?: string | null;
  renderMode?: SceneRenderMode;
  sceneSettings?: SceneSettings;
  onObjectChange?: (obj: THREE.Object3D) => void;
  onPlaneClick?: (wx: number, wz: number) => void;
  isDraggingGizmoRef?: MutableRefObject<boolean>;
  addLog?: (msg: string) => void;
  resolveAudioSrc?: (src: string) => Promise<string>;
  gizmoSize?: number;
}) {
  const selectedNode = selectedNodeId && sceneGraph ? sceneGraph.findNode(selectedNodeId) : null;
  const showGizmo = selectedNode?.type === 'mesh' || selectedNode?.type === 'camera' || selectedNode?.type === 'audio';
  const presetConfig = CAMERA_PRESETS[cameraPreset];

  // Log showGizmo state changes
  const prevShowGizmoRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevShowGizmoRef.current !== showGizmo) {
      addLog?.(`showGizmo=${showGizmo} node=${selectedNodeId?.slice(0, 8) ?? 'none'}`);
      prevShowGizmoRef.current = showGizmo;
    }
  });

  return (
    <>
      {activeCameraNodeId && sceneGraph
        ? <ActiveSceneCamera sceneGraph={sceneGraph} activeCameraNodeId={activeCameraNodeId} />
        : null}
      {/* Orbit disabled when a gizmo is shown — prevents camera competing with transform drag */}
      <OrbitControls makeDefault={!activeCameraNodeId} enabled={!activeCameraNodeId && !showGizmo} enableDamping={false} mouseButtons={presetConfig.mouseButtons as Partial<{ LEFT: THREE.MOUSE; MIDDLE: THREE.MOUSE; RIGHT: THREE.MOUSE }>} />
      {sceneSettings?.backgroundType === 'solid' && (
        <color attach="background" args={[sceneSettings.backgroundColor]} />
      )}
      {sceneSettings?.fogType === 'linear' && (
        <fog attach="fog" args={[sceneSettings.fogColor, sceneSettings.fogNear, sceneSettings.fogFar]} />
      )}
      {sceneSettings?.fogType === 'exp2' && (
        <fogExp2 attach="fog" args={[sceneSettings.fogColor, sceneSettings.fogDensity]} />
      )}
      {sceneSettings?.environmentPreset && sceneSettings.environmentPreset !== 'none' && (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <Environment preset={sceneSettings.environmentPreset as any} />
      )}
      <AudioListenerEffect />
      <ambientLight intensity={0.3} />
      <directionalLight position={[10, 10, 5]} intensity={0.7} />
      {showGrid && <gridHelper args={[20, 20, '#444444', '#333333']} />}
      <SceneRenderer
        sceneGraph={sceneGraph}
        version={version}
        selectedNodeId={selectedNodeId}
        onNodeSelect={onNodeSelect}
        renderMode={renderMode}
        resolveAudioSrc={resolveAudioSrc}
      />
      {showGizmo && sceneGraph && selectedNodeId && (
        <GizmoControls
          sceneGraph={sceneGraph}
          selectedNodeId={selectedNodeId}
          transformMode={transformMode}
          onObjectChange={onObjectChange}
          isDraggingGizmoRef={isDraggingGizmoRef}
          addLog={addLog}
          gizmoSize={gizmoSize}
        />
      )}
      <FitCameraEffect sceneGraph={sceneGraph} autoFit={autoFit} fitSceneRef={fitSceneRef} />
      {onPlaneClick && <PlacementPlane onPlaneClick={onPlaneClick} />}
      {showAxesGizmo !== false && (
        <GizmoHelper alignment="bottom-left" margin={[72, 72]}>
          <GizmoViewport
            axisColors={['#e05555', '#55cc55', '#4488ff']}
            labelColor="white"
          />
        </GizmoHelper>
      )}
    </>
  );
}

export function SimpleViewer({
  sceneGraph,
  version,
  showGrid = true,
  selectedNodeId,
  transformMode = 'translate',
  cameraPreset = 'standard',
  onNodeSelect,
  width = '100%',
  height = '100%',
  backgroundColor = '#2a2a2a',
  className,
  style,
  autoFit,
  fitSceneRef,
  showAxesGizmo,
  activeCameraNodeId,
  renderMode = 'realistic',
  sceneSettings,
  onPlaneClick,
  debugLog = false,
  resolveAudioSrc,
  gizmoSize = 0.7,
}: SimpleViewerProps) {
  const scaleXRef = useRef<HTMLSpanElement>(null);
  const scaleYRef = useRef<HTMLSpanElement>(null);
  const scaleZRef = useRef<HTMLSpanElement>(null);

  // ── Debug log ────────────────────────────────────────────────────────────────
  const DEBUG_MAX = 24;
  const debugLinesRef = useRef<string[]>([]);
  const debugScrollRef = useRef<HTMLDivElement>(null);
  const [, setDebugVer] = useState(0);
  const pendingSendRef = useRef<string[]>([]);
  const debugSessionRef = useRef(`s${Date.now().toString(36)}`);

  const addLog = useCallback((msg: string) => {
    if (!debugLog) return;
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}.${String(now.getMilliseconds()).padStart(3,'0')}`;
    const line = `${ts} ${msg}`;
    debugLinesRef.current = [...debugLinesRef.current.slice(-(DEBUG_MAX - 1)), line];
    pendingSendRef.current.push(`[${debugSessionRef.current}] ${line}`);
    setDebugVer(v => v + 1);
  }, [debugLog]);

  // Auto-flush pending lines to cad-backend every 2s
  useEffect(() => {
    if (!debugLog) return;
    const id = setInterval(() => {
      const lines = pendingSendRef.current.splice(0);
      if (lines.length === 0) return;
      fetch('/api/debug-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
      }).catch(() => { /* ignore network errors */ });
    }, 2000);
    return () => clearInterval(id);
  }, [debugLog]);

  // Auto-scroll debug panel to bottom on new entries
  useLayoutEffect(() => {
    if (debugScrollRef.current) {
      debugScrollRef.current.scrollTop = debugScrollRef.current.scrollHeight;
    }
  });

  // Gizmo drag guard — prevents onPointerMissed from deselecting while dragging a gizmo handle
  const isDraggingGizmoRef = useRef(false);

  // Pen/stylus hover filter — block pointer events where pointerType='pen' but pressure=0
  // (stylus near screen but not touching). Skipped during an active gizmo drag so that
  // the zero-pressure event after a brief lift doesn't drop the drag track.
  const [glInstance, setGlInstance] = useState<THREE.WebGLRenderer | null>(null);
  // Pen hover events are logged only to the on-screen overlay (not sent to server) to avoid flooding the buffer
  const hoverBlockCountRef = useRef(0);
  const filterPenHover = useCallback((e: PointerEvent) => {
    if (e.pointerType === 'pen' && e.pressure === 0 && !isDraggingGizmoRef.current) {
      hoverBlockCountRef.current++;
      // Only show every 20th hover-blocked event in the overlay, never send to server
      if (debugLog && hoverBlockCountRef.current % 20 === 1) {
        const now = new Date();
        const ts = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}.${String(now.getMilliseconds()).padStart(3,'0')}`;
        const line = `${ts} hover blocked ×${hoverBlockCountRef.current}`;
        debugLinesRef.current = [...debugLinesRef.current.slice(-(DEBUG_MAX - 1)), line];
        setDebugVer(v => v + 1);
        // NOT pushed to pendingSendRef — don't flood server buffer
      }
      e.stopImmediatePropagation();
    }
  }, [debugLog]);

  // pointercancel → synthetic pointerup — fixes TransformControls getting stuck when stylus
  // is lifted quickly (browser fires cancel instead of up; Three.js TC doesn't handle cancel).
  useEffect(() => {
    if (!glInstance) return;
    const el = glInstance.domElement;
    const onCancel = (e: PointerEvent) => {
      addLog?.(`✕ ${e.pointerType} cancel pid=${e.pointerId}`);
      try {
        el.dispatchEvent(new PointerEvent('pointerup', {
          pointerId: e.pointerId,
          pointerType: e.pointerType,
          button: 0,
          clientX: e.clientX,
          clientY: e.clientY,
          bubbles: true,
          cancelable: false,
        }));
      } catch { /* ignore */ }
    };
    el.addEventListener('pointercancel', onCancel);
    return () => el.removeEventListener('pointercancel', onCancel);
  }, [glInstance, addLog]);

  // Native pointer event logging on the canvas
  useEffect(() => {
    if (!glInstance || !debugLog) return;
    const el = glInstance.domElement;
    const onDown = (e: PointerEvent) => {
      addLog(`↓ ${e.pointerType} btn=${e.button} p=${e.pressure.toFixed(2)} (${e.offsetX.toFixed(0)},${e.offsetY.toFixed(0)})`);
    };
    const onUp = (e: PointerEvent) => {
      addLog(`↑ ${e.pointerType} btn=${e.button} p=${e.pressure.toFixed(2)}`);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pressure > 0) addLog(`→ ${e.pointerType} p=${e.pressure.toFixed(2)} (${e.offsetX.toFixed(0)},${e.offsetY.toFixed(0)})`);
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointermove', onMove);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointermove', onMove);
    };
  }, [glInstance, debugLog, addLog]);

  useEffect(() => {
    if (!glInstance) return;
    const el = glInstance.domElement;
    el.addEventListener('pointermove', filterPenHover, { capture: true });
    el.addEventListener('pointerover', filterPenHover, { capture: true });
    el.addEventListener('pointerenter', filterPenHover, { capture: true });
    return () => {
      el.removeEventListener('pointermove', filterPenHover, { capture: true });
      el.removeEventListener('pointerover', filterPenHover, { capture: true });
      el.removeEventListener('pointerenter', filterPenHover, { capture: true });
    };
  }, [glInstance, filterPenHover]);

  const handleLiveTransform = useCallback((obj: THREE.Object3D) => {
    if (scaleXRef.current) scaleXRef.current.textContent = obj.scale.x.toFixed(3);
    if (scaleYRef.current) scaleYRef.current.textContent = obj.scale.y.toFixed(3);
    if (scaleZRef.current) scaleZRef.current.textContent = obj.scale.z.toFixed(3);
  }, []);

  const selectedNode = selectedNodeId && sceneGraph ? sceneGraph.findNode(selectedNodeId) : null;
  // R3F fires onPointerMissed for EVERY tap on the gizmo (<primitive> has no R3F handlers).
  // On mobile/stylus a tap always emits click → onPointerMissed → deselects node → gizmo gone.
  // Fix: suppress deselection whenever transform handles are visible.
  const showGizmo = selectedNode?.type === 'mesh' || selectedNode?.type === 'camera' || selectedNode?.type === 'audio';

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width,
        height,
        overflow: 'hidden',
        touchAction: 'none',
        ...style,
      }}
    >
      <Canvas
        camera={{ position: [5, 5, 5], fov: 75 }}
        style={{ background: backgroundColor }}
        onPointerMissed={(e) => {
          const drag = isDraggingGizmoRef.current;
          const type = (e as unknown as PointerEvent).pointerType ?? 'mouse';
          addLog(`miss ${type} drag=${drag} gizmo=${showGizmo} → ${!drag && !showGizmo ? 'DESELECT' : 'blocked'}`);
          if (!drag && !showGizmo) onNodeSelect?.(null);
        }}
        onCreated={({ gl }) => setGlInstance(gl)}
      >
        <SceneContent
          sceneGraph={sceneGraph}
          version={version}
          showGrid={showGrid}
          selectedNodeId={selectedNodeId}
          transformMode={transformMode}
          cameraPreset={cameraPreset}
          onNodeSelect={onNodeSelect}
          autoFit={autoFit}
          fitSceneRef={fitSceneRef}
          showAxesGizmo={showAxesGizmo}
          activeCameraNodeId={activeCameraNodeId}
          renderMode={renderMode}
          sceneSettings={sceneSettings}
          onObjectChange={handleLiveTransform}
          onPlaneClick={onPlaneClick}
          isDraggingGizmoRef={isDraggingGizmoRef}
          addLog={addLog}
          resolveAudioSrc={resolveAudioSrc}
          gizmoSize={gizmoSize}
        />
      </Canvas>
      {selectedNode && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)',
            borderRadius: 4,
            padding: '4px 8px',
            pointerEvents: 'none',
            fontFamily: 'monospace',
            fontSize: 11,
            lineHeight: '18px',
            color: '#ccc',
            userSelect: 'none',
            zIndex: 10,
          }}
        >
          <div style={{ color: '#777', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 1 }}>Scale</div>
          <div>
            <span style={{ color: '#e05555', marginRight: 6 }}>X</span>
            <span ref={scaleXRef}>{selectedNode.scale[0].toFixed(3)}</span>
          </div>
          <div>
            <span style={{ color: '#55cc55', marginRight: 6 }}>Y</span>
            <span ref={scaleYRef}>{selectedNode.scale[1].toFixed(3)}</span>
          </div>
          <div>
            <span style={{ color: '#4488ff', marginRight: 6 }}>Z</span>
            <span ref={scaleZRef}>{selectedNode.scale[2].toFixed(3)}</span>
          </div>
        </div>
      )}
      {debugLog && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            right: 8,
            maxHeight: 220,
            background: 'rgba(0,0,0,0.82)',
            backdropFilter: 'blur(4px)',
            borderRadius: 6,
            border: '1px solid rgba(79,195,247,0.35)',
            padding: '4px 6px',
            pointerEvents: 'none',
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#4fc3f7', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2, flexShrink: 0 }}>
            DEBUG LOG — {isTouchDevice ? 'TOUCH' : 'MOUSE'} DEVICE
          </div>
          <div
            ref={debugScrollRef}
            style={{ overflowY: 'auto', fontFamily: 'monospace', fontSize: 10, lineHeight: '15px', color: '#ccc', wordBreak: 'break-all' }}
          >
            {debugLinesRef.current.map((line, i) => (
              <div key={i} style={{ color: line.includes('DESELECT') ? '#ff7070' : line.includes('blocked') ? '#7fc97f' : line.includes('↓') ? '#ffe082' : '#ccc' }}>
                {line}
              </div>
            ))}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#555', marginTop: 2, flexShrink: 0 }}>
            selected: {selectedNodeId?.slice(0,8) ?? 'none'} | gizmo: {String(showGizmo)} | drag: {String(isDraggingGizmoRef.current)}
          </div>
        </div>
      )}
    </div>
  );
}
