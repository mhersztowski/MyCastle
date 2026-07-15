import { useState, useEffect, useRef } from 'react';
import {
  Box, Button, Typography, Divider, TextField, MenuItem, Switch, FormControlLabel, Radio, RadioGroup, Checkbox,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import type { Feature, ChamferFeature, ChamferType, ExtrudeFeature, ExtrudeType, ExtrudeDirection, FilletFeature, GrooveFeature, HelixFeature, HelixMode, HelixAxis, HoleFeature, HoleDepthType, HoleDrillPoint, HoleCounterType, LinearPatternFeature, LoftCutFeature, LoftFeature, LoftSection, MirrorFeature, MirrorMode, PatternMode, PatternDirection, PocketFeature, PolarPatternFeature, RevolveFeature, RevolveType, RevolveAxis, RevolveTypeExt, RevolveAxisExt, ShellFeature, ShellMode, ShellJoinType, SketchFeature, SweepCutFeature, SweepFeature, SweepCornerStyle, SweepOrientationMode, SweepTransformMode, DatumPointFeature, DatumLineFeature, DatumPlaneFeature, DatumCsFeature, Vec3 } from '../../cad3d/types';

interface Props {
  feature: Feature | null;
  features: Feature[];
  onUpdate: (id: string, patch: Partial<Feature>) => void;
  onEditSketch?: (id: string) => void;
  /** Tworzy nowy DatumPlaneFeature w drzewie i zwraca jego ID. */
  onCreateDatumPlane?: (position?: Vec3, normal?: Vec3, size?: number) => string;
  /** Parametry ostatnio zaznaczonej face bryły. */
  faceDatumParams?: { position: Vec3; normal: Vec3; size: number } | null;
  /** Parametry ostatnio zaznaczonej krawędzi — Fillet/Chamfer używa do zbierania edges. */
  edgeParams?: { midpoint: Vec3; tangent: Vec3 } | null;
}

function NumField({ label, value, onChange, min, max, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
}) {
  // LOKALNY string state — pozwala edytować pole bez clampowania w trakcie.
  // Bez tego parent clampuje `Math.max(1, v)` przy każdym keystroke, przez co
  // usunięcie ostatniej cyfry (np. "10" → "1" → "") blokuje się na 1.
  // Sync z prop tylko gdy value zewnętrzne się zmieni (feature re-select, undo).
  const [local, setLocal] = useState<string>(String(value));
  const lastSyncedValue = useRef<number>(value);
  useEffect(() => {
    // Sync zewnętrznego value tylko jeśli faktycznie się zmienił (nie z powodu onChange z tego pola)
    if (value !== lastSyncedValue.current) {
      setLocal(String(value));
      lastSyncedValue.current = value;
    }
  }, [value]);

  const commit = () => {
    const v = parseFloat(local);
    if (isNaN(v)) {
      // Empty / invalid → przywróć poprzednią wartość
      setLocal(String(value));
      return;
    }
    lastSyncedValue.current = v;
    onChange(v);
    setLocal(String(v));
  };

  return (
    <TextField
      label={label} type="number" size="small" fullWidth value={local}
      inputProps={{ min, max, step }}
      onChange={e => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur(); } }}
      sx={{ mb: 1.5 }}
    />
  );
}

function Vec3Field({ label, value, onChange }: { label: string; value: Vec3; onChange: (v: Vec3) => void }) {
  // Local per-axis string state (żeby edycja jednej osi nie clampowała innych).
  const [local, setLocal] = useState<[string, string, string]>([String(value[0]), String(value[1]), String(value[2])]);
  const lastValueRef = useRef<Vec3>(value);
  useEffect(() => {
    if (value.some((v, i) => v !== lastValueRef.current[i])) {
      setLocal([String(value[0]), String(value[1]), String(value[2])]);
      lastValueRef.current = value;
    }
  }, [value]);

  const commit = (i: number) => {
    const n = parseFloat(local[i]);
    if (isNaN(n)) {
      const next = [...local] as [string, string, string]; next[i] = String(value[i]); setLocal(next);
      return;
    }
    const nextVec: Vec3 = [...value]; nextVec[i] = n;
    lastValueRef.current = nextVec;
    onChange(nextVec);
  };
  const setAxis = (i: number, raw: string) => {
    const next = [...local] as [string, string, string]; next[i] = raw; setLocal(next);
  };
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>{label}</Typography>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        {(['X', 'Y', 'Z'] as const).map((ax, i) => (
          <TextField key={ax} label={ax} type="number" size="small" value={local[i]}
            inputProps={{ step: 1 }}
            onChange={e => setAxis(i, e.target.value)}
            onBlur={() => commit(i)}
            onKeyDown={e => { if (e.key === 'Enter') { commit(i); (e.target as HTMLInputElement).blur(); } }}
            sx={{ flex: 1 }} />
        ))}
      </Box>
    </Box>
  );
}

function DatumPointProps({ f, onUpdate }: { f: DatumPointFeature; onUpdate: (p: Partial<Feature>) => void }) {
  return <Vec3Field label="Pozycja" value={f.position} onChange={v => onUpdate({ position: v })} />;
}
function DatumLineProps({ f, onUpdate }: { f: DatumLineFeature; onUpdate: (p: Partial<Feature>) => void }) {
  return (
    <>
      <Vec3Field label="Punkt początkowy" value={f.position} onChange={v => onUpdate({ position: v })} />
      <Vec3Field label="Kierunek" value={f.direction} onChange={v => onUpdate({ direction: v })} />
      <NumField label="Długość" value={f.length} onChange={v => onUpdate({ length: Math.max(0.1, v) })} min={0.1} step={5} />
    </>
  );
}
function DatumPlaneProps({ f, onUpdate }: { f: DatumPlaneFeature; onUpdate: (p: Partial<Feature>) => void }) {
  const setNormal = (n: Vec3) => onUpdate({ normal: n });
  return (
    <>
      <Vec3Field label="Pozycja" value={f.position} onChange={v => onUpdate({ position: v })} />
      <TextField label="Orientacja" select size="small" fullWidth value={presetOf(f.normal)}
        onChange={e => { const p = e.target.value; if (p === 'XY') setNormal([0, 0, 1]); else if (p === 'XZ') setNormal([0, 1, 0]); else if (p === 'YZ') setNormal([1, 0, 0]); }}
        sx={{ mb: 1.5 }}>
        <MenuItem value="XY">XY (normalna Z)</MenuItem>
        <MenuItem value="XZ">XZ (normalna Y)</MenuItem>
        <MenuItem value="YZ">YZ (normalna X)</MenuItem>
        <MenuItem value="custom">Własna…</MenuItem>
      </TextField>
      <Vec3Field label="Normalna" value={f.normal} onChange={setNormal} />
      <NumField label="Rozmiar" value={f.size} onChange={v => onUpdate({ size: Math.max(1, v) })} min={1} step={5} />
    </>
  );
}
function presetOf(n: Vec3): string {
  if (n[0] === 0 && n[1] === 0 && n[2] !== 0) return 'XY';
  if (n[0] === 0 && n[2] === 0 && n[1] !== 0) return 'XZ';
  if (n[1] === 0 && n[2] === 0 && n[0] !== 0) return 'YZ';
  return 'custom';
}
function DatumCsProps({ f, onUpdate }: { f: DatumCsFeature; onUpdate: (p: Partial<Feature>) => void }) {
  return (
    <>
      <Vec3Field label="Pozycja" value={f.position} onChange={v => onUpdate({ position: v })} />
      <Vec3Field label="Obrót (°)" value={f.rotation} onChange={v => onUpdate({ rotation: v })} />
      <NumField label="Długość osi" value={f.size} onChange={v => onUpdate({ size: Math.max(1, v) })} min={1} step={5} />
    </>
  );
}

