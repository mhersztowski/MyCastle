import React, { useState, useCallback } from 'react';
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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import ExtensionIcon from '@mui/icons-material/Extension';
import { ProjectComponentModel, ProjectTestComponentModel } from '../../modules/filesystem/models/ProjectModel';

interface ProjectComponentEditorProps {
  components: ProjectComponentModel[];
  onChange: (components: ProjectComponentModel[]) => void;
  readOnly?: boolean;
}

const isTestComponent = (c: ProjectComponentModel): c is ProjectTestComponentModel =>
  c.type === 'project_test';

interface EditDraft {
  index: number;
  type: string;
  name: string;
  description: string;
}

const ProjectComponentEditor: React.FC<ProjectComponentEditorProps> = ({
  components,
  onChange,
  readOnly = false,
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>({ index: -1, type: '', name: '', description: '' });

  const handleAdd = useCallback(() => {
    const newComponent: ProjectTestComponentModel = {
      type: 'project_test',
      name: '',
      description: '',
    };
    const newIndex = components.length;
    onChange([...components, newComponent]);
    setEditingIndex(newIndex);
    setEditDraft({ index: newIndex, type: 'project_test', name: '', description: '' });
  }, [components, onChange]);

  const handleDelete = useCallback((index: number) => {
    const updated = components.filter((_, i) => i !== index);
    onChange(updated);
    if (editingIndex === index) {
      setEditingIndex(null);
    } else if (editingIndex !== null && editingIndex > index) {
      setEditingIndex(editingIndex - 1);
    }
  }, [components, onChange, editingIndex]);

  const handleEditStart = useCallback((index: number) => {
    const comp = components[index];
    if (isTestComponent(comp)) {
      setEditDraft({ index, type: comp.type, name: comp.name, description: comp.description });
    } else {
      setEditDraft({ index, type: comp.type, name: '', description: '' });
    }
    setEditingIndex(index);
  }, [components]);

  const handleEditCancel = useCallback(() => {
    if (editingIndex !== null) {
      const comp = components[editingIndex];
      if (isTestComponent(comp) && !comp.name) {
        onChange(components.filter((_, i) => i !== editingIndex));
      }
    }
    setEditingIndex(null);
  }, [editingIndex, components, onChange]);

  const handleEditSave = useCallback(() => {
    if (editingIndex === null || !editDraft.name?.trim()) return;

    const updated = components.map((c, i) => {
      if (i !== editingIndex) return c;
      if (editDraft.type === 'project_test') {
        return {
          type: 'project_test' as const,
          name: editDraft.name.trim(),
          description: editDraft.description,
        } satisfies ProjectTestComponentModel;
      }
      return c;
    });
    onChange(updated);
    setEditingIndex(null);
  }, [editingIndex, editDraft, components, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleEditSave();
      else if (e.key === 'Escape') handleEditCancel();
    },
    [handleEditSave, handleEditCancel]
  );

  const colCount = readOnly ? 3 : 4;

  return (
    <Box>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, width: 120 }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 180 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
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
              const test = isTestComponent(comp) ? comp : null;

              if (isEditing) {
                return (
                  <TableRow key={index} sx={{ bgcolor: 'action.hover' }}>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {editDraft.type}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        variant="standard"
                        value={editDraft.name}
                        onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
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
                        value={editDraft.description}
                        onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                        onKeyDown={handleKeyDown}
                        placeholder="description"
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
                  key={index}
                  hover
                  onDoubleClick={!readOnly ? () => handleEditStart(index) : undefined}
                  sx={{ cursor: readOnly ? 'default' : 'pointer' }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <ExtensionIcon sx={{ fontSize: 16, color: 'action.active' }} />
                      {comp.type}
                    </Box>
                  </TableCell>
                  <TableCell>{test?.name || ''}</TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 300 }}>
                      {test?.description || ''}
                    </Typography>
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
                <TableCell colSpan={colCount} align="center" sx={{ py: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    No components
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {!readOnly && (
        <Box sx={{ mt: 1 }}>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={handleAdd}
            disabled={editingIndex !== null}
          >
            Add Component
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default ProjectComponentEditor;
