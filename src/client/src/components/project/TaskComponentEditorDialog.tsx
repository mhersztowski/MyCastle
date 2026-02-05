import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  IconButton,
  Tooltip,
  Box,
  Button,
  Paper,
  Typography,
  MenuItem,
  Select,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import ExtensionIcon from '@mui/icons-material/Extension';
import {
  TaskModel,
  TaskComponentModel,
  TaskTestComponentModel,
  TaskIntervalComponentModel,
  TaskSequenceComponentModel,
} from '../../modules/filesystem/models/TaskModel';
import ProjectTaskEditor from './ProjectTaskEditor';

const COMPONENT_TYPES = [
  { value: 'task_test', label: 'Test' },
  { value: 'task_interval', label: 'Interval' },
  { value: 'task_sequence', label: 'Sequence' },
] as const;

type ComponentType = typeof COMPONENT_TYPES[number]['value'];

const isTestComponent = (c: TaskComponentModel): c is TaskTestComponentModel =>
  c.type === 'task_test';

const isIntervalComponent = (c: TaskComponentModel): c is TaskIntervalComponentModel =>
  c.type === 'task_interval';

const isSequenceComponent = (c: TaskComponentModel): c is TaskSequenceComponentModel =>
  c.type === 'task_sequence';

interface EditDraft {
  index: number;
  type: ComponentType;
  name: string;
  description: string;
  daysInterval: number;
  tasks: TaskModel[];
}

const emptyDraft = (index: number, type: ComponentType = 'task_test'): EditDraft => ({
  index,
  type,
  name: '',
  description: '',
  daysInterval: 1,
  tasks: [],
});

function draftToComponent(draft: EditDraft): TaskComponentModel {
  if (draft.type === 'task_test') {
    const comp: TaskTestComponentModel = {
      type: 'task_test',
      name: draft.name.trim(),
      description: draft.description,
    };
    return comp;
  }
  if (draft.type === 'task_interval') {
    const comp: TaskIntervalComponentModel = {
      type: 'task_interval',
      daysInterval: draft.daysInterval,
    };
    return comp;
  }
  const comp: TaskSequenceComponentModel = {
    type: 'task_sequence',
    tasks: draft.tasks.length > 0 ? draft.tasks : undefined,
  };
  return comp;
}

function componentToDraft(comp: TaskComponentModel, index: number): EditDraft {
  if (isTestComponent(comp)) {
    return { index, type: 'task_test', name: comp.name, description: comp.description, daysInterval: 1, tasks: [] };
  }
  if (isIntervalComponent(comp)) {
    return { index, type: 'task_interval', name: '', description: '', daysInterval: comp.daysInterval, tasks: [] };
  }
  if (isSequenceComponent(comp)) {
    return { index, type: 'task_sequence', name: '', description: '', daysInterval: 1, tasks: comp.tasks || [] };
  }
  return emptyDraft(index);
}

function isDraftValid(draft: EditDraft): boolean {
  if (draft.type === 'task_test') return !!draft.name.trim();
  if (draft.type === 'task_interval') return draft.daysInterval > 0;
  if (draft.type === 'task_sequence') return true;
  return false;
}

function getComponentLabel(comp: TaskComponentModel): string {
  if (isTestComponent(comp)) return comp.name;
  if (isIntervalComponent(comp)) return `Every ${comp.daysInterval} day(s)`;
  if (isSequenceComponent(comp)) return `${comp.tasks?.length || 0} task(s)`;
  return comp.type;
}

interface TaskComponentEditorDialogProps {
  open: boolean;
  onClose: () => void;
  taskName: string;
  components: TaskComponentModel[];
  onChange: (components: TaskComponentModel[]) => void;
  readOnly?: boolean;
}

