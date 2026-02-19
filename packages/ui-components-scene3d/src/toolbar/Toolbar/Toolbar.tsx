import type { ToolbarProps } from '@mhersztowski/ui-core';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';

export function Toolbar({ items = [], className }: ToolbarProps) {
  return (
    <Box
      className={className}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.25,
        px: 1,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        height: 36,
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {items.map((item) => {
        if (item.type === 'separator') {
          return <Divider key={item.id} orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.75 }} />;
        }

        const isIconOnly = item.icon && !item.label;

        const btn = isIconOnly ? (
          <IconButton
            size="small"
            onClick={item.onClick}
            disabled={item.disabled}
            color={item.active ? 'primary' : 'default'}
            sx={{
              borderRadius: 1,
              width: 26,
              height: 26,
              bgcolor: item.active ? 'action.selected' : 'transparent',
              '& svg': { fontSize: 16, width: 16, height: 16 },
            }}
          >
            {item.icon}
          </IconButton>
        ) : (
          <Button
            size="small"
            startIcon={item.icon}
            onClick={item.onClick}
            disabled={item.disabled}
            color={item.active ? 'primary' : 'inherit'}
            sx={{
              minWidth: 'auto',
              px: 0.75,
              py: 0.25,
              fontSize: '0.7rem',
              textTransform: 'none',
              lineHeight: 1.2,
              bgcolor: item.active ? 'action.selected' : 'transparent',
              '& .MuiButton-startIcon': { mr: 0.5 },
              '& svg': { fontSize: '14px !important', width: 14, height: 14 },
            }}
          >
            {item.label}
          </Button>
        );

        return item.tooltip ? (
          <Tooltip key={item.id} title={item.tooltip} arrow disableInteractive enterDelay={400}>
            <span style={{ display: 'inline-flex' }}>{btn}</span>
          </Tooltip>
        ) : (
          <span key={item.id} style={{ display: 'inline-flex' }}>{btn}</span>
        );
      })}
    </Box>
  );
}
