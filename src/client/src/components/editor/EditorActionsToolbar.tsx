import React from 'react';
import { Box, IconButton, Divider, Tooltip } from '@mui/material';
import * as MuiIcons from '@mui/icons-material';
import type { editor } from 'monaco-editor';
import { EditorActionsConfig, EditorActionConfig } from './EditorActionsTypes';

type IconName = keyof typeof MuiIcons;

interface EditorActionsToolbarProps {
  config: EditorActionsConfig;
  editor: editor.IStandaloneCodeEditor | null;
  sx?: object;
}

const getIcon = (iconName: IconName): React.ReactNode => {
  const IconComponent = MuiIcons[iconName] as React.ComponentType<{ fontSize?: 'small' | 'medium' | 'large' }>;
  return IconComponent ? <IconComponent fontSize="small" /> : null;
};

const EditorActionsToolbar: React.FC<EditorActionsToolbarProps> = ({ config, editor, sx }) => {
  const handleAction = (action: EditorActionConfig) => {
    if (!editor) return;
    const selection = editor.getSelection();
    action.executor(editor, selection);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 0.5,
        px: 1,
        py: 0.5,
        bgcolor: 'grey.100',
        borderBottom: '1px solid',
        borderColor: 'divider',
        ...sx,
      }}
    >
      {config.groups.map((group, groupIndex) => (
        <React.Fragment key={group.id}>
          {groupIndex > 0 && (
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          )}
          <Box sx={{ display: 'flex', gap: 0.25 }}>
            {group.actions.map((action) => (
              <Tooltip key={action.id} title={action.tooltip || action.label} arrow>
                <IconButton
                  size="small"
                  onClick={() => handleAction(action)}
                  sx={{
                    borderRadius: 1,
                    '&:hover': {
                      bgcolor: 'grey.200',
                    },
                  }}
                >
                  {getIcon(action.icon)}
                </IconButton>
              </Tooltip>
            ))}
          </Box>
        </React.Fragment>
      ))}
    </Box>
  );
};

export default EditorActionsToolbar;
