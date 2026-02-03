import React, { useState, useMemo } from 'react';
import {
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  TextField,
  InputAdornment,
  Box,
  Skeleton,
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import { useFilesystem } from '../../modules/filesystem';

interface PersonPickerProps {
  id: string | null;
  editable?: boolean;
  size?: 'small' | 'medium';
  onChange?: (id: string | null) => void;
}

const PersonPicker: React.FC<PersonPickerProps> = ({
  id,
  editable = false,
  size = 'medium',
  onChange,
}) => {
  const { dataSource, isDataLoaded } = useFilesystem();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const persons = useMemo(() => {
    if (!isDataLoaded) return [];
    return dataSource.persons;
  }, [dataSource, isDataLoaded]);

  const selectedPerson = useMemo(() => {
    if (!id || !isDataLoaded) return null;
    return dataSource.getPersonById(id) || null;
  }, [dataSource, isDataLoaded, id]);

  const filteredPersons = useMemo(() => {
    if (!filter) return persons;
    return dataSource.findPersons(filter);
  }, [dataSource, persons, filter]);

  const handleOpen = () => {
    if (editable) {
      setOpen(true);
      setFilter('');
    }
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleSelect = (personId: string) => {
    onChange?.(personId);
    setOpen(false);
  };

  if (!isDataLoaded) {
    return <Skeleton variant="rounded" width={100} height={size === 'small' ? 24 : 32} />;
  }

  return (
    <>
      <Chip
        icon={<PersonIcon />}
        label={selectedPerson ? selectedPerson.getDisplayName() : 'Select person'}
        size={size}
        variant={selectedPerson ? 'outlined' : 'filled'}
        color={selectedPerson ? 'primary' : 'default'}
        onClick={editable ? handleOpen : undefined}
        onDelete={editable ? handleOpen : undefined}
        deleteIcon={editable ? <EditIcon /> : undefined}
        sx={{ cursor: editable ? 'pointer' : 'default' }}
      />

      <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
          <PersonIcon color="primary" />
          Select Person
          <Box sx={{ flexGrow: 1 }} />
          <IconButton size="small" onClick={handleClose}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search persons..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
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
          <List sx={{ maxHeight: 300, overflow: 'auto' }}>
            {filteredPersons.map((person) => (
              <ListItemButton
                key={person.id}
                selected={person.id === id}
                onClick={() => handleSelect(person.id)}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <PersonIcon color={person.id === id ? 'primary' : 'action'} />
                </ListItemIcon>
                <ListItemText
                  primary={person.getDisplayName()}
                  secondary={person.nick !== person.getDisplayName() ? person.nick : undefined}
                />
              </ListItemButton>
            ))}
            {filteredPersons.length === 0 && (
              <ListItemText
                primary="No persons found"
                sx={{ px: 2, py: 1, color: 'text.secondary' }}
              />
            )}
          </List>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PersonPicker;