function SketchProps({ f, onUpdate, onEditSketch }: { f: SketchFeature; onUpdate: (p: Partial<Feature>) => void; onEditSketch?: (id: string) => void }) {
  return (
    <>
      {f.plane === 'face' ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5, fontStyle: 'italic' }}>
          Face plane (arbitrary orientation)
        </Typography>
      ) : (
        <>
          <TextField label="Plane" select size="small" fullWidth value={f.plane}
            onChange={e => onUpdate({ plane: e.target.value as SketchFeature['plane'] })} sx={{ mb: 1.5 }}>
            <MenuItem value="XY">XY — front</MenuItem>
            <MenuItem value="XZ">XZ — top</MenuItem>
            <MenuItem value="YZ">YZ — right</MenuItem>
          </TextField>
          <NumField label="Offset" value={f.offset} onChange={v => onUpdate({ offset: v })} />
        </>
      )}
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1.5 }}>
        {f.projectData ? `${JSON.parse(f.projectData).entities?.length ?? 0} entities` : 'Empty sketch'}
      </Typography>
      {onEditSketch && (
        <Button fullWidth size="small" variant="outlined" startIcon={<EditIcon />} onClick={() => onEditSketch(f.id)}>
          Edit Sketch
        </Button>
      )}
    </>
  );
}

function ExtrudeProps({ f, features, onUpdate }: { f: ExtrudeFeature; features: Feature[]; onUpdate: (p: Partial<Feature>) => void }) {
  const extrudeType = f.extrudeType ?? 'dimension';
  const reversed    = f.reversed ?? false;
  const direction   = f.direction ?? 'normal';
  const taper       = f.taper ?? 0;
  const sketches = features.filter(feat => feat.type === 'sketch') as SketchFeature[];
  return (
    <>
      {/* Sketch source — extrude/pocket używa profilu 2D z sketch */}
      <SketchSelect label="Sketch (profile)" value={f.sketchId} sketches={sketches}
        onChange={id => onUpdate({ sketchId: id })} />
      {!f.sketchId && (
        <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 1 }}>
          Wybierz sketch żeby operacja zadziałała.
        </Typography>
      )}

      <TextField label="Type" select size="small" fullWidth value={extrudeType}
        onChange={e => onUpdate({ extrudeType: e.target.value as ExtrudeType })} sx={{ mb: 1.5 }}>
        <MenuItem value="dimension">Dimension</MenuItem>
        <MenuItem value="symmetric">Symmetric</MenuItem>
        <MenuItem value="through_all">Through All</MenuItem>
      </TextField>

      {extrudeType !== 'through_all' && (
        <NumField label="Length" value={f.height} onChange={v => onUpdate({ height: v })} min={0.1} step={1} />
      )}

      {extrudeType === 'dimension' && (
        <FormControlLabel
          control={<Switch size="small" checked={f.symmetric} onChange={e => onUpdate({ symmetric: e.target.checked })} />}
          label="Symmetric to plane" sx={{ mb: 0.5 }}
        />
      )}

      <FormControlLabel
        control={<Switch size="small" checked={reversed} onChange={e => onUpdate({ reversed: e.target.checked })} />}
        label="Reversed" sx={{ mb: 1 }}
      />

      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.75 }}>
        Direction
      </Typography>

      <TextField label="Direction / Edge" select size="small" fullWidth value={direction}
        onChange={e => onUpdate({ direction: e.target.value as ExtrudeDirection })} sx={{ mb: 1.5 }}>
        <MenuItem value="normal">Sketch normal vector</MenuItem>
        <MenuItem value="X">X axis</MenuItem>
        <MenuItem value="Y">Y axis</MenuItem>
        <MenuItem value="Z">Z axis</MenuItem>
      </TextField>

      <NumField label="Taper angle (°)" value={taper}
        onChange={v => onUpdate({ taper: Math.max(-89, Math.min(89, v)) })}
        min={-89} max={89} step={0.5} />

      <Typography variant="caption" color="text.disabled">
        {f.sketchId ? 'From sketch' : f.entityIds.length === 0 ? 'All CAD 2D entities (dynamic)' : `${f.entityIds.length} pinned entities`}
      </Typography>
    </>
  );
}

function PocketProps({ f, features, onUpdate }: { f: PocketFeature; features: Feature[]; onUpdate: (p: Partial<Feature>) => void }) {
  return <ExtrudeProps f={f as unknown as ExtrudeFeature} features={features} onUpdate={onUpdate} />;
}

function MirrorProps({ f, features, onUpdate, onCreateDatumPlane, faceDatumParams }: {
  f: MirrorFeature; features: Feature[]; onUpdate: (p: Partial<Feature>) => void;
  onCreateDatumPlane?: (position?: Vec3, normal?: Vec3, size?: number) => string;
  faceDatumParams?: { position: Vec3; normal: Vec3; size: number } | null;
}) {
  const mode = f.mode ?? 'content';
  const featureIds = f.featureIds ?? [];
  const autoRefresh = f.autoRefresh ?? true;

  // Kandydaci do mirror: additive features (extrude, revolve, loft, sweep, helix) i modifiers
  const candidates = features.filter(x =>
    x.id !== f.id
    && (x.type === 'extrude' || x.type === 'revolve' || x.type === 'loft' || x.type === 'sweep' || x.type === 'helix'
        || x.type === 'pocket' || x.type === 'hole' || x.type === 'groove')
  );
  const datumPlanes = features.filter(x => x.type === 'datum_plane');

  // Wybór dla dropdown płaszczyzny: dla datum_plane używamy ID (żeby unikalne), dla presetu XY/XZ/YZ używamy tego stringa
  const currentPlaneKey = (f.planeMode === 'datum_plane' && f.datumPlaneId)
    ? `datum:${f.datumPlaneId}`
    : (f.planeMode ?? f.plane);

  const setPlaneKey = (key: string) => {
    if (key.startsWith('datum:')) {
      const id = key.slice('datum:'.length);
      onUpdate({ planeMode: 'datum_plane', datumPlaneId: id });
    } else {
      const preset = key as MirrorFeature['plane'];
      onUpdate({ planeMode: preset, plane: preset, datumPlaneId: undefined });
    }
  };

  const addFeature = (id: string) => {
    if (!id || featureIds.includes(id)) return;
    onUpdate({ featureIds: [...featureIds, id] });
  };
  const removeFeature = (id: string) => {
    onUpdate({ featureIds: featureIds.filter(x => x !== id) });
  };

  const handleCreateEmpty = () => {
    if (!onCreateDatumPlane) return;
    const id = onCreateDatumPlane();
    onUpdate({ planeMode: 'datum_plane', datumPlaneId: id });
  };

  const handleCreateFromFace = () => {
    if (!onCreateDatumPlane || !faceDatumParams) return;
    const id = onCreateDatumPlane(faceDatumParams.position, faceDatumParams.normal, faceDatumParams.size);
    onUpdate({ planeMode: 'datum_plane', datumPlaneId: id });
  };

  return (
    <>
      {/* Tryb: content vs tool shapes */}
      <RadioGroup value={mode} onChange={e => onUpdate({ mode: e.target.value as MirrorMode })}
        sx={{ mb: 1 }}>
        <FormControlLabel value="content" control={<Radio size="small" />}
          label={<Typography variant="body2">Przekształć zawartość</Typography>} />
        <FormControlLabel value="tool_shapes" control={<Radio size="small" />}
          label={<Typography variant="body2">Przekształć kształty narzędzi</Typography>} />
      </RadioGroup>

      {/* Lista cech (tylko dla tool_shapes) */}
      {mode === 'tool_shapes' && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Cechy do odbicia
          </Typography>
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, maxHeight: 140, overflowY: 'auto', mb: 1 }}>
            {featureIds.length === 0 ? (
              <Typography variant="caption" color="text.disabled" sx={{ p: 1, display: 'block' }}>
                Brak wybranych cech
              </Typography>
            ) : featureIds.map(id => {
              const c = features.find(x => x.id === id);
              return (
                <Box key={id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1, py: 0.25 }}>
                  <Typography variant="caption">{c?.name ?? id}</Typography>
                  <Button size="small" sx={{ minWidth: 24, p: 0 }} onClick={() => removeFeature(id)}>×</Button>
                </Box>
              );
            })}
          </Box>
          <TextField label="Dodaj cechę" select size="small" fullWidth value="" sx={{ mb: 1.5 }}
            onChange={e => addFeature(e.target.value)}>
            <MenuItem value="" disabled><em>Wybierz cechę…</em></MenuItem>
            {candidates.filter(c => !featureIds.includes(c.id)).map(c => (
              <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
            ))}
          </TextField>
        </>
      )}

      {/* Płaszczyzna — dropdown z presetami + wszystkimi datum_plane z tree */}
      <TextField label="Płaszczyzna" select size="small" fullWidth
        value={currentPlaneKey}
        onChange={e => setPlaneKey(e.target.value)}
        sx={{ mb: 1 }}>
        <MenuItem value="YZ">YZ (world)</MenuItem>
        <MenuItem value="XZ">XZ (world)</MenuItem>
        <MenuItem value="XY">XY (world)</MenuItem>
        {datumPlanes.length > 0 && [
          <MenuItem key="__hdr" value="__hdr" disabled sx={{ opacity: 0.5, fontSize: 11 }}>
            — Płaszczyzny odniesienia w scenie —
          </MenuItem>,
          ...datumPlanes.map(dp => (
            <MenuItem key={dp.id} value={`datum:${dp.id}`}>{dp.name}</MenuItem>
          )),
        ]}
      </TextField>

      {/* Akcje tworzenia nowej płaszczyzny odniesienia */}
      {onCreateDatumPlane && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 1.5 }}>
          <Button size="small" variant="outlined" onClick={handleCreateEmpty}>
            + Nowa płaszczyzna odniesienia
          </Button>
          {faceDatumParams && (
            <Button size="small" variant="outlined" color="success" onClick={handleCreateFromFace}>
              + Płaszczyzna z zaznaczonej face
            </Button>
          )}
        </Box>
      )}

      {/* Auto-refresh */}
      <FormControlLabel
        control={<Checkbox size="small" checked={autoRefresh}
          onChange={e => onUpdate({ autoRefresh: e.target.checked })} />}
        label={<Typography variant="body2">Przelicz po zmianie</Typography>}
      />
    </>
  );
}

