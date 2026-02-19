import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
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
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import TaskIcon from '@mui/icons-material/Task';
import ExtensionIcon from '@mui/icons-material/Extension';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import SearchIcon from '@mui/icons-material/Search';
import { v4 as uuidv4 } from 'uuid';
import { TaskModel, TaskComponentModel } from '@mhersztowski/core';
import { useFilesystem } from '../../modules/filesystem';
import TaskComponentEditorDialog from './TaskComponentEditorDialog';

interface ProjectTaskEditorProps {
  tasks: TaskModel[];
  onChange: (tasks: TaskModel[]) => void;
  readOnly?: boolean;
  showAddExisting?: boolean;
}

const ProjectTaskEditor: React.FC<ProjectTaskEditorProps> = ({
  tasks,
  onChange,
  readOnly = false,
  showAddExisting = false,
}) => {
  const { dataSource, isDataLoaded } = useFilesystem();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<TaskModel>>({});
  const [componentsTaskId, setComponentsTaskId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFilter, setPickerFilter] = useState('');

  const handleAdd = useCallback(() => {
    const newTask: TaskModel = {
      type: 'task',
      id: uuidv4(),
      name: '',
    };
    onChange([...tasks, newTask]);
    setEditingId(newTask.id);
    setEditDraft(newTask);
  }, [tasks, onChange]);

  const handleDelete = useCallback((id: string) => {
    onChange(tasks.filter((t) => t.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setEditDraft({});
    }
  }, [tasks, onChange, editingId]);

  const handleEditStart = useCallback((task: TaskModel) => {
    setEditingId(task.id);
    setEditDraft({ ...task });
  }, []);

  const handleEditCancel = useCallback(() => {
    const task = tasks.find((t) => t.id === editingId);
    if (task && !task.name) {
      onChange(tasks.filter((t) => t.id !== editingId));
    }
    setEditingId(null);
    setEditDraft({});
  }, [editingId, tasks, onChange]);

  const handleEditSave = useCallback(() => {
    if (!editingId || !editDraft.name?.trim()) return;
    onChange(
      tasks.map((t) =>
        t.id === editingId
          ? { ...t, ...editDraft, name: editDraft.name!.trim() }
          : t
      )
    );
    setEditingId(null);
    setEditDraft({});
  }, [editingId, editDraft, tasks, onChange]);

  // Keep a ref to tasks to avoid circular deps in the auto-sync effect
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const handleDraftChange = useCallback(
    (field: string, value: string | number | null | undefined) => {
      setEditDraft((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  // Auto-sync draft edits to parent so data is never lost when parent saves
  useEffect(() => {
    if (!editingId) return;
    const task = tasksRef.current.find((t) => t.id === editingId);
    if (!task) return;
    // Check if draft has any meaningful difference from the stored task
    const hasChanges = Object.keys(editDraft).some(
      (key) => key !== 'type' && key !== 'id' && editDraft[key as keyof TaskModel] !== task[key as keyof TaskModel]
    );
    if (!hasChanges) return;
    onChange(
      tasksRef.current.map((t) =>
        t.id === editingId ? { ...t, ...editDraft } : t
      )
    );
  }, [editingId, editDraft, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleEditSave();
      else if (e.key === 'Escape') handleEditCancel();
    },
    [handleEditSave, handleEditCancel]
  );

  const handleComponentsChange = useCallback(
    (taskId: string, components: TaskComponentModel[]) => {
      onChange(
        tasks.map((t) =>
          t.id === taskId
            ? { ...t, components: components.length > 0 ? components : undefined }
            : t
        )
      );
    },
    [tasks, onChange]
  );

  const handleAddExisting = useCallback((taskId: string) => {
    const taskNode = dataSource.getTaskById(taskId);
    if (!taskNode) return;
    const model = taskNode.toModel();
    const copy: TaskModel = {
      ...model,
      id: uuidv4(),
      projectId: undefined,
    };
    onChange([...tasks, copy]);
    setPickerOpen(false);
    setPickerFilter('');
  }, [dataSource, tasks, onChange]);

  const pickerTasks = useMemo(() => {
    if (!showAddExisting || !isDataLoaded) return [];
    const allTasks = dataSource.tasks;
    if (!pickerFilter.trim()) return allTasks;
    return allTasks.filter((t) => t.matches(pickerFilter));
  }, [showAddExisting, isDataLoaded, dataSource, pickerFilter]);

  const componentsTask = componentsTaskId ? tasks.find((t) => t.id === componentsTaskId) : null;

  const colCount = readOnly ? 4 : 5;

  return (
    <Box>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, width: 180 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 90 }}>Duration</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 90 }}>Cost</TableCell>
              {!readOnly && (
                <TableCell sx={{ width: 110 }} align="right">
                  Actions
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {tasks.map((task) => {
              const isEditing = editingId === task.id;

              if (isEditing) {
                return (
                  <TableRow key={task.id} sx={{ bgcolor: 'action.hover' }}>
                    <TableCell>
                      <TextField
                        size="small"
                        variant="standard"
                        value={editDraft.name || ''}
                        onChange={(e) => handleDraftChange('name', e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="name *"
                        autoFocus
                        error={!editDraft.name?.trim()}
                        fullWidth
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        variant="standard"
                        value={editDraft.description || ''}
                        onChange={(e) => handleDraftChange('description', e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="description"
                        fullWidth
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        variant="standard"
                        type="number"
                        value={editDraft.duration ?? ''}
                        onChange={(e) =>
                          handleDraftChange('duration', e.target.value ? parseFloat(e.target.value) : undefined)
                        }
                        onKeyDown={handleKeyDown}
                        placeholder="0"
                        fullWidth
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        variant="standard"
                        type="number"
                        value={editDraft.cost ?? ''}
                        onChange={(e) =>
                          handleDraftChange('cost', e.target.value ? parseFloat(e.target.value) : undefined)
                        }
                        onKeyDown={handleKeyDown}
                        placeholder="0"
                        fullWidth
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Save (Enter)">
                        <span>
                          <IconButton
                            size="small"
                            onClick={handleEditSave}
                            color="success"
                            disabled={!editDraft.name?.trim()}
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
                  key={task.id}
                  hover
                  onDoubleClick={!readOnly ? () => handleEditStart(task) : undefined}
                  sx={{ cursor: readOnly ? 'default' : 'pointer' }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <TaskIcon sx={{ fontSize: 16, color: 'action.active' }} />
                      {task.name}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
                      {task.description || ''}
                    </Typography>
                  </TableCell>
                  <TableCell>{task.duration ?? ''}</TableCell>
                  <TableCell>{task.cost ?? ''}</TableCell>
                  {!readOnly && (
                    <TableCell align="right">
                      <Tooltip title={`Components (${task.components?.length || 0})`}>
                        <IconButton
                          size="small"
                          onClick={() => setComponentsTaskId(task.id)}
                          color={task.components?.length ? 'primary' : 'default'}
                        >
                          <ExtensionIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => handleEditStart(task)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          onClick={() => handleDelete(task.id)}
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

            {tasks.length === 0 && (
              <TableRow>
                <TableCell colSpan={colCount} align="center" sx={{ py: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    No tasks
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {!readOnly && (
        <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={handleAdd}
            disabled={editingId !== null}
          >
            Add Task
          </Button>
          {showAddExisting && (
            <Button
              size="small"
              startIcon={<PlaylistAddIcon />}
              onClick={() => { setPickerOpen(true); setPickerFilter(''); }}
              disabled={editingId !== null}
            >
              Add Existing Task
            </Button>
          )}
        </Box>
      )}

      {componentsTask && (
        <TaskComponentEditorDialog
          open={!!componentsTaskId}
          onClose={() => setComponentsTaskId(null)}
          taskName={componentsTask.name}
          components={componentsTask.components || []}
          onChange={(comps) => handleComponentsChange(componentsTask.id, comps)}
          readOnly={readOnly}
        />
      )}

      {showAddExisting && (
        <Dialog
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
            <TaskIcon color="secondary" />
            Select Existing Task
            <Box sx={{ flexGrow: 1 }} />
            <IconButton size="small" onClick={() => setPickerOpen(false)}>
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent sx={{ p: 0 }}>
            <Box sx={{ px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search tasks..."
                value={pickerFilter}
                onChange={(e) => setPickerFilter(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                autoFocus
              />
            </Box>
            <List dense sx={{ maxHeight: 400, overflow: 'auto' }}>
              {pickerTasks.map((taskNode) => (
                <ListItemButton
                  key={taskNode.id}
                  onClick={() => handleAddExisting(taskNode.id)}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <TaskIcon sx={{ fontSize: 18 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={taskNode.getDisplayName()}
                    secondary={taskNode.getProjectName() || undefined}
                    primaryTypographyProps={{ fontSize: '0.85rem' }}
                    secondaryTypographyProps={{ fontSize: '0.75rem' }}
                  />
                </ListItemButton>
              ))}
              {pickerTasks.length === 0 && (
                <Typography color="text.secondary" sx={{ px: 2, py: 2, textAlign: 'center' }}>
                  No tasks found
                </Typography>
              )}
            </List>
          </DialogContent>
        </Dialog>
      )}
    </Box>
  );
};

export default ProjectTaskEditor;
