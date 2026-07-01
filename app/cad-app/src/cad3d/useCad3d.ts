import { useState, useCallback, useRef } from 'react';
import { Project } from '@mhersztowski/core-cad';
import type { Feature, FeatureTree, SketchFeature, SketchPlane } from './types';
import { defaultDatumCs, defaultDatumLine, defaultDatumPlane, defaultDatumPoint, defaultExtrude, defaultGroove, defaultHelix, defaultHole, defaultLoft, defaultLoftCut, defaultMirror, defaultPocket, defaultRevolve, defaultShell, defaultSketch, defaultSweep, defaultSweepCut } from './types';

const STORAGE_KEY = 'cad3d-feature-tree';

function load(): FeatureTree {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as FeatureTree;
  } catch {}
  return { version: 1 as const, features: [] };
}

function save(tree: FeatureTree): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tree));
}

export interface Cad3dState {
  tree: FeatureTree;
  selectedId: string | null;
  editingSketchId: string | null;
  mergeFeatures: (json: string) => void;
  addSketch: (plane?: SketchPlane, offset?: number, planeMatrix?: number[]) => void;
  startEditSketch: (id: string) => void;
  exitSketch: () => void;
  getSketchProject: (id: string) => Project;
  addExtrude: (sketchId: string | null, entityIds: string[]) => void;
  addPocket: (sketchId: string | null, entityIds: string[]) => void;
  addHole: (sketchId: string | null) => void;
  addGroove: (sketchId: string | null, entityIds: string[]) => void;
  addMirror: () => void;
  addRevolve: (sketchId: string | null, entityIds: string[]) => void;
  addShell: () => void;
  addLoft: () => void;
  addLoftCut: () => void;
  addSweep: () => void;
  addSweepCut: () => void;
  addHelix: () => void;
  addDatumPoint: () => void;
  addDatumLine: () => void;
  addDatumPlane: () => void;
  addDatumCs: () => void;
  removeFeature: (id: string) => void;
  updateFeature: (id: string, patch: Partial<Feature>) => void;
  toggleFeature: (id: string) => void;
  moveFeature: (id: string, direction: 'up' | 'down') => void;
  selectFeature: (id: string | null) => void;
  clearTree: () => void;
}