const TaskComponentEditorDialog: React.FC<TaskComponentEditorDialogProps> = ({
  open,
  onClose,
  taskName,
  components,
  onChange,
  readOnly = false,
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>(emptyDraft(-1));

  const handleAdd = useCallback(() => {
    const newComp: TaskTestComponentModel = { type: 'task_test', name: '', description: '' };
    const newIndex = components.length;
    onChange([...components, newComp]);
    setEditingIndex(newIndex);
    setEditDraft(emptyDraft(newIndex, 'task_test'));
  }, [components, onChange]);

  const handleDelete = useCallback((index: number) => {
    onChange(components.filter((_, i) => i !== index));
    if (editingIndex === index) {
      setEditingIndex(null);
    } else if (editingIndex !== null && editingIndex > index) {
      setEditingIndex(editingIndex - 1);
    }
  }, [components, onChange, editingIndex]);

  const handleEditStart = useCallback((index: number) => {
    setEditDraft(componentToDraft(components[index], index));
    setEditingIndex(index);
  }, [components]);

  const handleEditCancel = useCallback(() => {
    if (editingIndex !== null) {
      const comp = components[editingIndex];
      if (!isDraftValid(componentToDraft(comp, editingIndex))) {
        onChange(components.filter((_, i) => i !== editingIndex));
      }
    }
    setEditingIndex(null);
  }, [editingIndex, components, onChange]);

  const handleClose = useCallback(() => {
    if (editingIndex !== null) {
      const comp = components[editingIndex];
      if (!isDraftValid(componentToDraft(comp, editingIndex))) {
        onChange(components.filter((_, i) => i !== editingIndex));
      }
      setEditingIndex(null);
    }
    onClose();
  }, [editingIndex, components, onChange, onClose]);

  const handleEditSave = useCallback(() => {
    if (editingIndex === null || !isDraftValid(editDraft)) return;
    onChange(components.map((c, i) => (i === editingIndex ? draftToComponent(editDraft) : c)));
    setEditingIndex(null);
  }, [editingIndex, editDraft, components, onChange]);

  const handleTypeChange = useCallback((type: ComponentType) => {
    setEditDraft((prev) => ({ ...prev, type }));
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleEditSave();
      else if (e.key === 'Escape') handleEditCancel();
    },
    [handleEditSave, handleEditCancel]
  );

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <ExtensionIcon color="primary" />
        <Box>
          <Typography variant="subtitle1">Task Components</Typography>
          <Typography variant="caption" color="text.secondary">
            {taskName}
          </Typography>
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        <IconButton size="small" onClick={handleClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 2, pb: 1 }}>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, width: 120 }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Details</TableCell>
                {!readOnly && (
                  <TableCell sx={{ width: 80 }} align="right">
                    Actions
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {components.map((comp, index) => {
                const isEditing = editingIndex === index;

                if (isEditing) {
                  return (
                    <TableRow key={index} sx={{ bgcolor: 'action.hover' }}>
                      <TableCell>
                        <Select
                          size="small"
                          variant="standard"
                          value={editDraft.type}
                          onChange={(e) => handleTypeChange(e.target.value as ComponentType)}
                          fullWidth
                        >
                          {COMPONENT_TYPES.map((ct) => (
                            <MenuItem key={ct.value} value={ct.value}>
                              {ct.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell>
                        {editDraft.type === 'task_test' && (
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            <TextField
                              size="small"
                              variant="standard"
                              value={editDraft.name}
                              onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                              onKeyDown={handleKeyDown}
                              placeholder="name *"
                              autoFocus
                              error={!editDraft.name.trim()}
                              fullWidth
                            />
                            <TextField
                              size="small"
                              variant="standard"
                              value={editDraft.description}
                              onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                              onKeyDown={handleKeyDown}
                              placeholder="description"
                              fullWidth
                            />
                          </Box>
                        )}
                        {editDraft.type === 'task_interval' && (
                          <TextField
                            size="small"
                            variant="standard"
                            type="number"
                            value={editDraft.daysInterval}
                            onChange={(e) =>
                              setEditDraft((d) => ({
                                ...d,
                                daysInterval: Math.max(0.1, Number(e.target.value) || 0.1),
                              }))
                            }
                            onKeyDown={handleKeyDown}
                            placeholder="days"
                            autoFocus
                            label="Days interval"
                            inputProps={{ step: 0.1, min: 0.1 }}
                            fullWidth
                          />
                        )}
                        {editDraft.type === 'task_sequence' && (
                          <Box>
                            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                              Sub-tasks ({editDraft.tasks.length})
                            </Typography>
                            <ProjectTaskEditor
                              tasks={editDraft.tasks}
                              onChange={(tasks) => setEditDraft((d) => ({ ...d, tasks }))}
                              showAddExisting
                            />
                          </Box>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Save (Enter)">
                          <span>
                            <IconButton
                              size="small"
                              onClick={handleEditSave}
                              color="success"
                              disabled={!isDraftValid(editDraft)}
                            >
                              <CheckIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Cancel (Esc)">
                          <IconButton size="small" onClick={handleEditCancel}>
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                }

                return (
                  <TableRow
                    key={index}
                    hover
                    onDoubleClick={!readOnly ? () => handleEditStart(index) : undefined}
                    sx={{ cursor: readOnly ? 'default' : 'pointer' }}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <ExtensionIcon sx={{ fontSize: 16, color: 'action.active' }} />
                        {COMPONENT_TYPES.find((ct) => ct.value === comp.type)?.label || comp.type}
                      </Box>
                    </TableCell>
                    <TableCell>
                      {isSequenceComponent(comp) && comp.tasks && comp.tasks.length > 0 ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                          {comp.tasks.map((t, i) => (
                            <Typography key={t.id || i} variant="body2" color="text.secondary" noWrap>
                              {t.name || '(unnamed)'}{t.description ? ` — ${t.description}` : ''}
                            </Typography>
                          ))}
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          {getComponentLabel(comp)}
                        </Typography>
                      )}
                    </TableCell>
                    {!readOnly && (
                      <TableCell align="right">
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => handleEditStart(index)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            onClick={() => handleDelete(index)}
                            color="error"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}

              {components.length === 0 && (
                <TableRow>
                  <TableCell colSpan={readOnly ? 2 : 3} align="center" sx={{ py: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      No components
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>

      <DialogActions sx={{ px: 2, pb: 2 }}>
        {!readOnly && (
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={handleAdd}
            disabled={editingIndex !== null}
          >
            Add Component
          </Button>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={handleClose} variant="outlined" size="small">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TaskComponentEditorDialog;
