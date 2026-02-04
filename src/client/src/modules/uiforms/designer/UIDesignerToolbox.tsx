/**
 * UI Designer Toolbox - paleta kontrolek do drag & drop
 */

import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
  alpha,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { CONTROL_METADATA, UIControlCategory, IconComponent } from '../renderer/controls/registry';
import { UIControlType } from '../models/UIControlModel';
import { useUIDesigner } from './UIDesignerContext';

// Grupuj kontrolki po kategoriach
const CATEGORY_ORDER: UIControlCategory[] = ['containers', 'basic', 'pickers', 'advanced'];

const CATEGORY_LABELS: Record<UIControlCategory, string> = {
  containers: 'Kontenery',
  basic: 'Podstawowe',
  pickers: 'Pickery',
  advanced: 'Zaawansowane',
};

interface ToolboxItemProps {
  type: UIControlType;
  label: string;
  icon: IconComponent;
  description: string;
}

const ToolboxItem: React.FC<ToolboxItemProps> = ({ type, label, icon: Icon, description }) => {
  const { startDrag, endDrag, addControl, selectedControlId, form } = useUIDesigner();
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('controlType', type);
    e.dataTransfer.effectAllowed = 'copy';
    setIsDragging(true);
    startDrag(type);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    endDrag();
  };

  const handleClick = () => {
    // Dodaj do wybranego kontenera lub roota
    const parentId = selectedControlId || (form ? form.root.id : null);
    addControl(parentId, type);
  };

  return (
    <Tooltip title={description || label} placement="right" arrow>
      <Paper
        elevation={isDragging ? 4 : 0}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={handleClick}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1,
          cursor: 'grab',
          bgcolor: isDragging ? 'action.selected' : 'background.paper',
          border: '1px solid',
          borderColor: isDragging ? 'primary.main' : 'divider',
          borderRadius: 1,
          transition: 'all 0.15s ease',
          '&:hover': {
            bgcolor: 'action.hover',
            borderColor: 'primary.light',
            transform: 'translateX(2px)',
          },
          '&:active': {
            cursor: 'grabbing',
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 0.5,
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
            color: 'primary.main',
          }}
        >
          <Icon sx={{ fontSize: 18 }} />
        </Box>
        <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>
          {label}
        </Typography>
      </Paper>
    </Tooltip>
  );
};

interface UIDesignerToolboxProps {
  collapsed?: boolean;
}

const UIDesignerToolbox: React.FC<UIDesignerToolboxProps> = ({ collapsed = false }) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<UIControlCategory>>(
    new Set(CATEGORY_ORDER)
  );

  const handleAccordionChange = (category: UIControlCategory) => (_: unknown, isExpanded: boolean) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (isExpanded) {
        next.add(category);
      } else {
        next.delete(category);
      }
      return next;
    });
  };

  // Grupuj kontrolki po kategoriach
  const controlsByCategory = CATEGORY_ORDER.reduce((acc, category) => {
    acc[category] = Object.entries(CONTROL_METADATA)
      .filter(([, meta]) => meta.category === category)
      .sort((a, b) => (a[1].label || '').localeCompare(b[1].label || ''));
    return acc;
  }, {} as Record<UIControlCategory, [string, (typeof CONTROL_METADATA)[keyof typeof CONTROL_METADATA]][]>);

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
      <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle2" color="text.secondary">
          Kontrolki
        </Typography>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {CATEGORY_ORDER.map((category) => {
          const controls = controlsByCategory[category];
          if (controls.length === 0) return null;

          return (
            <Accordion
              key={category}
              expanded={expandedCategories.has(category)}
              onChange={handleAccordionChange(category)}
              disableGutters
              elevation={0}
              sx={{
                '&:before': { display: 'none' },
                bgcolor: 'transparent',
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  minHeight: 40,
                  '& .MuiAccordionSummary-content': { my: 0.5 },
                  bgcolor: 'grey.50',
                  borderBottom: 1,
                  borderColor: 'divider',
                }}
              >
                <Typography variant="caption" fontWeight={600} color="text.secondary">
                  {CATEGORY_LABELS[category]}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {controls.map(([type, meta]) => (
                  <ToolboxItem
                    key={type}
                    type={type as UIControlType}
                    label={meta.label}
                    icon={meta.icon}
                    description={meta.description}
                  />
                ))}
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Box>
    </Paper>
  );
};

export default UIDesignerToolbox;
