import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import type { EditableMesh, SelectMode } from '../edit-mode/types';
import { cloneEditableMesh, editableToBufferData } from '../edit-mode/meshConverter';

// ─── Colour constants ─────────────────────────────────────────────

const C_VERT_DEFAULT = new THREE.Color('#cccccc');
const C_VERT_SELECTED = new THREE.Color('#ff8c00');
const C_EDGE_DEFAULT = new THREE.Color('#555566');
const C_EDGE_SELECTED = new THREE.Color('#ff8c00');
const C_FACE_DEFAULT = new THREE.Color('#3a3a5a');
const C_FACE_SELECTED = new THREE.Color('#6b3a00');

// ─── Internal scene (R3F) ─────────────────────────────────────────

interface SceneProps {
  mesh: EditableMesh;
  selectMode: SelectMode;
  orbitEnabled: boolean;
  onMeshChange: (m: EditableMesh) => void;
  onGrabActive: (v: boolean) => void;
}

function EditScene({ mesh, selectMode, orbitEnabled, onMeshChange, onGrabActive }: SceneProps) {
  const { camera, size, gl } = useThree();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orbitRef = useRef<any>(null);

  // ── Sync current props/state to stable refs ───────────────────
  const stateRef = useRef({ mesh, selectMode, camera, size, onMeshChange, onGrabActive, gl });
  stateRef.current = { mesh, selectMode, camera, size, onMeshChange, onGrabActive, gl };

  // ── Grab state (ref, never triggers re-render) ────────────────
  const grabRef = useRef({
    active: false,
    axis: 'free' as 'free' | 'x' | 'y' | 'z',
    startPos: new Map<number, THREE.Vector3>(),
    grabbed: false,
    startWorld: new THREE.Vector3(),
  });

  // ── Geometry buffers (recomputed only on mesh change) ─────────

  const { vertGeo, edgeGeo, faceGeo } = useMemo(() => {
    // Vertices
    const vCount = mesh.vertices.length;
    const vPos = new Float32Array(vCount * 3);
    const vCol = new Float32Array(vCount * 3);
    mesh.vertices.forEach((v, i) => {
      vPos[i * 3] = v.pos.x; vPos[i * 3 + 1] = v.pos.y; vPos[i * 3 + 2] = v.pos.z;
      const c = v.selected ? C_VERT_SELECTED : C_VERT_DEFAULT;
      vCol[i * 3] = c.r; vCol[i * 3 + 1] = c.g; vCol[i * 3 + 2] = c.b;
    });
    const vg = new THREE.BufferGeometry();
    vg.setAttribute('position', new THREE.Float32BufferAttribute(vPos, 3));
    vg.setAttribute('color', new THREE.Float32BufferAttribute(vCol, 3));

    // Edges
    const ePos = new Float32Array(mesh.edges.length * 6);
    const eCol = new Float32Array(mesh.edges.length * 6);
    mesh.edges.forEach((e, i) => {
      const va = mesh.vertices[e.v0], vb = mesh.vertices[e.v1];
      const base = i * 6;
      ePos[base] = va.pos.x; ePos[base + 1] = va.pos.y; ePos[base + 2] = va.pos.z;
      ePos[base + 3] = vb.pos.x; ePos[base + 4] = vb.pos.y; ePos[base + 5] = vb.pos.z;
      const c = e.selected ? C_EDGE_SELECTED : C_EDGE_DEFAULT;
      for (let k = 0; k < 2; k++) { eCol[base + k * 3] = c.r; eCol[base + k * 3 + 1] = c.g; eCol[base + k * 3 + 2] = c.b; }
    });
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.Float32BufferAttribute(ePos, 3));
    eg.setAttribute('color', new THREE.Float32BufferAttribute(eCol, 3));

    // Faces
    const fPos = new Float32Array(mesh.faces.length * 9);
    const fCol = new Float32Array(mesh.faces.length * 9);
    mesh.faces.forEach((f, i) => {
      const base = i * 9;
      for (const [j, vi] of [[0, f.v0], [1, f.v1], [2, f.v2]] as [number, number][]) {
        const v = mesh.vertices[vi];
        fPos[base + j * 3] = v.pos.x; fPos[base + j * 3 + 1] = v.pos.y; fPos[base + j * 3 + 2] = v.pos.z;
        const c = f.selected ? C_FACE_SELECTED : C_FACE_DEFAULT;
        fCol[base + j * 3] = c.r; fCol[base + j * 3 + 1] = c.g; fCol[base + j * 3 + 2] = c.b;
      }
    });
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fPos, 3));
    fg.setAttribute('color', new THREE.Float32BufferAttribute(fCol, 3));
    fg.computeVertexNormals();

    return { vertGeo: vg, edgeGeo: eg, faceGeo: fg };
  }, [mesh]);

  // faceGeo in a ref so the stable event handler can do face-picking
  const faceGeoRef = useRef<THREE.BufferGeometry>(faceGeo);
  faceGeoRef.current = faceGeo;

  // ── Orbit enable/disable ──────────────────────────────────────

  useEffect(() => {
    if (orbitRef.current) orbitRef.current.enabled = orbitEnabled;
  }, [orbitEnabled]);

  // ── Single stable effect: attach ALL event listeners once ─────
  //    All handlers read from stateRef / grabRef — never stale.
  //    Mouse events go on gl.domElement (the canvas) directly.
  //    Keyboard events go on window (independent of focus).

  useEffect(() => {
    const canvas = stateRef.current.gl.domElement;

    // ─ Helpers (use stateRef for current camera/size/mesh) ──────

    const toNDC = (clientX: number, clientY: number): THREE.Vector2 => {
      const rect = canvas.getBoundingClientRect();
      return new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
    };

    const pickVertex = (ndc: THREE.Vector2): number | null => {
      const { mesh, camera, size } = stateRef.current;
      const THRESHOLD_PX = 14;
      let best: number | null = null, bestDist = Infinity;
      const proj = new THREE.Vector3();
      mesh.vertices.forEach(v => {
        proj.copy(v.pos).project(camera);
        const sx = (proj.x * 0.5 + 0.5) * size.width;
        const sy = (1 - (proj.y * 0.5 + 0.5)) * size.height;
        const mx = (ndc.x * 0.5 + 0.5) * size.width;
        const my = (1 - (ndc.y * 0.5 + 0.5)) * size.height;
        const d = Math.hypot(sx - mx, sy - my);
        if (d < THRESHOLD_PX && d < bestDist) { bestDist = d; best = v.id; }
      });
      return best;
    };

    const pickFace = (ndc: THREE.Vector2): number | null => {
      const { mesh, camera } = stateRef.current;
      const fg = faceGeoRef.current;
      if (!fg) return null;
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const positions = fg.attributes['position'] as THREE.BufferAttribute;
      const triA = new THREE.Vector3(), triB = new THREE.Vector3(), triC = new THREE.Vector3();
      const target = new THREE.Vector3();
      let best: number | null = null, bestDist = Infinity;
      for (let i = 0; i < mesh.faces.length; i++) {
        const base = i * 3;
        triA.fromBufferAttribute(positions, base);
        triB.fromBufferAttribute(positions, base + 1);
        triC.fromBufferAttribute(positions, base + 2);
        if (ray.ray.intersectTriangle(triA, triB, triC, false, target)) {
          const d = ray.ray.origin.distanceTo(target);
          if (d < bestDist) { bestDist = d; best = i; }
        }
      }
      return best;
    };

    const pickEdge = (ndc: THREE.Vector2): number | null => {
      const { mesh, camera, size } = stateRef.current;
      const THRESHOLD_PX = 10;
      let best: number | null = null, bestDist = Infinity;
      const proj = new THREE.Vector3();
      const pA = new THREE.Vector2(), pB = new THREE.Vector2();
      const mx = (ndc.x * 0.5 + 0.5) * size.width;
      const my = (1 - (ndc.y * 0.5 + 0.5)) * size.height;
      mesh.edges.forEach(e => {
        const va = mesh.vertices[e.v0], vb = mesh.vertices[e.v1];
        proj.copy(va.pos).project(camera);
        pA.set((proj.x * 0.5 + 0.5) * size.width, (1 - (proj.y * 0.5 + 0.5)) * size.height);
        proj.copy(vb.pos).project(camera);
        pB.set((proj.x * 0.5 + 0.5) * size.width, (1 - (proj.y * 0.5 + 0.5)) * size.height);
        const dx = pB.x - pA.x, dy = pB.y - pA.y;
        const lenSq = dx * dx + dy * dy;
        const t = lenSq > 0 ? Math.max(0, Math.min(1, ((mx - pA.x) * dx + (my - pA.y) * dy) / lenSq)) : 0;
        const d = Math.hypot(mx - (pA.x + t * dx), my - (pA.y + t * dy));
        if (d < THRESHOLD_PX && d < bestDist) { bestDist = d; best = e.id; }
      });
      return best;
    };

    const ndcToWorldAtCenter = (ndc: THREE.Vector2): THREE.Vector3 => {
      const { mesh, camera } = stateRef.current;
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const center = new THREE.Vector3();
      let count = 0;
      mesh.vertices.forEach(v => { if (v.selected) { center.add(v.pos); count++; } });
      if (count === 0) return new THREE.Vector3();
      center.divideScalar(count);
      return ray.ray.at(camera.position.distanceTo(center), new THREE.Vector3());
    };

    const applyGrabDelta = (delta: THREE.Vector3) => {
      const { mesh, onMeshChange } = stateRef.current;
      const grab = grabRef.current;
      const updated = cloneEditableMesh(mesh);
      updated.vertices.forEach(v => {
        if (!v.selected) return;
        const orig = grab.startPos.get(v.id);
        if (!orig) return;
        const d = delta.clone();
        if (grab.axis === 'x') { d.y = 0; d.z = 0; }
        else if (grab.axis === 'y') { d.x = 0; d.z = 0; }
        else if (grab.axis === 'z') { d.x = 0; d.y = 0; }
        v.pos.copy(orig).add(d);
      });
      onMeshChange(updated);
    };

    // ─ Pointer events (on container — bubble from canvas) ────────

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const { mesh, selectMode, onMeshChange, onGrabActive } = stateRef.current;
      const grab = grabRef.current;

      if (grab.active) {
        grab.active = false;
        grab.grabbed = false;
        onGrabActive(false);
        return;
      }

      const ndc = toNDC(e.clientX, e.clientY);
      const shift = e.shiftKey;
      const updated = cloneEditableMesh(mesh);

      if (selectMode === 'vertex') {
        const vid = pickVertex(ndc);
        if (!shift) { updated.vertices.forEach(v => { v.selected = false; }); updated.edges.forEach(ed => { ed.selected = false; }); updated.faces.forEach(f => { f.selected = false; }); }
        if (vid !== null) updated.vertices[vid].selected = !shift || !updated.vertices[vid].selected;
      } else if (selectMode === 'face') {
        const fid = pickFace(ndc);
        if (!shift) { updated.vertices.forEach(v => { v.selected = false; }); updated.faces.forEach(f => { f.selected = false; }); }
        if (fid !== null) {
          const f = updated.faces[fid];
          f.selected = !shift || !f.selected;
          [f.v0, f.v1, f.v2].forEach(vi => { updated.vertices[vi].selected = f.selected; });
        }
      } else {
        const eid = pickEdge(ndc);
        if (!shift) { updated.vertices.forEach(v => { v.selected = false; }); updated.edges.forEach(ed => { ed.selected = false; }); }
        if (eid !== null) {
          const ed = updated.edges[eid];
          ed.selected = !shift || !ed.selected;
          updated.vertices[ed.v0].selected = ed.selected;
          updated.vertices[ed.v1].selected = ed.selected;
        }
      }

      onMeshChange(updated);
    };

    const onPointerMove = (e: PointerEvent) => {
      const grab = grabRef.current;
      if (!grab.active) return;
      const ndc = toNDC(e.clientX, e.clientY);

      if (!grab.grabbed) {
        grab.startWorld.copy(ndcToWorldAtCenter(ndc));
        grab.grabbed = true;
        return;
      }

      const currentWorld = ndcToWorldAtCenter(ndc);
      applyGrabDelta(currentWorld.clone().sub(grab.startWorld));
    };

    const onContextMenu = (e: Event) => { if (grabRef.current.active) e.preventDefault(); };

    // Right-click during grab: cancel
    const onPointerUp = (e: PointerEvent) => {
      if (e.button === 2 && grabRef.current.active) {
        const { mesh, onMeshChange, onGrabActive } = stateRef.current;
        const grab = grabRef.current;
        grab.active = false;
        grab.grabbed = false;
        onGrabActive(false);
        const updated = cloneEditableMesh(mesh);
        updated.vertices.forEach(v => { const orig = grab.startPos.get(v.id); if (orig) v.pos.copy(orig); });
        onMeshChange(updated);
      }
    };

    // ─ Keyboard events (on window — fires regardless of focus) ──

    const onKeyDown = (e: KeyboardEvent) => {
      const { mesh, onMeshChange, onGrabActive } = stateRef.current;
      const grab = grabRef.current;

      // A — select all / deselect all
      if (e.key === 'a' && !grab.active) {
        e.preventDefault();
        const updated = cloneEditableMesh(mesh);
        const anySelected = mesh.vertices.some(v => v.selected);
        updated.vertices.forEach(v => { v.selected = !anySelected; });
        updated.edges.forEach(ed => { ed.selected = !anySelected; });
        updated.faces.forEach(f => { f.selected = !anySelected; });
        onMeshChange(updated);
        return;
      }

      // G — start grab
      if (e.key === 'g' && !grab.active) {
        if (!mesh.vertices.some(v => v.selected)) return;
        grab.active = true;
        grab.axis = 'free';
        grab.grabbed = false;
        grab.startWorld.set(0, 0, 0);
        grab.startPos = new Map(mesh.vertices.filter(v => v.selected).map(v => [v.id, v.pos.clone()]));
        onGrabActive(true);
        return;
      }

      // Axis constraints during grab
      if (grab.active) {
        if (e.key === 'x') { e.preventDefault(); grab.axis = grab.axis === 'x' ? 'free' : 'x'; return; }
        if (e.key === 'y') { e.preventDefault(); grab.axis = grab.axis === 'y' ? 'free' : 'y'; return; }
        if (e.key === 'z') { e.preventDefault(); grab.axis = grab.axis === 'z' ? 'free' : 'z'; return; }
      }

      // Escape — cancel grab or do nothing
      if (e.key === 'Escape' && grab.active) {
        grab.active = false;
        grab.grabbed = false;
        onGrabActive(false);
        const updated = cloneEditableMesh(mesh);
        updated.vertices.forEach(v => { const orig = grab.startPos.get(v.id); if (orig) v.pos.copy(orig); });
        onMeshChange(updated);
        return;
      }

      // Delete — remove selected vertices and their faces
      if (e.key === 'Delete' && !grab.active) {
        const toRemove = new Set(mesh.vertices.filter(v => v.selected).map(v => v.id));
        if (toRemove.size === 0) return;
        const updated = cloneEditableMesh(mesh);
        updated.faces = updated.faces.filter(f => !toRemove.has(f.v0) && !toRemove.has(f.v1) && !toRemove.has(f.v2));
        updated.vertices = updated.vertices.filter(v => !toRemove.has(v.id));
        const remap = new Map<number, number>();
        updated.vertices.forEach((v, i) => { remap.set(v.id, i); v.id = i; });
        updated.faces.forEach(f => { f.v0 = remap.get(f.v0)!; f.v1 = remap.get(f.v1)!; f.v2 = remap.get(f.v2)!; });
        const edgeMap = new Map<string, (typeof updated.edges)[0]>();
        updated.faces.forEach(f => {
          for (const [a, b] of [[f.v0, f.v1], [f.v1, f.v2], [f.v2, f.v0]] as [number, number][]) {
            const ea = Math.min(a, b), eb = Math.max(a, b);
            const ek = `${ea}-${eb}`;
            if (!edgeMap.has(ek)) edgeMap.set(ek, { id: edgeMap.size, v0: ea, v1: eb, selected: false });
          }
        });
        updated.edges = [...edgeMap.values()];
        onMeshChange(updated);
      }
    };

    // canvas: selection click + context menu cancel
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('contextmenu', onContextMenu);
    // window: grab drag (stays active even if pointer leaves canvas) + keyboard + right-click cancel
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // empty deps — all live state accessed via stateRef/grabRef/faceGeoRef

  // ── Render ────────────────────────────────────────────────────

  return (
    <>
      <OrbitControls
        ref={orbitRef}
        mouseButtons={{ LEFT: undefined as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
        enableDamping={false}
      />

      {/* Faces */}
      <mesh>
        <primitive object={faceGeo} attach="geometry" />
        <meshBasicMaterial vertexColors side={THREE.DoubleSide} transparent opacity={0.4} depthWrite={false} />
      </mesh>

      {/* Edges */}
      <lineSegments>
        <primitive object={edgeGeo} attach="geometry" />
        <lineBasicMaterial vertexColors linewidth={1.5} />
      </lineSegments>

      {/* Vertices */}
      <points>
        <primitive object={vertGeo} attach="geometry" />
        <pointsMaterial vertexColors size={8} sizeAttenuation={false} />
      </points>

      <gridHelper args={[10, 10, '#333344', '#222233']} />

      <GizmoHelper alignment="bottom-left" margin={[60, 60]}>
        <GizmoViewport axisColors={['#ef5350', '#66bb6a', '#42a5f5']} labelColor="white" />
      </GizmoHelper>
    </>
  );
}

// ─── Main dialog component ────────────────────────────────────────

export interface MeshEditModeDialogProps {
  open: boolean;
  initialMesh: EditableMesh | null;
  onApply: (bufferData: { positions: number[]; normals: number[] }) => void;
  onClose: () => void;
}

export function MeshEditModeDialog({ open, initialMesh, onApply, onClose }: MeshEditModeDialogProps) {
  const [editMesh, setEditMesh] = useState<EditableMesh | null>(null);
  const [selectMode, setSelectMode] = useState<SelectMode>('vertex');
  const [isGrabbing, setIsGrabbing] = useState(false);

  useEffect(() => {
    if (open && initialMesh) {
      setEditMesh(cloneEditableMesh(initialMesh));
      setSelectMode('vertex');
      setIsGrabbing(false);
    }
  }, [open, initialMesh]);

  const handleApply = useCallback(() => {
    if (!editMesh) return;
    onApply(editableToBufferData(editMesh));
  }, [editMesh, onApply]);

  const selCount = useMemo(() => editMesh?.vertices.filter(v => v.selected).length ?? 0, [editMesh]);
  const vertCount = editMesh?.vertices.length ?? 0;
  const faceCount = editMesh?.faces.length ?? 0;

  const grabAxisLabel = isGrabbing ? ' — G active (X/Y/Z constrain, RMB cancel, LMB confirm)' : '';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      PaperProps={{ sx: { width: '92vw', height: '85vh', maxWidth: 1400, background: '#141414', display: 'flex', flexDirection: 'column' } }}
    >
      <DialogTitle sx={{ py: 0.75, px: 1.5, borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#1a1a1a', display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <ButtonGroup size="small" sx={{ mr: 1 }}>
          {(['vertex', 'edge', 'face'] as SelectMode[]).map((mode, i) => (
            <Tooltip key={mode} title={`${mode.charAt(0).toUpperCase() + mode.slice(1)} select (${i + 1})`}>
              <Button
                onClick={() => setSelectMode(mode)}
                variant={selectMode === mode ? 'contained' : 'outlined'}
                sx={{ fontSize: '0.65rem', textTransform: 'none', minWidth: 56, px: 1,
                  background: selectMode === mode ? '#1565c0' : 'transparent',
                  borderColor: 'rgba(255,255,255,0.15)' }}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </Button>
            </Tooltip>
          ))}
        </ButtonGroup>

        <Chip label={`Vertices: ${vertCount}`} size="small" sx={{ fontSize: '0.6rem', height: 20 }} />
        <Chip label={`Faces: ${faceCount}`} size="small" sx={{ fontSize: '0.6rem', height: 20 }} />
        {selCount > 0 && <Chip label={`Selected: ${selCount}`} size="small" color="warning" sx={{ fontSize: '0.6rem', height: 20 }} />}
        {isGrabbing && <Chip label="GRAB" size="small" color="error" sx={{ fontSize: '0.6rem', height: 20 }} />}

        <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled', ml: 'auto' }}>
          LMB select · Shift+LMB add · A all/none · G grab{grabAxisLabel} · Del delete
        </Typography>
      </DialogTitle>

      <DialogContent
        sx={{ p: 0, flex: 1, minHeight: 0, overflow: 'hidden' }}
      >
        {editMesh && (
          <Canvas
            camera={{ position: [3, 3, 5], fov: 45 }}
            style={{ width: '100%', height: '100%', background: '#141414' }}
            gl={{ antialias: true }}
          >
            <ambientLight intensity={0.4} />
            <directionalLight position={[5, 10, 7]} intensity={0.8} />
            <EditScene
              mesh={editMesh}
              selectMode={selectMode}
              orbitEnabled={!isGrabbing}
              onMeshChange={setEditMesh}
              onGrabActive={setIsGrabbing}
            />
          </Canvas>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 1.5, py: 0.75, borderTop: '1px solid rgba(255,255,255,0.08)', background: '#1a1a1a', gap: 1 }}>
        <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled', mr: 'auto' }}>
          MMB / RMB drag = orbit · Scroll = zoom
        </Typography>
        <Button size="small" onClick={onClose} sx={{ fontSize: '0.72rem', textTransform: 'none' }}>Cancel</Button>
        <Button size="small" variant="contained" onClick={handleApply} sx={{ fontSize: '0.72rem', textTransform: 'none' }}>
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}
