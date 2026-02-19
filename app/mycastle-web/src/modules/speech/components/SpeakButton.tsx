/**
 * SpeakButton - reusable button that speaks given text via TTS
 */

import React, { useState, useCallback } from 'react';
import { IconButton, Tooltip, CircularProgress } from '@mui/material';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import StopIcon from '@mui/icons-material/Stop';
import { speechService } from '../services/SpeechService';

interface SpeakButtonProps {
  text: string;
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  color?: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';
}

const SpeakButton: React.FC<SpeakButtonProps> = ({
  text,
  size = 'small',
  disabled = false,
  color = 'default',
}) => {
  const [speaking, setSpeaking] = useState(false);

  const handleClick = useCallback(async () => {
    if (speaking) {
      speechService.stopSpeaking();
      setSpeaking(false);
      return;
    }

    if (!text.trim()) return;

    setSpeaking(true);
    try {
      await speechService.speak({ text });
    } catch (err) {
      console.error('[SpeakButton] TTS error:', err);
    } finally {
      setSpeaking(false);
    }
  }, [text, speaking]);

  return (
    <Tooltip title={speaking ? 'Stop' : 'Speak'}>
      <span>
        <IconButton
          onClick={handleClick}
          size={size}
          disabled={disabled}
          color={color}
        >
          {speaking ? <StopIcon fontSize={size} /> : <VolumeUpIcon fontSize={size} />}
          {speaking && (
            <CircularProgress
              size={size === 'small' ? 20 : size === 'medium' ? 28 : 36}
              sx={{
                position: 'absolute',
                color: 'primary.main',
              }}
            />
          )}
        </IconButton>
      </span>
    </Tooltip>
  );
};

export default SpeakButton;
