/**
 * Immersive WebXR VR viewer for a CAD project loaded from cad-backend.
 *
 * URL pattern: /viewer/vr/:projectName
 *
 * The page shows a regular 3D preview and an "Enter VR" button (Three.js VRButton).
 * When a VR headset is connected the button starts an immersive-vr session;
 * otherwise it shows "VR NOT SUPPORTED" or "VR NOT ALLOWED".
 *
 * Scene is scaled so its largest dimension = VR_TARGET_SIZE metres — comfortable
 * for room-scale viewing regardless of original CAD units (mm/cm/m/in).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { Box, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Project } from '@mhersztowski/core-cad';
import type { SceneGraph } from '@mhersztowski/core-scene3d';
import { readProject } from '../vfs/cadProjectApi';
import { loadProjectFromText } from '../io/CadExporter';
import { cadProjectToSceneGraph } from '../bridge/CadToScene';

// Target size for the longest scene dimension in VR (metres)
const VR_TARGET_SIZE = 3;

// ── helpers ───────────────────────────────────────────────────────────────────

/** Compute bounding box of all meshes in a Three.js scene. */
function computeSceneBoundingBox(scene: THREE.Scene): THREE.Box3 {
  const box = new THREE.Box3();
  scene.traverse(obj => {
    if (obj instanceof THREE.Mesh) {
      obj.updateWorldMatrix(true, false);
      obj.geometry.computeBoundingBox();
      if (obj.geometry.boundingBox) {
        box.union(obj.geometry.boundingBox.clone().applyMatrix4(obj.matrixWorld));
      }
    }
  });
  return box;
}

// ── geometry builder ──────────────────────────────────────────────────────────

function VrMeshGeometry({
  type,
  params,
}: {
  type: string;
  params?: Record<string, number>;
}) {
  switch (type) {
    case 'sphere':
      return <sphereGeometry args={[params?.radius ?? 1, 32, 32]} />;
    case 'cylinder':
      return (
        <cylinderGeometry
          args={[
            params?.radiusTop ?? 1,
            params?.radiusBottom ?? 1,
            params?.height ?? 2,
            32,
          ]}
        />
      );
    case 'plane':
      return <planeGeometry args={[params?.width ?? 10, params?.height ?? 10]} />;
    case 'cone':
      return <coneGeometry args={[params?.radius ?? 1, params?.height ?? 2, 32]} />;
    case 'torus':
      return <torusGeometry args={[params?.radius ?? 1, params?.tube ?? 0.4, 16, 100]} />;
    case 'box':
    default:
      return (
        <boxGeometry
          args={[params?.width ?? 1, params?.height ?? 1, params?.depth ?? 1]}
        />
      );
  }
}

// ── scene renderer from SceneGraph ────────────────────────────────────────────

function VrSceneRenderer({ sceneGraph }: { sceneGraph: SceneGraph }) {
  const objects = useMemo(() => {
    const result: React.ReactElement[] = [];

    sceneGraph.traverse(node => {
      if (node === sceneGraph.root || !node.visible) return;

      if (node.type === 'mesh') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m = node as any;
        const geo = m.geometry ?? { type: 'box', params: {} };
        const mat = m.material ?? { color: '#4fc3f7', opacity: 1, wireframe: false };

        result.push(
          <mesh
            key={node.id}
            position={node.position}
            rotation={node.rotation}
            scale={node.scale}
          >
            <VrMeshGeometry type={geo.type} params={geo.params} />
            <meshStandardMaterial
              color={mat.color}
              opacity={mat.opacity}
              transparent={mat.opacity < 1}
              wireframe={mat.wireframe}
            />
          </mesh>,
        );
      } else if (node.type === 'light') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const l = node as any;
        switch (l.lightType) {
          case 'ambient':
            result.push(<ambientLight key={node.id} color={l.color} intensity={l.intensity} />);
            break;
          case 'point':
            result.push(<pointLight key={node.id} position={node.position} color={l.color} intensity={l.intensity} />);
            break;
          default:
            result.push(<directionalLight key={node.id} position={node.position} color={l.color} intensity={l.intensity} />);
        }
      }
    });

    return result;
  }, [sceneGraph]);

  return <group>{objects}</group>;
}

// ── VRButton injected into DOM ────────────────────────────────────────────────

function VrWebXRSetup() {
  const { gl } = useThree();

  useEffect(() => {
    gl.xr.enabled = true;

    const button = VRButton.createButton(gl);
    Object.assign(button.style, {
      position: 'fixed',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '9999',
      fontSize: '14px',
    });
    document.body.appendChild(button);

    return () => button.remove();
  }, [gl]);

  return null;
}

