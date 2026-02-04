/**
 * UI Accordion - rozwijane sekcje
 */

import React, { useState } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Box,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import * as Icons from '@mui/icons-material';
import { UIControlModel, UIAccordionProperties } from '../../../models';
import { UIControlRenderer } from '../../UIControlRenderer';
import { registerControl, CONTROL_METADATA } from '../registry';

interface UIAccordionProps {
  control: UIControlModel;
  children?: React.ReactNode;
}

export const UIAccordion: React.FC<UIAccordionProps> = ({ control }) => {
  const props = (control.properties || {}) as unknown as UIAccordionProperties;

  // Inicjalizuj rozwinięte elementy
  const initialExpanded = new Set(
    props.expandedItems ||
    props.items?.filter(item => item.defaultExpanded).map(item => item.id) ||
    []
  );
  const [expanded, setExpanded] = useState<Set<string>>(initialExpanded);

  const items = props.items || [];

  const handleChange = (itemId: string) => (_: React.SyntheticEvent, isExpanded: boolean) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (isExpanded) {
        if (!props.allowMultiple) {
          next.clear();
        }
        next.add(itemId);
      } else {
        next.delete(itemId);
      }
      return next;
    });
  };

  return (
    <Box sx={{ width: '100%' }}>
      {items.map((item) => {
        // Dynamiczne ładowanie ikony
        const IconComponent = item.icon
          ? (Icons as Record<string, React.ElementType>)[item.icon]
          : null;

        return (
          <Accordion
            key={item.id}
            expanded={expanded.has(item.id)}
            onChange={handleChange(item.id)}
            disabled={item.disabled}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {IconComponent && <IconComponent fontSize="small" />}
                <Typography>{item.header}</Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {item.content && (
                <UIControlRenderer control={item.content} />
              )}
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
};

// Rejestracja
registerControl('accordion', UIAccordion, CONTROL_METADATA.accordion);
