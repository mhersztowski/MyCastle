/**
 * UI Control Renderer - renderuje pojedynczą kontrolkę
 */

import React from 'react';
import { Box, Typography } from '@mui/material';
import { UIControlModel } from '../models';
// Import from controls (not registry) to trigger control registration side effects
import { controlRegistry } from './controls';
import { useUIFormContextOptional } from '../binding';
import {
  UIAnchorLayout,
  UIFlexChild,
  isAnchorLayoutContainer,
  isFlexLayoutContainer,
} from './UIAnchorLayout';

interface UIControlRendererProps {
  control: UIControlModel;
  parentType?: string;  // Typ rodzica (dla określenia layout mode)
}

export const UIControlRenderer: React.FC<UIControlRendererProps> = ({
  control,
  parentType,
}) => {
  // Use optional context - allows renderer to work without UIFormProvider (e.g. in designer)
  const formContext = useUIFormContextOptional();

  // Provide defaults when no context is available
  const mode = formContext?.mode ?? 'view';
  const selectedControlId = formContext?.selectedControlId ?? null;
  const setSelectedControlId = formContext?.setSelectedControlId ?? (() => {});

  // Pobierz komponent z rejestru
  const Component = controlRegistry.get(control.controlType);

  // Określ czy to design mode
  const isDesignMode = mode === 'design';
  const isSelected = selectedControlId === control.id;
  const [isHovered, setIsHovered] = React.useState(false);

  // Handler kliknięcia (dla design mode)
  const handleClick = React.useCallback((e: React.MouseEvent) => {
    if (isDesignMode) {
      e.stopPropagation();
      setSelectedControlId(control.id);
    }
  }, [isDesignMode, control.id, setSelectedControlId]);

  // Fallback dla niezarejestrowanego komponentu
  if (!Component) {
    console.warn(`Unknown control type: ${control.controlType}`);
    return (
      <Box
        sx={{
          p: 2,
          border: '1px dashed',
          borderColor: 'error.main',
          borderRadius: 1,
          bgcolor: 'error.lighter',
        }}
      >
        <Typography variant="caption" color="error">
          Unknown control: {control.controlType}
        </Typography>
      </Box>
    );
  }

  // Renderuj kontrolkę
  const renderedControl = (
    <Component control={control}>
      {control.children?.map((child) => (
        <UIControlRenderer
          key={child.id}
          control={child}
          parentType={control.controlType}
        />
      ))}
    </Component>
  );

  // Wrapper props dla hover w design mode
  const wrapperProps = isDesignMode
    ? {
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false),
      }
    : {};

  // Określ typ layoutu na podstawie rodzica
  if (parentType) {
    if (isFlexLayoutContainer(parentType)) {
      // Rodzic to VBox lub HBox - użyj flex child
      return (
        <Box {...wrapperProps}>
          <UIFlexChild
            control={control}
            isDesignMode={isDesignMode}
            isSelected={isSelected}
            isHovered={isHovered}
            onClick={handleClick}
          >
            {renderedControl}
          </UIFlexChild>
        </Box>
      );
    }

    if (isAnchorLayoutContainer(parentType)) {
      // Rodzic to Container - użyj anchor layout
      return (
        <Box {...wrapperProps}>
          <UIAnchorLayout
            control={control}
            isDesignMode={isDesignMode}
            isSelected={isSelected}
            isHovered={isHovered}
            onClick={handleClick}
          >
            {renderedControl}
          </UIAnchorLayout>
        </Box>
      );
    }
  }

  // Domyślnie - bez wrappera layoutu (dla root lub grid children)
  if (isDesignMode) {
    return (
      <Box
        {...wrapperProps}
        sx={{
          position: 'relative',
          outline: isSelected
            ? '2px solid #1976d2'
            : isHovered
              ? '1px dashed #90caf9'
              : '1px dashed transparent',
          outlineOffset: '-1px',
          cursor: 'pointer',
          transition: 'outline 0.1s ease',
          ...(isHovered && !isSelected ? { backgroundColor: 'rgba(25, 118, 210, 0.04)' } : {}),
        }}
        onClick={handleClick}
        data-ui-control={control.id}
        data-control-type={control.controlType}
      >
        {renderedControl}
      </Box>
    );
  }

  return renderedControl;
};
