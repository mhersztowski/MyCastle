/**
 * AI Planner Dialog - generowanie planu dnia za pomocą AI
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Checkbox,
  CircularProgress,
  Alert,
  Chip,
  Slider,
  FormControlLabel,
} from '@mui/material';
import PsychologyIcon from '@mui/icons-material/Psychology';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { Dayjs } from 'dayjs';
import { EventNode } from '../../modules/filesystem/nodes';
import { DataSource } from '../../modules/filesystem/data/DataSource';
import { aiService } from '../../modules/ai';
import { DayTemplateEvent } from './types';
import {
  PlannerContext,
  SuggestedEvent,
  buildPlannerSystemPrompt,
  buildPlannerUserPrompt,
  parsePlannerResponse,
  buildContextFromEvents,
  buildTasksList,
} from './aiPlannerPrompt';

interface AiPlannerDialogProps {
  open: boolean;
  onClose: () => void;
  selectedDate: Dayjs;
  existingEvents: EventNode[];
  dataSource: DataSource;
  onAccept: (events: DayTemplateEvent[]) => void;
}

const AiPlannerDialog: React.FC<AiPlannerDialogProps> = ({
  open,
  onClose,
  selectedDate,
  existingEvents,
  dataSource,
  onAccept,
}) => {
  const [preferences, setPreferences] = useState('');
  const [historyDays, setHistoryDays] = useState(7);
  const [suggestions, setSuggestions] = useState<SuggestedEvent[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    if (open) {
      aiService.loadConfig().then(() => {
        setIsConfigured(aiService.isConfigured());
      });
    }
  }, [open]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setSuggestions([]);

    try {
      // Build recent days history
      const recentDaysEvents: PlannerContext['recentDaysEvents'] = [];
      for (let i = 1; i <= historyDays; i++) {
        const pastDate = selectedDate.subtract(i, 'day');
        const dateStr = pastDate.format('YYYY-MM-DD');
        const dayEvents = dataSource.events.filter(e => {
          const eventDate = e.getStartDate();
          return eventDate && eventDate.format('YYYY-MM-DD') === dateStr;
        });
        if (dayEvents.length > 0) {
          recentDaysEvents.push({
            date: `${pastDate.format('dddd')} ${dateStr}`,
            events: buildContextFromEvents(EventNode.sortByTime(dayEvents)),
          });
        }
      }

      const context: PlannerContext = {
        date: selectedDate.format('YYYY-MM-DD'),
        dayOfWeek: selectedDate.format('dddd'),
        existingEvents: buildContextFromEvents(existingEvents),
        recentDaysEvents,
        tasks: buildTasksList(dataSource.tasks.map(t => t.toModel())),
        userPreferences: preferences,
      };

      const systemPrompt = buildPlannerSystemPrompt();
      const userPrompt = buildPlannerUserPrompt(context);

      const response = await aiService.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        maxTokens: 4096,
      });

      const parsed = parsePlannerResponse(response.content);
      setSuggestions(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }, [selectedDate, existingEvents, dataSource, preferences, historyDays]);

  const toggleSuggestion = useCallback((index: number) => {
    setSuggestions(prev => prev.map((s, i) =>
      i === index ? { ...s, accepted: !s.accepted } : s
    ));
  }, []);

  const handleAccept = useCallback(() => {
    const accepted = suggestions
      .filter(s => s.accepted)
      .map(({ accepted: _, ...rest }) => rest as DayTemplateEvent);
    onAccept(accepted);
    setSuggestions([]);
    onClose();
  }, [suggestions, onAccept, onClose]);

  const handleClose = useCallback(() => {
    setSuggestions([]);
    setError(null);
    onClose();
  }, [onClose]);

  const acceptedCount = suggestions.filter(s => s.accepted).length;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <PsychologyIcon sx={{ color: '#e91e63' }} />
        <Typography variant="h6" component="span">AI Day Planner</Typography>
      </DialogTitle>

      <DialogContent dividers>
        {!isConfigured && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            AI nie jest skonfigurowane. Przejdź do Settings &gt; AI Settings aby ustawić providera.
          </Alert>
        )}

        {/* Info */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Data: <strong>{selectedDate.format('dddd, D MMMM YYYY')}</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Istniejące eventy: <strong>{existingEvents.length}</strong>
            {' | '}
            Dostępne taski: <strong>{dataSource.tasks.length}</strong>
          </Typography>
        </Box>

        {/* History days slider */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            Historia dni (do analizy wzorców): {historyDays}
          </Typography>
          <Slider
            value={historyDays}
            onChange={(_, v) => setHistoryDays(v as number)}
            min={0}
            max={30}
            step={1}
            valueLabelDisplay="auto"
            size="small"
            sx={{ maxWidth: 300 }}
          />
        </Box>

        {/* Preferences */}
        <TextField
          label="Preferencje"
          value={preferences}
          onChange={e => setPreferences(e.target.value)}
          fullWidth
          multiline
          rows={3}
          size="small"
          placeholder="np. Focus on Project X, start at 8:00, lunch at 12:30, finish by 18:00..."
          sx={{ mb: 2 }}
        />

        {/* Generate button */}
        <Button
          variant="contained"
          startIcon={generating ? <CircularProgress size={16} /> : <AutoFixHighIcon />}
          onClick={handleGenerate}
          disabled={generating || !isConfigured}
          fullWidth
          sx={{ mb: 2, bgcolor: '#e91e63', '&:hover': { bgcolor: '#c2185b' } }}
        >
          {generating ? 'Generowanie...' : 'Generuj plan'}
        </Button>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        )}

        {/* Suggestions list */}
        {suggestions.length > 0 && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="subtitle2" fontWeight={600}>
                Sugerowane eventy
              </Typography>
              <Chip label={`${acceptedCount}/${suggestions.length}`} size="small" />
            </Box>

            {suggestions.map((s, i) => (
              <Box
                key={i}
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1,
                  p: 1,
                  mb: 0.5,
                  borderRadius: 1,
                  bgcolor: s.accepted ? 'action.selected' : 'transparent',
                  opacity: s.accepted ? 1 : 0.5,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={s.accepted}
                      onChange={() => toggleSuggestion(i)}
                      size="small"
                    />
                  }
                  label=""
                  sx={{ m: 0, mr: -1 }}
                />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" fontWeight={600}>
                    {s.startTime}{s.endTime ? ` - ${s.endTime}` : ''}: {s.name}
                  </Typography>
                  {s.description && (
                    <Typography variant="caption" color="text.secondary">
                      {s.description}
                    </Typography>
                  )}
                  {s.taskId && (
                    <Chip label={`Task: ${s.taskId}`} size="small" sx={{ ml: 0.5, height: 18, fontSize: 10 }} />
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Anuluj</Button>
        {suggestions.length > 0 && (
          <>
            <Button onClick={handleGenerate} disabled={generating}>
              Regeneruj
            </Button>
            <Button
              onClick={handleAccept}
              variant="contained"
              disabled={acceptedCount === 0}
            >
              Akceptuj wybrane ({acceptedCount})
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default AiPlannerDialog;
