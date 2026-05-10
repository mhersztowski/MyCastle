import { useState } from 'react';
import {
  Box, TextField, IconButton, Typography, Paper, MenuItem, Menu, Chip, Button,
} from '@mui/material';
import { Add, Delete, KeyboardArrowDown } from '@mui/icons-material';
import type {
  IotEntity, IotEntityType, IotSensorEntity, IotBinarySensorEntity,
  IotNumberEntity, IotSelectEntity,
} from '@mhersztowski/core';

interface EntityConfigEditorProps {
  entities: IotEntity[];
  onChange: (entities: IotEntity[]) => void;
}

const ENTITY_TYPES: IotEntityType[] = ['sensor', 'binary_sensor', 'switch', 'number', 'button', 'select'];

const ENTITY_TYPE_LABELS: Record<IotEntityType, string> = {
  sensor: 'Sensor',
  binary_sensor: 'Binary Sensor',
  switch: 'Switch',
  number: 'Number',
  button: 'Button',
  select: 'Select',
};

const ENTITY_TYPE_COLORS: Record<IotEntityType, 'success' | 'info' | 'warning' | 'secondary' | 'error' | 'default'> = {
  sensor: 'success',
  binary_sensor: 'info',
  switch: 'warning',
  number: 'secondary',
  button: 'error',
  select: 'default',
};

function makeDefault(type: IotEntityType): IotEntity {
  const base = { id: '', name: '' };
  switch (type) {
    case 'sensor': return { ...base, type: 'sensor', unit: '' };
    case 'binary_sensor': return { ...base, type: 'binary_sensor' };
    case 'switch': return { ...base, type: 'switch' };
    case 'number': return { ...base, type: 'number', min: 0, max: 100, step: 1 };
    case 'button': return { ...base, type: 'button' };
    case 'select': return { ...base, type: 'select', options: [] };
  }
}

interface EntityRowProps {
  entity: IotEntity;
  index: number;
  onChange: (index: number, updated: IotEntity) => void;
  onRemove: (index: number) => void;
}

function EntityRow({ entity, index, onChange, onRemove }: EntityRowProps) {
  const patch = (updates: Partial<IotEntity>) =>
    onChange(index, { ...entity, ...updates } as IotEntity);

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
        <Chip
          label={ENTITY_TYPE_LABELS[entity.type]}
          color={ENTITY_TYPE_COLORS[entity.type]}
          size="small"
          sx={{ minWidth: 100 }}
        />
        <TextField
          label="ID"
          value={entity.id}
          onChange={(e) => patch({ id: e.target.value })}
          size="small"
          sx={{ width: 150 }}
          placeholder="temperature"
        />
        <TextField
          label="Name"
          value={entity.name}
          onChange={(e) => patch({ name: e.target.value })}
          size="small"
          sx={{ flexGrow: 1 }}
          placeholder="Temperature"
        />
        <TextField
          label="Icon"
          value={entity.icon ?? ''}
          onChange={(e) => patch({ icon: e.target.value || undefined })}
          size="small"
          sx={{ width: 120 }}
          placeholder="mdi:thermometer"
        />
        <IconButton size="small" onClick={() => onRemove(index)}>
          <Delete fontSize="small" />
        </IconButton>
      </Box>

      {/* Type-specific fields */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {entity.type === 'sensor' && (
          <>
            <TextField
              label="Unit"
              value={(entity as IotSensorEntity).unit}
              onChange={(e) => patch({ unit: e.target.value } as Partial<IotSensorEntity>)}
              size="small"
              sx={{ width: 80 }}
              placeholder="°C"
            />
            <TextField
              label="Device Class"
              value={entity.deviceClass ?? ''}
              onChange={(e) => patch({ deviceClass: e.target.value || undefined })}
              size="small"
              sx={{ width: 160 }}
              placeholder="temperature"
            />
          </>
        )}

        {entity.type === 'binary_sensor' && (
          <>
            <TextField
              label="On Label"
              value={(entity as IotBinarySensorEntity).onLabel ?? ''}
              onChange={(e) => patch({ onLabel: e.target.value || undefined } as Partial<IotBinarySensorEntity>)}
              size="small"
              sx={{ width: 120 }}
              placeholder="Active"
            />
            <TextField
              label="Off Label"
              value={(entity as IotBinarySensorEntity).offLabel ?? ''}
              onChange={(e) => patch({ offLabel: e.target.value || undefined } as Partial<IotBinarySensorEntity>)}
              size="small"
              sx={{ width: 120 }}
              placeholder="Inactive"
            />
            <TextField
              label="Device Class"
              value={entity.deviceClass ?? ''}
              onChange={(e) => patch({ deviceClass: e.target.value || undefined })}
              size="small"
              sx={{ width: 160 }}
              placeholder="motion"
            />
          </>
        )}

        {entity.type === 'number' && (
          <>
            <TextField
              label="Min"
              type="number"
              value={(entity as IotNumberEntity).min}
              onChange={(e) => patch({ min: parseFloat(e.target.value) || 0 } as Partial<IotNumberEntity>)}
              size="small"
              sx={{ width: 80 }}
            />
            <TextField
              label="Max"
              type="number"
              value={(entity as IotNumberEntity).max}
              onChange={(e) => patch({ max: parseFloat(e.target.value) || 100 } as Partial<IotNumberEntity>)}
              size="small"
              sx={{ width: 80 }}
            />
            <TextField
              label="Step"
              type="number"
              value={(entity as IotNumberEntity).step}
              onChange={(e) => patch({ step: parseFloat(e.target.value) || 1 } as Partial<IotNumberEntity>)}
              size="small"
              sx={{ width: 80 }}
              inputProps={{ min: 0.01, step: 0.1 }}
            />
            <TextField
              label="Unit"
              value={(entity as IotNumberEntity).unit ?? ''}
              onChange={(e) => patch({ unit: e.target.value || undefined } as Partial<IotNumberEntity>)}
              size="small"
              sx={{ width: 80 }}
              placeholder="°C"
            />
            <TextField
              label="Device Class"
              value={entity.deviceClass ?? ''}
              onChange={(e) => patch({ deviceClass: e.target.value || undefined })}
              size="small"
              sx={{ width: 160 }}
              placeholder="temperature"
            />
          </>
        )}

        {entity.type === 'select' && (
          <SelectOptionsEditor
            options={(entity as IotSelectEntity).options}
            onChange={(options) => patch({ options } as Partial<IotSelectEntity>)}
          />
        )}
      </Box>
    </Paper>
  );
}