function ShellProps({ f, onUpdate, faceDatumParams }: {
  f: ShellFeature; onUpdate: (p: Partial<Feature>) => void;
  faceDatumParams?: { position: Vec3; normal: Vec3; size: number } | null;
}) {
  const facesToRemove = f.facesToRemove ?? [];
  const mode = f.mode ?? 'skin';
  const joinType = f.joinType ?? 'arc';
  const intersection = f.intersection ?? false;
  const inwards = f.inwards ?? true;
  const autoRefresh = f.autoRefresh ?? true;

  const addFaceFromSelection = () => {
    if (!faceDatumParams) return;
    onUpdate({
      facesToRemove: [
        ...facesToRemove,
        { hintNormal: faceDatumParams.normal, hintPoint: faceDatumParams.position },
      ],
    });
  };
  const removeFace = (idx: number) => {
    onUpdate({ facesToRemove: facesToRemove.filter((_, i) => i !== idx) });
  };

  return (
    <>
      {/* Lista faces do usunięcia (Face select) */}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
        Faces do usunięcia (otwarte ściany)
      </Typography>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, maxHeight: 120, overflowY: 'auto', mb: 1, p: 0.5 }}>
        {facesToRemove.length === 0 ? (
          <Typography variant="caption" color="text.disabled" sx={{ p: 0.5, display: 'block' }}>
            Brak — zamknięta jama wewnątrz bryły
          </Typography>
        ) : facesToRemove.map((fr, idx) => (
          <Box key={idx} sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            px: 0.75, py: 0.25, mb: 0.25, bgcolor: 'action.hover', borderRadius: 0.5,
          }}>
            <Typography variant="caption" sx={{ flex: 1, mr: 1, color: 'text.primary' }}>
              Face @ ({fr.hintPoint[0].toFixed(0)}, {fr.hintPoint[1].toFixed(0)}, {fr.hintPoint[2].toFixed(0)})
            </Typography>
            <Button size="small" variant="text" color="error"
              sx={{ minWidth: 20, px: 0.5, py: 0, fontSize: 14, lineHeight: 1 }}
              onClick={() => removeFace(idx)}>×</Button>
          </Box>
        ))}
      </Box>
      <Button size="small" variant="outlined" fullWidth
        disabled={!faceDatumParams}
        onClick={addFaceFromSelection}
        sx={{ mb: 1.5 }}>
        {faceDatumParams ? '+ Dodaj zaznaczoną face' : '(zaznacz face w scenie)'}
      </Button>

      {/* Thickness */}
      <NumField label="Thickness" value={f.thickness}
        onChange={v => onUpdate({ thickness: Math.max(0.1, v) })}
        min={0.1} step={0.5} />

      {/* Mode */}
      <TextField label="Mode" select size="small" fullWidth value={mode}
        onChange={e => onUpdate({ mode: e.target.value as ShellMode })} sx={{ mb: 1.5 }}>
        <MenuItem value="skin">Skin</MenuItem>
        <MenuItem value="pipe">Pipe</MenuItem>
        <MenuItem value="recto_verso">Recto/Verso</MenuItem>
      </TextField>

      {/* Join type */}
      <TextField label="Join type" select size="small" fullWidth value={joinType}
        onChange={e => onUpdate({ joinType: e.target.value as ShellJoinType })} sx={{ mb: 1.5 }}>
        <MenuItem value="arc">Arc (zaokrąglone)</MenuItem>
        <MenuItem value="intersection">Intersection (proste)</MenuItem>
      </TextField>

      {/* Intersection checkbox */}
      <FormControlLabel
        control={<Checkbox size="small" checked={intersection}
          onChange={e => onUpdate({ intersection: e.target.checked })} />}
        label={<Typography variant="body2">Intersection</Typography>} sx={{ mb: 0.5 }}
      />

      {/* Make thickness inwards */}
      <FormControlLabel
        control={<Checkbox size="small" checked={inwards}
          onChange={e => onUpdate({ inwards: e.target.checked })} />}
        label={<Typography variant="body2">Make thickness inwards</Typography>} sx={{ mb: 0.5 }}
      />

      {/* Recompute */}
      <FormControlLabel
        control={<Checkbox size="small" checked={autoRefresh}
          onChange={e => onUpdate({ autoRefresh: e.target.checked })} />}
        label={<Typography variant="body2">Recompute on change</Typography>} sx={{ mb: 1 }}
      />

      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', fontSize: 11, lineHeight: 1.3 }}>
        Shell tworzy cienkościenną bryłę o grubości Thickness.
        Faces na liście są usuwane (bryła zostaje otwarta w tych miejscach).
      </Typography>
    </>
  );
}

