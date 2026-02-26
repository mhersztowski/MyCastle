export interface ConstantGenerator {
  type: 'constant';
  value: number;
}

export interface RandomGenerator {
  type: 'random';
  min: number;
  max: number;
  decimals: number;
}

export interface SineGenerator {
  type: 'sine';
  min: number;
  max: number;
  periodSec: number;
  phaseDeg: number;
}

export interface LinearGenerator {
  type: 'linear';
  startValue: number;
  endValue: number;
  durationSec: number;
  repeat: boolean;
}

export interface StepGenerator {
  type: 'step';
  values: number[];
  stepIntervalSec: number;
}

export type ValueGenerator =
  | ConstantGenerator
  | RandomGenerator
  | SineGenerator
  | LinearGenerator
  | StepGenerator;

export type ValueGeneratorType = ValueGenerator['type'];

export interface EmulatedMetricConfig {
  key: string;
  unit: string;
  generator: ValueGenerator;
}

export type CommandAckMode = 'auto-ack' | 'auto-fail' | 'manual';

export interface EmulatedDeviceConfig {
  id: string;
  deviceId: string;
  userId: string;
  name: string;
  metrics: EmulatedMetricConfig[];
  telemetryIntervalSec: number;
  heartbeatIntervalSec: number;
  commandAckMode: CommandAckMode;
  commandAckDelaySec: number;
  rssi: number;
  battery: number;
  brokerUrl?: string;
}

export interface ReceivedCommand {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  receivedAt: number;
  acked: boolean;
}

export interface EmulatedDeviceState {
  configId: string;
  isRunning: boolean;
  isConnected: boolean;
  startedAt: number | null;
  messagesSent: number;
  messagesReceived: number;
  lastTelemetrySentAt: number | null;
  lastHeartbeatSentAt: number | null;
  pendingCommands: ReceivedCommand[];
}

export interface ActivityLogEntry {
  timestamp: number;
  deviceConfigId: string;
  deviceName: string;
  direction: 'sent' | 'received';
  topic: string;
  type: 'telemetry' | 'heartbeat' | 'command' | 'command-ack';
  payload: string;
}

export type EmulatorEventType = 'stateChange' | 'logEntry' | 'configsChanged';
export type EmulatorEventCallback = (event: EmulatorEventType) => void;
