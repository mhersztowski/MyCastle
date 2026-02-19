/**
 * UI Designer Canvas - canvas do edycji formularza z drag & drop
 */

import React, { useRef, useState } from 'react';
import { Box, Paper, Typography, alpha } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useUIDesigner } from './UIDesignerContext';
import { UIControlModel } from '../models';
import { UIControlRenderer } from '../renderer/UIControlRenderer';
import { CONTROL_METADATA, IconComponent } from '../renderer/controls/registry';

// Komponent wizualizujący dropzone
interface DropZoneProps {
  parentId: string | null;
  index: number;
  isActive: boolean;
  onDrop: (parentId: string | null, index: number) => void;
}

const DropZone: React.FC<DropZoneProps> = ({ parentId, index, isActive, onDrop }) => {
  const [isOver, setIsOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setIsOver(true);
  };

  const handleDragLeave = () => {
    setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
    onDrop(parentId, index);
  };

  if (!isActive) return null;

  return (
    <Box
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        height: isOver ? 48 : 8,
        mx: 1,
        my: 0.5,
        borderRadius: 1,
        border: '2px dashed',
        borderColor: isOver ? 'primary.main' : 'transparent',
        bgcolor: isOver ? (theme) => alpha(theme.palette.primary.main, 0.1) : 'transparent',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {isOver && <AddIcon sx={{ color: 'primary.main' }} />}
    </Box>
  );
};

// Komponent renderujący kontrolkę w trybie design
interface DesignControlProps {
  control: UIControlModel;
  depth: number;
}

const DesignControl: React.FC<DesignControlProps> = ({ control, depth }) => {
  const {
    selectedControlId,
    hoveredControlId,
    selectControl,
    hoverControl,
    isDragging,
    draggedControlType,
    draggedControlId,
    addControl,
    moveControl,
    form,
  } = useUIDesigner();

  const isSelected = selectedControlId === control.id;
  const isHovered = hoveredControlId === control.id;
  const isContainer = ['container', 'vbox', 'hbox', 'grid', 'margin', 'scroll', 'tabs', 'accordion'].includes(control.controlType);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectControl(control.id);
  };

  const handleMouseEnter = () => {
    hoverControl(control.id);
  };

  const handleMouseLeave = () => {
    if (hoveredControlId === control.id) {
      hoverControl(null);
    }
  };

  const handleDrop = (parentId: string | null, index: number) => {
    if (draggedControlType) {
      // Nowa kontrolka z toolbox
      addControl(parentId || control.id, draggedControlType, index);
    } else if (draggedControlId && draggedControlId !== control.id) {
      // Przenoszenie istniejącej kontrolki
      moveControl(draggedControlId, parentId || control.id, index);
    }
  };

  const handleControlDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isContainer && draggedControlType) {
      addControl(control.id, draggedControlType);
    } else if (isContainer && draggedControlId && draggedControlId !== control.id) {
      moveControl(draggedControlId, control.id);
    }
  };

  const handleControlDragOver = (e: React.DragEvent) => {
    if (isContainer) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const meta = CONTROL_METADATA[control.controlType];
  const Icon: IconComponent | undefined = meta?.icon;

  // Renderuj dzieci z dropzone'ami
  const renderChildren = () => {
    if (!control.children || control.children.length === 0) {
      // Pusty kontener - pokaż placeholder
      if (isContainer) {
        return (
          <Box
            sx={{
              minHeight: 60,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: isDragging ? '2px dashed' : '1px dashed',
              borderColor: isDragging ? 'primary.main' : 'grey.300',
              borderRadius: 1,
              m: 1,
              color: 'text.disabled',
              bgcolor: isDragging ? (theme) => alpha(theme.palette.primary.main, 0.05) : 'transparent',
            }}
            onDragOver={handleControlDragOver}
            onDrop={handleControlDrop}
          >
            <Typography variant="caption">
              {isDragging ? 'Upuść tutaj' : 'Pusty kontener'}
            </Typography>
          </Box>
        );
      }
      return null;
    }

    return (
      <>
        <DropZone
          parentId={control.id}
          index={0}
          isActive={isDragging}
          onDrop={handleDrop}
        />
        {control.children.map((child, index) => (
          <React.Fragment key={child.id}>
            <DesignControl control={child} depth={depth + 1} />
            <DropZone
              parentId={control.id}
              index={index + 1}
              isActive={isDragging}
              onDrop={handleDrop}
            />
          </React.Fragment>
        ))}
      </>
    );
  };

  // Root ma specjalne traktowanie
  if (control.id === form?.root.id) {
    return (
      <Box
        onClick={(e) => {
          e.stopPropagation();
          selectControl(control.id);
        }}
        onDragOver={handleControlDragOver}
        onDrop={handleControlDrop}
        sx={{
          position: 'relative',
          minHeight: 200,
          border: isSelected ? '2px solid' : '1px solid',
          borderColor: isSelected ? 'primary.main' : 'grey.300',
          borderRadius: 1,
          bgcolor: 'background.paper',
          overflow: 'hidden',
        }}
      >
        {renderChildren()}
      </Box>
    );
  }

  return (
    <Box
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDragOver={handleControlDragOver}
      onDrop={handleControlDrop}
      sx={{
        position: 'relative',
        border: isSelected ? '2px solid' : isHovered ? '1px solid' : '1px solid transparent',
        borderColor: isSelected ? 'primary.main' : isHovered ? 'primary.light' : 'transparent',
        borderRadius: 0.5,
        m: 0.5,
        transition: 'border-color 0.15s ease',
        cursor: 'pointer',
        '&::before': isSelected || isHovered
          ? {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              bgcolor: (theme) =>
                alpha(theme.palette.primary.main, isSelected ? 0.05 : 0.02),
              pointerEvents: 'none',
              borderRadius: 'inherit',
            }
          : undefined,
      }}
    >
      {/* Control label */}
      {(isSelected || isHovered) && (
        <Box
          sx={{
            position: 'absolute',
            top: -1,
            left: 4,
            transform: 'translateY(-100%)',
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 0.75,
            py: 0.25,
            bgcolor: isSelected ? 'primary.main' : 'primary.light',
            color: 'primary.contrastText',
            borderRadius: '4px 4px 0 0',
            fontSize: '0.7rem',
            fontWeight: 500,
            zIndex: 10,
          }}
        >
          {Icon && <Icon sx={{ fontSize: 12 }} />}
          {control.name}
        </Box>
      )}

      {/* Render control content */}
      {isContainer ? (
        <Box
          sx={{
            minHeight: 40,
            // Apply flex layout based on container type
            ...(control.controlType === 'hbox' && {
              display: 'flex',
              flexDirection: 'row',
              gap: (control.properties as Record<string, unknown>)?.gap
                ? `${(control.properties as Record<string, unknown>).gap}px`
                : '8px',
              alignItems: 'center',
              flexWrap: 'wrap',
            }),
            ...(control.controlType === 'vbox' && {
              display: 'flex',
              flexDirection: 'column',
              gap: (control.properties as Record<string, unknown>)?.gap
                ? `${(control.properties as Record<string, unknown>).gap}px`
                : '8px',
            }),
            ...(control.controlType === 'grid' && {
              display: 'grid',
              gridTemplateColumns: `repeat(${(control.properties as Record<string, unknown>)?.columns || 2}, 1fr)`,
              gap: (control.properties as Record<string, unknown>)?.gap
                ? `${(control.properties as Record<string, unknown>).gap}px`
                : '8px',
            }),
          }}
        >
          {renderChildren()}
        </Box>
      ) : (
        <Box sx={{ pointerEvents: 'none', opacity: 0.9 }}>
          <UIControlRenderer control={control} />
        </Box>
      )}
    </Box>
  );
};

