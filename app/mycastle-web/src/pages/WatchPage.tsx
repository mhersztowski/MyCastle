import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { mqttClient } from '@mhersztowski/web-client';

const TOPIC = 'watch';

export default function WatchPage() {
  const [lastSent, setLastSent] = useState<number | null>(null);

  const handlePress = () => {
    mqttClient.rawPublish(TOPIC, JSON.stringify({ pressed: true, at: Date.now() }));
    setLastSent(Date.now());
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#1a1a2e',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        p: 2,
      }}
    >
      <Button
        variant="contained"
        onClick={handlePress}
        sx={{
          width: 160,
          height: 160,
          borderRadius: '50%',
          fontSize: '1.1rem',
          fontWeight: 700,
          bgcolor: '#e94560',
          '&:hover': { bgcolor: '#c73652' },
          '&:active': { transform: 'scale(0.95)' },
        }}
      >
        Press
      </Button>
      {lastSent && (
        <Typography variant="caption" sx={{ color: '#888' }}>
          Sent {new Date(lastSent).toLocaleTimeString()}
        </Typography>
      )}
    </Box>
  );
}
