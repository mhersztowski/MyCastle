import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary,
  Alert, Box, Button, Chip, CircularProgress,
  Collapse, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControl, IconButton, InputAdornment, InputLabel,
  MenuItem, Paper,
  Select, Snackbar, Tab, Table, TableBody, TableCell,
  TableHead, TableRow, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import DateRangeIcon from '@mui/icons-material/DateRange';
import DirectionsRunIcon from '@mui/icons-material/DirectionsRun';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { v4 as uuidv4 } from 'uuid';
import { useFilesystem } from '../../modules/filesystem';

// ─── Types ───────────────────────────────────────────────────────────────────

const HEALTH_PATH = 'data/health.json';

type ExerciseCategory = 'calisthenics' | 'kettlebell' | 'dumbbell' | 'barbell' | 'other';

interface ExerciseDef {
  id: string;
  name: string;
  category: ExerciseCategory;
  plannedSetReps: number[];   // one entry per set, e.g. [12, 10, 8]
  plannedWeight?: number;
  description?: string;
  photo?: string;             // base64 data URL or external image URL
  notes?: string;
}

interface TrainingProgram {
  id: string;
  name: string;
  description?: string;
  exercises: ExerciseDef[];
  scheduledDays: number[]; // 0=Mon … 6=Sun
}

interface WorkoutSetLog { reps: number; weight?: number }
interface WorkoutExerciseLog { exerciseDefId: string; sets: WorkoutSetLog[]; notes?: string }
interface WorkoutSession {
  id: string;
  date: string;
  programId?: string;
  exercises: WorkoutExerciseLog[];
  notes?: string;
}

interface HealthData {
  type: 'health_data';
  programs: TrainingProgram[];
  sessions: WorkoutSession[];
}

// ─── Constants & Helpers ─────────────────────────────────────────────────────

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  calisthenics: 'Kalistenika', kettlebell: 'Kettlebell',
  dumbbell: 'Hantle', barbell: 'Sztanga', other: 'Inne',
};
const CATEGORY_COLORS: Record<ExerciseCategory, 'primary'|'warning'|'success'|'error'|'default'> = {
  calisthenics: 'primary', kettlebell: 'warning',
  dumbbell: 'success', barbell: 'error', other: 'default',
};

