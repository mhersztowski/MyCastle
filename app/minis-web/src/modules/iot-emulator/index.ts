export { EmulatorService } from './EmulatorService';
export { generateValue, describeGenerator } from './generators';
export { DEVICE_PRESETS } from './presets';
export type { DevicePreset } from './presets';
export type {
  ValueGenerator,
  ValueGeneratorType,
  ConstantGenerator,
  RandomGenerator,
  SineGenerator,
  LinearGenerator,
  StepGenerator,
  EmulatedMetricConfig,
  EmulatedDeviceConfig,
  EmulatedDeviceState,
  ReceivedCommand,
  ActivityLogEntry,
  CommandAckMode,
  EmulatorEventType,
  EmulatorEventCallback,
} from './types';
