/**
 * UI Designer Tree - drzewo hierarchii kontrolek
 */

import React, { useState, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  Collapse,
  alpha,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';

import { useUIDesigner } from './UIDesignerContext';
import { UIControlModel, UIControlType } from '../models';
import { CONTROL_METADATA, IconComponent } from '../renderer/controls/registry';

interface TreeNodeProps {
  control: UIControlModel;
  depth: number;
  expandedNodes: Set<string>;
  onToggleExpand: (id: string) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  control,
  depth,
  expandedNodes,
  onToggleExpand,
}) => {
  const {
    selectedControlId,
    hoveredControlId,
    selectControl,
    hoverControl,
    startDrag,
    endDrag,
    moveControl,
    addControl,
    form,
  } = useUIDesigner();

  const [isDragOver, setIsDragOver] = useState(false);

  const isSelected = selectedControlId === control.id;
  const isHovered = hoveredControlId === control.id;
  const hasChildren = control.children && control.children.length > 0;
  const isExpanded = expandedNodes.has(control.id);
  const isRoot = form?.root.id === control.id;

  const meta = CONTROL_METADATA[control.controlType];
  const Icon: IconComponent | undefined = meta?.icon;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectControl(control.id);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) {
      onToggleExpand(control.id);
    }
  };

  const handleMouseEnter = () => {
    hoverControl(control.id);
  };

  const handleMouseLeave = () => {
    if (hoveredControlId === control.id) {
      hoverControl(null);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (isRoot) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('controlId', control.id);
    e.dataTransfer.effectAllowed = 'move';
    startDrag(null, control.id);
  };

  const handleDragEnd = () => {
    endDrag();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const isContainer = ['container', 'vbox', 'hbox', 'grid', 'margin', 'scroll', 'tabs', 'accordion'].includes(
      control.controlType
    );

    // Check if dropping a new control from toolbox
    const controlType = e.dataTransfer.getData('controlType');
    if (controlType && isContainer) {
      addControl(control.id, controlType as UIControlType);
      return;
    }

    // Or moving an existing control
    const draggedId = e.dataTransfer.getData('controlId');
    if (draggedId && draggedId !== control.id && isContainer) {
      moveControl(draggedId, control.id);
    }
  };

  return (
    <Box>
      <Box
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          pl: depth * 1.5 + 0.5,
          pr: 0.5,
          py: 0.5,
          cursor: 'pointer',
          bgcolor: isSelected
            ? (theme) => alpha(theme.palette.primary.main, 0.15)
            : isHovered || isDragOver
            ? 'action.hover'
            : 'transparent',
          borderLeft: isSelected ? '3px solid' : '3px solid transparent',
          borderColor: isSelected ? 'primary.main' : 'transparent',
          '&:hover': {
            bgcolor: isSelected
              ? (theme) => alpha(theme.palette.primary.main, 0.15)
              : 'action.hover',
          },
        }}
      >
        {/* Expand/collapse button */}
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(control.id);
          }}
          sx={{
            width: 20,
            height: 20,
            visibility: hasChildren ? 'visible' : 'hidden',
          }}
        >
          {isExpanded ? (
            <ExpandMoreIcon sx={{ fontSize: 16 }} />
          ) : (
            <ChevronRightIcon sx={{ fontSize: 16 }} />
          )}
        </IconButton>

        {/* Drag handle */}
        {!isRoot && (
          <Box
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            sx={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'grab',
              color: 'action.active',
              '&:active': { cursor: 'grabbing' },
            }}
          >
            <DragIndicatorIcon sx={{ fontSize: 14 }} />
          </Box>
        )}

        {/* Icon */}
        {Icon && (
          <Icon
            sx={{
              fontSize: 16,
              color: isSelected ? 'primary.main' : 'action.active',
            }}
          />
        )}

        {/* Name */}
        <Typography
          variant="body2"
          sx={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: isSelected ? 600 : 400,
            color: isSelected ? 'primary.main' : 'text.primary',
          }}
        >
          {control.name}
        </Typography>

        {/* Type badge */}
        <Typography
          variant="caption"
          sx={{
            color: 'text.disabled',
            fontSize: '0.65rem',
          }}
        >
          {control.controlType}
        </Typography>
      </Box>

      {/* Children */}
      <Collapse in={isExpanded && hasChildren}>
        {control.children?.map((child) => (
          <TreeNode
            key={child.id}
            control={child}
            depth={depth + 1}
            expandedNodes={expandedNodes}
            onToggleExpand={onToggleExpand}
          />
        ))}
      </Collapse>
    </Box>
  );
};

interface UIDesignerTreeProps {
  collapsed?: boolean;
}

const UIDesignerTree: React.FC<UIDesignerTreeProps> = ({ collapsed = false }) => {
  const { form } = useUIDesigner();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    // Domyślnie rozwiń root
    const initial = new Set<string>();
    if (form?.root.id) {
      initial.add(form.root.id);
    }
    return initial;
  });

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    if (!form) return;
    const getAllIds = (control: UIControlModel): string[] => {
      const ids = [control.id];
      control.children?.forEach((child) => {
        ids.push(...getAllIds(child));
      });
      return ids;
    };
    setExpandedNodes(new Set(getAllIds(form.root)));
  }, [form]);

  const handleCollapseAll = useCallback(() => {
    setExpandedNodes(new Set(form?.root.id ? [form.root.id] : []));
  }, [form]);

  if (collapsed) {
    return null;
  }

  return (
    <Paper
      elevation={0}
      sx={{
        width: 220,
        height: '100%',
        borderRight: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          p: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="subtitle2" color="text.secondary">
          Hierarchia
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Rozwiń wszystko">
            <IconButton size="small" onClick={handleExpandAll}>
              <ExpandMoreIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zwiń wszystko">
            <IconButton size="small" onClick={handleCollapseAll}>
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', py: 0.5 }}>
        {form ? (
          <TreeNode
            control={form.root}
            depth={0}
            expandedNodes={expandedNodes}
            onToggleExpand={handleToggleExpand}
          />
        ) : (
          <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body2">Brak formularza</Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
};

export default UIDesignerTree;
