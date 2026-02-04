/**
 * UI Anchor Layout - system CSS dla anchors/offsets (Godot-like positioning)
 */

import React from 'react';
import { Box } from '@mui/material';
import {
  UIControlModel,
  UIAnchors,
  UIOffsets,
  UISizeFlags,
  UIAnchorPreset,
  ANCHOR_PRESETS,
} from '../models';

// Typ dla stylów CSS (prosty obiekt zamiast SxProps)
type CSSStyles = Record<string, unknown>;

interface UIAnchorLayoutProps {
  control: UIControlModel;
  children: React.ReactNode;
  isDesignMode?: boolean;
  isSelected?: boolean;
  isHovered?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Komponent opakowujący kontrolkę z anchor-based layout
 * Oblicza pozycję CSS na podstawie anchors i offsets
 */
export const UIAnchorLayout: React.FC<UIAnchorLayoutProps> = ({
  control,
  children,
  isDesignMode = false,
  isSelected = false,
  isHovered = false,
  onClick,
}) => {
  // Pobierz anchors - użyj presetu jeśli zdefiniowany, inaczej bezpośrednie wartości
  const anchors = control.anchorPreset && control.anchorPreset !== 'custom'
    ? ANCHOR_PRESETS[control.anchorPreset]
    : control.anchors;

  const offsets = control.offsets;

  // Oblicz style CSS dla pozycjonowania
  const sx: CSSStyles = calculateAnchorStyles(anchors, offsets, control.minSize, control.sizeFlags);

  // Dodaj style dla design mode
  if (isDesignMode) {
    sx.outline = isSelected
      ? '2px solid #1976d2'
      : isHovered
        ? '1px dashed #90caf9'
        : '1px dashed transparent';
    sx.outlineOffset = '-1px';
    sx.cursor = 'pointer';
    sx.transition = 'outline 0.1s ease';

    // Pokaż podgląd przy hover
    if (isHovered && !isSelected) {
      sx.backgroundColor = 'rgba(25, 118, 210, 0.04)';
    }
  }

  // Visibility
  if (control.visible === false) {
    sx.display = 'none';
  }

  return (
    <Box
      sx={sx}
      data-ui-control={control.id}
      data-control-type={control.controlType}
      onClick={onClick}
    >
      {children}
    </Box>
  );
};

/**
 * Oblicz style CSS dla pozycjonowania anchor-based
 *
 * W Godot:
 * - anchors (0-1) określają punkt odniesienia względem rodzica
 * - offsets (px) określają przesunięcie od punktu anchor
 *
 * Przykłady:
 * - Top-Left corner: anchors(0,0,0,0), offsets(10,10,110,50) → pozycja (10,10), rozmiar (100x40)
 * - Full Rect: anchors(0,0,1,1), offsets(0,0,0,0) → wypełnia całego rodzica
 * - Center: anchors(0.5,0.5,0.5,0.5), offsets(-50,-25,50,25) → wyśrodkowany, rozmiar (100x50)
 */
function calculateAnchorStyles(
  anchors: UIAnchors,
  offsets: UIOffsets,
  minSize?: { width?: number; height?: number },
  _sizeFlags?: UISizeFlags
): CSSStyles {
  const sx: CSSStyles = {
    position: 'absolute',
    boxSizing: 'border-box',
  };

  // Left edge: anchor_left * parent_width + offset_left
  sx.left = `calc(${anchors.left * 100}% + ${offsets.left}px)`;

  // Top edge: anchor_top * parent_height + offset_top
  sx.top = `calc(${anchors.top * 100}% + ${offsets.top}px)`;

  // Width calculation:
  // Jeśli left i right anchor są takie same → użyj różnicy offsetów jako stałej szerokości
  // Jeśli różne → oblicz szerokość jako różnicę między right i left edge
  if (anchors.left === anchors.right) {
    // Stała szerokość (offset_right - offset_left)
    sx.width = `${offsets.right - offsets.left}px`;
  } else {
    // Szerokość zależna od rodzica
    // right_edge = anchor_right * parent_width + offset_right
    // width = right_edge - left_edge
    sx.width = `calc(${(anchors.right - anchors.left) * 100}% + ${offsets.right - offsets.left}px)`;
  }

  // Height calculation (analogicznie do width)
  if (anchors.top === anchors.bottom) {
    // Stała wysokość
    sx.height = `${offsets.bottom - offsets.top}px`;
  } else {
    // Wysokość zależna od rodzica
    sx.height = `calc(${(anchors.bottom - anchors.top) * 100}% + ${offsets.bottom - offsets.top}px)`;
  }

  // Min size constraints
  if (minSize?.width) {
    sx.minWidth = minSize.width;
  }
  if (minSize?.height) {
    sx.minHeight = minSize.height;
  }

  return sx;
}

/**
 * Oblicz style flexbox dla kontenerów (VBox, HBox)
 * Używane gdy kontrolka jest dzieckiem kontenera flex
 */
export function getFlexChildStyles(sizeFlags?: UISizeFlags): CSSStyles {
  const sx: CSSStyles = {};

  if (sizeFlags?.horizontal === 'fill') {
    sx.width = '100%';
  } else if (sizeFlags?.horizontal === 'expand') {
    sx.flexGrow = sizeFlags.stretchRatio ?? 1;
  } else if (sizeFlags?.horizontal === 'shrinkCenter') {
    sx.flexShrink = 1;
    sx.alignSelf = 'center';
  } else if (sizeFlags?.horizontal === 'shrinkEnd') {
    sx.flexShrink = 1;
    sx.alignSelf = 'flex-end';
  }

  if (sizeFlags?.vertical === 'fill') {
    sx.height = '100%';
  } else if (sizeFlags?.vertical === 'expand') {
    sx.flexGrow = sizeFlags.stretchRatio ?? 1;
  } else if (sizeFlags?.vertical === 'shrinkCenter') {
    sx.flexShrink = 1;
    sx.alignSelf = 'center';
  } else if (sizeFlags?.vertical === 'shrinkEnd') {
    sx.flexShrink = 1;
    sx.alignSelf = 'flex-end';
  }

  return sx;
}

/**
 * Wrapper dla kontrolek w kontenerach flex (VBox, HBox)
 * Nie używa anchor layout, tylko flex child styles
 */
interface UIFlexChildProps {
  control: UIControlModel;
  children: React.ReactNode;
  isDesignMode?: boolean;
  isSelected?: boolean;
  isHovered?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

export const UIFlexChild: React.FC<UIFlexChildProps> = ({
  control,
  children,
  isDesignMode = false,
  isSelected = false,
  isHovered = false,
  onClick,
}) => {
  const sx = getFlexChildStyles(control.sizeFlags);

  // Min size
  if (control.minSize?.width) {
    sx.minWidth = control.minSize.width;
  }
  if (control.minSize?.height) {
    sx.minHeight = control.minSize.height;
  }

  // Design mode styles
  if (isDesignMode) {
    sx.outline = isSelected
      ? '2px solid #1976d2'
      : isHovered
        ? '1px dashed #90caf9'
        : '1px dashed transparent';
    sx.outlineOffset = '-1px';
    sx.cursor = 'pointer';
    sx.transition = 'outline 0.1s ease';

    if (isHovered && !isSelected) {
      sx.backgroundColor = 'rgba(25, 118, 210, 0.04)';
    }
  }

  // Visibility
  if (control.visible === false) {
    sx.display = 'none';
  }

  return (
    <Box
      sx={sx}
      data-ui-control={control.id}
      data-control-type={control.controlType}
      onClick={onClick}
    >
      {children}
    </Box>
  );
};

/**
 * Helper - sprawdź czy kontener używa anchor layout czy flex
 */
export function isAnchorLayoutContainer(controlType: string): boolean {
  return controlType === 'container';
}

export function isFlexLayoutContainer(controlType: string): boolean {
  return ['vbox', 'hbox'].includes(controlType);
}

export function isGridLayoutContainer(controlType: string): boolean {
  return controlType === 'grid';
}

/**
 * Helper - utwórz offsets z predefiniowanego rozmiaru
 */
export function createOffsetsFromSize(
  width: number,
  height: number,
  preset: UIAnchorPreset = 'topLeft'
): UIOffsets {
  const anchors = ANCHOR_PRESETS[preset];

  // Dla top-left: left=0, top=0, right=width, bottom=height
  if (anchors.left === 0 && anchors.top === 0 && anchors.right === 0 && anchors.bottom === 0) {
    return { left: 0, top: 0, right: width, bottom: height };
  }

  // Dla center: left=-width/2, top=-height/2, right=width/2, bottom=height/2
  if (anchors.left === 0.5 && anchors.top === 0.5 && anchors.right === 0.5 && anchors.bottom === 0.5) {
    return { left: -width / 2, top: -height / 2, right: width / 2, bottom: height / 2 };
  }

  // Dla full rect: wszystkie 0
  if (anchors.left === 0 && anchors.top === 0 && anchors.right === 1 && anchors.bottom === 1) {
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }

  // Default
  return { left: 0, top: 0, right: width, bottom: height };
}
