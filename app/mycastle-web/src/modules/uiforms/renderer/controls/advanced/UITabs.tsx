/**
 * UI Tabs - zakładki
 */

import React, { useState } from 'react';
import { Box, Tabs, Tab } from '@mui/material';
import * as Icons from '@mui/icons-material';
import { UIControlModel, UITabsProperties } from '../../../models';
import { UIControlRenderer } from '../../UIControlRenderer';
import { registerControl, CONTROL_METADATA } from '../registry';

interface UITabsProps {
  control: UIControlModel;
  children?: React.ReactNode;
}

export const UITabs: React.FC<UITabsProps> = ({ control }) => {
  const props = (control.properties || {}) as unknown as UITabsProperties;
  const [activeTab, setActiveTab] = useState(props.activeTab ?? 0);

  const tabs = props.tabs || [];

  const handleChange = (_: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={activeTab}
          onChange={handleChange}
          variant={props.variant || 'standard'}
          centered={props.centered}
        >
          {tabs.map((tab) => {
            // Dynamiczne ładowanie ikony
            const IconComponent = tab.icon
              ? (Icons as Record<string, React.ElementType>)[tab.icon]
              : null;

            return (
              <Tab
                key={tab.id}
                label={tab.label}
                disabled={tab.disabled}
                icon={IconComponent ? <IconComponent /> : undefined}
                iconPosition="start"
              />
            );
          })}
        </Tabs>
      </Box>

      {/* Tab panels */}
      {tabs.map((tab, index) => (
        <Box
          key={tab.id}
          role="tabpanel"
          hidden={activeTab !== index}
          sx={{
            flex: 1,
            position: 'relative',
            overflow: 'auto',
            p: 2,
          }}
        >
          {activeTab === index && tab.content && (
            <UIControlRenderer control={tab.content} />
          )}
        </Box>
      ))}
    </Box>
  );
};

// Rejestracja
registerControl('tabs', UITabs, CONTROL_METADATA.tabs);
