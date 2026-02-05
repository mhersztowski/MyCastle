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
import PersonIcon from '@mui/icons-material/Person';
import { PersonModel } from '../../modules/filesystem/models/PersonModel';
import { v4 as uuidv4 } from 'uuid';

interface PersonListEditorProps {
  persons: PersonModel[];
  onChange: (persons: PersonModel[]) => void;
  readOnly?: boolean;
}

const PersonListEditor: React.FC<PersonListEditorProps> = ({
  persons,
  onChange,
  readOnly = false,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<PersonModel>>({});

  const handleAdd = useCallback(() => {
    const newPerson: PersonModel = {
      type: 'person',
      id: uuidv4(),
      nick: '',
      firstName: '',
      secondName: '',
      description: '',
    };
    onChange([...persons, newPerson]);
    setEditingId(newPerson.id);
    setEditDraft(newPerson);
  }, [persons, onChange]);

  const handleDelete = useCallback((id: string) => {
    onChange(persons.filter((p) => p.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setEditDraft({});
    }
  }, [persons, onChange, editingId]);

  const handleEditStart = useCallback((person: PersonModel) => {
    setEditingId(person.id);
    setEditDraft({ ...person });
  }, []);

  const handleEditCancel = useCallback(() => {
    // If the person has empty nick, it was just added - remove it
    const person = persons.find((p) => p.id === editingId);
    if (person && !person.nick) {
      onChange(persons.filter((p) => p.id !== editingId));
    }
    setEditingId(null);
    setEditDraft({});
  }, [editingId, persons, onChange]);

  const handleEditSave = useCallback(() => {
    if (!editingId || !editDraft.nick?.trim()) return;

    onChange(
      persons.map((p) =>
        p.id === editingId
          ? { ...p, ...editDraft, nick: editDraft.nick!.trim() }
          : p
      )
    );
    setEditingId(null);
    setEditDraft({});
  }, [editingId, editDraft, persons, onChange]);

  const handleDraftChange = useCallback(
    (field: keyof PersonModel, value: string) => {
      setEditDraft((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleEditSave();
      } else if (e.key === 'Escape') {
        handleEditCancel();
      }
    },
    [handleEditSave, handleEditCancel]
  );

  return (
    <Box>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, width: 140 }}>Nick</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>First Name</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Last Name</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
              {!readOnly && (
                <TableCell sx={{ width: 80 }} align="right">
                  Actions
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {persons.map((person) => {
              const isEditing = editingId === person.id;

              if (isEditing) {
                return (
                  <TableRow key={person.id} sx={{ bgcolor: 'action.hover' }}>
                    <TableCell>
                      <TextField
                        size="small"
                        variant="standard"
                        value={editDraft.nick || ''}
                        onChange={(e) => handleDraftChange('nick', e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="nick *"
                        autoFocus
                        error={!editDraft.nick?.trim()}
                        fullWidth
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        variant="standard"
                        value={editDraft.firstName || ''}
                        onChange={(e) => handleDraftChange('firstName', e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="first name"
                        fullWidth
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        variant="standard"
                        value={editDraft.secondName || ''}
                        onChange={(e) => handleDraftChange('secondName', e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="last name"
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
                    <TableCell align="right">
                      <Tooltip title="Save (Enter)">
                        <span>
                          <IconButton
                            size="small"
                            onClick={handleEditSave}
                            color="success"
                            disabled={!editDraft.nick?.trim()}
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
                  key={person.id}
                  hover
                  onDoubleClick={!readOnly ? () => handleEditStart(person) : undefined}
                  sx={{ cursor: readOnly ? 'default' : 'pointer' }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <PersonIcon sx={{ fontSize: 16, color: 'action.active' }} />
                      {person.nick}
                    </Box>
                  </TableCell>
                  <TableCell>{person.firstName || ''}</TableCell>
                  <TableCell>{person.secondName || ''}</TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      noWrap
                      sx={{ maxWidth: 200 }}
                    >
                      {person.description || ''}
                    </Typography>
                  </TableCell>
                  {!readOnly && (
                    <TableCell align="right">
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => handleEditStart(person)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          onClick={() => handleDelete(person.id)}
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

            {persons.length === 0 && (
              <TableRow>
                <TableCell colSpan={readOnly ? 4 : 5} align="center" sx={{ py: 3 }}>
                  <Typography variant="body2" color="text.secondary">
                    No persons
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
            disabled={editingId !== null}
          >
            Add Person
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default PersonListEditor;
