import { useState, useCallback, useRef } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M1 1.5l14 6.5-14 6.5V9l10-1-10-1V1.5z" />
  </svg>
);

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    // Re-focus after send
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <Box sx={{
      display: 'flex', alignItems: 'flex-end', gap: 0.5,
      p: 1, borderTop: '1px solid #3c3c3c',
    }}>
      <TextField
        inputRef={inputRef}
        size="small"
        fullWidth
        multiline
        maxRows={5}
        placeholder={disabled ? 'Processing...' : 'Ask the agent...'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        slotProps={{
          input: {
            sx: {
              fontSize: 12,
              bgcolor: '#3c3c3c',
              color: '#ccc',
              '& fieldset': { border: '1px solid #555' },
              '&:hover fieldset': { borderColor: '#777 !important' },
              '&.Mui-focused fieldset': { borderColor: '#007acc !important' },
              borderRadius: 0.5,
              py: 0.75,
              px: 1,
            },
          },
        }}
      />
      <IconButton
        size="small"
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        sx={{
          color: value.trim() && !disabled ? '#007acc' : '#555',
          mb: 0.25,
          '&:hover': { bgcolor: '#3c3c3c' },
        }}
      >
        <SendIcon />
      </IconButton>
    </Box>
  );
}
