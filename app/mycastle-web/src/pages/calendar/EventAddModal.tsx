import React, { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  IconButton,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AddIcon from '@mui/icons-material/Add';
import RepeatIcon from '@mui/icons-material/Repeat';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/pl';
import type { RecurrenceModel, RecurrenceFreq } from '@mhersztowski/core';
import { CurrentEvent } from './types';
import { TaskPicker } from '../../components/task';
import { useFilesystem } from '../../modules/filesystem';

type ModalMode = 'current' | 'permanent';

interface EventAddModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (event: CurrentEvent) => void;
  initialStartTime?: Dayjs;
  initialEndTime?: Dayjs;
  initialName?: string;
  initialDescription?: string;
  initialTaskId?: string;
  initialRecurrence?: RecurrenceModel;
  mode?: ModalMode;
  editMode?: boolean;
}

type FreqOption = 'none' | RecurrenceFreq;
const FREQ_OPTIONS: { value: FreqOption; label: string }[] = [
  { value: 'none', label: 'Bez powtarzania' },
  { value: 'daily', label: 'Codziennie' },
  { value: 'weekly', label: 'Co tydzień' },
  { value: 'monthly', label: 'Co miesiąc' },
  { value: 'yearly', label: 'Co rok' },
  { value: 'weekdays', label: 'Wybrane dni tygodnia' },
];
// Kolejność wyświetlania dni: Pn…Nd (wartości dayjs: 1..6,0)
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Pn' }, { value: 2, label: 'Wt' }, { value: 3, label: 'Śr' },
  { value: 4, label: 'Cz' }, { value: 5, label: 'Pt' }, { value: 6, label: 'So' }, { value: 0, label: 'Nd' },
];

const EventAddModal: React.FC<EventAddModalProps> = ({
  open,
  onClose,
  onAdd,
  initialStartTime,
  initialEndTime,
  initialName,
  initialDescription,
  initialTaskId,
  initialRecurrence,
  mode = 'current',
  editMode = false,
}) => {
  const { dataSource } = useFilesystem();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<Dayjs>(dayjs());
  const [endTime, setEndTime] = useState<Dayjs>(dayjs());
  const [recFreq, setRecFreq] = useState<FreqOption>('none');
  const [recInterval, setRecInterval] = useState<number>(1);
  const [recWeekdays, setRecWeekdays] = useState<number[]>([]);

  const isPermanent = mode === 'permanent';

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setStartTime(initialStartTime || dayjs());
      setEndTime(initialEndTime || (initialStartTime ? initialStartTime.add(1, 'hour') : dayjs().add(1, 'hour')));
      setName(initialName || '');
      setDescription(initialDescription || '');
      setTaskId(initialTaskId || null);
      setRecFreq(initialRecurrence?.freq ?? 'none');
      setRecInterval(Math.max(1, initialRecurrence?.interval ?? 1));
      setRecWeekdays(initialRecurrence?.weekdays ?? []);
    }
  }, [open, initialStartTime, initialEndTime, initialName, initialDescription, initialTaskId, initialRecurrence]);

  const buildRecurrence = (): RecurrenceModel | undefined => {
    if (!isPermanent || recFreq === 'none') return undefined;
    if (recFreq === 'weekdays') {
      return { freq: 'weekdays', weekdays: recWeekdays.length ? [...recWeekdays].sort((a, b) => a - b) : [startTime.day()] };
    }
    return recInterval > 1 ? { freq: recFreq, interval: recInterval } : { freq: recFreq };
  };

  const handleTaskChange = useCallback((id: string | null) => {
    setTaskId(id);

    if (id) {
      const task = dataSource.getTaskById(id);
      if (task) {
        // Build name from project path + task name
        const parts: string[] = [];

        if (task.projectId) {
          const project = dataSource.findProjectByIdDeep(task.projectId);
          if (project) {
            // Get full project path
            parts.push(...project.getPath());
          }
        }

        parts.push(task.getDisplayName());
        setName(parts.join('.'));
      }
    }
  }, [dataSource]);

  const handleAdd = () => {
    if (!name.trim()) return;

    onAdd({
      name: name.trim(),
      description: description.trim() || undefined,
      taskId: taskId || undefined,
      startTime,
      endTime: isPermanent ? endTime : undefined,
      recurrence: buildRecurrence(),
    });

    // Reset form
    setName('');
    setDescription('');
    setTaskId(null);
    setStartTime(dayjs());
    setEndTime(dayjs().add(1, 'hour'));
    setRecFreq('none');
    setRecInterval(1);
    setRecWeekdays([]);
    onClose();
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setTaskId(null);
    setStartTime(dayjs());
    setEndTime(dayjs().add(1, 'hour'));
    setRecFreq('none');
    setRecInterval(1);
    setRecWeekdays([]);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {isPermanent ? <AddIcon color="primary" /> : <PlayArrowIcon color="primary" />}
        {editMode ? 'Edit Event' : isPermanent ? 'Add Event' : 'Start New Event'}
        <Box sx={{ flexGrow: 1 }} />
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Assign to Task (optional)
            </Typography>
            <TaskPicker
              id={taskId}
              editable
              onChange={handleTaskChange}
            />
          </Box>

          <TextField
            autoFocus
            label="Event Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            placeholder="What are you working on?"
          />

          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
            placeholder="Optional description..."
          />

          <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="pl">
            <DateTimePicker
              label="Start Time"
              value={startTime}
              onChange={(newValue) => newValue && setStartTime(newValue)}
              ampm={false}
              format="DD.MM.YYYY HH:mm"
              slotProps={{
                textField: { fullWidth: true },
              }}
            />
            {isPermanent && (
              <DateTimePicker
                label="End Time"
                value={endTime}
                onChange={(newValue) => newValue && setEndTime(newValue)}
                ampm={false}
                format="DD.MM.YYYY HH:mm"
                slotProps={{
                  textField: { fullWidth: true },
                }}
                minDateTime={startTime}
              />
            )}
          </LocalizationProvider>

          {isPermanent && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <RepeatIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">Powtarzanie</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <FormControl fullWidth size="small">
                  <InputLabel id="rec-freq-label">Częstotliwość</InputLabel>
                  <Select
                    labelId="rec-freq-label"
                    label="Częstotliwość"
                    value={recFreq}
                    onChange={(e) => setRecFreq(e.target.value as FreqOption)}
                  >
                    {FREQ_OPTIONS.map((o) => (
                      <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {recFreq !== 'none' && recFreq !== 'weekdays' && (
                  <TextField
                    label="Co ile"
                    type="number"
                    size="small"
                    value={recInterval}
                    onChange={(e) => setRecInterval(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    inputProps={{ min: 1 }}
                    sx={{ width: 110 }}
                  />
                )}
              </Box>

              {recFreq === 'weekdays' && (
                <ToggleButtonGroup
                  value={recWeekdays}
                  onChange={(_, next: number[]) => setRecWeekdays(next)}
                  size="small"
                  sx={{ flexWrap: 'wrap' }}
                >
                  {WEEKDAYS.map((d) => (
                    <ToggleButton key={d.value} value={d.value} sx={{ px: 1.5 }}>
                      {d.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              )}
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleAdd}
          disabled={!name.trim()}
          startIcon={isPermanent ? <AddIcon /> : <PlayArrowIcon />}
          color="success"
        >
          {editMode ? 'Save' : isPermanent ? 'Add Event' : 'Start Event'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EventAddModal;
