import React, { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Alert,
  CircularProgress,
  Button,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import AddIcon from '@mui/icons-material/Add';
import EventIcon from '@mui/icons-material/Event';
import TodayIcon from '@mui/icons-material/Today';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/pl';
import { useMqtt } from '../../modules/mqttclient';
import { useFilesystem } from '../../modules/filesystem';
import { EventNode } from '../../modules/filesystem/nodes';
import { EventModel, EventsModel } from '../../modules/filesystem/models/EventModel';
import { CurrentEvent } from './types';
import EventAddModal from './EventAddModal';
import CurrentEventWidget from './CurrentEventWidget';
import EventListItem from './EventListItem';

const CalendarPage: React.FC = () => {
  const { isConnected, isConnecting } = useMqtt();
  const { dataSource, isLoading, isDataLoaded, error, writeFile, loadAllData } = useFilesystem();

  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [currentEvent, setCurrentEvent] = useState<CurrentEvent | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [modalInitialStartTime, setModalInitialStartTime] = useState<Dayjs | undefined>(undefined);
  const [modalInitialEndTime, setModalInitialEndTime] = useState<Dayjs | undefined>(undefined);
  const [modalMode, setModalMode] = useState<'current' | 'permanent'>('current');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Filter events for selected date, sorted by time
  const filteredEvents = useMemo(() => {
    const dateStr = selectedDate.format('YYYY-MM-DD');
    const dayEvents = dataSource.events.filter(e => {
      const eventDate = e.getStartDate();
      return eventDate && eventDate.format('YYYY-MM-DD') === dateStr;
    });
    return EventNode.sortByTime(dayEvents);
  }, [dataSource.events, selectedDate]);

  const isToday = selectedDate.isSame(dayjs(), 'day');

  const handlePrevDay = () => {
    setSelectedDate(prev => prev.subtract(1, 'day'));
  };

  const handleNextDay = () => {
    setSelectedDate(prev => prev.add(1, 'day'));
  };

  const handleToday = () => {
    setSelectedDate(dayjs());
  };

  const handleAddCurrentClick = () => {
    setModalInitialStartTime(undefined);
    setModalInitialEndTime(undefined);
    setModalMode('current');
    setAddModalOpen(true);
  };

  const handleAddPermanentClick = () => {
    setModalInitialStartTime(dayjs());
    setModalInitialEndTime(dayjs().add(1, 'hour'));
    setModalMode('permanent');
    setAddModalOpen(true);
  };

  const handleInsertBefore = useCallback((event: EventNode) => {
    const startDate = event.getStartDate();
    if (startDate) {
      setModalInitialStartTime(startDate.subtract(1, 'hour'));
      setModalInitialEndTime(startDate);
      setModalMode('permanent');
      setAddModalOpen(true);
    }
  }, []);

  const handleInsertAfter = useCallback((event: EventNode) => {
    const endDate = event.getEndDate();
    if (endDate) {
      setModalInitialStartTime(endDate);
      setModalInitialEndTime(endDate.add(1, 'hour'));
      setModalMode('permanent');
      setAddModalOpen(true);
    } else {
      // If no end time, use start time
      const startDate = event.getStartDate();
      if (startDate) {
        setModalInitialStartTime(startDate);
        setModalInitialEndTime(startDate.add(1, 'hour'));
        setModalMode('permanent');
        setAddModalOpen(true);
      }
    }
  }, []);

  const handleAddEvent = useCallback(async (event: CurrentEvent) => {
    // For permanent events (with endTime), save directly to filesystem
    if (event.endTime) {
      setSaving(true);
      setSaveError(null);

      try {
        const dateStr = event.startTime.format('YYYY-MM-DD');
        const [year, month, day] = dateStr.split('-');

        // Create the event model
        const newEvent: EventModel = {
          type: 'event',
          name: event.name,
          description: event.description,
          taskId: event.taskId,
          startTime: event.startTime.toISOString(),
          endTime: event.endTime.toISOString(),
        };

        // Build file path
        const filePath = `data/calendar/${year}/${month}/${day}.json`;

        // Check if file exists and get existing events
        let existingEvents: EventModel[] = [];
        const existingFile = dataSource.events.filter(e => {
          const eventDate = e.getStartDate();
          return eventDate && eventDate.format('YYYY-MM-DD') === dateStr;
        });

        if (existingFile.length > 0) {
          existingEvents = existingFile.map(e => e.toModel());
        }

        // Add new event
        const eventsModel: EventsModel = {
          type: 'events',
          tasks: [...existingEvents, newEvent],
        };

        // Save to filesystem
        await writeFile(filePath, JSON.stringify(eventsModel, null, 2));

        // Reload data to get the new event
        await loadAllData();

      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Failed to save event');
      } finally {
        setSaving(false);
      }
    } else {
      // For current events, just set the state
      setCurrentEvent(event);
    }
    setAddModalOpen(false);
  }, [dataSource.events, writeFile, loadAllData]);

  const handleStopEvent = useCallback(async () => {
    if (!currentEvent) return;

    setSaving(true);
    setSaveError(null);

    try {
      const stopTime = dayjs();
      const dateStr = currentEvent.startTime.format('YYYY-MM-DD');
      const [year, month, day] = dateStr.split('-');

      // Create the event model
      const newEvent: EventModel = {
        type: 'event',
        name: currentEvent.name,
        description: currentEvent.description,
        taskId: currentEvent.taskId,
        startTime: currentEvent.startTime.toISOString(),
        endTime: stopTime.toISOString(),
      };

      // Build file path
      const filePath = `data/calendar/${year}/${month}/${day}.json`;

      // Check if file exists and get existing events
      let existingEvents: EventModel[] = [];
      const existingFile = dataSource.events.filter(e => {
        const eventDate = e.getStartDate();
        return eventDate && eventDate.format('YYYY-MM-DD') === dateStr;
      });

      if (existingFile.length > 0) {
        existingEvents = existingFile.map(e => e.toModel());
      }

      // Add new event
      const eventsModel: EventsModel = {
        type: 'events',
        tasks: [...existingEvents, newEvent],
      };

      // Save to filesystem
      await writeFile(filePath, JSON.stringify(eventsModel, null, 2));

      // Clear current event
      setCurrentEvent(null);

      // Reload data to get the new event
      await loadAllData();

    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save event');
    } finally {
      setSaving(false);
    }
  }, [currentEvent, dataSource.events, writeFile, loadAllData]);

  if (isConnecting) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Connecting to server...</Typography>
      </Box>
    );
  }

  if (!isConnected) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">
          Not connected to server. Please check if the backend is running.
        </Alert>
      </Box>
    );
  }

  const loading = isLoading && !isDataLoaded;

  return (
    <Box sx={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', p: 2 }}>
      {/* Header with DatePicker and controls */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <EventIcon color="primary" sx={{ fontSize: 28 }} />
          <Typography variant="h6" sx={{ mr: 2 }}>
            Time Tracker
          </Typography>

          {/* Date navigation */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <IconButton size="small" onClick={handlePrevDay}>
              <ChevronLeftIcon />
            </IconButton>

            <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="pl">
              <DatePicker
                value={selectedDate}
                onChange={(newValue) => newValue && setSelectedDate(newValue)}
                slotProps={{
                  textField: {
                    size: 'small',
                    sx: { width: 150 }
                  },
                }}
                format="DD.MM.YYYY"
              />
            </LocalizationProvider>

            <IconButton size="small" onClick={handleNextDay}>
              <ChevronRightIcon />
            </IconButton>

            <Tooltip title="Go to today">
              <IconButton
                size="small"
                onClick={handleToday}
                color={isToday ? 'primary' : 'default'}
              >
                <TodayIcon />
              </IconButton>
            </Tooltip>
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          <Button
            variant="outlined"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleAddPermanentClick}
            disabled={saving}
            size="small"
          >
            Add
          </Button>
          <Button
            variant="contained"
            color="success"
            startIcon={<AddIcon />}
            onClick={handleAddCurrentClick}
            disabled={!!currentEvent || saving}
            size="small"
          >
            Add Current
          </Button>
        </Box>
      </Paper>

      {/* Errors */}
      {(error || saveError) && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSaveError(null)}>
          {error || saveError}
        </Alert>
      )}

      {/* Current Event Widget */}
      {currentEvent && (
        <Box sx={{ mb: 2 }}>
          <CurrentEventWidget
            event={currentEvent}
            onStop={handleStopEvent}
          />
        </Box>
      )}

      {/* Loading state */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        /* Events List */
        <Paper sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Typography variant="h6">
              {selectedDate.format('dddd, D MMMM YYYY')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              ({filteredEvents.length} events)
            </Typography>
            {isToday && (
              <Typography
                variant="caption"
                sx={{
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  px: 1,
                  py: 0.25,
                  borderRadius: 1,
                  fontWeight: 600
                }}
              >
                TODAY
              </Typography>
            )}
          </Box>

          <Divider sx={{ mb: 2 }} />

          {filteredEvents.length > 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {filteredEvents.map((event, index) => (
                <EventListItem
                  key={index}
                  event={event}
                  onInsertBefore={handleInsertBefore}
                  onInsertAfter={handleInsertAfter}
                />
              ))}
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <EventIcon sx={{ fontSize: 64, color: 'grey.300', mb: 2 }} />
              <Typography color="text.secondary">
                No events for this day.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Click "Add Current" to start tracking.
              </Typography>
            </Box>
          )}
        </Paper>
      )}

      {/* Add Event Modal */}
      <EventAddModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdd={handleAddEvent}
        initialStartTime={modalInitialStartTime}
        initialEndTime={modalInitialEndTime}
        mode={modalMode}
      />
    </Box>
  );
};

export default CalendarPage;
