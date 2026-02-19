/**
 * AutomateMobileToolbox - bottom drawer z nodami (tap-to-add)
 */

import React from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { NODE_TYPE_METADATA, CATEGORY_LABELS, CATEGORY_ORDER } from '../../registry/nodeTypes';
import { AutomateNodeType } from '@mhersztowski/core';

interface AutomateMobileToolboxProps {
  open: boolean;
  onClose: () => void;
  onAddNode: (nodeType: AutomateNodeType) => void;
}

const AutomateMobileToolbox: React.FC<AutomateMobileToolboxProps> = ({ open, onClose, onAddNode }) => {
  const categorizedNodes = CATEGORY_ORDER.map(category => ({
    category,
    label: CATEGORY_LABELS[category],
    nodes: Object.values(NODE_TYPE_METADATA).filter(m => m.category === category),
  }));

  const handleNodeTap = (nodeType: AutomateNodeType) => {
    onAddNode(nodeType);
    onClose();
  };

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          borderRadius: '16px 16px 0 0',
          maxHeight: '70vh',
        },
      }}
    >
      {/* Puller handle */}
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1, pb: 0.5 }}>
        <Box sx={{ width: 40, height: 6, bgcolor: 'grey.300', borderRadius: 3 }} />
      </Box>

      {/* Header */}
      <Box sx={{ px: 2, pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle1" fontWeight={600}>
          Dodaj node
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Node categories */}
      <Box sx={{ overflow: 'auto', px: 1, pb: 2 }}>
        {categorizedNodes.map(({ category, label, nodes }) => (
          <Accordion
            key={category}
            defaultExpanded
            disableGutters
            elevation={0}
            sx={{ '&:before': { display: 'none' } }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}
            >
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
                      onClick={() => handleNodeTap(meta.nodeType)}
                      sx={{ py: 1 }}
                    >
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <Icon sx={{ fontSize: 20, color: meta.color }} />
                      </ListItemIcon>
                      <ListItemText
                        primary={meta.label}
                        secondary={meta.description}
                        primaryTypographyProps={{ variant: 'body2' }}
                        secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
                      />
                    </ListItemButton>
                  );
                })}
              </List>
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>
    </Drawer>
  );
};

export default AutomateMobileToolbox;
