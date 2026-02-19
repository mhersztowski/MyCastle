import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  IconButton,
  Typography,
  Box,
  Chip,
  DialogContentText,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { DayTemplate } from './types';

interface TemplateLoadDialogProps {
  open: boolean;
  onClose: () => void;
  onLoad: (template: DayTemplate) => void;
  onDelete: (templateId: string) => void;
  templates: DayTemplate[];
}

const TemplateLoadDialog: React.FC<TemplateLoadDialogProps> = ({
  open,
  onClose,
  onLoad,
  onDelete,
  templates,
}) => {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    onDelete(id);
    setDeleteConfirmId(null);
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Load Template</DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {templates.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4, px: 2 }}>
              <Typography color="text.secondary">
                No templates saved yet.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Use "Save Template" to save the current day's events as a template.
              </Typography>
            </Box>
          ) : (
            <List>
              {templates.map((template) => (
                <ListItem
                  key={template.id}
                  disablePadding
                  secondaryAction={
                    <IconButton
                      edge="end"
                      color="error"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmId(template.id);
                      }}
                      size="small"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemButton onClick={() => onLoad(template)}>
                    <ListItemText
                      primary={template.name}
                      secondary={
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5 }}>
                          {template.events.map((event, i) => (
                            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <AccessTimeIcon sx={{ fontSize: 14, color: 'action.active' }} />
                              <Typography variant="body2" color="text.secondary" component="span">
                                {event.startTime}
                                {event.endTime && `–${event.endTime}`}
                              </Typography>
                              <Chip label={event.name} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.75rem' }} />
                            </Box>
                          ))}
                        </Box>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)}>
        <DialogTitle>Delete Template</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this template?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
          <Button
            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            color="error"
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default TemplateLoadDialog;
