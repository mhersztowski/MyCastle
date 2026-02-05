import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import PsychologyIcon from '@mui/icons-material/Psychology';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/pl';
import { useMqtt } from '../../modules/mqttclient';
import { useFilesystem } from '../../modules/filesystem';
import { EventNode } from '../../modules/filesystem/nodes';
import { EventModel, EventsModel } from '../../modules/filesystem/models/EventModel';
import { CurrentEvent, DayTemplate, DayTemplateEvent, DayTemplatesFile } from './types';
import EventAddModal from './EventAddModal';
import CurrentEventWidget from './CurrentEventWidget';
import EventListItem from './EventListItem';
import TemplateSaveDialog from './TemplateSaveDialog';
import TemplateLoadDialog from './TemplateLoadDialog';
import AiPlannerDialog from './AiPlannerDialog';
import { aiService } from '../../modules/ai';
import { v4 as uuidv4 } from 'uuid';

const CalendarPage: React.FC = () => {
  const { isConnected, isConnecting } = useMqtt();
  const { dataSource, isLoading, isDataLoaded, error, writeFile, readFile, loadAllData } = useFilesystem();

  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [currentEvent, setCurrentEvent] = useState<CurrentEvent | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [modalInitialStartTime, setModalInitialStartTime] = useState<Dayjs | undefined>(undefined);
  const [modalInitialEndTime, setModalInitialEndTime] = useState<Dayjs | undefined>(undefined);
  const [modalMode, setModalMode] = useState<'current' | 'permanent'>('current');
  const [modalInitialName, setModalInitialName] = useState<string | undefined>(undefined);
  const [modalInitialDescription, setModalInitialDescription] = useState<string | undefined>(undefined);
  const [modalInitialTaskId, setModalInitialTaskId] = useState<string | undefined>(undefined);
  const [editingEvent, setEditingEvent] = useState<EventNode | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<DayTemplate[]>([]);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [loadTemplateOpen, setLoadTemplateOpen] = useState(false);
  const [aiPlannerOpen, setAiPlannerOpen] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);

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
    setModalInitialName(undefined);
    setModalInitialDescription(undefined);
    setModalInitialTaskId(undefined);
    setEditingEvent(null);
    setModalMode('current');
    setAddModalOpen(true);
  };

  const handleAddPermanentClick = () => {
    setModalInitialStartTime(dayjs());
    setModalInitialEndTime(dayjs().add(1, 'hour'));
    setModalInitialName(undefined);
    setModalInitialDescription(undefined);
    setModalInitialTaskId(undefined);
    setEditingEvent(null);
    setModalMode('permanent');
    setAddModalOpen(true);
  };

  const handleInsertBefore = useCallback((event: EventNode) => {
    const startDate = event.getStartDate();
    if (startDate) {
      setModalInitialStartTime(startDate.subtract(1, 'hour'));
      setModalInitialEndTime(startDate);
      setModalInitialName(undefined);
      setModalInitialDescription(undefined);
      setModalInitialTaskId(undefined);
      setEditingEvent(null);
      setModalMode('permanent');
      setAddModalOpen(true);
    }
  }, []);

  const handleInsertAfter = useCallback((event: EventNode) => {
    const endDate = event.getEndDate();
    if (endDate) {
      setModalInitialStartTime(endDate);
      setModalInitialEndTime(endDate.add(1, 'hour'));
    } else {
      const startDate = event.getStartDate();
      if (startDate) {
        setModalInitialStartTime(startDate);
        setModalInitialEndTime(startDate.add(1, 'hour'));
      } else {
        return;
      }
    }
    setModalInitialName(undefined);
    setModalInitialDescription(undefined);
    setModalInitialTaskId(undefined);
    setEditingEvent(null);
    setModalMode('permanent');
    setAddModalOpen(true);
  }, []);

  const handleEditEvent = useCallback((event: EventNode) => {
    setModalInitialStartTime(event.getStartDate() || undefined);
    setModalInitialEndTime(event.getEndDate() || undefined);
    setModalInitialName(event.getDisplayName());
    setModalInitialDescription(event.description || undefined);
    setModalInitialTaskId(event.taskId || undefined);
    setEditingEvent(event);
    setModalMode('permanent');
    setAddModalOpen(true);
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

        // Get existing events, excluding the one being edited
        const existingEvents = dataSource.events
          .filter(e => {
            const eventDate = e.getStartDate();
            if (!eventDate || eventDate.format('YYYY-MM-DD') !== dateStr) return false;
            if (editingEvent && e === editingEvent) return false;
            return true;
          })
          .map(e => e.toModel());

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
    setEditingEvent(null);
  }, [dataSource.events, editingEvent, writeFile, loadAllData]);

  const handleDeleteEvent = useCallback(async (event: EventNode) => {
    setSaving(true);
    setSaveError(null);

    try {
      const eventDate = event.getStartDate();
      if (!eventDate) throw new Error('Event has no start date');

      const dateStr = eventDate.format('YYYY-MM-DD');
      const [year, month, day] = dateStr.split('-');
      const filePath = `data/calendar/${year}/${month}/${day}.json`;

      // Get all events for the same day except the one being deleted
      const sameDayEvents = dataSource.events.filter(e => {
        const eDate = e.getStartDate();
        return eDate && eDate.format('YYYY-MM-DD') === dateStr && e !== event;
      });

      const eventsModel: EventsModel = {
        type: 'events',
        tasks: sameDayEvents.map(e => e.toModel()),
      };

      await writeFile(filePath, JSON.stringify(eventsModel, null, 2));
      await loadAllData();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to delete event');
    } finally {
      setSaving(false);
    }
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

  const TEMPLATES_PATH = 'data/calendar/templates.json';

  const loadTemplates = useCallback(async () => {
    try {
      const file = await readFile(TEMPLATES_PATH);
      if (file) {
        const data = JSON.parse(file.toString()) as DayTemplatesFile;
        setTemplates(data.templates || []);
      }
    } catch {
      // File doesn't exist yet, that's fine
    }
  }, [readFile]);

  const saveTemplates = useCallback(async (updatedTemplates: DayTemplate[]) => {
    const data: DayTemplatesFile = {
      type: 'day_templates',
      templates: updatedTemplates,
    };
    await writeFile(TEMPLATES_PATH, JSON.stringify(data, null, 2));
    setTemplates(updatedTemplates);
  }, [writeFile]);

  const handleSaveAsTemplate = useCallback(async (name: string) => {
    setSaving(true);
    setSaveError(null);
    try {
      const templateEvents: DayTemplateEvent[] = filteredEvents.map(e => ({
        name: e.getDisplayName(),
        description: e.description,
        taskId: e.taskId,
        startTime: e.getStartDate()?.format('HH:mm') || '00:00',
        endTime: e.getEndDate()?.format('HH:mm'),
      }));

      const newTemplate: DayTemplate = {
        id: uuidv4(),
        name,
        events: templateEvents,
      };

      await saveTemplates([...templates, newTemplate]);
      setSaveTemplateOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  }, [filteredEvents, templates, saveTemplates]);

  const handleLoadTemplate = useCallback(async (template: DayTemplate) => {
    setSaving(true);
    setSaveError(null);
    try {
      const dateStr = selectedDate.format('YYYY-MM-DD');
      const [year, month, day] = dateStr.split('-');
      const filePath = `data/calendar/${year}/${month}/${day}.json`;

      // Get existing events for this day
      const existingEvents = dataSource.events
        .filter(e => {
          const eventDate = e.getStartDate();
          return eventDate && eventDate.format('YYYY-MM-DD') === dateStr;
        })
        .map(e => e.toModel());

      // Convert template events to full EventModels with selected date
      const newEvents: EventModel[] = template.events.map(te => {
        const [startH, startM] = te.startTime.split(':').map(Number);
        const startTime = selectedDate.hour(startH).minute(startM).second(0).millisecond(0);

        let endTime: dayjs.Dayjs | undefined;
        if (te.endTime) {
          const [endH, endM] = te.endTime.split(':').map(Number);
          endTime = selectedDate.hour(endH).minute(endM).second(0).millisecond(0);
        }

        return {
          type: 'event' as const,
          name: te.name,
          description: te.description,
          taskId: te.taskId,
          startTime: startTime.toISOString(),
          endTime: endTime?.toISOString(),
        };
      });

      const eventsModel: EventsModel = {
        type: 'events',
        tasks: [...existingEvents, ...newEvents],
      };

      await writeFile(filePath, JSON.stringify(eventsModel, null, 2));
      await loadAllData();
      setLoadTemplateOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to load template');
    } finally {
      setSaving(false);
    }
  }, [selectedDate, dataSource.events, writeFile, loadAllData]);

  const handleDeleteTemplate = useCallback(async (templateId: string) => {
    try {
      const updated = templates.filter(t => t.id !== templateId);
      await saveTemplates(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to delete template');
    }
  }, [templates, saveTemplates]);

  // Load templates on mount
  useEffect(() => {
    if (isDataLoaded) {
      loadTemplates();
    }
  }, [isDataLoaded, loadTemplates]);

  // Check AI configuration
  useEffect(() => {
    if (isDataLoaded) {
      aiService.loadConfig().then(() => {
        setAiConfigured(aiService.isConfigured());
      });
    }
  }, [isDataLoaded]);

  const handleAcceptAiPlan = useCallback(async (events: DayTemplateEvent[]) => {
    setSaving(true);
    setSaveError(null);
    try {
      const dateStr = selectedDate.format('YYYY-MM-DD');
      const [year, month, day] = dateStr.split('-');
      const filePath = `data/calendar/${year}/${month}/${day}.json`;

      const existingEvents = dataSource.events
        .filter(e => {
          const eventDate = e.getStartDate();
          return eventDate && eventDate.format('YYYY-MM-DD') === dateStr;
        })
        .map(e => e.toModel());

      const newEvents: EventModel[] = events.map(te => {
        const [startH, startM] = te.startTime.split(':').map(Number);
        const startTime = selectedDate.hour(startH).minute(startM).second(0).millisecond(0);

        let endTime: dayjs.Dayjs | undefined;
        if (te.endTime) {
          const [endH, endM] = te.endTime.split(':').map(Number);
          endTime = selectedDate.hour(endH).minute(endM).second(0).millisecond(0);
        }

        return {
          type: 'event' as const,
          name: te.name,
          description: te.description,
          taskId: te.taskId,
          startTime: startTime.toISOString(),
          endTime: endTime?.toISOString(),
        };
      });

      const eventsModel: EventsModel = {
        type: 'events',
        tasks: [...existingEvents, ...newEvents],
      };

      await writeFile(filePath, JSON.stringify(eventsModel, null, 2));
      await loadAllData();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save AI plan');
    } finally {
      setSaving(false);
    }
  }, [selectedDate, dataSource.events, writeFile, loadAllData]);

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

            <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 500 }}>
              {selectedDate.locale('pl').format('dddd').charAt(0).toUpperCase() + selectedDate.locale('pl').format('dddd').slice(1)}
            </Typography>

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

          <Tooltip title="Save as template">
            <span>
              <IconButton
                color="secondary"
                onClick={() => setSaveTemplateOpen(true)}
                disabled={saving || filteredEvents.length === 0}
                size="small"
              >
                <BookmarkAddIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Load template">
            <IconButton
              color="secondary"
              onClick={() => setLoadTemplateOpen(true)}
              disabled={saving}
              size="small"
            >
              <FileDownloadIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="AI Day Planner">
            <IconButton
              onClick={() => {
                aiService.loadConfig().then(() => {
                  setAiConfigured(aiService.isConfigured());
                });
                setAiPlannerOpen(true);
              }}
              disabled={saving}
              size="small"
              sx={{ color: aiConfigured ? '#e91e63' : 'text.disabled' }}
            >
              <PsychologyIcon />
            </IconButton>
          </Tooltip>
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
                  onEdit={handleEditEvent}
                  onDelete={handleDeleteEvent}
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
        onClose={() => { setAddModalOpen(false); setEditingEvent(null); }}
        onAdd={handleAddEvent}
        initialStartTime={modalInitialStartTime}
        initialEndTime={modalInitialEndTime}
        initialName={modalInitialName}
        initialDescription={modalInitialDescription}
        initialTaskId={modalInitialTaskId}
        mode={modalMode}
        editMode={!!editingEvent}
      />

      {/* Template Dialogs */}
      <TemplateSaveDialog
        open={saveTemplateOpen}
        onClose={() => setSaveTemplateOpen(false)}
        onSave={handleSaveAsTemplate}
      />
      <TemplateLoadDialog
        open={loadTemplateOpen}
        onClose={() => setLoadTemplateOpen(false)}
        onLoad={handleLoadTemplate}
        onDelete={handleDeleteTemplate}
        templates={templates}
      />
      <AiPlannerDialog
        open={aiPlannerOpen}
        onClose={() => setAiPlannerOpen(false)}
        selectedDate={selectedDate}
        existingEvents={filteredEvents}
        dataSource={dataSource}
        onAccept={handleAcceptAiPlan}
      />
    </Box>
  );
};

export default CalendarPage;