function SelectOptionsEditor({ options, onChange }: { options: string[]; onChange: (opts: string[]) => void }) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const trimmed = draft.trim();
    if (trimmed && !options.includes(trimmed)) {
      onChange([...options, trimmed]);
      setDraft('');
    }
  };

  const remove = (i: number) => onChange(options.filter((_, idx) => idx !== i));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, width: '100%' }}>
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Options:</Typography>
        {options.map((opt, i) => (
          <Chip key={i} label={opt} size="small" onDelete={() => remove(i)} />
        ))}
        {options.length === 0 && (
          <Typography variant="caption" color="text.secondary">None yet</Typography>
        )}
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          label="New option"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          size="small"
          sx={{ width: 160 }}
          placeholder="option-value"
        />
        <Button size="small" variant="outlined" onClick={add} disabled={!draft.trim()}>Add</Button>
      </Box>
    </Box>
  );
}

function EntityConfigEditor({ entities, onChange }: EntityConfigEditorProps) {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  const handleAdd = (type: IotEntityType) => {
    setMenuAnchor(null);
    onChange([...entities, makeDefault(type)]);
  };

  const handleChange = (index: number, updated: IotEntity) => {
    onChange(entities.map((e, i) => (i === index ? updated : e)));
  };

  const handleRemove = (index: number) => {
    onChange(entities.filter((_, i) => i !== index));
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2">Entities</Typography>
        <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)}>
          <Add fontSize="small" />
          <KeyboardArrowDown fontSize="small" />
        </IconButton>
        <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
          {ENTITY_TYPES.map((type) => (
            <MenuItem key={type} onClick={() => handleAdd(type)}>
              <Chip
                label={ENTITY_TYPE_LABELS[type]}
                color={ENTITY_TYPE_COLORS[type]}
                size="small"
                sx={{ mr: 1, minWidth: 100 }}
              />
              {type === 'sensor' && 'Read-only numeric/string value'}
              {type === 'binary_sensor' && 'On/off state indicator'}
              {type === 'switch' && 'Controllable on/off toggle'}
              {type === 'number' && 'Controllable numeric with range'}
              {type === 'button' && 'Trigger-only action'}
              {type === 'select' && 'Choose from options'}
            </MenuItem>
          ))}
        </Menu>
      </Box>

      {entities.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
          No entities configured. Click + to add one.
        </Typography>
      )}

      {entities.map((entity, index) => (
        <EntityRow
          key={index}
          entity={entity}
          index={index}
          onChange={handleChange}
          onRemove={handleRemove}
        />
      ))}
    </Box>
  );
}

export default EntityConfigEditor;
