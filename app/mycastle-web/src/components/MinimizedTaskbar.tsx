import { Box, IconButton, Paper, Typography } from '@mui/material';
import { Close } from '@mui/icons-material';
import { useGlobalWindows } from './GlobalWindowsContext';

export function MinimizedTaskbar() {
  const { windows, windowTitles, restore, close } = useGlobalWindows();

  const minimized = [...windows.entries()].filter(([, state]) => state === 'minimized');
  if (minimized.length === 0) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        display: 'flex',
        flexDirection: 'row',
        gap: 0.5,
        px: 1,
        pb: 0,
        zIndex: 1250,
        pointerEvents: 'none',
      }}
    >
      {minimized.map(([name]) => (
        <Paper
          key={name}
          elevation={4}
          onClick={() => restore(name)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 1.5,
            py: 0.5,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            cursor: 'pointer',
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            maxWidth: 200,
            userSelect: 'none',
            pointerEvents: 'auto',
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 'bold', flexGrow: 1 }} noWrap>
            {windowTitles.get(name) ?? name}
          </Typography>
          <IconButton
            size="small"
            sx={{ color: 'inherit', p: 0.25 }}
            onClick={(e) => { e.stopPropagation(); close(name); }}
          >
            <Close sx={{ fontSize: 14 }} />
          </IconButton>
        </Paper>
      ))}
    </Box>
  );
}