function FilletProps({ f, onUpdate, edgeParams }: {
  f: FilletFeature; onUpdate: (p: Partial<Feature>) => void;
  edgeParams?: { midpoint: Vec3; tangent: Vec3 } | null;
}) {
  const useAllEdges = f.useAllEdges ?? true;
  const autoRefresh = f.autoRefresh ?? true;
  const edges = f.edges ?? [];

  const addEdge = () => {
    if (!edgeParams) return;
    onUpdate({
      edges: [...edges, { hintPoint: edgeParams.midpoint, hintNormal: edgeParams.tangent }],
      useAllEdges: false,
    });
  };
  const removeEdge = (idx: number) => {
    onUpdate({ edges: edges.filter((_, i) => i !== idx) });
  };

  return (
    <>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
        Krawędzie do zaokrąglenia
      </Typography>

      {!useAllEdges && (
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, maxHeight: 120, overflowY: 'auto', mb: 1, p: 0.5 }}>
          {edges.length === 0 ? (
            <Typography variant="caption" color="text.disabled" sx={{ p: 0.5, display: 'block' }}>
              Brak — dodaj krawędzie przez tryb Edge select
            </Typography>
          ) : edges.map((e, idx) => (
            <Box key={idx} sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              px: 0.75, py: 0.25, mb: 0.25, bgcolor: 'action.hover', borderRadius: 0.5,
            }}>
              <Typography variant="caption" sx={{ flex: 1, mr: 1, color: 'text.primary' }}>
                Edge @ ({e.hintPoint[0].toFixed(0)}, {e.hintPoint[1].toFixed(0)}, {e.hintPoint[2].toFixed(0)})
              </Typography>
              <Button size="small" variant="text" color="error"
                sx={{ minWidth: 20, px: 0.5, py: 0, fontSize: 14, lineHeight: 1 }}
                onClick={() => removeEdge(idx)}>×</Button>
            </Box>
          ))}
        </Box>
      )}

      <Button size="small" variant="outlined" fullWidth
        disabled={!edgeParams}
        onClick={addEdge}
        sx={{ mb: 1.5 }}>
        {edgeParams ? '+ Dodaj zaznaczoną krawędź' : '(zaznacz krawędź — Edge select mode)'}
      </Button>

      <NumField label="Radius" value={f.radius}
        onChange={v => onUpdate({ radius: Math.max(0.01, v) })} min={0.01} step={0.5} />

      <FormControlLabel
        control={<Checkbox size="small" checked={useAllEdges}
          onChange={e => onUpdate({ useAllEdges: e.target.checked })} />}
        label={<Typography variant="body2">Use all edges</Typography>} sx={{ mb: 0.5 }}
      />

      <FormControlLabel
        control={<Checkbox size="small" checked={autoRefresh}
          onChange={e => onUpdate({ autoRefresh: e.target.checked })} />}
        label={<Typography variant="body2">Recompute on change</Typography>} sx={{ mb: 1 }}
      />

      <Box sx={{ mt: 1, p: 1, bgcolor: 'info.main', color: 'info.contrastText', borderRadius: 1, opacity: 0.9 }}>
        <Typography variant="caption" sx={{ fontSize: 11, lineHeight: 1.3, display: 'block', fontWeight: 600 }}>
          ℹ️ Tryb edycji Fillet
        </Typography>
        <Typography variant="caption" sx={{ fontSize: 10.5, lineHeight: 1.3, display: 'block' }}>
          Scena pokazuje bryłę <b>PRZED</b> tym Fillet (z ostrymi krawędziami do klikania).
          Przełącz Select mode na Edge → klik krawędź → "+ Dodaj". Odznacz feature w tree żeby zobaczyć wynik.
        </Typography>
      </Box>
    </>
  );
}

function PatternFeatureList({ features, featureIds, onUpdate }: {
  features: Feature[]; featureIds: string[]; onUpdate: (ids: string[]) => void;
}) {
  const candidates = features.filter(x =>
    x.type === 'extrude' || x.type === 'pocket' || x.type === 'hole' || x.type === 'revolve' ||
    x.type === 'loft' || x.type === 'sweep' || x.type === 'helix' || x.type === 'groove'
  );
  const addFeature = (id: string) => {
    if (!id || featureIds.includes(id)) return;
    onUpdate([...featureIds, id]);
  };
  const removeFeature = (id: string) => onUpdate(featureIds.filter(x => x !== id));
  return (
    <>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, maxHeight: 140, overflowY: 'auto', mb: 1 }}>
        {featureIds.length === 0 ? (
          <Typography variant="caption" color="text.disabled" sx={{ p: 1, display: 'block' }}>
            Brak wybranych cech
          </Typography>
        ) : featureIds.map(id => {
          const c = features.find(x => x.id === id);
          return (
            <Box key={id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1, py: 0.25 }}>
              <Typography variant="caption">{c?.name ?? id}</Typography>
              <Button size="small" sx={{ minWidth: 24, p: 0 }} onClick={() => removeFeature(id)}>×</Button>
            </Box>
          );
        })}
      </Box>
      <TextField label="Add Feature" select size="small" fullWidth value="" sx={{ mb: 1.5 }}
        onChange={e => addFeature(e.target.value)}>
        <MenuItem value="" disabled><em>Wybierz cechę…</em></MenuItem>
        {candidates.filter(c => !featureIds.includes(c.id)).map(c => (
          <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
        ))}
      </TextField>
    </>
  );
}

function LinearPatternProps({ f, features, onUpdate }: {
  f: LinearPatternFeature; features: Feature[]; onUpdate: (p: Partial<Feature>) => void;
}) {
  const mode = f.mode ?? 'tool_shapes';
  const dir2On = f.direction2Enabled ?? false;
  const autoRefresh = f.autoRefresh ?? true;

  return (
    <>
      <RadioGroup value={mode} onChange={e => onUpdate({ mode: e.target.value as PatternMode })} sx={{ mb: 1 }}>
        <FormControlLabel value="content" control={<Radio size="small" />}
          label={<Typography variant="body2">Transform body</Typography>} />
        <FormControlLabel value="tool_shapes" control={<Radio size="small" />}
          label={<Typography variant="body2">Transform tool shapes</Typography>} />
      </RadioGroup>

      {mode === 'tool_shapes' && (
        <PatternFeatureList features={features} featureIds={f.featureIds ?? []}
          onUpdate={ids => onUpdate({ featureIds: ids })} />
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
        Direction
      </Typography>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1, mb: 1.5 }}>
        <TextField label="Direction" select size="small" fullWidth value={f.direction}
          onChange={e => onUpdate({ direction: e.target.value as PatternDirection })} sx={{ mb: 1 }}>
          <MenuItem value="sketch_horizontal">Horizontal sketch axis</MenuItem>
          <MenuItem value="sketch_vertical">Vertical sketch axis</MenuItem>
          <MenuItem value="X">Base X</MenuItem>
          <MenuItem value="Y">Base Y</MenuItem>
          <MenuItem value="Z">Base Z</MenuItem>
        </TextField>
        <FormControlLabel
          control={<Switch size="small" checked={f.reversed ?? false}
            onChange={e => onUpdate({ reversed: e.target.checked })} />}
          label={<Typography variant="body2">Reversed</Typography>} sx={{ mb: 0.5 }} />
        <NumField label="Length" value={f.length} onChange={v => onUpdate({ length: v })} step={10} min={0.1} />
        <NumField label="Occurrences" value={f.occurrences} onChange={v => onUpdate({ occurrences: Math.max(2, Math.round(v)) })} step={1} min={2} />
      </Box>

      <FormControlLabel
        control={<Checkbox size="small" checked={dir2On}
          onChange={e => onUpdate({ direction2Enabled: e.target.checked })} />}
        label={<Typography variant="body2">Direction 2 (grid pattern)</Typography>} sx={{ mb: 0.5 }} />

      {dir2On && (
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1, mb: 1.5 }}>
          <TextField label="Direction 2" select size="small" fullWidth value={f.direction2 ?? 'sketch_vertical'}
            onChange={e => onUpdate({ direction2: e.target.value as PatternDirection })} sx={{ mb: 1 }}>
            <MenuItem value="sketch_horizontal">Horizontal</MenuItem>
            <MenuItem value="sketch_vertical">Vertical</MenuItem>
            <MenuItem value="X">Base X</MenuItem>
            <MenuItem value="Y">Base Y</MenuItem>
            <MenuItem value="Z">Base Z</MenuItem>
          </TextField>
          <NumField label="Length 2" value={f.length2 ?? 100} onChange={v => onUpdate({ length2: v })} step={10} min={0.1} />
          <NumField label="Occurrences 2" value={f.occurrences2 ?? 2}
            onChange={v => onUpdate({ occurrences2: Math.max(2, Math.round(v)) })} step={1} min={2} />
        </Box>
      )}

      <FormControlLabel
        control={<Checkbox size="small" checked={autoRefresh}
          onChange={e => onUpdate({ autoRefresh: e.target.checked })} />}
        label={<Typography variant="body2">Recompute on change</Typography>} sx={{ mb: 1 }} />
    </>
  );
}

