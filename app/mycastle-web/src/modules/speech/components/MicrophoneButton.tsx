/**
 * MicrophoneButton - reusable button for speech-to-text recording
 * Supports both OpenAI Whisper (record audio blob) and Browser STT (live recognition)
 */

import React, { useState, useCallback, useRef } from 'react';
import { IconButton, Tooltip, CircularProgress, Box, Typography } from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import { speechService } from '../services/SpeechService';
import { AudioRecorder } from '../services/AudioRecorder';
import { createBrowserRecognition } from '../providers/BrowserSttProvider';

interface MicrophoneButtonProps {
  onTranscript: (text: string) => void;
  onInterim?: (text: string) => void;
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  showTranscript?: boolean;
}

const MicrophoneButton: React.FC<MicrophoneButtonProps> = ({
  onTranscript,
  onInterim,
  size = 'small',
  disabled = false,
  showTranscript = false,
}) => {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [interimText, setInterimText] = useState('');
  const recorderRef = useRef<AudioRecorder | null>(null);
  const recognitionRef = useRef<{ stop: () => void; abort: () => void } | null>(null);

  const handleClick = useCallback(async () => {
    if (recording) {
      // Stop recording
      const config = speechService.getConfig();

      if (config.stt.provider === 'openai') {
        // Stop MediaRecorder and send to Whisper
        if (recorderRef.current) {
          setProcessing(true);
          setRecording(false);
          try {
            const audioBlob = await recorderRef.current.stop();
            const result = await speechService.transcribe({ audio: audioBlob });
            onTranscript(result.text);
          } catch (err) {
            console.error('[MicrophoneButton] Transcription error:', err);
          } finally {
            setProcessing(false);
            recorderRef.current = null;
          }
        }
      } else {
        // Stop browser recognition
        if (recognitionRef.current) {
          recognitionRef.current.stop();
          recognitionRef.current = null;
        }
        setRecording(false);
      }

      setInterimText('');
      return;
    }

    // Start recording
    const config = speechService.getConfig();

    if (config.stt.provider === 'openai') {
      // Record audio via MediaRecorder for Whisper
      try {
        const recorder = new AudioRecorder();
        await recorder.start();
        recorderRef.current = recorder;
        setRecording(true);
      } catch (err) {
        console.error('[MicrophoneButton] Mic access error:', err);
      }
    } else {
      // Use browser Speech Recognition
      const recognition = createBrowserRecognition({
        lang: config.stt.browser.lang,
        continuous: false,
        interimResults: true,
        onResult: (transcript, isFinal) => {
          if (isFinal) {
            onTranscript(transcript);
            setInterimText('');
            setRecording(false);
            recognitionRef.current = null;
          } else {
            setInterimText(transcript);
            onInterim?.(transcript);
          }
        },
        onError: (error) => {
          console.error('[MicrophoneButton] Recognition error:', error);
          setRecording(false);
          setInterimText('');
          recognitionRef.current = null;
        },
        onEnd: () => {
          setRecording(false);
          recognitionRef.current = null;
        },
      });

      if (recognition) {
        recognition.start();
        recognitionRef.current = recognition;
        setRecording(true);
      }
    }
  }, [recording, onTranscript, onInterim]);

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <Tooltip title={recording ? 'Stop recording' : processing ? 'Processing...' : 'Start recording'}>
        <span>
          <IconButton
            onClick={handleClick}
            size={size}
            disabled={disabled || processing}
            color={recording ? 'error' : 'default'}
          >
            {recording ? <MicOffIcon fontSize={size} /> : <MicIcon fontSize={size} />}
            {(recording || processing) && (
              <CircularProgress
                size={size === 'small' ? 20 : size === 'medium' ? 28 : 36}
                sx={{
                  position: 'absolute',
                  color: recording ? 'error.main' : 'primary.main',
                }}
              />
            )}
          </IconButton>
        </span>
      </Tooltip>

      {showTranscript && interimText && (
        <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {interimText}
        </Typography>
      )}
    </Box>
  );
};

export default MicrophoneButton;
