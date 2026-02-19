/**
 * AutomateDesignerToolbox - paleta nodów (lewy panel)
 */

import React from 'react';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { NODE_TYPE_METADATA, CATEGORY_LABELS, CATEGORY_ORDER } from '../registry/nodeTypes';
import { AutomateNodeType } from '@mhersztowski/core';

interface AutomateDesignerToolboxProps {
  onDragStart: (nodeType: AutomateNodeType, event: React.DragEvent) => void;
}

const AutomateDesignerToolbox: React.FC<AutomateDesignerToolboxProps> = ({ onDragStart }) => {
  const categorizedNodes = CATEGORY_ORDER.map(category => ({
    category,
    label: CATEGORY_LABELS[category],
    nodes: Object.values(NODE_TYPE_METADATA).filter(m => m.category === category),
  }));

  return (
    <Box sx={{ width: 200, borderRight: '1px solid', borderColor: 'divider', overflow: 'auto', bgcolor: 'background.paper' }}>
      <Box sx={{ p: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="subtitle2" fontWeight={600}>
          Nody
        </Typography>
      </Box>

      {categorizedNodes.map(({ category, label, nodes }) => (
        <Accordion key={category} defaultExpanded disableGutters elevation={0} sx={{ '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Typography variant="caption" fontWeight={600} color="text.secondary">
              {label}
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            <List dense disablePadding>
              {nodes.map(meta => {
                const Icon = meta.icon;
                return (
                  <ListItemButton
                    key={meta.nodeType}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/automate-node-type', meta.nodeType);
                      e.dataTransfer.effectAllowed = 'move';
                      onDragStart(meta.nodeType, e);
                    }}
                    sx={{
                      py: 0.25,
                      cursor: 'grab',
                      '&:active': { cursor: 'grabbing' },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 28 }}>
                      <Icon sx={{ fontSize: 16, color: meta.color }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={meta.label}
                      primaryTypographyProps={{ variant: 'caption', fontSize: '0.75rem' }}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
};

export default AutomateDesignerToolbox;