function PolarPatternProps({ f, features, onUpdate }: {
  f: PolarPatternFeature; features: Feature[]; onUpdate: (p: Partial<Feature>) => void;
}) {
  const mode = f.mode ?? 'tool_shapes';
  const autoRefresh = f.autoRefresh ?? true;

  return (
    <>
      <RadioGroup value={mode} onChange={e => onUpdate({ mode: e.target.value as PatternMode })} sx={{ mb: 1 }}>
        <FormControlLabel value="content" control={<Radio size="small" />}
          label={<Typography variant="body2">Transform body</Typography>} />
        <FormControlLabel value="tool_shapes" control={<Radio size="small" />}
          label={<Typography variant="body2">Transform tool shapes</Typography>} />
      </RadioGroup>

      {mode === 'tool_shapes' && (
        <PatternFeatureList features={features} featureIds={f.featureIds ?? []}
          onUpdate={ids => onUpdate({ featureIds: ids })} />
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
        Axis
      </Typography>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1, mb: 1.5 }}>
        <TextField label="Axis" select size="small" fullWidth value={f.axis}
          onChange={e => onUpdate({ axis: e.target.value as PatternDirection })} sx={{ mb: 1 }}>
          <MenuItem value="sketch_normal">Normal sketch axis</MenuItem>
          <MenuItem value="sketch_horizontal">Horizontal sketch axis</MenuItem>
          <MenuItem value="sketch_vertical">Vertical sketch axis</MenuItem>
          <MenuItem value="X">Base X</MenuItem>
          <MenuItem value="Y">Base Y</MenuItem>
          <MenuItem value="Z">Base Z</MenuItem>
        </TextField>
        <FormControlLabel
          control={<Switch size="small" checked={f.reversed ?? false}
            onChange={e => onUpdate({ reversed: e.target.checked })} />}
          label={<Typography variant="body2">Reversed</Typography>} sx={{ mb: 0.5 }} />
        <NumField label="Angle (°)" value={f.angle}
          onChange={v => onUpdate({ angle: Math.max(1, Math.min(360, v)) })} step={5} min={1} max={360} />
        <NumField label="Occurrences" value={f.occurrences}
          onChange={v => onUpdate({ occurrences: Math.max(2, Math.round(v)) })} step={1} min={2} />
      </Box>

      <FormControlLabel
        control={<Checkbox size="small" checked={autoRefresh}
          onChange={e => onUpdate({ autoRefresh: e.target.checked })} />}
        label={<Typography variant="body2">Recompute on change</Typography>} sx={{ mb: 1 }} />
    </>
  );
}

function ChamferProps({ f, onUpdate, edgeParams }: {
  f: ChamferFeature; onUpdate: (p: Partial<Feature>) => void;
  edgeParams?: { midpoint: Vec3; tangent: Vec3 } | null;
}) {
  const chamferType = f.chamferType ?? 'equal';
  const useAllEdges = f.useAllEdges ?? true;
  const autoRefresh = f.autoRefresh ?? true;
  const edges = f.edges ?? [];

  const addEdge = () => {
    if (!edgeParams) return;
    onUpdate({
      edges: [...edges, { hintPoint: edgeParams.midpoint, hintNormal: edgeParams.tangent }],
      useAllEdges: false,
    });
  };
  const removeEdge = (idx: number) => {
    onUpdate({ edges: edges.filter((_, i) => i !== idx) });
  };

  return (
    <>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
        Krawędzie do skosowania
      </Typography>

      {!useAllEdges && (
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, maxHeight: 120, overflowY: 'auto', mb: 1, p: 0.5 }}>
          {edges.length === 0 ? (
            <Typography variant="caption" color="text.disabled" sx={{ p: 0.5, display: 'block' }}>
              Brak — dodaj krawędzie przez tryb Edge select
            </Typography>
          ) : edges.map((e, idx) => (
            <Box key={idx} sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              px: 0.75, py: 0.25, mb: 0.25, bgcolor: 'action.hover', borderRadius: 0.5,
            }}>
              <Typography variant="caption" sx={{ flex: 1, mr: 1, color: 'text.primary' }}>
                Edge @ ({e.hintPoint[0].toFixed(0)}, {e.hintPoint[1].toFixed(0)}, {e.hintPoint[2].toFixed(0)})
              </Typography>
              <Button size="small" variant="text" color="error"
                sx={{ minWidth: 20, px: 0.5, py: 0, fontSize: 14, lineHeight: 1 }}
                onClick={() => removeEdge(idx)}>×</Button>
            </Box>
          ))}
        </Box>
      )}

      <Button size="small" variant="outlined" fullWidth
        disabled={!edgeParams}
        onClick={addEdge}
        sx={{ mb: 1.5 }}>
        {edgeParams ? '+ Dodaj zaznaczoną krawędź' : '(zaznacz krawędź — Edge select mode)'}
      </Button>

      <TextField label="Type" select size="small" fullWidth value={chamferType}
        onChange={e => onUpdate({ chamferType: e.target.value as ChamferType })} sx={{ mb: 1.5 }}>
        <MenuItem value="equal">Equal distance</MenuItem>
        <MenuItem value="two_distances">Two distances</MenuItem>
      </TextField>

      <NumField label="Size" value={f.size}
        onChange={v => onUpdate({ size: Math.max(0.01, v) })} min={0.01} step={0.5} />

      {chamferType === 'two_distances' && (
        <NumField label="Size 2" value={f.size2 ?? f.size}
          onChange={v => onUpdate({ size2: Math.max(0.01, v) })} min={0.01} step={0.5} />
      )}

      <FormControlLabel
        control={<Checkbox size="small" checked={useAllEdges}
          onChange={e => onUpdate({ useAllEdges: e.target.checked })} />}
        label={<Typography variant="body2">Use all edges</Typography>} sx={{ mb: 0.5 }}
      />

      <FormControlLabel
        control={<Checkbox size="small" checked={autoRefresh}
          onChange={e => onUpdate({ autoRefresh: e.target.checked })} />}
        label={<Typography variant="body2">Recompute on change</Typography>} sx={{ mb: 1 }}
      />

      <Box sx={{ mt: 1, p: 1, bgcolor: 'info.main', color: 'info.contrastText', borderRadius: 1, opacity: 0.9 }}>
        <Typography variant="caption" sx={{ fontSize: 11, lineHeight: 1.3, display: 'block', fontWeight: 600 }}>
          ℹ️ Tryb edycji Chamfer
        </Typography>
        <Typography variant="caption" sx={{ fontSize: 10.5, lineHeight: 1.3, display: 'block' }}>
          Scena pokazuje bryłę <b>PRZED</b> tym Chamfer (z ostrymi krawędziami).
          Select mode: Edge → klik krawędź → "+ Dodaj".
        </Typography>
      </Box>
    </>
  );
}

