import { useRef, useMemo, useEffect, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import type { SceneGraph } from '../scene/SceneGraph';
import type { SceneNode } from '../scene/SceneNode';
import type { MeshNode, BufferGeometryData } from '../nodes/MeshNode';
import type { LightNode } from '../nodes/LightNode';
import type { CSSProperties, ReactElement, RefObject } from 'react';
import type { CameraPresetName } from '@mhersztowski/ui-core';
import { CAMERA_PRESETS } from './cameraPresets';

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
}

function SelectableMesh({
  node,
  meshNode,
  isSelected,
  onSelect,
}: {
  node: SceneNode;
  meshNode: MeshNode;
  isSelected: boolean;
  onSelect?: (nodeId: string) => void;
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
      <meshStandardMaterial
        color={meshNode.material.color}
        opacity={meshNode.material.opacity}
        transparent={meshNode.material.opacity < 1}
        wireframe={meshNode.material.wireframe}
        emissive={isSelected ? '#4fc3f7' : '#000000'}
        emissiveIntensity={isSelected ? 0.15 : 0}
      />
    </mesh>
  );
}

function GizmoControls({
  sceneGraph,
  selectedNodeId,
  transformMode,
}: {
  sceneGraph: SceneGraph;
  selectedNodeId: string;
  transformMode: 'translate' | 'rotate' | 'scale';
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
      node.setPosition(targetObject.position.toArray() as [number, number, number]);
    } else if (transformMode === 'rotate') {
      node.setRotation([targetObject.rotation.x, targetObject.rotation.y, targetObject.rotation.z]);
    } else if (transformMode === 'scale') {
      node.setScale(targetObject.scale.toArray() as [number, number, number]);
    }
  }, [targetObject, sceneGraph, selectedNodeId, transformMode]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const callback = () => handleDragEnd();
    controls.addEventListener('mouseUp', callback);
    return () => controls.removeEventListener('mouseUp', callback);
  }, [handleDragEnd]);

  if (!targetObject) return null;

  return (
    <TransformControls
      ref={controlsRef}
      object={targetObject}
      mode={transformMode}
      size={0.7}
    />
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

function SceneRenderer({
  sceneGraph,
  version,
  selectedNodeId,
  onNodeSelect,
}: {
  sceneGraph?: SceneGraph;
  version?: number;
  selectedNodeId?: string | null;
  onNodeSelect?: (nodeId: string) => void;
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
      }
    });

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneGraph, version, selectedNodeId, onNodeSelect]);

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
      return <sphereGeometry args={[params?.['radius'] ?? 1, 32, 32]} />;
    case 'cylinder':
      return (
        <cylinderGeometry
          args={[
            params?.['radiusTop'] ?? 1,
            params?.['radiusBottom'] ?? 1,
            params?.['height'] ?? 2,
            32,
          ]}
        />
      );
    case 'plane':
      return (
        <planeGeometry args={[params?.['width'] ?? 10, params?.['height'] ?? 10]} />
      );
    case 'cone':
      return (
        <coneGeometry args={[params?.['radius'] ?? 1, params?.['height'] ?? 2, 32]} />
      );
    case 'torus':
      return (
        <torusGeometry
          args={[params?.['radius'] ?? 1, params?.['tube'] ?? 0.4, 16, 100]}
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
          ]}
        />
      );
  }
}

function SceneContent({
  sceneGraph,
  version,
  showGrid,
  selectedNodeId,
  transformMode,
  cameraPreset = 'standard',
  onNodeSelect,
}: {
  sceneGraph?: SceneGraph;
  version?: number;
  showGrid: boolean;
  selectedNodeId?: string | null;
  transformMode: 'translate' | 'rotate' | 'scale';
  cameraPreset?: CameraPresetName;
  onNodeSelect?: (nodeId: string | null) => void;
}) {
  const selectedNode = selectedNodeId && sceneGraph ? sceneGraph.findNode(selectedNodeId) : null;
  const showGizmo = selectedNode?.type === 'mesh';
  const presetConfig = CAMERA_PRESETS[cameraPreset];

  return (
    <>
      <OrbitControls makeDefault mouseButtons={presetConfig.mouseButtons as Partial<{ LEFT: THREE.MOUSE; MIDDLE: THREE.MOUSE; RIGHT: THREE.MOUSE }>} />
      <ambientLight intensity={0.3} />
      <directionalLight position={[10, 10, 5]} intensity={0.7} />
      {showGrid && <gridHelper args={[20, 20, '#444444', '#333333']} />}
      <SceneRenderer
        sceneGraph={sceneGraph}
        version={version}
        selectedNodeId={selectedNodeId}
        onNodeSelect={onNodeSelect}
      />
      {showGizmo && sceneGraph && selectedNodeId && (
        <GizmoControls
          sceneGraph={sceneGraph}
          selectedNodeId={selectedNodeId}
          transformMode={transformMode}
        />
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
}: SimpleViewerProps) {
  return (
    <div
      className={className}
      style={{
        width,
        height,
        overflow: 'hidden',
        ...style,
      }}
    >
      <Canvas
        camera={{ position: [5, 5, 5], fov: 75 }}
        style={{ background: backgroundColor }}
        onPointerMissed={() => onNodeSelect?.(null)}
      >
        <SceneContent
          sceneGraph={sceneGraph}
          version={version}
          showGrid={showGrid}
          selectedNodeId={selectedNodeId}
          transformMode={transformMode}
          cameraPreset={cameraPreset}
          onNodeSelect={onNodeSelect}
        />
      </Canvas>
    </div>
  );
}
