/**
 * Insert a task-linked event into the markdown document.
 *
 * Opened from the `/event` slash command. Lists the user's tasks (pulled
 * from useFilesystem's DataSource) in an autocomplete; once picked, the
 * event name defaults to the task name and the description is pre-filled
 * with the task's own description so the user only has to set the time.
 *
 * Output is a markdown blockquote — renders the same in any viewer:
 *
 *   > 📅 **2026-06-10 14:00 — 15:30** · Code review
 *   > 🔗 Zadanie: **Faza I** (Projekt X)
 *   > Notes about the meeting…
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent,
  DialogTitle, Stack, TextField, Typography,
} from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import { useFilesystem } from '../../modules/filesystem';

export interface EventBlockAttrs {
  eventName: string;
  start: string;
  end: string;
  description: string;
  taskId: string;
  taskName: string;
  projectName: string;
}

export interface EventDialogResult {
  /** Markdown block — used by callers that want the legacy text format. */
  markdown: string;
  /** Structured attrs — used to populate the EventBlock TipTap node. */
  attrs: EventBlockAttrs;
}

export interface EventDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (result: EventDialogResult) => void;
  /** Pre-fill form fields — used when editing an existing EventBlock. */
  initial?: Partial<EventBlockAttrs>;
}

interface TaskOption {
  id: string;
  name: string;
  projectId?: string;
  /** Optional cached project label — used when the picker is preloaded
   *  with a synthetic option for an already-saved event. */
  projectName?: string;
  description?: string;
}

/** Local datetime → ISO-ish for display (`2026-06-10 14:00`). */
function fmtDate(value: string): string {
  if (!value) return '';
  // datetime-local gives `YYYY-MM-DDTHH:mm`; just swap the T for a space.
  return value.replace('T', ' ');
}

