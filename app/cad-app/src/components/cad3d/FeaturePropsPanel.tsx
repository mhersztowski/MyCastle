import {
  Box, Button, Typography, Divider, TextField, MenuItem, Switch, FormControlLabel, IconButton, List, ListItem, ListItemText,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import type { Feature, ExtrudeFeature, ExtrudeType, ExtrudeDirection, GrooveFeature, HelixFeature, HelixMode, HelixAxis, HoleFeature, HoleDepthType, HoleDrillPoint, HoleCounterType, LoftCutFeature, LoftFeature, LoftSection, MirrorFeature, PocketFeature, RevolveFeature, RevolveType, RevolveAxis, ShellFeature, SketchFeature, SweepCutFeature, SweepFeature, SweepCornerStyle, SweepOrientationMode, SweepTransformMode, DatumPointFeature, DatumLineFeature, DatumPlaneFeature, DatumCsFeature, Vec3 } from '../../cad3d/types';

interface Props {
  feature: Feature | null;
  features: Feature[];
  onUpdate: (id: string, patch: Partial<Feature>) => void;
  onEditSketch?: (id: string) => void;
}

function NumField({ label, value, onChange, min, max, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
}) {
  return (
    <TextField
      label={label} type="number" size="small" fullWidth value={value}
      inputProps={{ min, max, step }}
      onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v); }}
      sx={{ mb: 1.5 }}
    />
  );
}

