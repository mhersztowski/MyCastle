/**
 * UI Project Picker - wybór projektu
 */

import React from 'react';
import { UIControlModel, UIProjectPickerProperties } from '../../../models';
import { useUIControl } from '../../../binding';
import { registerControl, CONTROL_METADATA } from '../registry';
import ProjectPicker from '../../../../../components/project/ProjectPicker';

interface UIProjectPickerProps {
  control: UIControlModel;
  children?: React.ReactNode;
}

export const UIProjectPicker: React.FC<UIProjectPickerProps> = ({ control }) => {
  const props = (control.properties || {}) as unknown as UIProjectPickerProperties;
  const { value, onChange, isEditable } = useUIControl<string>(
    control.binding,
    control.events
  );

  const selectedId = value ?? props.value ?? '';

  const handleChange = (id: string | null) => {
    onChange(id ?? '');
  };

  return (
    <ProjectPicker
      id={selectedId || null}
      editable={props.editable !== false && isEditable}
      size={props.size || 'medium'}
      onChange={handleChange}
    />
  );
};

// Rejestracja
registerControl('projectPicker', UIProjectPicker, CONTROL_METADATA.projectPicker);