/** Default datetime-local value: next round hour from now. */
function defaultStart(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  // 'YYYY-MM-DDTHH:mm' for <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const EventDialog: React.FC<EventDialogProps> = ({ open, onClose, onInsert, initial }) => {
  const { dataSource } = useFilesystem();

  // Materialise task list from the DataSource each time the dialog opens —
  // wraps node objects in plain serialisable shape for the picker.
  const tasks: TaskOption[] = useMemo(() => {
    if (!open) return [];
    try {
      const ts = dataSource.tasks ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ts.map((t: any) => ({
        id: String(t.id ?? t.model?.id ?? ''),
        name: String(t.name ?? t.model?.name ?? '(unnamed)'),
        projectId: t.projectId ?? t.model?.projectId,
        description: t.description ?? t.model?.description,
      })).filter(t => t.id);
    } catch {
      return [];
    }
  }, [open, dataSource]);

  // Cross-reference project ids → names so the inserted markdown can say
  // "Projekt X" instead of an opaque uuid.
  const projectName: (id?: string) => string | undefined = useMemo(() => {
    if (!open) return () => undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const projects: any[] = dataSource.projects ?? [];
      const byId = new Map<string, string>();
      for (const p of projects) {
        const id = String(p.id ?? p.model?.id ?? '');
        const name = String(p.name ?? p.model?.name ?? '');
        if (id) byId.set(id, name);
      }
      return (id?: string) => id ? byId.get(id) : undefined;
    } catch {
      return () => undefined;
    }
  }, [open, dataSource]);

  // Form state — `task` may be null (no task chosen, manual event).
  const [task, setTask] = useState<TaskOption | null>(null);
  const [name, setName] = useState('');
  const [start, setStart] = useState(defaultStart());
  const [end, setEnd] = useState('');
  const [description, setDescription] = useState('');

  // Reset / preload whenever the dialog opens — use `initial` props (passed
  // when editing an existing EventBlock node) to bring the form back to the
  // saved state instead of defaults.
  useEffect(() => {
    if (!open) return;
    setName(initial?.eventName ?? '');
    setStart(initial?.start || defaultStart());
    setEnd(initial?.end ?? '');
    setDescription(initial?.description ?? '');
    if (initial?.taskId) {
      // Build a synthetic task option matching the saved id so the picker
      // shows the linked task right away (even if DataSource isn't loaded yet).
      setTask({
        id: initial.taskId,
        name: initial.taskName ?? '',
        projectName: initial.projectName,
      });
    } else {
      setTask(null);
    }
  }, [open, initial]);

  // When the user picks a task, pre-fill event name + description from it.
  // Only overwrite when those fields are still default-empty so we don't
  // clobber typing-in-progress.
  useEffect(() => {
    if (!task) return;
    setName((curr) => curr || task.name);
    setDescription((curr) => curr || task.description || '');
  }, [task]);

  const handleInsert = () => {
    const projName = task ? projectName(task.projectId) ?? task.projectName ?? '' : '';
    // Legacy markdown blockquote — kept for backward compatibility / hosts
    // that prefer the plain-text version of an event.
    const dateLine = end
      ? `📅 **${fmtDate(start)} — ${fmtDate(end)}** · ${name || '(bez nazwy)'}`
      : `📅 **${fmtDate(start)}** · ${name || '(bez nazwy)'}`;
    const lines: string[] = [`> ${dateLine}`];
    if (task) {
      const projSuffix = projName ? ` (${projName})` : '';
      lines.push(`> 🔗 Zadanie: **${task.name}**${projSuffix}`);
    }
    if (description.trim()) {
      for (const ln of description.trim().split('\n')) lines.push(`> ${ln}`);
    }
    const markdown = lines.join('\n') + '\n\n';
    // Structured attrs — fed straight into the EventBlock TipTap node.
    const attrs: EventBlockAttrs = {
      eventName: name,
      start,
      end,
      description,
      taskId: task?.id ?? '',
      taskName: task?.name ?? '',
      projectName: projName,
    };
    onInsert({ markdown, attrs });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <EventIcon /> Wstaw event
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {/* Task picker — freeSolo so the user can still build an event
              without referencing a task, or when DataSource is empty
              (no tasks yet / MQTT load failed). */}
          <Autocomplete
            options={tasks}
            value={task}
            onChange={(_, v) => setTask(v)}
            getOptionLabel={(o) => o.name}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            renderInput={(params) => (
              <TextField {...params} label="Zadanie z PIM/Projects"
                helperText={tasks.length === 0
                  ? 'Brak zadań w DataSource — możesz pominąć i wpisać event ręcznie'
                  : `${tasks.length} dostępnych zadań`}
              />
            )}
            renderOption={(props, option) => {
              const projName = projectName(option.projectId);
              return (
                <Box component="li" {...props}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap>{option.name}</Typography>
                    {projName && (
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {projName}
                      </Typography>
                    )}
                  </Box>
                </Box>
              );
            }}
          />

          <TextField
            label="Nazwa eventu"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            placeholder={task?.name || 'np. Spotkanie z zespołem'}
          />

          <Stack direction="row" spacing={1}>
            <TextField
              label="Start"
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Koniec (opcjonalnie)"
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>

          <TextField
            label="Opis (opcjonalnie)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth multiline rows={3}
          />

          {/* Preview */}
          <Alert severity="info" icon={<EventIcon />} sx={{ '& .MuiAlert-message': { width: '100%' } }}>
            <Typography variant="caption" component="div" sx={{ mb: 0.5, fontWeight: 600 }}>
              Podgląd
            </Typography>
            <Box component="pre" sx={{ m: 0, fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap' }}>
{`> 📅 **${end ? `${fmtDate(start)} — ${fmtDate(end)}` : fmtDate(start)}** · ${name || '(bez nazwy)'}${task ? `\n> 🔗 Zadanie: **${task.name}**${projectName(task.projectId) ? ` (${projectName(task.projectId)})` : ''}` : ''}${description.trim() ? `\n> ${description.trim().split('\n').join('\n> ')}` : ''}`}
            </Box>
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Anuluj</Button>
        <Button variant="contained" onClick={handleInsert} disabled={!start}>
          Wstaw event
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EventDialog;