function todayIso() { return new Date().toISOString().slice(0, 10); }
function todayDayIndex() { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; }
function formatDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });
}
function weekStart(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
  return d.toISOString().slice(0, 10);
}
function weekLabel(startStr: string) {
  const s = new Date(startStr + 'T12:00:00');
  const e = new Date(startStr + 'T12:00:00');
  e.setDate(e.getDate() + 6);
  const f = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${f(s)} – ${f(e)}`;
}
function displayPlan(def: ExerciseDef): string {
  const r = def.plannedSetReps;
  if (r.length === 0) return '—';
  const allSame = r.every(x => x === r[0]);
  const weightStr = def.plannedWeight ? ` @ ${def.plannedWeight} kg` : '';
  return allSame
    ? `${r.length} × ${r[0]}${weightStr}`
    : `${r.map((x, i) => `${i + 1}:${x}`).join(' / ')}${weightStr}`;
}

function getAllExercises(programs: TrainingProgram[]): ExerciseDef[] {
  return programs.flatMap(p => p.exercises);
}
function findExercise(programs: TrainingProgram[], id: string): ExerciseDef | undefined {
  for (const p of programs) { const e = p.exercises.find(x => x.id === id); if (e) return e; }
}

// ─── ExerciseDialog ───────────────────────────────────────────────────────────

interface ExerciseDialogProps {
  open: boolean; onClose: () => void;
  onSave: (def: ExerciseDef) => void;
  initial?: ExerciseDef | null;
}
const ExerciseDialog: React.FC<ExerciseDialogProps> = ({ open, onClose, onSave, initial }) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ExerciseCategory>('calisthenics');
  const [setReps, setSetReps] = useState<number[]>([10, 10, 10]);
  const [weight, setWeight] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setCategory(initial?.category ?? 'calisthenics');
      setSetReps(initial?.plannedSetReps?.length ? [...initial.plannedSetReps] : [10, 10, 10]);
      setWeight(initial?.plannedWeight?.toString() ?? '');
      setDescription(initial?.description ?? '');
      setPhoto(initial?.photo);
      setNotes(initial?.notes ?? '');
    }
  }, [open, initial]);

  const updateRep = (idx: number, val: string) =>
    setSetReps(prev => prev.map((r, i) => i === idx ? (parseInt(val) || 0) : r));
  const addSet = () => setSetReps(prev => [...prev, prev[prev.length - 1] ?? 10]);
  const removeSet = (idx: number) => setSetReps(prev => prev.filter((_, i) => i !== idx));

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPhoto(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!name.trim() || setReps.length === 0) return;
    onSave({
      id: initial?.id ?? uuidv4(), name: name.trim(), category,
      plannedSetReps: setReps,
      plannedWeight: weight ? parseFloat(weight) : undefined,
      description: description.trim() || undefined,
      photo,
      notes: notes.trim() || undefined,
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial ? 'Edit Exercise' : 'Add Exercise'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>

          {/* Photo + name row */}
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
            <Box sx={{ flexShrink: 0 }}>
              <Box
                onClick={() => fileInputRef.current?.click()}
                sx={{
                  width: 88, height: 88, borderRadius: 2, border: '2px dashed', borderColor: 'divider',
                  cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  bgcolor: 'action.hover', '&:hover': { borderColor: 'primary.main' }, flexShrink: 0,
                }}
              >
                {photo
                  ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', px: 0.5 }}>Add photo</Typography>
                }
              </Box>
              {photo && (
                <Button size="small" color="error" onClick={() => setPhoto(undefined)} sx={{ mt: 0.5, minWidth: 88, fontSize: 11 }}>
                  Remove
                </Button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
            </Box>

            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <TextField label="Name" value={name} onChange={e => setName(e.target.value)} required autoFocus size="small" />
              <FormControl size="small">
                <InputLabel>Category</InputLabel>
                <Select value={category} onChange={e => setCategory(e.target.value as ExerciseCategory)} label="Category">
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                </Select>
              </FormControl>
            </Box>
          </Box>

          <TextField
            label="Photo URL"
            value={photo && !photo.startsWith('data:') ? photo : ''}
            onChange={e => setPhoto(e.target.value || undefined)}
            size="small"
            placeholder="https://… (or use the thumbnail above to upload a file)"
            helperText={photo?.startsWith('data:') ? 'Uploaded file in use — clear it to paste a URL instead' : undefined}
            disabled={photo?.startsWith('data:')}
          />

          <TextField
            label="Description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            size="small"
            multiline
            rows={2}
            placeholder="How to perform the exercise, key cues, common mistakes…"
          />

          <TextField label="Weight" value={weight} onChange={e => setWeight(e.target.value)} size="small" type="number" sx={{ maxWidth: 200 }}
            InputProps={{ endAdornment: <InputAdornment position="end">kg</InputAdornment> }}
            placeholder={category === 'calisthenics' ? 'bodyweight' : ''} />

          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Planned sets — reps per set
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ py: 0.5, width: 60 }}>Set</TableCell>
                  <TableCell sx={{ py: 0.5 }}>Reps</TableCell>
                  <TableCell sx={{ py: 0.5, width: 40 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {setReps.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell sx={{ py: 0.5 }}>
                      <Typography variant="body2" color="text.secondary">{idx + 1}</Typography>
                    </TableCell>
                    <TableCell sx={{ py: 0.5 }}>
                      <TextField value={r} onChange={e => updateRep(idx, e.target.value)}
                        size="small" type="number" sx={{ width: 90 }} inputProps={{ min: 0 }} />
                    </TableCell>
                    <TableCell sx={{ py: 0.5 }}>
                      <IconButton size="small" onClick={() => removeSet(idx)} disabled={setReps.length <= 1}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Button size="small" startIcon={<AddIcon />} onClick={addSet} sx={{ mt: 0.5 }}>Add set</Button>
          </Box>

          <TextField label="Notes" value={notes} onChange={e => setNotes(e.target.value)} size="small" multiline rows={2}
            placeholder="Progression notes, form reminders…" />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!name.trim() || setReps.length === 0}>
          {initial ? 'Save' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── ProgramDialog ────────────────────────────────────────────────────────────

interface ProgramDialogProps {
  open: boolean; onClose: () => void;
  onSave: (name: string, description: string) => void;
  initial?: TrainingProgram | null;
}
const ProgramDialog: React.FC<ProgramDialogProps> = ({ open, onClose, onSave, initial }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (open) { setName(initial?.name ?? ''); setDescription(initial?.description ?? ''); }
  }, [open, initial]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{initial ? 'Edit Program' : 'New Program'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField label="Program name" value={name} onChange={e => setName(e.target.value)} required autoFocus size="small"
            placeholder="e.g. Kalistenika, Siłownia, Full Body" />
          <TextField label="Description" value={description} onChange={e => setDescription(e.target.value)} size="small" multiline rows={2} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={() => { if (name.trim()) { onSave(name.trim(), description.trim()); onClose(); } }}
          variant="contained" disabled={!name.trim()}>
          {initial ? 'Save' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── SessionDialog ────────────────────────────────────────────────────────────

interface SessionEntry { exerciseDefId: string; sets: Array<{reps: string; weight: string}> }

interface SessionDialogProps {
  open: boolean; onClose: () => void;
  onSave: (session: WorkoutSession) => void;
  programs: TrainingProgram[];
}
const SessionDialog: React.FC<SessionDialogProps> = ({ open, onClose, onSave, programs }) => {
  const [date, setDate] = useState(todayIso());
  const [programId, setProgramId] = useState('');
  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const [sessionNotes, setSessionNotes] = useState('');
  const [photoZoom, setPhotoZoom] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDate(todayIso());
    setSessionNotes('');
    // Pre-select today's program
    const todayIdx = todayDayIndex();
    const todayProg = programs.find(p => p.scheduledDays.includes(todayIdx));
    const pid = todayProg?.id ?? (programs[0]?.id ?? '');
    setProgramId(pid);
    const prog = programs.find(p => p.id === pid);
    setEntries(prog ? prog.exercises.map(def => ({
      exerciseDefId: def.id,
      sets: def.plannedSetReps.map(r => ({ reps: String(r), weight: def.plannedWeight ? String(def.plannedWeight) : '' })),
    })) : []);
  }, [open, programs]);

  const handlePickProgram = (pid: string) => {
    setProgramId(pid);
    const prog = programs.find(p => p.id === pid);
    setEntries(prog ? prog.exercises.map(def => ({
      exerciseDefId: def.id,
      sets: def.plannedSetReps.map(r => ({ reps: String(r), weight: def.plannedWeight ? String(def.plannedWeight) : '' })),
    })) : []);
  };

  const allExercises = getAllExercises(programs);
  const updateSet = (ei: number, si: number, field: 'reps'|'weight', val: string) =>
    setEntries(prev => prev.map((e, i) => i !== ei ? e : { ...e, sets: e.sets.map((s, j) => j !== si ? s : { ...s, [field]: val }) }));
  const addSet = (ei: number) => {
    const def = findExercise(programs, entries[ei].exerciseDefId);
    setEntries(prev => prev.map((e, i) => i !== ei ? e : {
      ...e, sets: [...e.sets, { reps: String(def?.plannedSetReps?.[e.sets.length] ?? def?.plannedSetReps?.[0] ?? 10), weight: def?.plannedWeight ? String(def.plannedWeight) : '' }],
    }));
  };
  const removeSet = (ei: number, si: number) =>
    setEntries(prev => prev.map((e, i) => i !== ei ? e : { ...e, sets: e.sets.filter((_, j) => j !== si) }));
  const removeExercise = (ei: number) => setEntries(prev => prev.filter((_, i) => i !== ei));

  const handleSave = () => {
    onSave({
      id: uuidv4(), date, programId: programId || undefined,
      exercises: entries.filter(e => e.sets.length > 0).map(e => ({
        exerciseDefId: e.exerciseDefId,
        sets: e.sets.map(s => ({ reps: parseInt(s.reps) || 0, weight: s.weight ? parseFloat(s.weight) : undefined })),
      })),
      notes: sessionNotes.trim() || undefined,
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>New Workout Session</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Date" type="date" value={date} onChange={e => setDate(e.target.value)}
              size="small" sx={{ maxWidth: 200 }} InputLabelProps={{ shrink: true }} />
            {programs.length > 0 && (
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>Program</InputLabel>
                <Select value={programId} onChange={e => handlePickProgram(e.target.value as string)} label="Program">
                  <MenuItem value="">— freeform —</MenuItem>
                  {programs.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </Select>
              </FormControl>
            )}
          </Box>

          {entries.map((entry, ei) => {
            const def = findExercise(programs, entry.exerciseDefId) ?? allExercises.find(x => x.id === entry.exerciseDefId);
            return (
              <Paper key={ei} variant="outlined" sx={{ p: 1.5 }}>
                {/* Header: photo + info side by side */}
                <Box sx={{ display: 'flex', gap: 1.5, mb: 1, alignItems: 'flex-start' }}>
                  {def?.photo && (
                    <Box
                      onClick={() => setPhotoZoom(def.photo!)}
                      sx={{
                        flexShrink: 0, width: 96, height: 96, borderRadius: 1.5,
                        overflow: 'hidden', cursor: 'zoom-in',
                        '&:hover': { opacity: 0.82, outline: '2px solid', outlineColor: 'primary.main' },
                      }}
                    >
                      <img src={def.photo} alt={def.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </Box>
                  )}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                      <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>{def?.name ?? '?'}</Typography>
                      {def && <Chip label={CATEGORY_LABELS[def.category]} color={CATEGORY_COLORS[def.category]} size="small" />}
                      <IconButton size="small" color="error" onClick={() => removeExercise(ei)}><DeleteIcon fontSize="small" /></IconButton>
                    </Box>
                    {def && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        Plan: {displayPlan(def)}{!def.plannedWeight ? ' (waga ciała)' : ''}
                      </Typography>
                    )}
                    {def?.description && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, fontStyle: 'italic' }}>
                        {def.description}
                      </Typography>
                    )}
                  </Box>
                </Box>
                {/* Sets table — full width below */}
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ py: 0.5, width: 40 }}>#</TableCell>
                      <TableCell sx={{ py: 0.5 }}>Reps</TableCell>
                      <TableCell sx={{ py: 0.5 }}>Weight kg</TableCell>
                      <TableCell sx={{ py: 0.5, width: 40 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {entry.sets.map((s, si) => (
                      <TableRow key={si}>
                        <TableCell sx={{ py: 0.5 }}><Typography variant="body2" color="text.secondary">{si + 1}</Typography></TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <TextField value={s.reps} onChange={e => updateSet(ei, si, 'reps', e.target.value)} size="small" type="number" sx={{ width: 90 }} inputProps={{ min: 0 }} />
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <TextField value={s.weight} onChange={e => updateSet(ei, si, 'weight', e.target.value)} size="small" type="number" sx={{ width: 110 }} inputProps={{ min: 0, step: 0.5 }} placeholder={def?.category === 'calisthenics' ? 'bw' : ''} />
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <IconButton size="small" onClick={() => removeSet(ei, si)} disabled={entry.sets.length <= 1}><DeleteIcon fontSize="small" /></IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Button size="small" startIcon={<AddIcon />} onClick={() => addSet(ei)} sx={{ mt: 0.5 }}>Add set</Button>
              </Paper>
            );
          })}

          <TextField label="Session notes" value={sessionNotes} onChange={e => setSessionNotes(e.target.value)} size="small" multiline rows={2} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={entries.length === 0 || entries.every(e => e.sets.length === 0)}>
          Log Session
        </Button>
      </DialogActions>

      {/* Photo zoom lightbox */}
      <Dialog open={!!photoZoom} onClose={() => setPhotoZoom(null)} maxWidth="lg"
        PaperProps={{ sx: { bgcolor: 'black', boxShadow: 'none' } }}>
        <Box onClick={() => setPhotoZoom(null)} sx={{ cursor: 'zoom-out', display: 'flex', alignItems: 'center', justifyContent: 'center', maxHeight: '90vh' }}>
          {photoZoom && <img src={photoZoom} alt="" style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', display: 'block' }} />}
        </Box>
      </Dialog>
    </Dialog>
  );
};

// ─── SessionCard ──────────────────────────────────────────────────────────────

interface SessionCardProps {
  session: WorkoutSession;
  programs: TrainingProgram[];
  onDelete: () => void;
}
const SessionCard: React.FC<SessionCardProps> = ({ session, programs, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const prog = programs.find(p => p.id === session.programId);

  return (
    <Paper variant="outlined" sx={{ mb: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', p: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
        onClick={() => setExpanded(v => !v)}>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle1" fontWeight={600}>{formatDate(session.date)}</Typography>
            {prog && <Chip label={prog.name} size="small" color="primary" variant="outlined" />}
          </Box>
          <Typography variant="body2" color="text.secondary">
            {session.exercises.length} exercise{session.exercises.length !== 1 ? 's' : ''}: {session.exercises.map(e => findExercise(programs, e.exerciseDefId)?.name ?? '?').join(', ')}
          </Typography>
        </Box>
        <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={ev => { ev.stopPropagation(); onDelete(); }} sx={{ flexShrink: 0 }}>
          Delete
        </Button>
        {expanded ? <ExpandLessIcon fontSize="small" sx={{ ml: 0.5 }} /> : <ExpandMoreIcon fontSize="small" sx={{ ml: 0.5 }} />}
      </Box>
      <Collapse in={expanded}>
        <Divider />
        <Box sx={{ p: 1.5 }}>
          {session.exercises.map((ex, i) => {
            const def = findExercise(programs, ex.exerciseDefId);
            return (
              <Box key={i} sx={{ mb: i < session.exercises.length - 1 ? 2 : 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="subtitle2" fontWeight={600}>{def?.name ?? '?'}</Typography>
                  {def && <Chip label={CATEGORY_LABELS[def.category]} color={CATEGORY_COLORS[def.category]} size="small" />}
                </Box>
                {def && (
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                    Plan: {displayPlan(def)}{!def.plannedWeight ? ' (waga ciała)' : ''}
                  </Typography>
                )}
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ py: 0.25, fontWeight: 600 }}>#</TableCell>
                      <TableCell sx={{ py: 0.25, fontWeight: 600 }}>Reps</TableCell>
                      <TableCell sx={{ py: 0.25, fontWeight: 600 }}>Weight</TableCell>
                      <TableCell sx={{ py: 0.25, fontWeight: 600 }}>vs plan</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {ex.sets.map((s, si) => {
                      const repOk = def ? s.reps >= (def.plannedSetReps[si] ?? def.plannedSetReps[0] ?? 0) : true;
                      const wOk = !def?.plannedWeight || (s.weight != null && s.weight >= def.plannedWeight);
                      return (
                        <TableRow key={si}>
                          <TableCell sx={{ py: 0.25 }}>{si + 1}</TableCell>
                          <TableCell sx={{ py: 0.25 }}><Typography variant="body2" color={repOk ? 'success.main' : 'error.main'}>{s.reps}</Typography></TableCell>
                          <TableCell sx={{ py: 0.25 }}><Typography variant="body2" color={wOk ? 'success.main' : 'error.main'}>{s.weight != null ? `${s.weight} kg` : 'bw'}</Typography></TableCell>
                          <TableCell sx={{ py: 0.25 }}>{repOk && wOk ? <Chip label="✓" size="small" color="success" /> : <Chip label="below" size="small" color="warning" />}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>
            );
          })}
          {session.notes && <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>{session.notes}</Typography>}
        </Box>
      </Collapse>
    </Paper>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const HealthPage: React.FC = () => {
  const { readFile, writeFile, isDataLoaded } = useFilesystem();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [tab, setTab] = useState(0);

  // Gate that prevents auto-save from overwriting on-disk data before the
  // initial read has completed. Set to true only after readFile finishes.
  const hasLoadedRef = useRef(false);

  // Debounced save — reads latest data from ref so closures never go stale
  const saveDataRef = useRef<{ programs: TrainingProgram[]; sessions: WorkoutSession[] }>({ programs: [], sessions: [] });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writeFileRef = useRef(writeFile);
  useEffect(() => { writeFileRef.current = writeFile; }, [writeFile]);

  const scheduleSave = useCallback((programs: TrainingProgram[], sessions: WorkoutSession[]) => {
    if (!hasLoadedRef.current) return;
    saveDataRef.current = { programs, sessions };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      console.log('[Health] saving to', HEALTH_PATH, { programs: saveDataRef.current.programs.length, sessions: saveDataRef.current.sessions.length });
      try {
        const result = await writeFileRef.current(
          HEALTH_PATH,
          JSON.stringify({ type: 'health_data', ...saveDataRef.current } satisfies HealthData, null, 2),
        );
        console.log('[Health] writeFile result:', result);
        if (result !== null) {
          setSavedAt(new Date());
        } else {
          setSnackbar({ open: true, message: 'Save failed — check connection', severity: 'error' });
        }
      } catch (err) {
        console.error('[Health] writeFile threw:', err);
        setSnackbar({ open: true, message: 'Save failed', severity: 'error' });
      } finally {
        setSaving(false);
      }
    }, 800);
  }, []);
  const [programs, setPrograms] = useState<TrainingProgram[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);

  // Dialog state
  const [programDialog, setProgramDialog] = useState<{ open: boolean; prog: TrainingProgram | null }>({ open: false, prog: null });
  const [exDialog, setExDialog] = useState<{ open: boolean; programId: string; ex: ExerciseDef | null }>({ open: false, programId: '', ex: null });
  const [sessionDialog, setSessionDialog] = useState(false);
  const [deleteProgram, setDeleteProgram] = useState<string | null>(null);
  const [deleteSession, setDeleteSession] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success'|'error' }>({ open: false, message: '', severity: 'success' });

  // Load — wait until FilesystemService has built the directory tree, otherwise
  // readFile returns null even when the file exists on disk, and the first
  // auto-save would clobber it with an empty/partial state.
  useEffect(() => {
    if (!isDataLoaded || hasLoadedRef.current) return;
    readFile(HEALTH_PATH).then(file => {
      if (file) {
        try {
          const data: HealthData = JSON.parse(file.toString());
          setPrograms(data.programs ?? []);
          setSessions(data.sessions ?? []);
        } catch { /* fresh */ }
      }
    }).finally(() => {
      hasLoadedRef.current = true;
      setLoading(false);
    });
  }, [readFile, isDataLoaded]);


  // Program CRUD
  const handleSaveProgram = useCallback((name: string, desc: string) => {
    const editing = programDialog.prog;
    const next = editing
      ? programs.map(p => p.id === editing.id ? { ...p, name, description: desc || undefined } : p)
      : [...programs, { id: uuidv4(), name, description: desc || undefined, exercises: [], scheduledDays: [] }];
    setPrograms(next);
    scheduleSave(next, sessions);
  }, [programDialog.prog, programs, sessions, scheduleSave]);

  const toggleScheduledDay = useCallback((programId: string, day: number) => {
    const next = programs.map(p => p.id !== programId ? p : {
      ...p,
      scheduledDays: p.scheduledDays.includes(day) ? p.scheduledDays.filter(d => d !== day) : [...p.scheduledDays, day].sort(),
    });
    setPrograms(next);
    scheduleSave(next, sessions);
  }, [programs, sessions, scheduleSave]);

  // Exercise CRUD within program
  const handleSaveExercise = useCallback((def: ExerciseDef) => {
    const pid = exDialog.programId;
    const next = programs.map(p => p.id !== pid ? p : {
      ...p,
      exercises: p.exercises.some(e => e.id === def.id)
        ? p.exercises.map(e => e.id === def.id ? def : e)
        : [...p.exercises, def],
    });
    setPrograms(next);
    scheduleSave(next, sessions);
  }, [exDialog.programId, programs, sessions, scheduleSave]);

  const handleDeleteExercise = useCallback((programId: string, exId: string) => {
    const next = programs.map(p => p.id !== programId ? p : { ...p, exercises: p.exercises.filter(e => e.id !== exId) });
    setPrograms(next);
    scheduleSave(next, sessions);
  }, [programs, sessions, scheduleSave]);

  // Session CRUD
  const handleAddSession = useCallback((session: WorkoutSession) => {
    const next = [session, ...sessions].sort((a, b) => b.date.localeCompare(a.date));
    setSessions(next);
    scheduleSave(programs, next);
  }, [programs, sessions, scheduleSave]);

  // Export
  const buildProgramText = useCallback(() => {
    const lines: string[] = ['=== PROGRAMY TRENINGOWE ==='];
    programs.forEach((prog, pi) => {
      lines.push(`\n${pi + 1}. ${prog.name}${prog.description ? ` — ${prog.description}` : ''}`);
      const days = prog.scheduledDays.map(d => DAY_NAMES[d]).join(', ');
      if (days) lines.push(`   Zaplanowane dni: ${days}`);
      prog.exercises.forEach(ex => {
        lines.push(`   • ${ex.name} [${CATEGORY_LABELS[ex.category]}]: ${displayPlan(ex)}${!ex.plannedWeight ? ' (waga ciała)' : ''}`);
      });
    });
    return lines.join('\n');
  }, [programs]);

  const buildWorkoutLogText = useCallback(() => {
    const lines: string[] = ['=== DZIENNIK TRENINGÓW ==='];
    sessions.forEach(sess => {
      const prog = programs.find(p => p.id === sess.programId);
      lines.push(`\n📅 ${formatDate(sess.date)}${prog ? ` [${prog.name}]` : ''}`);
      sess.exercises.forEach(ex => {
        const def = findExercise(programs, ex.exerciseDefId);
        lines.push(`  ▸ ${def?.name ?? '?'}`);
        if (def) lines.push(`    Plan: ${displayPlan(def)}`);
        ex.sets.forEach((s, si) => {
          const wStr = s.weight != null ? `@ ${s.weight} kg` : '(waga ciała)';
          const repOk = def ? s.reps >= (def.plannedSetReps[si] ?? def.plannedSetReps[0] ?? 0) : true;
          const wOk = !def?.plannedWeight || (s.weight != null && s.weight >= def.plannedWeight);
          lines.push(`    Seria ${si + 1}: ${s.reps} powt. ${wStr} ${repOk && wOk ? '✓' : '✗'}`);
        });
      });
    });
    return lines.join('\n');
  }, [programs, sessions]);

  const handleExportProgram = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildProgramText());
      setSnackbar({ open: true, message: 'Program copied to clipboard', severity: 'success' });
    } catch { setSnackbar({ open: true, message: 'Failed to copy', severity: 'error' }); }
  }, [buildProgramText]);

  const handleExportWorkoutLog = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildWorkoutLogText());
      setSnackbar({ open: true, message: 'Workout log copied to clipboard', severity: 'success' });
    } catch { setSnackbar({ open: true, message: 'Failed to copy', severity: 'error' }); }
  }, [buildWorkoutLogText]);

  // Weekly summary
  interface WeekAgg { start: string; sessions: WorkoutSession[] }
  const weekAggs = useMemo((): WeekAgg[] => {
    const map = new Map<string, WorkoutSession[]>();
    const tw = weekStart(todayIso());
    map.set(tw, []);
    for (const s of sessions) {
      const ws = weekStart(s.date);
      if (!map.has(ws)) map.set(ws, []);
      map.get(ws)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([start, ss]) => ({ start, sessions: ss }));
  }, [sessions]);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: 2, maxWidth: 960, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
        <FitnessCenterIcon color="primary" />
        <Typography variant="h5" sx={{ flex: 1 }}>Health &amp; Fitness</Typography>
        <Button variant="outlined" size="small" startIcon={<ContentCopyIcon />} onClick={handleExportProgram}>Export Program</Button>
        <Button variant="outlined" size="small" startIcon={<ContentCopyIcon />} onClick={handleExportWorkoutLog}>Export Workout Log</Button>
        {saving
          ? <Chip icon={<CircularProgress size={12} />} label="Saving…" size="small" variant="outlined" />
          : savedAt && <Chip icon={<CheckCircleOutlineIcon />} label={`Saved ${savedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`} size="small" color="success" variant="outlined" />
        }
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label={`Programs (${programs.length})`} icon={<DirectionsRunIcon />} iconPosition="start" />
          <Tab label="Weekly Plan" icon={<DateRangeIcon />} iconPosition="start" />
          <Tab label={`Workout Log (${sessions.length})`} icon={<FitnessCenterIcon />} iconPosition="start" />
        </Tabs>
      </Paper>

      {/* ── Programs ── */}
      {tab === 0 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setProgramDialog({ open: true, prog: null })}>New Program</Button>
          </Box>

          {programs.length === 0 ? (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <FitnessCenterIcon sx={{ fontSize: 64, color: 'grey.300', mb: 2 }} />
              <Typography color="text.secondary">No programs yet. Create your first training program!</Typography>
            </Paper>
          ) : (
            programs.map(prog => (
              <Accordion key={prog.id} sx={{ mb: 1 }} defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, pr: 1, flexWrap: 'wrap' }}>
                    <Typography variant="subtitle1" fontWeight={700}>{prog.name}</Typography>
                    {prog.description && <Typography variant="body2" color="text.secondary">{prog.description}</Typography>}
                    <Box sx={{ display: 'flex', gap: 0.5, ml: 'auto', flexWrap: 'wrap' }}>
                      {DAY_SHORT.map((d, idx) => (
                        <Chip
                          key={idx}
                          label={d}
                          size="small"
                          color={prog.scheduledDays.includes(idx) ? 'primary' : 'default'}
                          variant={prog.scheduledDays.includes(idx) ? 'filled' : 'outlined'}
                          onClick={ev => { ev.stopPropagation(); toggleScheduledDay(prog.id, idx); }}
                          sx={{ cursor: 'pointer', fontSize: 11, height: 22 }}
                        />
                      ))}
                    </Box>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  {prog.exercises.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>No exercises in this program yet.</Typography>
                  ) : (
                    <Table size="small" sx={{ mb: 1 }}>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ width: 56 }} />
                          <TableCell>Exercise</TableCell>
                          <TableCell>Category</TableCell>
                          <TableCell>Plan</TableCell>
                          <TableCell>Weight</TableCell>
                          <TableCell align="right" />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {prog.exercises.map(ex => (
                          <TableRow key={ex.id} hover sx={{ verticalAlign: 'top' }}>
                            <TableCell sx={{ py: 0.75 }}>
                              {ex.photo
                                ? <Box sx={{ width: 44, height: 44, borderRadius: 1, overflow: 'hidden' }}>
                                    <img src={ex.photo} alt={ex.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  </Box>
                                : <Box sx={{ width: 44, height: 44, borderRadius: 1, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <FitnessCenterIcon sx={{ fontSize: 20, color: 'text.disabled' }} />
                                  </Box>
                              }
                            </TableCell>
                            <TableCell sx={{ py: 0.75 }}>
                              <Typography variant="body2" fontWeight={600}>{ex.name}</Typography>
                              {ex.description && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', maxWidth: 240 }}>{ex.description}</Typography>}
                            </TableCell>
                            <TableCell sx={{ py: 0.75 }}><Chip label={CATEGORY_LABELS[ex.category]} color={CATEGORY_COLORS[ex.category]} size="small" /></TableCell>
                            <TableCell sx={{ py: 0.75 }}><Typography variant="body2">{displayPlan(ex)}</Typography></TableCell>
                            <TableCell sx={{ py: 0.75 }}><Typography variant="body2">{ex.plannedWeight ? `${ex.plannedWeight} kg` : <span style={{ color: '#999' }}>bw</span>}</Typography></TableCell>
                            <TableCell align="right" sx={{ py: 0.75 }}>
                              <Tooltip title="Edit"><IconButton size="small" onClick={() => setExDialog({ open: true, programId: prog.id, ex })}><EditIcon fontSize="small" /></IconButton></Tooltip>
                              <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => handleDeleteExercise(prog.id, ex.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
                    <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setExDialog({ open: true, programId: prog.id, ex: null })}>
                      Add exercise
                    </Button>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button size="small" startIcon={<EditIcon />} onClick={() => setProgramDialog({ open: true, prog })}>
                        Edit program
                      </Button>
                      <Button size="small" color="error" variant="outlined" startIcon={<DeleteIcon />} onClick={() => setDeleteProgram(prog.id)}>
                        Delete program
                      </Button>
                    </Box>
                  </Box>
                </AccordionDetails>
              </Accordion>
            ))
          )}
        </Box>
      )}

      {/* ── Weekly Plan ── */}
      {tab === 1 && (
        <Box>
          {/* This week's day view */}
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>This week — {weekLabel(weekStart(todayIso()))}</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 3 }}>
            {DAY_NAMES.map((dayName, dayIdx) => {
              const isToday = dayIdx === todayDayIndex();
              const dayProgs = programs.filter(p => p.scheduledDays.includes(dayIdx));
              return (
                <Paper key={dayIdx} variant="outlined"
                  sx={{ px: 2, py: 1, display: 'flex', alignItems: 'flex-start', gap: 2,
                    border: isToday ? 2 : 1, borderColor: isToday ? 'primary.main' : 'divider' }}>
                  <Typography variant="body2" fontWeight={isToday ? 700 : 500} color={isToday ? 'primary' : 'text.primary'}
                    sx={{ minWidth: 100, pt: 0.5 }}>
                    {dayName}{isToday && <Chip label="today" size="small" color="primary" sx={{ ml: 1, height: 18, fontSize: 10 }} />}
                  </Typography>
                  {dayProgs.length > 0 ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
                      {dayProgs.map(prog => (
                        <Box key={prog.id}>
                          <Typography variant="body2" fontWeight={600}>{prog.name}</Typography>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                            {prog.exercises.map(ex => (
                              <Chip key={ex.id} label={`${ex.name} ${displayPlan(ex)}`}
                                color={CATEGORY_COLORS[ex.category]} size="small" variant="outlined" />
                            ))}
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic', pt: 0.5 }}>rest day</Typography>
                  )}
                </Paper>
              );
            })}
          </Box>

          {/* Historical weeks */}
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Progress by week</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {weekAggs.map(week => {
              const isCurrent = week.start === weekStart(todayIso());
              const sessionsByProg = new Map<string, number>();
              week.sessions.forEach(s => {
                const pid = s.programId ?? '__none__';
                sessionsByProg.set(pid, (sessionsByProg.get(pid) ?? 0) + 1);
              });
              // which programs were planned this week
              const plannedProgs = programs.filter(p => p.scheduledDays.length > 0);
              return (
                <Paper key={week.start} variant="outlined"
                  sx={{ border: isCurrent ? 2 : 1, borderColor: isCurrent ? 'primary.main' : 'divider' }}>
                  <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1,
                    bgcolor: isCurrent ? 'primary.main' : 'action.hover', borderRadius: '3px 3px 0 0' }}>
                    <Typography variant="subtitle2" fontWeight={700} color={isCurrent ? 'primary.contrastText' : 'text.primary'}>
                      {weekLabel(week.start)}
                    </Typography>
                    {isCurrent && <Chip label="current" size="small" sx={{ bgcolor: 'primary.light', color: 'primary.contrastText', height: 18, fontSize: 10 }} />}
                    <Typography variant="caption" color={isCurrent ? 'primary.contrastText' : 'text.secondary'} sx={{ ml: 'auto' }}>
                      {week.sessions.length} session{week.sessions.length !== 1 ? 's' : ''}
                    </Typography>
                  </Box>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Program</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Exercises done</TableCell>
                        <TableCell sx={{ fontWeight: 600, width: 120 }} align="center">Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {plannedProgs.length === 0 && week.sessions.length === 0 && (
                        <TableRow><TableCell colSpan={3}><Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>No programs scheduled and no sessions logged.</Typography></TableCell></TableRow>
                      )}
                      {plannedProgs.map(prog => {
                        const done = sessionsByProg.get(prog.id) ?? 0;
                        const exercisesDone = week.sessions
                          .filter(s => s.programId === prog.id)
                          .flatMap(s => s.exercises)
                          .map(ex => findExercise(programs, ex.exerciseDefId)?.name ?? '?');
                        const uniqueDone = [...new Set(exercisesDone)];
                        return (
                          <TableRow key={prog.id} sx={{ opacity: done > 0 ? 1 : 0.5 }}>
                            <TableCell><Typography variant="body2" fontWeight={600}>{prog.name}</Typography></TableCell>
                            <TableCell>
                              {done > 0
                                ? <Typography variant="body2" color="success.main">{uniqueDone.join(', ')}</Typography>
                                : <Typography variant="body2" color="text.disabled">—</Typography>}
                            </TableCell>
                            <TableCell align="center">
                              {done === 0
                                ? <Chip label="not done" size="small" color="default" />
                                : <Chip label={`✓ ${done}×`} size="small" color="success" />}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Paper>
              );
            })}
          </Box>
        </Box>
      )}

      {/* ── Workout Log ── */}
      {tab === 2 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setSessionDialog(true)} disabled={programs.length === 0}>
              New Session
            </Button>
          </Box>
          {programs.length === 0 && <Alert severity="info" sx={{ mb: 2 }}>Create a program first before logging sessions.</Alert>}
          {sessions.length === 0
            ? <Paper sx={{ p: 4, textAlign: 'center' }}><FitnessCenterIcon sx={{ fontSize: 64, color: 'grey.300', mb: 2 }} /><Typography color="text.secondary">No sessions logged yet.</Typography></Paper>
            : sessions.map(s => <SessionCard key={s.id} session={s} programs={programs} onDelete={() => setDeleteSession(s.id)} />)
          }
        </Box>
      )}

      {/* Dialogs */}
      <ProgramDialog open={programDialog.open} onClose={() => setProgramDialog({ open: false, prog: null })}
        onSave={handleSaveProgram} initial={programDialog.prog} />

      <ExerciseDialog open={exDialog.open} onClose={() => setExDialog(s => ({ ...s, open: false }))}
        onSave={handleSaveExercise} initial={exDialog.ex} />

      <SessionDialog open={sessionDialog} onClose={() => setSessionDialog(false)} onSave={handleAddSession} programs={programs} />

      <Dialog open={!!deleteProgram} onClose={() => setDeleteProgram(null)}>
        <DialogTitle>Delete program?</DialogTitle>
        <DialogContent><Typography>This will remove the program and all its exercises. Logged sessions are not affected.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteProgram(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => {
            const next = programs.filter(p => p.id !== deleteProgram);
            setPrograms(next); setDeleteProgram(null); scheduleSave(next, sessions);
          }}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteSession} onClose={() => setDeleteSession(null)}>
        <DialogTitle>Delete session?</DialogTitle>
        <DialogContent><Typography>This workout session will be permanently deleted.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteSession(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => {
            const next = sessions.filter(s => s.id !== deleteSession);
            setSessions(next); setDeleteSession(null); scheduleSave(programs, next);
          }}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnackbar(s => ({ ...s, open: false }))} severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default HealthPage;
