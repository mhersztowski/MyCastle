import type { EmulatedMetricConfig } from './types';
import type { IotEntity } from '@mhersztowski/core';

export interface DevicePreset {
  name: string;
  metrics: EmulatedMetricConfig[];
  entities?: IotEntity[];
  telemetryIntervalSec: number;
  heartbeatIntervalSec: number;
}

export const DEVICE_PRESETS: Record<string, DevicePreset> = {
  'temperature-sensor': {
    name: 'Temperature Sensor',
    metrics: [
      { key: 'temperature', unit: '°C', generator: { type: 'sine', min: 18, max: 28, periodSec: 300, phaseDeg: 0 } },
    ],
    entities: [
      { id: 'temperature', type: 'sensor', name: 'Temperature', unit: '°C', deviceClass: 'temperature' },
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
    entities: [
      { id: 'temperature', type: 'sensor', name: 'Temperature', unit: '°C', deviceClass: 'temperature' },
      { id: 'humidity', type: 'sensor', name: 'Humidity', unit: '%', deviceClass: 'humidity' },
      { id: 'light', type: 'sensor', name: 'Light Level', unit: 'lux', deviceClass: 'illuminance' },
    ],
    telemetryIntervalSec: 5,
    heartbeatIntervalSec: 60,
  },
  'relay-actuator': {
    name: 'Relay Actuator',
    metrics: [
      { key: 'relay_state', unit: '', generator: { type: 'constant', value: 0 } },
    ],
    entities: [
      { id: 'relay_state', type: 'switch', name: 'Relay' },
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
    entities: [
      { id: 'voltage', type: 'sensor', name: 'Voltage', unit: 'V', deviceClass: 'voltage' },
      { id: 'temperature', type: 'sensor', name: 'Temperature', unit: '°C', deviceClass: 'temperature' },
    ],
    telemetryIntervalSec: 15,
    heartbeatIntervalSec: 60,
  },
  'smart-thermostat': {
    name: 'Smart Thermostat',
    metrics: [
      { key: 'temperature', unit: '°C', generator: { type: 'sine', min: 19, max: 25, periodSec: 600, phaseDeg: 0 } },
      { key: 'target_temp', unit: '°C', generator: { type: 'constant', value: 22 } },
      { key: 'hvac_mode', unit: '', generator: { type: 'constant', value: 1 } },
      { key: 'heating', unit: '', generator: { type: 'step', values: [0, 1, 1, 0], stepIntervalSec: 60 } },
    ],
    entities: [
      { id: 'temperature', type: 'sensor', name: 'Temperature', unit: '°C', deviceClass: 'temperature' },
      { id: 'target_temp', type: 'number', name: 'Target Temperature', min: 15, max: 30, step: 0.5, unit: '°C' },
      { id: 'hvac_mode', type: 'select', name: 'HVAC Mode', options: ['off', 'heat', 'cool', 'auto'] },
      { id: 'heating', type: 'binary_sensor', name: 'Heating', deviceClass: 'heat', onLabel: 'Heating', offLabel: 'Idle' },
    ],
    telemetryIntervalSec: 10,
    heartbeatIntervalSec: 60,
  },
  'smart-plug': {
    name: 'Smart Plug',
    metrics: [
      { key: 'power_state', unit: '', generator: { type: 'constant', value: 1 } },
      { key: 'power', unit: 'W', generator: { type: 'random', min: 50, max: 200, decimals: 1 } },
      { key: 'energy', unit: 'kWh', generator: { type: 'linear', startValue: 0, endValue: 5, durationSec: 3600, repeat: false } },
    ],
    entities: [
      { id: 'power_state', type: 'switch', name: 'Power' },
      { id: 'power', type: 'sensor', name: 'Power Consumption', unit: 'W', deviceClass: 'power' },
      { id: 'energy', type: 'sensor', name: 'Energy', unit: 'kWh', deviceClass: 'energy' },
      { id: 'restart', type: 'button', name: 'Restart Device' },
    ],
    telemetryIntervalSec: 5,
    heartbeatIntervalSec: 60,
  },
};