// Główny Canvas
interface UIDesignerCanvasProps {
  onControlSelect?: (controlId: string | null) => void;
}

const UIDesignerCanvas: React.FC<UIDesignerCanvasProps> = ({ onControlSelect }) => {
  const {
    form,
    zoom,
    showGrid,
    gridSize,
    selectControl,
    isDragging,
    addControl,
    draggedControlType,
  } = useUIDesigner();

  const canvasRef = useRef<HTMLDivElement>(null);

  const handleCanvasClick = () => {
    selectControl(null);
    onControlSelect?.(null);
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedControlType && form) {
      addControl(form.root.id, draggedControlType);
    }
  };

  const handleCanvasDragOver = (e: React.DragEvent) => {
    if (isDragging) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  if (!form) {
    return (
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'grey.100',
        }}
      >
        <Typography color="text.secondary">
          Wybierz lub utwórz formularz
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      ref={canvasRef}
      onClick={handleCanvasClick}
      onDrop={handleCanvasDrop}
      onDragOver={handleCanvasDragOver}
      sx={{
        flex: 1,
        overflow: 'auto',
        bgcolor: 'grey.100',
        p: 3,
        // Grid pattern
        ...(showGrid && {
          backgroundImage: `
            linear-gradient(to right, rgba(0,0,0,0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0,0,0,0.03) 1px, transparent 1px)
          `,
          backgroundSize: `${gridSize * zoom}px ${gridSize * zoom}px`,
        }),
      }}
    >
      <Paper
        elevation={2}
        sx={{
          width: form.settings?.width || 400,
          minHeight: form.settings?.height || 300,
          mx: 'auto',
          p: form.settings?.padding ? `${form.settings.padding}px` : 2,
          transform: `scale(${zoom})`,
          transformOrigin: 'top center',
          transition: 'transform 0.2s ease',
        }}
      >
        <DesignControl control={form.root} depth={0} />
      </Paper>
    </Box>
  );
};

export default UIDesignerCanvas;