function RevolveProps({ f, features, onUpdate }: { f: RevolveFeature; features: Feature[]; onUpdate: (p: Partial<Feature>) => void }) {
  // FreeCAD-style Revolution Parameters:
  // - Type: Angle / To last / To first / Up to face / Two angles
  // - Axis: Base X / Base Y / Base Z / Select reference (datum_line lub datum_cs)
  // - Angle (+ Angle2 dla Two angles)
  // - Symmetric to plane, Reversed, Recompute on change
  const typeExt = f.revolveTypeExt ?? (
    f.revolveType === 'through_all' ? 'to_last'
    : f.revolveType === 'symmetric' ? 'angle'
    : 'angle'
  );
  const axisExt = f.axisExt ?? (
    f.axis === 'X' ? 'X' : f.axis === 'Y' ? 'Y' : f.axis === 'Z' ? 'Z'
    : f.axis === 'sketch_vertical' ? 'sketch_vertical' : f.axis === 'sketch_horizontal' ? 'sketch_horizontal'
    : 'Y'
  );
  const autoRefresh = f.autoRefresh ?? true;

  // Kandydaci na oś referencyjną — datum_line + datum_cs (którego oś Z użyjemy jako oś)
  const axisRefs = features.filter(x => x.type === 'datum_line' || x.type === 'datum_cs');

  // Mapping typeExt → legacy revolveType (żeby evalRevolve dalej działał)
  const legacyType = (t: RevolveTypeExt): RevolveType => {
    if (t === 'to_last') return 'through_all';
    if (t === 'two_angles' || t === 'up_to_face') return 'dimension';
    return f.symmetric ? 'symmetric' : 'dimension';
  };
  const legacyAxis = (a: RevolveAxisExt): RevolveAxis => {
    if (a === 'X' || a === 'Y' || a === 'Z') return a;
    if (a === 'sketch_vertical') return 'sketch_vertical';
    if (a === 'sketch_horizontal') return 'sketch_horizontal';
    return 'sketch_vertical'; // fallback dla datum_reference — evalRevolve nie wspiera; kolejne PR
  };

  const setTypeExt = (t: RevolveTypeExt) => {
    const patch: Partial<RevolveFeature> = { revolveTypeExt: t, revolveType: legacyType(t) };
    // Ustaw sensowne defaults gdy zmieniamy typ:
    if (t === 'to_last' && f.angle !== 360) patch.angle = 360;
    if (t === 'two_angles' && f.angle2 === undefined) patch.angle2 = 90;
    onUpdate(patch);
  };
  const setAxisExt = (a: RevolveAxisExt, refId?: string) => {
    onUpdate({ axisExt: a, axis: legacyAxis(a), ...(refId !== undefined ? { axisRefId: refId } : {}) });
  };

  const currentAxisKey = axisExt === 'datum_reference' && f.axisRefId
    ? `datum:${f.axisRefId}`
    : axisExt;

  const sketches = features.filter(feat => feat.type === 'sketch') as SketchFeature[];

  return (
    <>
      {/* Sketch source — profil 2D który będzie obracany wokół osi */}
      <SketchSelect label="Sketch (profile to revolve)" value={f.sketchId} sketches={sketches}
        onChange={id => onUpdate({ sketchId: id })} />
      {!f.sketchId && (
        <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 1 }}>
          Wybierz sketch z profilem 2D który będzie obracany.
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5, fontSize: 11, lineHeight: 1.3 }}>
        Profile musi być CAŁKOWICIE po jednej stronie osi obrotu.
        Pomarańczowa linia w scenie = oś (widoczna gdy Revolve zaznaczony).
      </Typography>

      {/* Type */}
      <TextField label="Type" select size="small" fullWidth value={typeExt}
        onChange={e => setTypeExt(e.target.value as RevolveTypeExt)}
        sx={{ mb: 1.5 }}>
        <MenuItem value="angle">Angle</MenuItem>
        <MenuItem value="to_last">To last (360°)</MenuItem>
        <MenuItem value="to_first" disabled>To first</MenuItem>
        <MenuItem value="up_to_face" disabled>Up to face</MenuItem>
        <MenuItem value="two_angles">Two angles</MenuItem>
      </TextField>

      {/* Axis */}
      <TextField label="Axis" select size="small" fullWidth value={currentAxisKey}
        onChange={e => {
          const v = e.target.value;
          if (v.startsWith('datum:')) {
            setAxisExt('datum_reference', v.slice('datum:'.length));
          } else {
            setAxisExt(v as RevolveAxisExt, undefined);
          }
        }}
        sx={{ mb: 1.5 }}>
        <MenuItem value="X">Base X-axis</MenuItem>
        <MenuItem value="Y">Base Y-axis</MenuItem>
        <MenuItem value="Z">Base Z-axis</MenuItem>
        <MenuItem value="sketch_vertical">Sketch vertical</MenuItem>
        <MenuItem value="sketch_horizontal">Sketch horizontal</MenuItem>
        {axisRefs.length > 0 && [
          <MenuItem key="__hdr" value="__hdr" disabled sx={{ opacity: 0.5, fontSize: 11 }}>
            — Reference (datum line / CS) —
          </MenuItem>,
          ...axisRefs.map(r => (
            <MenuItem key={r.id} value={`datum:${r.id}`}>{r.name}</MenuItem>
          )),
        ]}
      </TextField>

      {/* Angle — dla two_angles ogranicz do (360 - angle2) żeby suma nie przekraczała 360° */}
      {typeExt !== 'to_last' && typeExt !== 'to_first' && typeExt !== 'up_to_face' && (
        <NumField label="Angle (°)" value={f.angle}
          onChange={v => {
            const otherAngle = typeExt === 'two_angles' ? (f.angle2 ?? 0) : 0;
            const maxAllowed = Math.max(1, 360 - otherAngle);
            onUpdate({ angle: Math.max(1, Math.min(maxAllowed, v)) });
          }}
          min={1} max={typeExt === 'two_angles' ? Math.max(1, 360 - (f.angle2 ?? 0)) : 360}
          step={5} />
      )}

      {/* Angle 2 (dla Two angles) — max = 360 - angle1 */}
      {typeExt === 'two_angles' && (
        <>
          <NumField label="Angle 2 (°)" value={f.angle2 ?? 90}
            onChange={v => {
              const maxAllowed = Math.max(1, 360 - f.angle);
              onUpdate({ angle2: Math.max(1, Math.min(maxAllowed, v)) });
            }}
            min={1} max={Math.max(1, 360 - f.angle)} step={5} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5, fontSize: 11, lineHeight: 1.3 }}>
            Suma Angle + Angle 2 = {f.angle + (f.angle2 ?? 0)}° (max 360°).
            Revolve idzie od -Angle 2 do +Angle wokół osi.
          </Typography>
        </>
      )}

      {/* Symmetric to plane (dla Angle) */}
      {typeExt === 'angle' && (
        <FormControlLabel
          control={<Switch size="small" checked={f.symmetric ?? false}
            onChange={e => onUpdate({ symmetric: e.target.checked, revolveType: e.target.checked ? 'symmetric' : 'dimension' })} />}
          label={<Typography variant="body2">Symmetric to plane</Typography>} sx={{ mb: 0.5 }}
        />
      )}

      {/* Reversed */}
      <FormControlLabel
        control={<Switch size="small" checked={f.reversed ?? false}
          onChange={e => onUpdate({ reversed: e.target.checked })} />}
        label={<Typography variant="body2">Reversed</Typography>} sx={{ mb: 0.5 }}
      />

      {/* Recompute on change */}
      <FormControlLabel
        control={<Checkbox size="small" checked={autoRefresh}
          onChange={e => onUpdate({ autoRefresh: e.target.checked })} />}
        label={<Typography variant="body2">Recompute on change</Typography>} sx={{ mb: 1 }}
      />

      <NumField label="Segments" value={f.segments}
        onChange={v => onUpdate({ segments: Math.max(3, Math.round(v)) })} min={3} max={128} step={1} />

      <Typography variant="caption" color="text.disabled">
        {f.sketchId ? 'From sketch' : f.entityIds.length === 0 ? 'All CAD 2D entities (dynamic)' : `${f.entityIds.length} pinned entities`}
      </Typography>
    </>
  );
}

function SketchSelect({ label, value, sketches, onChange }: {
  label: string; value: string | null; sketches: SketchFeature[]; onChange: (id: string | null) => void;
}) {
  return (
    <TextField label={label} select size="small" fullWidth value={value ?? ''} onChange={e => onChange(e.target.value || null)} sx={{ mb: 1.5 }}>
      <MenuItem value=""><em>None</em></MenuItem>
      {sketches.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
    </TextField>
  );
}

function SweepProps({ f, features, onUpdate }: { f: SweepFeature; features: Feature[]; onUpdate: (p: Partial<Feature>) => void }) {
  const sketches = features.filter(feat => feat.type === 'sketch') as SketchFeature[];
  return (
    <>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.75 }}>
        Profile
      </Typography>
      <SketchSelect label="Profile sketch" value={f.profileSketchId} sketches={sketches}
        onChange={id => onUpdate({ profileSketchId: id })} />

      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.75 }}>
        Path to sweep
      </Typography>
      <SketchSelect label="Path sketch" value={f.pathSketchId} sketches={sketches}
        onChange={id => onUpdate({ pathSketchId: id })} />

      <TextField label="Corner transition" select size="small" fullWidth value={f.cornerStyle ?? 'transformed'}
        onChange={e => onUpdate({ cornerStyle: e.target.value as SweepCornerStyle })} sx={{ mb: 1.5 }}>
        <MenuItem value="transformed">Transformed</MenuItem>
        <MenuItem value="round">Round</MenuItem>
        <MenuItem value="right_angle">Right angle</MenuItem>
      </TextField>

      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.75 }}>
        Profile section direction
      </Typography>
      <TextField label="Orientation mode" select size="small" fullWidth value={f.orientationMode ?? 'standard'}
        onChange={e => onUpdate({ orientationMode: e.target.value as SweepOrientationMode })} sx={{ mb: 1.5 }}>
        <MenuItem value="standard">Standard (Frenet)</MenuItem>
        <MenuItem value="fixed">Fixed</MenuItem>
        <MenuItem value="frenet">Frenet</MenuItem>
      </TextField>

      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.75 }}>
        Section transformation
      </Typography>
      <TextField label="Transformation mode" select size="small" fullWidth value={f.transformMode ?? 'constant'}
        onChange={e => onUpdate({ transformMode: e.target.value as SweepTransformMode })} sx={{ mb: 1.5 }}>
        <MenuItem value="constant">Constant</MenuItem>
        <MenuItem value="inscribed">Inscribed</MenuItem>
      </TextField>

      {(!f.profileSketchId || !f.pathSketchId) && (
        <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
          {!f.profileSketchId && !f.pathSketchId ? 'Profile and path sketches required.'
            : !f.profileSketchId ? 'Profile sketch required.'
            : 'Path sketch required.'}
        </Typography>
      )}
    </>
  );
}

