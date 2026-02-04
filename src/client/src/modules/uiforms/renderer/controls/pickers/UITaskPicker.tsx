/**
 * UI Task Picker - wybór zadania
 */

import React from 'react';
import { UIControlModel, UITaskPickerProperties } from '../../../models';
import { useUIControl } from '../../../binding';
import { registerControl, CONTROL_METADATA } from '../registry';
import TaskPicker from '../../../../../components/task/TaskPicker';

interface UITaskPickerProps {
  control: UIControlModel;
  children?: React.ReactNode;
}

export const UITaskPicker: React.FC<UITaskPickerProps> = ({ control }) => {
  const props = (control.properties || {}) as unknown as UITaskPickerProperties;
  const { value, onChange, isEditable } = useUIControl<string>(
    control.binding,
    control.events
  );

  const selectedId = value ?? props.value ?? '';

  const handleChange = (id: string | null) => {
    onChange(id ?? '');
  };

  return (
    <TaskPicker
      id={selectedId || null}
      editable={props.editable !== false && isEditable}
      size={props.size || 'medium'}
      onChange={handleChange}
    />
  );
};

// Rejestracja
registerControl('taskPicker', UITaskPicker, CONTROL_METADATA.taskPicker);