// ── camera fit + scale normalisation ─────────────────────────────────────────

function VrCameraSetup({ sceneGraph }: { sceneGraph: SceneGraph | null }) {
  const { camera, controls, scene } = useThree();
  const fitted = useRef(false);

  useEffect(() => {
    if (!sceneGraph || fitted.current) return;

    // Wait one frame for Three.js to build geometry
    const id = requestAnimationFrame(() => {
      const box = computeSceneBoundingBox(scene);
      if (box.isEmpty()) return;

      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      // Normalise: scale the scene group so longest axis = VR_TARGET_SIZE
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = maxDim > 0.001 ? VR_TARGET_SIZE / maxDim : 1;

      // Apply scale to all top-level objects (not lights / camera itself)
      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.scale.multiplyScalar(scale);
          obj.position.multiplyScalar(scale);
        }
      });

      const scaledCenter = center.clone().multiplyScalar(scale);
      const scaledSize = size.clone().multiplyScalar(scale);
      const scaledMaxDim = Math.max(scaledSize.x, scaledSize.y, scaledSize.z);

      const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
      const dist = Math.abs(scaledMaxDim / 2 / Math.tan(fov / 2)) * 1.8;

      camera.position.set(
        scaledCenter.x,
        scaledCenter.y + scaledMaxDim * 0.3,
        scaledCenter.z + dist,
      );
      camera.near = dist * 0.01;
      camera.far = dist * 100;
      camera.updateProjectionMatrix();

      if (controls && 'target' in controls) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const oc = controls as any;
        oc.target.copy(scaledCenter);
        oc.update();
      }

      fitted.current = true;
    });

    return () => cancelAnimationFrame(id);
  }, [sceneGraph, camera, controls, scene]);

  return null;
}

// ── main canvas ───────────────────────────────────────────────────────────────

function VrCanvas({ sceneGraph }: { sceneGraph: SceneGraph }) {
  return (
    <Canvas
      camera={{ position: [0, 1.6, 5], fov: 75, near: 0.01, far: 500 }}
      style={{ background: '#1a1a1a', width: '100%', height: '100%' }}
      onCreated={({ gl }) => { gl.xr.enabled = true; }}
    >
      <OrbitControls makeDefault />
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />
      <gridHelper args={[20, 20, '#333333', '#282828']} />
      <VrSceneRenderer sceneGraph={sceneGraph} />
      <VrWebXRSetup />
      <VrCameraSetup sceneGraph={sceneGraph} />
    </Canvas>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

interface Props {
  projectName: string;
}

export function VrViewerPage({ projectName }: Props) {
  const [sceneGraph, setSceneGraph] = useState<SceneGraph | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const jsonText = await readProject(projectName);
        if (cancelled) return;
        const proj = new Project();
        loadProjectFromText(jsonText, proj);
        const graph = cadProjectToSceneGraph(proj);
        if (!cancelled) setSceneGraph(graph);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }

    load();
    return () => { cancelled = true; };
  }, [projectName]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: '#1a1a1a', color: '#fff' }}>
      {/* Minimal top bar */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1, px: 1.5,
        height: 36, bgcolor: '#252526', borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <Typography variant="caption" sx={{ fontSize: 12, color: 'text.secondary' }}>
          VR viewer
        </Typography>
        <Typography variant="caption" sx={{ fontSize: 12, fontWeight: 600, color: '#ce93d8' }}>
          {projectName}
        </Typography>
        <Typography variant="caption" sx={{ fontSize: 11, color: 'text.disabled', ml: 1 }}>
          — click "ENTER VR" to start immersive session
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Open Scene Viewer (non-VR)">
          <IconButton
            size="small"
            onClick={() => { window.open(`/viewer/scene/${encodeURIComponent(projectName)}`, '_blank'); }}
          >
            <OpenInNewIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Open in editor">
          <IconButton size="small" onClick={() => { window.location.href = '/'; }}>
            <OpenInNewIcon sx={{ fontSize: 16, opacity: 0.5 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Viewer area */}
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {!sceneGraph && !error && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2 }}>
            <CircularProgress size={32} sx={{ color: '#ce93d8' }} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Loading "{projectName}"…
            </Typography>
          </Box>
        )}

        {error && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Typography sx={{ color: 'error.main', fontSize: 14 }}>
              Failed to load project: {error}
            </Typography>
          </Box>
        )}

        {sceneGraph && <VrCanvas sceneGraph={sceneGraph} />}
      </Box>
    </Box>
  );
}