function LoftProps({ f, features, onUpdate }: { f: LoftFeature; features: Feature[]; onUpdate: (p: Partial<Feature>) => void }) {
  const sketches = features.filter(feat => feat.type === 'sketch') as SketchFeature[];
  const sections: LoftSection[] = f.sections ?? [];
  const available = sketches.filter(s => !sections.some(sec => sec.sketchId === s.id));

  return (
    <>
      <FormControlLabel
        control={<Switch size="small" checked={f.ruled ?? false} onChange={e => onUpdate({ ruled: e.target.checked })} />}
        label="Ruled surface" sx={{ mb: 0.5 }}
      />
      <FormControlLabel
        control={<Switch size="small" checked={f.closed ?? false} onChange={e => onUpdate({ closed: e.target.checked })} />}
        label="Closed" sx={{ mb: 1 }}
      />

      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.5 }}>
        Sections
      </Typography>

      {sections.length === 0 && (
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1 }}>
          No sections yet
        </Typography>
      )}

      <Box sx={{ mb: 1 }}>
        {sections.map((sec, idx) => {
          const sk = sketches.find(s => s.id === sec.sketchId);
          return (
            <Box key={`${sec.sketchId}-${idx}`}
              sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderLeft: '2px solid', borderColor: 'primary.main',
                pl: 1, pr: 0.5, py: 0.25, mb: 0.25,
                bgcolor: 'action.hover',
                borderRadius: 0.5,
              }}
            >
              <Typography variant="body2" noWrap sx={{ flex: 1, mr: 1, color: 'text.primary' }}>
                {sk?.name ?? `Section ${idx + 1}`}
              </Typography>
              <Button
                size="small"
                variant="text"
                color="error"
                sx={{ minWidth: 24, px: 0.75, py: 0, fontSize: 16, lineHeight: 1 }}
                onClick={() => onUpdate({ sections: sections.filter((_, i) => i !== idx) })}
              >
                ×
              </Button>
            </Box>
          );
        })}
      </Box>

      {available.length > 0 ? (
        <TextField label="Add section" select size="small" fullWidth value=""
          onChange={e => { if (e.target.value) onUpdate({ sections: [...sections, { sketchId: e.target.value }] }); }}
          sx={{ mb: 1 }}>
          {available.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
        </TextField>
      ) : (
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1 }}>
          {sketches.length === 0 ? 'Add sketches first' : 'All sketches already added'}
        </Typography>
      )}

      {sections.length < 2 && (
        <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
          At least 2 sections required to generate geometry.
        </Typography>
      )}
    </>
  );
}

function GrooveProps({ f, features, onUpdate }: { f: GrooveFeature; features: Feature[]; onUpdate: (p: Partial<Feature>) => void }) {
  return <RevolveProps f={f as unknown as RevolveFeature} features={features} onUpdate={onUpdate} />;
}

function LoftCutProps({ f, features, onUpdate }: { f: LoftCutFeature; features: Feature[]; onUpdate: (p: Partial<Feature>) => void }) {
  return <LoftProps f={f as unknown as LoftFeature} features={features} onUpdate={onUpdate} />;
}

function SweepCutProps({ f, features, onUpdate }: { f: SweepCutFeature; features: Feature[]; onUpdate: (p: Partial<Feature>) => void }) {
  return <SweepProps f={f as unknown as SweepFeature} features={features} onUpdate={onUpdate} />;
}

function HoleProps({ f, features, onUpdate }: { f: HoleFeature; features: Feature[]; onUpdate: (p: Partial<Feature>) => void }) {
  const depthType   = f.depthType   ?? 'dimension';
  const counterType = f.counterType ?? 'none';
  const drillPoint  = f.drillPoint  ?? 'angled';
  const sketches = features.filter(feat => feat.type === 'sketch') as SketchFeature[];
  return (
    <>
      {/* Sketch source — hole używa środków okręgów z sketch jako punktów wiercenia */}
      <SketchSelect label="Sketch (circle centers)" value={f.sketchId} sketches={sketches}
        onChange={id => onUpdate({ sketchId: id })} />
      {!f.sketchId && (
        <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 1 }}>
          Bez sketch — wywierci pojedynczy otwór w origin.
        </Typography>
      )}

      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.75 }}>
        Bore
      </Typography>

      <NumField label="Diameter" value={f.diameter ?? 6}
        onChange={v => onUpdate({ diameter: Math.max(0.1, v) })} min={0.1} step={0.5} />

      <TextField label="Depth type" select size="small" fullWidth value={depthType}
        onChange={e => onUpdate({ depthType: e.target.value as HoleDepthType })} sx={{ mb: 1.5 }}>
        <MenuItem value="dimension">Dimension</MenuItem>
        <MenuItem value="through_all">Through All</MenuItem>
      </TextField>

      {depthType === 'dimension' && (
        <NumField label="Depth" value={f.depth ?? 25}
          onChange={v => onUpdate({ depth: Math.max(0.1, v) })} min={0.1} step={1} />
      )}

      <FormControlLabel
        control={<Switch size="small" checked={f.reversed ?? false} onChange={e => onUpdate({ reversed: e.target.checked })} />}
        label="Reversed" sx={{ mb: 0.5 }}
      />
      <FormControlLabel
        control={<Switch size="small" checked={f.tapered ?? false} onChange={e => onUpdate({ tapered: e.target.checked })} />}
        label="Tapered" sx={{ mb: 0.5 }}
      />
      {(f.tapered ?? false) && (
        <NumField label="Taper angle (°)" value={f.taperAngle ?? 90}
          onChange={v => onUpdate({ taperAngle: Math.max(1, Math.min(179, v)) })} min={1} max={179} step={1} />
      )}

      <Divider sx={{ my: 1 }} />
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.75 }}>
        Drill Point
      </Typography>

      <TextField label="Drill point" select size="small" fullWidth value={drillPoint}
        onChange={e => onUpdate({ drillPoint: e.target.value as HoleDrillPoint })} sx={{ mb: 1.5 }}>
        <MenuItem value="flat">Flat</MenuItem>
        <MenuItem value="angled">Angled</MenuItem>
      </TextField>

      {drillPoint === 'angled' && (
        <NumField label="Drill angle (°)" value={f.drillPointAngle ?? 118}
          onChange={v => onUpdate({ drillPointAngle: Math.max(1, Math.min(179, v)) })} min={1} max={179} step={1} />
      )}

      <Divider sx={{ my: 1 }} />
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.75 }}>
        Countersink / Counterbore
      </Typography>

      <TextField label="Counter type" select size="small" fullWidth value={counterType}
        onChange={e => onUpdate({ counterType: e.target.value as HoleCounterType })} sx={{ mb: 1.5 }}>
        <MenuItem value="none">None</MenuItem>
        <MenuItem value="countersink">Countersink</MenuItem>
        <MenuItem value="counterbore">Counterbore</MenuItem>
      </TextField>

      {counterType !== 'none' && (
        <NumField label="Outer diameter" value={f.counterDiameter ?? 10}
          onChange={v => onUpdate({ counterDiameter: Math.max((f.diameter ?? 6) + 0.1, v) })} min={0.1} step={0.5} />
      )}
      {counterType === 'counterbore' && (
        <NumField label="CB depth" value={f.counterDepth ?? 3}
          onChange={v => onUpdate({ counterDepth: Math.max(0.1, v) })} min={0.1} step={0.5} />
      )}
      {counterType === 'countersink' && (
        <NumField label="CS angle (°)" value={f.counterAngle ?? 90}
          onChange={v => onUpdate({ counterAngle: Math.max(1, Math.min(179, v)) })} min={1} max={179} step={1} />
      )}
    </>
  );
}

