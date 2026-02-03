import React, { useState } from 'react';
import {
  Paper,
  Box,
  Typography,
  Chip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import TaskIcon from '@mui/icons-material/Task';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { EventNode } from '../../modules/filesystem/nodes';

interface EventListItemProps {
  event: EventNode;
  onInsertBefore?: (event: EventNode) => void;
  onInsertAfter?: (event: EventNode) => void;
}

const EventListItem: React.FC<EventListItemProps> = ({ event, onInsertBefore, onInsertAfter }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);

  const isPast = event.isPast();
  const isNow = event.isNow();

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
              <Chip
                icon={<TaskIcon />}
                label={event.getTaskName()}
                size="small"
                variant="outlined"
                color="secondary"
              />
            )}
          </Box>
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
    </Menu>
    </>
  );
};

export default EventListItem;