function Vec3Field({ label, value, onChange }: { label: string; value: Vec3; onChange: (v: Vec3) => void }) {
  const set = (i: number, raw: string) => {
    const n = parseFloat(raw); if (isNaN(n)) return;
    const next: Vec3 = [...value]; next[i] = n; onChange(next);
  };
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>{label}</Typography>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        {(['X', 'Y', 'Z'] as const).map((ax, i) => (
          <TextField key={ax} label={ax} type="number" size="small" value={value[i]}
            inputProps={{ step: 1 }} onChange={e => set(i, e.target.value)} sx={{ flex: 1 }} />
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

function ExtrudeProps({ f, onUpdate }: { f: ExtrudeFeature; onUpdate: (p: Partial<Feature>) => void }) {
  const extrudeType = f.extrudeType ?? 'dimension';
  const reversed    = f.reversed ?? false;
  const direction   = f.direction ?? 'normal';
  const taper       = f.taper ?? 0;
  return (
    <>
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

function PocketProps({ f, onUpdate }: { f: PocketFeature; onUpdate: (p: Partial<Feature>) => void }) {
  return <ExtrudeProps f={f as unknown as ExtrudeFeature} onUpdate={onUpdate} />;
}

function MirrorProps({ f, onUpdate }: { f: MirrorFeature; onUpdate: (p: Partial<Feature>) => void }) {
  return (
    <TextField label="Mirror plane" select size="small" fullWidth value={f.plane}
      onChange={e => onUpdate({ plane: e.target.value as MirrorFeature['plane'] })} sx={{ mb: 1.5 }}>
      {(['YZ', 'XZ', 'XY'] as const).map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
    </TextField>
  );
}

function ShellProps({ f, onUpdate }: { f: ShellFeature; onUpdate: (p: Partial<Feature>) => void }) {
  return (
    <>
      <NumField label="Wall thickness" value={f.thickness} onChange={v => onUpdate({ thickness: Math.max(0.1, v) })} min={0.1} step={0.5} />
      <Typography variant="caption" color="text.disabled">
        Hollows the accumulated solid by offsetting faces inward.
      </Typography>
    </>
  );
}

function RevolveProps({ f, onUpdate }: { f: RevolveFeature; onUpdate: (p: Partial<Feature>) => void }) {
  const revolveType = f.revolveType ?? 'dimension';
  const axis        = f.axis ?? 'sketch_vertical';
  const symmetric   = f.symmetric ?? false;
  const reversed    = f.reversed ?? false;
  return (
    <>
      <TextField label="Type" select size="small" fullWidth value={revolveType}
        onChange={e => onUpdate({ revolveType: e.target.value as RevolveType })} sx={{ mb: 1.5 }}>
        <MenuItem value="dimension">Dimension</MenuItem>
        <MenuItem value="symmetric">Symmetric</MenuItem>
        <MenuItem value="through_all">Through All (360°)</MenuItem>
      </TextField>

      <TextField label="Axis" select size="small" fullWidth value={axis}
        onChange={e => onUpdate({ axis: e.target.value as RevolveAxis })} sx={{ mb: 1.5 }}>
        <MenuItem value="sketch_vertical">Vertical sketch axis</MenuItem>
        <MenuItem value="sketch_horizontal">Horizontal sketch axis</MenuItem>
        <MenuItem value="X">X axis</MenuItem>
        <MenuItem value="Y">Y axis</MenuItem>
        <MenuItem value="Z">Z axis</MenuItem>
      </TextField>

      {revolveType !== 'through_all' && (
        <NumField label="Angle (°)" value={f.angle}
          onChange={v => onUpdate({ angle: Math.max(1, Math.min(360, v)) })} min={1} max={360} step={5} />
      )}

      {revolveType === 'dimension' && (
        <FormControlLabel
          control={<Switch size="small" checked={symmetric} onChange={e => onUpdate({ symmetric: e.target.checked })} />}
          label="Symmetric to plane" sx={{ mb: 0.5 }}
        />
      )}

      <FormControlLabel
        control={<Switch size="small" checked={reversed} onChange={e => onUpdate({ reversed: e.target.checked })} />}
        label="Reversed" sx={{ mb: 1 }}
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

      <List dense disablePadding sx={{ mb: 1 }}>
        {sections.map((sec, idx) => {
          const sk = sketches.find(s => s.id === sec.sketchId);
          return (
            <ListItem key={sec.sketchId} disablePadding
              sx={{ borderLeft: '2px solid', borderColor: 'primary.main', pl: 1, mb: 0.25 }}
              secondaryAction={
                <IconButton size="small" edge="end"
                  onClick={() => onUpdate({ sections: sections.filter((_, i) => i !== idx) })}>
                  <DeleteIcon fontSize="inherit" />
                </IconButton>
              }
            >
              <ListItemText
                primary={sk?.name ?? `Section ${idx + 1}`}
                primaryTypographyProps={{ variant: 'body2', noWrap: true }}
              />
            </ListItem>
          );
        })}
      </List>

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

function GrooveProps({ f, onUpdate }: { f: GrooveFeature; onUpdate: (p: Partial<Feature>) => void }) {
  return <RevolveProps f={f as unknown as RevolveFeature} onUpdate={onUpdate} />;
}

function LoftCutProps({ f, features, onUpdate }: { f: LoftCutFeature; features: Feature[]; onUpdate: (p: Partial<Feature>) => void }) {
  return <LoftProps f={f as unknown as LoftFeature} features={features} onUpdate={onUpdate} />;
}

function SweepCutProps({ f, features, onUpdate }: { f: SweepCutFeature; features: Feature[]; onUpdate: (p: Partial<Feature>) => void }) {
  return <SweepProps f={f as unknown as SweepFeature} features={features} onUpdate={onUpdate} />;
}

function HoleProps({ f, onUpdate }: { f: HoleFeature; onUpdate: (p: Partial<Feature>) => void }) {
  const depthType   = f.depthType   ?? 'dimension';
  const counterType = f.counterType ?? 'none';
  const drillPoint  = f.drillPoint  ?? 'angled';
  return (
    <>
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

export function FeaturePropsPanel({ feature, features, onUpdate, onEditSketch }: Props) {
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
        {feature.type === 'extrude' && <ExtrudeProps f={feature as ExtrudeFeature} onUpdate={up} />}
        {feature.type === 'pocket'  && <PocketProps  f={feature as PocketFeature}  onUpdate={up} />}
        {feature.type === 'hole'    && <HoleProps    f={feature as HoleFeature}    onUpdate={up} />}
        {feature.type === 'groove'   && <GrooveProps   f={feature as GrooveFeature}                    onUpdate={up} />}
        {feature.type === 'loft_cut' && <LoftCutProps  f={feature as LoftCutFeature} features={features} onUpdate={up} />}
        {feature.type === 'mirror'  && <MirrorProps  f={feature as MirrorFeature}  onUpdate={up} />}
        {feature.type === 'revolve' && <RevolveProps f={feature as RevolveFeature} onUpdate={up} />}
        {feature.type === 'shell'   && <ShellProps   f={feature as ShellFeature}   onUpdate={up} />}
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