export function useCad3d(): Cad3dState {
  const [tree, setTree] = useState<FeatureTree>(load);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingSketchId, setEditingSketchId] = useState<string | null>(null);

  // Ref to current tree so callbacks can read it without stale closures
  const treeRef = useRef<FeatureTree>(tree);
  treeRef.current = tree;

  // In-memory sketch projects (survive re-renders, lost on page reload → reloaded from projectData)
  const sketchProjectsRef = useRef<Map<string, Project>>(new Map());

  // ── Sketch project management ───────────────────────────────────────────────

  const getSketchProject = useCallback((id: string): Project => {
    if (!sketchProjectsRef.current.has(id)) {
      const sketch = treeRef.current.features.find(
        f => f.id === id && f.type === 'sketch'
      ) as SketchFeature | undefined;

      let p: Project;
      if (sketch?.projectData) {
        try {
          p = Project.fromJSON(JSON.parse(sketch.projectData));
        } catch {
          p = new Project();
        }
      } else {
        p = new Project();
      }
      sketchProjectsRef.current.set(id, p);
    }
    return sketchProjectsRef.current.get(id)!;
  }, []);

  const addSketch = useCallback((plane: SketchPlane = 'XY', offset = 0, planeMatrix?: number[]) => {
    const f = defaultSketch(plane, offset, planeMatrix);
    sketchProjectsRef.current.set(f.id, new Project());
    setTree(prev => {
      const next = { ...prev, features: [...prev.features, f] };
      save(next);
      return next;
    });
    setSelectedId(f.id);
    setEditingSketchId(f.id);
  }, []);

  const startEditSketch = useCallback((id: string) => {
    getSketchProject(id); // ensure loaded into memory
    setEditingSketchId(id);
    setSelectedId(id);
  }, [getSketchProject]);

  const exitSketch = useCallback(() => {
    const id = editingSketchId;
    if (!id) return;
    const p = sketchProjectsRef.current.get(id);
    if (p) {
      const projectData = JSON.stringify(p.toJSON());
      setTree(prev => {
        const next = {
          ...prev,
          features: prev.features.map(f =>
            f.id === id ? { ...(f as SketchFeature), projectData } as Feature : f
          ),
        };
        save(next);
        return next;
      });
    }
    setEditingSketchId(null);
  }, [editingSketchId]);

  // ── Feature operations ──────────────────────────────────────────────────────

  const addExtrude = useCallback((sketchId: string | null, entityIds: string[]) => {
    const f = defaultExtrude(sketchId, entityIds);
    setTree(prev => { const next = { ...prev, features: [...prev.features, f] }; save(next); return next; });
    setSelectedId(f.id);
  }, []);

  const addPocket = useCallback((sketchId: string | null, entityIds: string[]) => {
    const f = defaultPocket(sketchId, entityIds);
    setTree(prev => { const next = { ...prev, features: [...prev.features, f] }; save(next); return next; });
    setSelectedId(f.id);
  }, []);

  const addHole = useCallback((sketchId: string | null) => {
    const f = defaultHole(sketchId);
    setTree(prev => { const next = { ...prev, features: [...prev.features, f] }; save(next); return next; });
    setSelectedId(f.id);
  }, []);

  const addGroove = useCallback((sketchId: string | null, entityIds: string[]) => {
    const f = defaultGroove(sketchId, entityIds);
    setTree(prev => { const next = { ...prev, features: [...prev.features, f] }; save(next); return next; });
    setSelectedId(f.id);
  }, []);

  const addMirror = useCallback(() => {
    const f = defaultMirror();
    setTree(prev => { const next = { ...prev, features: [...prev.features, f] }; save(next); return next; });
    setSelectedId(f.id);
  }, []);

  const addShell = useCallback(() => {
    const f = defaultShell();
    setTree(prev => { const next = { ...prev, features: [...prev.features, f] }; save(next); return next; });
    setSelectedId(f.id);
  }, []);

  const addLoft = useCallback(() => {
    const f = defaultLoft();
    setTree(prev => { const next = { ...prev, features: [...prev.features, f] }; save(next); return next; });
    setSelectedId(f.id);
  }, []);

  const addLoftCut = useCallback(() => {
    const f = defaultLoftCut();
    setTree(prev => { const next = { ...prev, features: [...prev.features, f] }; save(next); return next; });
    setSelectedId(f.id);
  }, []);

  const addSweep = useCallback(() => {
    const f = defaultSweep();
    setTree(prev => { const next = { ...prev, features: [...prev.features, f] }; save(next); return next; });
    setSelectedId(f.id);
  }, []);

  const addSweepCut = useCallback(() => {
    const f = defaultSweepCut();
    setTree(prev => { const next = { ...prev, features: [...prev.features, f] }; save(next); return next; });
    setSelectedId(f.id);
  }, []);

  const addHelix = useCallback(() => {
    const f = defaultHelix();
    setTree(prev => { const next = { ...prev, features: [...prev.features, f] }; save(next); return next; });
    setSelectedId(f.id);
  }, []);

  const addRevolve = useCallback((sketchId: string | null, entityIds: string[]) => {
    const f = defaultRevolve(sketchId, entityIds);
    setTree(prev => { const next = { ...prev, features: [...prev.features, f] }; save(next); return next; });
    setSelectedId(f.id);
  }, []);

  const addDatum = useCallback((f: Feature) => {
    setTree(prev => { const next = { ...prev, features: [...prev.features, f] }; save(next); return next; });
    setSelectedId(f.id);
  }, []);
  const addDatumPoint = useCallback(() => addDatum(defaultDatumPoint()), [addDatum]);
  const addDatumLine = useCallback(() => addDatum(defaultDatumLine()), [addDatum]);
  const addDatumPlane = useCallback(() => addDatum(defaultDatumPlane()), [addDatum]);
  const addDatumCs = useCallback(() => addDatum(defaultDatumCs()), [addDatum]);

  const removeFeature = useCallback((id: string) => {
    sketchProjectsRef.current.delete(id);
    setTree(prev => { const next = { ...prev, features: prev.features.filter(f => f.id !== id) }; save(next); return next; });
    setSelectedId(prev => (prev === id ? null : prev));
    setEditingSketchId(prev => (prev === id ? null : prev));
  }, []);

  const updateFeature = useCallback((id: string, patch: Partial<Feature>) => {
    setTree(prev => {
      const next = { ...prev, features: prev.features.map(f => (f.id === id ? { ...f, ...patch } as Feature : f)) };
      save(next);
      return next;
    });
  }, []);

  const toggleFeature = useCallback((id: string) => {
    setTree(prev => {
      const next = { ...prev, features: prev.features.map(f => (f.id === id ? { ...f, enabled: !f.enabled } : f)) };
      save(next);
      return next;
    });
  }, []);

  const moveFeature = useCallback((id: string, direction: 'up' | 'down') => {
    setTree(prev => {
      const idx = prev.features.findIndex(f => f.id === id);
      if (idx === -1) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.features.length) return prev;
      const arr = [...prev.features];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      const next = { ...prev, features: arr };
      save(next);
      return next;
    });
  }, []);

  const selectFeature = useCallback((id: string | null) => { setSelectedId(id); }, []);

  const mergeFeatures = useCallback((json: string) => {
    try {
      const data = JSON.parse(json) as FeatureTree;
      const idMap = new Map<string, string>();
      for (const f of data.features) {
        idMap.set(f.id, crypto.randomUUID());
      }
      const remapped = data.features.map(f => {
        const base = { ...f, id: idMap.get(f.id)! } as Feature & { sketchId?: string | null };
        if (base.sketchId) base.sketchId = idMap.get(base.sketchId) ?? base.sketchId;
        return base as Feature;
      });
      setTree(prev => {
        const next = { ...prev, features: [...prev.features, ...remapped] };
        save(next);
        return next;
      });
    } catch (e) {
      console.error('[useCad3d] mergeFeatures failed', e);
    }
  }, []);

  const clearTree = useCallback(() => {
    sketchProjectsRef.current.clear();
    const next: FeatureTree = { version: 1 as const, features: [] };
    setTree(next);
    save(next);
    setSelectedId(null);
    setEditingSketchId(null);
  }, []);

  return {
    tree, selectedId, editingSketchId,
    mergeFeatures,
    addSketch, startEditSketch, exitSketch, getSketchProject,
    addExtrude, addPocket, addHole, addGroove, addMirror, addRevolve, addShell, addLoft, addLoftCut, addSweep, addSweepCut, addHelix,
    addDatumPoint, addDatumLine, addDatumPlane, addDatumCs,
    removeFeature, updateFeature, toggleFeature, moveFeature,
    selectFeature, clearTree,
  };
}