function HelixProps({ f, features, onUpdate }: { f: HelixFeature; features: Feature[]; onUpdate: (p: Partial<Feature>) => void }) {
  const sketches = features.filter(feat => feat.type === 'sketch') as SketchFeature[];
  const mode = f.mode ?? 'pitch_height';
  return (
    <>
      <TextField label="Axis" select size="small" fullWidth value={f.axis ?? 'Y'}
        onChange={e => onUpdate({ axis: e.target.value as HelixAxis })} sx={{ mb: 1.5 }}>
        <MenuItem value="sketch_vertical">Vertical sketch axis</MenuItem>
        <MenuItem value="sketch_horizontal">Horizontal sketch axis</MenuItem>
        <MenuItem value="X">X axis</MenuItem>
        <MenuItem value="Y">Y axis</MenuItem>
        <MenuItem value="Z">Z axis</MenuItem>
      </TextField>

      <TextField label="Mode" select size="small" fullWidth value={mode}
        onChange={e => onUpdate({ mode: e.target.value as HelixMode })} sx={{ mb: 1.5 }}>
        <MenuItem value="pitch_height">Pitch + Height</MenuItem>
        <MenuItem value="pitch_turns">Pitch + Turns</MenuItem>
        <MenuItem value="turns_height">Turns + Height</MenuItem>
      </TextField>

      {(mode === 'pitch_height' || mode === 'pitch_turns') && (
        <NumField label="Pitch" value={f.pitch ?? 10}
          onChange={v => onUpdate({ pitch: Math.max(0.1, v) })} min={0.1} step={1} />
      )}
      {(mode === 'pitch_height' || mode === 'turns_height') && (
        <NumField label="Height" value={f.height ?? 50}
          onChange={v => onUpdate({ height: Math.max(0.1, v) })} min={0.1} step={1} />
      )}
      {(mode === 'pitch_turns' || mode === 'turns_height') && (
        <NumField label="Turns" value={f.turns ?? 5}
          onChange={v => onUpdate({ turns: Math.max(0.25, v) })} min={0.25} step={0.25} />
      )}

      <NumField label="Radius" value={f.radius ?? 20}
        onChange={v => onUpdate({ radius: Math.max(0.1, v) })} min={0.1} step={1} />

      <NumField label="Taper angle (°)" value={f.taper ?? 0}
        onChange={v => onUpdate({ taper: Math.max(-89, Math.min(89, v)) })}
        min={-89} max={89} step={0.5} />

      <FormControlLabel
        control={<Switch size="small" checked={f.leftHanded ?? false} onChange={e => onUpdate({ leftHanded: e.target.checked })} />}
        label="Left-handed" sx={{ mb: 0.5 }}
      />
      <FormControlLabel
        control={<Switch size="small" checked={f.reversed ?? false} onChange={e => onUpdate({ reversed: e.target.checked })} />}
        label="Reversed" sx={{ mb: 1 }}
      />

      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.75 }}>
        Profile (optional)
      </Typography>
      <SketchSelect label="Profile sketch" value={f.profileSketchId} sketches={sketches}
        onChange={id => onUpdate({ profileSketchId: id })} />

      {!f.profileSketchId && (
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
          No profile — spine tube shown.
        </Typography>
      )}
    </>
  );
}

export function FeaturePropsPanel({ feature, features, onUpdate, onEditSketch, onCreateDatumPlane, faceDatumParams, edgeParams }: Props) {
  if (!feature) {
    return (
      <Box sx={{ width: 220, p: 2, borderLeft: '1px solid', borderColor: 'divider' }}>
        <Typography variant="body2" color="text.disabled">Select a feature to edit its properties.</Typography>
      </Box>
    );
  }

  const up = (patch: Partial<Feature>) => onUpdate(feature.id, patch);

  return (
    <Box sx={{ width: 220, display: 'flex', flexDirection: 'column', borderLeft: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
      <Typography variant="caption" sx={{ px: 1.5, py: 0.75, color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
        Properties
      </Typography>
      <Divider />
      <Box sx={{ p: 1.5, overflowY: 'auto', flex: 1 }}>
        <TextField label="Name" size="small" fullWidth value={feature.name}
          onChange={e => up({ name: e.target.value })} sx={{ mb: 1.5 }} />
        {feature.type === 'sketch'  && <SketchProps  f={feature as SketchFeature}  onUpdate={up} onEditSketch={onEditSketch} />}
        {feature.type === 'extrude' && <ExtrudeProps f={feature as ExtrudeFeature} features={features} onUpdate={up} />}
        {feature.type === 'pocket'  && <PocketProps  f={feature as PocketFeature}  features={features} onUpdate={up} />}
        {feature.type === 'hole'    && <HoleProps    f={feature as HoleFeature}    features={features} onUpdate={up} />}
        {feature.type === 'groove'   && <GrooveProps   f={feature as GrooveFeature}   features={features} onUpdate={up} />}
        {feature.type === 'loft_cut' && <LoftCutProps  f={feature as LoftCutFeature} features={features} onUpdate={up} />}
        {feature.type === 'mirror'  && <MirrorProps  f={feature as MirrorFeature}  features={features} onUpdate={up}
          onCreateDatumPlane={onCreateDatumPlane} faceDatumParams={faceDatumParams} />}
        {feature.type === 'revolve' && <RevolveProps f={feature as RevolveFeature} features={features} onUpdate={up} />}
        {feature.type === 'shell'   && <ShellProps   f={feature as ShellFeature}   onUpdate={up} faceDatumParams={faceDatumParams} />}
        {feature.type === 'fillet'  && <FilletProps  f={feature as FilletFeature}  onUpdate={up} edgeParams={edgeParams} />}
        {feature.type === 'chamfer' && <ChamferProps f={feature as ChamferFeature} onUpdate={up} edgeParams={edgeParams} />}
        {feature.type === 'linear_pattern' && <LinearPatternProps f={feature as LinearPatternFeature} features={features} onUpdate={up} />}
        {feature.type === 'polar_pattern'  && <PolarPatternProps  f={feature as PolarPatternFeature}  features={features} onUpdate={up} />}
        {feature.type === 'loft'    && <LoftProps    f={feature as LoftFeature}    features={features} onUpdate={up} />}
        {feature.type === 'sweep'     && <SweepProps    f={feature as SweepFeature}    features={features} onUpdate={up} />}
        {feature.type === 'sweep_cut' && <SweepCutProps f={feature as SweepCutFeature} features={features} onUpdate={up} />}
        {feature.type === 'helix'   && <HelixProps   f={feature as HelixFeature}   features={features} onUpdate={up} />}
        {feature.type === 'datum_point' && <DatumPointProps f={feature as DatumPointFeature} onUpdate={up} />}
        {feature.type === 'datum_line'  && <DatumLineProps  f={feature as DatumLineFeature}  onUpdate={up} />}
        {feature.type === 'datum_plane' && <DatumPlaneProps f={feature as DatumPlaneFeature} onUpdate={up} />}
        {feature.type === 'datum_cs'    && <DatumCsProps    f={feature as DatumCsFeature}    onUpdate={up} />}
      </Box>
    </Box>
  );
}
