/**
 * UI Person Picker - wybór osoby
 */

import React from 'react';
import { UIControlModel, UIPersonPickerProperties } from '../../../models';
import { useUIControl } from '../../../binding';
import { registerControl, CONTROL_METADATA } from '../registry';
import PersonPicker from '../../../../../components/person/PersonPicker';

interface UIPersonPickerProps {
  control: UIControlModel;
  children?: React.ReactNode;
}

export const UIPersonPicker: React.FC<UIPersonPickerProps> = ({ control }) => {
  const props = (control.properties || {}) as unknown as UIPersonPickerProperties;
  const { value, onChange, isEditable } = useUIControl<string>(
    control.binding,
    control.events
  );

  const selectedId = value ?? props.value ?? '';

  const handleChange = (id: string | null) => {
    onChange(id ?? '');
  };

  return (
    <PersonPicker
      id={selectedId || null}
      editable={props.editable !== false && isEditable}
      size={props.size || 'medium'}
      onChange={handleChange}
    />
  );
};

// Rejestracja
registerControl('personPicker', UIPersonPicker, CONTROL_METADATA.personPicker);
