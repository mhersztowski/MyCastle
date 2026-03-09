import { Box, Typography, Button, Chip } from '@mui/material';
import { Check, Close } from '@mui/icons-material';
import type { ReceivedCommand } from '@modules/iot-emulator';

interface PendingCommandsListProps {
  commands: ReceivedCommand[];
  onAck: (commandId: string, status: 'ACKNOWLEDGED' | 'FAILED') => void;
}

function PendingCommandsList({ commands, onAck }: PendingCommandsListProps) {
  const pending = commands.filter((c) => !c.acked);

  if (pending.length === 0) return null;

  return (
    <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>
        Pending Commands ({pending.length})
      </Typography>
      {pending.map((cmd) => (
        <Box key={cmd.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
          <Chip label={cmd.name} size="small" variant="outlined" />
          <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
            {new Date(cmd.receivedAt).toLocaleTimeString()}
          </Typography>
          <Button
            size="small"
            color="success"
            startIcon={<Check />}
            onClick={() => onAck(cmd.id, 'ACKNOWLEDGED')}
            sx={{ minWidth: 'auto', px: 1, fontSize: '0.7rem' }}
          >
            ACK
          </Button>
          <Button
            size="small"
            color="error"
            startIcon={<Close />}
            onClick={() => onAck(cmd.id, 'FAILED')}
            sx={{ minWidth: 'auto', px: 1, fontSize: '0.7rem' }}
          >
            FAIL
          </Button>
        </Box>
      ))}
    </Box>
  );
}

export default PendingCommandsList;
