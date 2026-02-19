import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Toolbar, Button, IconButton, Typography, Divider, Box } from '@mui/material';
import * as MuiIcons from '@mui/icons-material';

type IconName = keyof typeof MuiIcons;

export interface ToolbarButtonConfig {
  type: 'button' | 'iconButton';
  label?: string;
  icon?: IconName;
  variant?: 'text' | 'outlined' | 'contained';
  color?: 'inherit' | 'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning';
  disabled?: boolean;
  action: ToolbarAction;
}

export interface ToolbarDividerConfig {
  type: 'divider';
  orientation?: 'vertical' | 'horizontal';
}

export interface ToolbarSpacerConfig {
  type: 'spacer';
}

export interface ToolbarTextConfig {
  type: 'text';
  text: string;
  variant?: 'h6' | 'subtitle1' | 'subtitle2' | 'body1' | 'body2' | 'caption';
  noWrap?: boolean;
  fontFamily?: string;
}

export type ToolbarItemConfig =
  | ToolbarButtonConfig
  | ToolbarDividerConfig
  | ToolbarSpacerConfig
  | ToolbarTextConfig;

export interface ToolbarAction {
  type: 'navigate' | 'navigateBack' | 'callback' | 'link';
  path?: string;
  url?: string;
  callbackId?: string;
}

export interface JsonToolbarConfig {
  items: ToolbarItemConfig[];
  variant?: 'dense' | 'regular';
  elevation?: number;
  color?: 'default' | 'primary' | 'secondary' | 'transparent';
}

interface JsonToolbarProps {
  config: JsonToolbarConfig;
  callbacks?: Record<string, () => void>;
  sx?: object;
}

const getIcon = (iconName?: IconName): React.ReactNode => {
  if (!iconName) return null;
  const IconComponent = MuiIcons[iconName] as React.ComponentType;
  return IconComponent ? <IconComponent /> : null;
};

const JsonToolbar: React.FC<JsonToolbarProps> = ({ config, callbacks = {}, sx }) => {
  const navigate = useNavigate();

  const handleAction = (action: ToolbarAction) => {
    switch (action.type) {
      case 'navigate':
        if (action.path) {
          navigate(action.path);
        }
        break;
      case 'navigateBack':
        navigate(-1);
        break;
      case 'callback':
        if (action.callbackId && callbacks[action.callbackId]) {
          callbacks[action.callbackId]();
        }
        break;
      case 'link':
        if (action.url) {
          window.open(action.url, '_blank');
        }
        break;
    }
  };

  const renderItem = (item: ToolbarItemConfig, index: number) => {
    switch (item.type) {
      case 'button':
        return (
          <Button
            key={index}
            variant={item.variant || 'text'}
            color={item.color || 'inherit'}
            disabled={item.disabled}
            startIcon={getIcon(item.icon)}
            onClick={() => handleAction(item.action)}
            sx={{ mx: 0.5 }}
          >
            {item.label}
          </Button>
        );

      case 'iconButton':
        return (
          <IconButton
            key={index}
            color={item.color || 'inherit'}
            disabled={item.disabled}
            onClick={() => handleAction(item.action)}
            title={item.label}
          >
            {getIcon(item.icon)}
          </IconButton>
        );

      case 'divider':
        return (
          <Divider
            key={index}
            orientation={item.orientation || 'vertical'}
            flexItem
            sx={{ mx: 1 }}
          />
        );

      case 'spacer':
        return <Box key={index} sx={{ flexGrow: 1 }} />;

      case 'text':
        return (
          <Typography
            key={index}
            variant={item.variant || 'subtitle1'}
            noWrap={item.noWrap !== false}
            sx={{
              fontFamily: item.fontFamily,
              mx: 1
            }}
          >
            {item.text}
          </Typography>
        );

      default:
        return null;
    }
  };

  return (
    <Toolbar variant={config.variant || 'regular'} sx={sx}>
      {config.items.map((item, index) => renderItem(item, index))}
    </Toolbar>
  );
};

export default JsonToolbar;
