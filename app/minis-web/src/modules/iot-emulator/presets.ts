import type { EmulatedMetricConfig } from './types';

export interface DevicePreset {
  name: string;
  metrics: EmulatedMetricConfig[];
  telemetryIntervalSec: number;
  heartbeatIntervalSec: number;
}

export const DEVICE_PRESETS: Record<string, DevicePreset> = {
  'temperature-sensor': {
    name: 'Temperature Sensor',
    metrics: [
      { key: 'temperature', unit: '°C', generator: { type: 'sine', min: 18, max: 28, periodSec: 300, phaseDeg: 0 } },
    ],
    telemetryIntervalSec: 10,
    heartbeatIntervalSec: 60,
  },
  'multi-sensor': {
    name: 'Multi Sensor (Temp + Humidity + Light)',
    metrics: [
      { key: 'temperature', unit: '°C', generator: { type: 'sine', min: 20, max: 30, periodSec: 600, phaseDeg: 0 } },
      { key: 'humidity', unit: '%', generator: { type: 'random', min: 40, max: 80, decimals: 1 } },
      { key: 'light', unit: 'lux', generator: { type: 'step', values: [100, 500, 800, 500], stepIntervalSec: 60 } },
    ],
    telemetryIntervalSec: 5,
    heartbeatIntervalSec: 60,
  },
  'relay-actuator': {
    name: 'Relay Actuator',
    metrics: [
      { key: 'relay_state', unit: '', generator: { type: 'constant', value: 0 } },
    ],
    telemetryIntervalSec: 30,
    heartbeatIntervalSec: 60,
  },
  'battery-device': {
    name: 'Battery Device (Draining)',
    metrics: [
      { key: 'voltage', unit: 'V', generator: { type: 'linear', startValue: 4.2, endValue: 3.0, durationSec: 3600, repeat: false } },
      { key: 'temperature', unit: '°C', generator: { type: 'random', min: 25, max: 35, decimals: 1 } },
    ],
    telemetryIntervalSec: 15,
    heartbeatIntervalSec: 60,
  },
};
