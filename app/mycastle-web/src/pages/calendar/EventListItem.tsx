import React, { useState, useMemo } from 'react';
import {
  Paper,
  Box,
  Typography,
  Chip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Collapse,
  IconButton,
} from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import TaskIcon from '@mui/icons-material/Task';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { EventNode, TaskSequenceComponentModel } from '@mhersztowski/core';
import { useFilesystem } from '../../modules/filesystem';

interface EventListItemProps {
  event: EventNode;
  onInsertBefore?: (event: EventNode) => void;
  onInsertAfter?: (event: EventNode) => void;
  onEdit?: (event: EventNode) => void;
  onDelete?: (event: EventNode) => void;
}

const EventListItem: React.FC<EventListItemProps> = ({ event, onInsertBefore, onInsertAfter, onEdit, onDelete }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const menuOpen = Boolean(anchorEl);
  const { dataSource } = useFilesystem();

  const isPast = event.isPast();
  const isNow = event.isNow();

  const sequenceTasks = useMemo(() => {
    if (!event.taskId) return null;
    const taskNode = dataSource.getTaskById(event.taskId);
    if (!taskNode?.components) return null;
    const seqComp = taskNode.components.find(
      (c): c is TaskSequenceComponentModel => c.type === 'task_sequence'
    );
    return seqComp?.tasks ?? null;
  }, [event.taskId, dataSource]);

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(e.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleInsertBefore = () => {
    handleClose();
    onInsertBefore?.(event);
  };

  const handleInsertAfter = () => {
    handleClose();
    onInsertAfter?.(event);
  };

  const handleEditClick = () => {
    handleClose();
    onEdit?.(event);
  };

  const handleDeleteClick = () => {
    handleClose();
    onDelete?.(event);
  };

  return (
    <>
    <Paper
      variant="outlined"
      onClick={handleClick}
      sx={{
        p: 2,
        opacity: isPast ? 0.7 : 1,
        borderColor: isNow ? 'primary.main' : 'divider',
        borderWidth: isNow ? 2 : 1,
        bgcolor: isNow ? 'primary.lighter' : 'background.paper',
        cursor: 'pointer',
        '&:hover': {
          bgcolor: isNow ? 'primary.lighter' : 'action.hover',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 1,
            bgcolor: isNow ? 'primary.main' : isPast ? 'grey.300' : 'primary.light',
            color: isNow ? 'white' : isPast ? 'grey.600' : 'primary.dark',
            flexShrink: 0,
          }}
        >
          <EventIcon />
        </Box>

        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 600,
                color: isPast ? 'text.secondary' : 'text.primary',
              }}
            >
              {event.getDisplayName()}
            </Typography>
            {isNow && (
              <Chip label="Now" size="small" color="primary" />
            )}
          </Box>

          {event.description && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 1 }}
            >
              {event.description}
            </Typography>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AccessTimeIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                {event.getTimeRange()}
              </Typography>
              {event.getDurationFormatted() && (
                <Typography variant="body2" color="text.secondary">
                  ({event.getDurationFormatted()})
                </Typography>
              )}
            </Box>

            {event.getTaskName() && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Chip
                  icon={<TaskIcon />}
                  label={event.getTaskName()}
                  size="small"
                  variant="outlined"
                  color="secondary"
                />
                {sequenceTasks && sequenceTasks.length > 0 && (
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded((prev) => !prev);
                    }}
                    sx={{ p: 0.25 }}
                  >
                    {expanded ? (
                      <ExpandLessIcon fontSize="small" />
                    ) : (
                      <ExpandMoreIcon fontSize="small" />
                    )}
                  </IconButton>
                )}
              </Box>
            )}
          </Box>

          {sequenceTasks && sequenceTasks.length > 0 && (
            <Collapse in={expanded} timeout="auto">
              <Box
                sx={{
                  mt: 1,
                  pl: 1,
                  borderLeft: '2px solid',
                  borderColor: 'secondary.light',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.5,
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Sequence ({sequenceTasks.length})
                </Typography>
                {sequenceTasks.map((t, i) => (
                  <Box key={t.id || i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TaskIcon sx={{ fontSize: 14, color: 'action.active' }} />
                    <Typography variant="body2" color="text.secondary">
                      {t.name || '(unnamed)'}
                    </Typography>
                    {t.description && (
                      <Typography variant="body2" color="text.disabled" noWrap sx={{ maxWidth: 200 }}>
                        — {t.description}
                      </Typography>
                    )}
                    {t.duration != null && (
                      <Chip label={`${t.duration}h`} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.7rem' }} />
                    )}
                  </Box>
                ))}
              </Box>
            </Collapse>
          )}
        </Box>

        <Typography
          variant="h6"
          sx={{
            fontFamily: 'monospace',
            fontWeight: 600,
            color: isPast ? 'text.secondary' : 'text.primary',
            flexShrink: 0,
          }}
        >
          {event.getStartDate()?.format('HH:mm')}
        </Typography>
      </Box>
    </Paper>

    <Menu
      anchorEl={anchorEl}
      open={menuOpen}
      onClose={handleClose}
      anchorOrigin={{
        vertical: 'bottom',
        horizontal: 'center',
      }}
      transformOrigin={{
        vertical: 'top',
        horizontal: 'center',
      }}
    >
      {onEdit && (
        <MenuItem onClick={handleEditClick}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
      )}
      <MenuItem onClick={handleInsertBefore}>
        <ListItemIcon>
          <ArrowUpwardIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Insert Before</ListItemText>
      </MenuItem>
      <MenuItem onClick={handleInsertAfter}>
        <ListItemIcon>
          <ArrowDownwardIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Insert After</ListItemText>
      </MenuItem>
      {onDelete && (
        <MenuItem onClick={handleDeleteClick} sx={{ color: 'error.main' }}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      )}
    </Menu>

    </>
  );
};

export default EventListItem;
