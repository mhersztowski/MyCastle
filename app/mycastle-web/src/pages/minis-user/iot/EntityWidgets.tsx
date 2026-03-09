import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Card, CardContent, Typography, Box, Switch as MuiSwitch,
  Slider, Button, Select, MenuItem, FormControl,
} from '@mui/material';
import type {
  IotEntity, IotSensorEntity, IotBinarySensorEntity, IotSwitchEntity,
  IotNumberEntity, IotSelectEntity, TelemetryMetric,
} from '@mhersztowski/core';

// --- Sparkline ---

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}

function Sparkline({ values, width = 120, height = 40, color = '#1976d2' }: SparklineProps) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padding = 2;

  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// --- Entity command callback ---

type OnCommand = (entityId: string, commandName: string, payload: Record<string, unknown>) => void;

// --- Sensor Widget ---

interface SensorWidgetProps {
  entity: IotSensorEntity;
  metric?: TelemetryMetric;
  history?: number[];
}

function SensorWidget({ entity, metric, history }: SensorWidgetProps) {
  const value = metric
    ? typeof metric.value === 'number' ? metric.value.toFixed(1) : String(metric.value)
    : '--';

  return (
    <Card variant="outlined">
      <CardContent sx={{ textAlign: 'center', py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
        <Typography variant="h5" sx={{ fontWeight: 500 }}>{value}</Typography>
        <Typography variant="caption" color="text.secondary">
          {entity.unit ? `${entity.unit} ` : ''}{entity.name}
        </Typography>
        {history && history.length >= 2 && (
          <Box sx={{ mt: 0.5, display: 'flex', justifyContent: 'center' }}>
            <Sparkline values={history} />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

// --- Binary Sensor Widget ---

interface BinarySensorWidgetProps {
  entity: IotBinarySensorEntity;
  metric?: TelemetryMetric;
}

function BinarySensorWidget({ entity, metric }: BinarySensorWidgetProps) {
  const isOn = metric ? Boolean(metric.value) : false;
  const label = isOn ? (entity.onLabel ?? 'On') : (entity.offLabel ?? 'Off');
  const dotColor = isOn ? '#4caf50' : '#9e9e9e';

  return (
    <Card variant="outlined">
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: dotColor, flexShrink: 0 }} />
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>{entity.name}</Typography>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

// --- Switch Widget ---

interface SwitchWidgetProps {
  entity: IotSwitchEntity;
  metric?: TelemetryMetric;
  onCommand: OnCommand;
  disabled?: boolean;
}

function SwitchWidget({ entity, metric, onCommand, disabled }: SwitchWidgetProps) {
  const isOn = metric ? Boolean(metric.value) : false;

  const handleToggle = () => {
    onCommand(entity.id, 'set_state', { entity_id: entity.id, state: !isOn });
  };

  return (
    <Card variant="outlined">
      <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>{entity.name}</Typography>
        <MuiSwitch checked={isOn} onChange={handleToggle} disabled={disabled} size="small" />
      </CardContent>
    </Card>
  );
}

// --- Number Widget ---

interface NumberWidgetProps {
  entity: IotNumberEntity;
  metric?: TelemetryMetric;
  onCommand: OnCommand;
  disabled?: boolean;
}

function NumberWidget({ entity, metric, onCommand, disabled }: NumberWidgetProps) {
  const currentValue = metric && typeof metric.value === 'number' ? metric.value : entity.min;
  const [localValue, setLocalValue] = useState(currentValue);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (metric && typeof metric.value === 'number') {
      setLocalValue(metric.value);
    }
  }, [metric]);

  const handleChange = useCallback((_: unknown, value: number | number[]) => {
    const v = typeof value === 'number' ? value : value[0];
    setLocalValue(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onCommand(entity.id, 'set_value', { entity_id: entity.id, value: v });
    }, 500);
  }, [entity.id, onCommand]);

  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>{entity.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            {localValue.toFixed(1)}{entity.unit ? ` ${entity.unit}` : ''}
          </Typography>
        </Box>
        <Slider
          value={localValue}
          onChange={handleChange}
          min={entity.min}
          max={entity.max}
          step={entity.step}
          disabled={disabled}
          size="small"
        />
      </CardContent>
    </Card>
  );
}

// --- Button Widget ---

interface ButtonWidgetProps {
  entity: IotEntity;
  onCommand: OnCommand;
  disabled?: boolean;
}

function ButtonWidget({ entity, onCommand, disabled }: ButtonWidgetProps) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>{entity.name}</Typography>
        <Button
          size="small"
          variant="outlined"
          disabled={disabled}
          onClick={() => onCommand(entity.id, 'press', { entity_id: entity.id })}
        >
          Press
        </Button>
      </CardContent>
    </Card>
  );
}

// --- Select Widget ---

interface SelectWidgetProps {
  entity: IotSelectEntity;
  metric?: TelemetryMetric;
  onCommand: OnCommand;
  disabled?: boolean;
}

function SelectWidget({ entity, metric, onCommand, disabled }: SelectWidgetProps) {
  // Metric value could be an index (number) or the option string itself
  let currentOption = '';
  if (metric) {
    if (typeof metric.value === 'string') {
      currentOption = metric.value;
    } else if (typeof metric.value === 'number') {
      currentOption = entity.options[metric.value] ?? '';
    }
  }

  return (
    <Card variant="outlined">
      <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
        <Typography variant="body2" sx={{ fontWeight: 500, flexShrink: 0 }}>{entity.name}</Typography>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <Select
            value={currentOption}
            onChange={(e) => onCommand(entity.id, 'set_option', { entity_id: entity.id, option: e.target.value })}
            disabled={disabled}
            size="small"
          >
            {entity.options.map((opt) => (
              <MenuItem key={opt} value={opt}>{opt}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </CardContent>
    </Card>
  );
}

// --- Main entity renderer ---

interface EntityWidgetProps {
  entity: IotEntity;
  metric?: TelemetryMetric;
  history?: number[];
  onCommand: OnCommand;
  disabled?: boolean;
}

function EntityWidget({ entity, metric, history, onCommand, disabled }: EntityWidgetProps) {
  switch (entity.type) {
    case 'sensor':
      return <SensorWidget entity={entity} metric={metric} history={history} />;
    case 'binary_sensor':
      return <BinarySensorWidget entity={entity} metric={metric} />;
    case 'switch':
      return <SwitchWidget entity={entity} metric={metric} onCommand={onCommand} disabled={disabled} />;
    case 'number':
      return <NumberWidget entity={entity} metric={metric} onCommand={onCommand} disabled={disabled} />;
    case 'button':
      return <ButtonWidget entity={entity} onCommand={onCommand} disabled={disabled} />;
    case 'select':
      return <SelectWidget entity={entity} metric={metric} onCommand={onCommand} disabled={disabled} />;
  }
}

export { EntityWidget, Sparkline };
export type { OnCommand };
