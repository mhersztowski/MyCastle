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
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AddIcon from '@mui/icons-material/Add';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/pl';
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
  mode?: ModalMode;
  editMode?: boolean;
}

const EventAddModal: React.FC<EventAddModalProps> = ({
  open,
  onClose,
  onAdd,
  initialStartTime,
  initialEndTime,
  initialName,
  initialDescription,
  initialTaskId,
  mode = 'current',
  editMode = false,
}) => {
  const { dataSource } = useFilesystem();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<Dayjs>(dayjs());
  const [endTime, setEndTime] = useState<Dayjs>(dayjs());

  const isPermanent = mode === 'permanent';

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setStartTime(initialStartTime || dayjs());
      setEndTime(initialEndTime || (initialStartTime ? initialStartTime.add(1, 'hour') : dayjs().add(1, 'hour')));
      setName(initialName || '');
      setDescription(initialDescription || '');
      setTaskId(initialTaskId || null);
    }
  }, [open, initialStartTime, initialEndTime, initialName, initialDescription, initialTaskId]);

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
    });

    // Reset form
    setName('');
    setDescription('');
    setTaskId(null);
    setStartTime(dayjs());
    setEndTime(dayjs().add(1, 'hour'));
    onClose();
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setTaskId(null);
    setStartTime(dayjs());
    setEndTime(dayjs().add(1, 'hour'));
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
