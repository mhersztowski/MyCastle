/**
 * WakeWordIndicator - UI indicator showing wake word detection status
 * Shows a small icon in the corner that indicates if wake word is listening
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, IconButton, Tooltip, Chip } from '@mui/material';
import HearingIcon from '@mui/icons-material/Hearing';
import HearingDisabledIcon from '@mui/icons-material/HearingDisabled';
import { wakeWordService } from '../services/WakeWordService';
import { speechService } from '../services/SpeechService';

interface WakeWordIndicatorProps {
  onWakeWord?: (transcript: string) => void;
}

const WakeWordIndicator: React.FC<WakeWordIndicatorProps> = ({ onWakeWord }) => {
  const [listening, setListening] = useState(false);
  const [lastTrigger, setLastTrigger] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    speechService.loadConfig().then(config => {
      if (config.wakeWord.enabled) {
        setConfigured(true);
        wakeWordService.configure({
          phrase: config.wakeWord.phrase,
          sensitivity: config.wakeWord.sensitivity,
          lang: config.wakeWord.lang,
          onWake: (transcript) => {
            setLastTrigger(transcript);
            onWakeWord?.(transcript);
            // Clear trigger display after 3s
            setTimeout(() => setLastTrigger(null), 3000);
          },
          onStatusChange: (isListening) => {
            setListening(isListening);
          },
        });
      }
    });

    return () => {
      wakeWordService.stop();
    };
  }, [onWakeWord]);

  const toggleListening = useCallback(() => {
    if (listening) {
      wakeWordService.stop();
    } else {
      wakeWordService.start();
    }
  }, [listening]);

  if (!configured) return null;

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <Tooltip title={listening ? `Listening for "${wakeWordService.wakePhrase}"` : 'Wake word disabled'}>
        <IconButton
          onClick={toggleListening}
          size="small"
          color={listening ? 'primary' : 'default'}
          sx={{
            animation: listening ? 'pulse 2s ease-in-out infinite' : 'none',
            '@keyframes pulse': {
              '0%, 100%': { opacity: 1 },
              '50%': { opacity: 0.5 },
            },
          }}
        >
          {listening ? <HearingIcon fontSize="small" /> : <HearingDisabledIcon fontSize="small" />}
        </IconButton>
      </Tooltip>

      {lastTrigger && (
        <Chip
          label="Wake!"
          size="small"
          color="success"
          sx={{ height: 20, fontSize: 10 }}
        />
      )}
    </Box>
  );
};

export default WakeWordIndicator;
