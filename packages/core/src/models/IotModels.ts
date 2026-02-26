// --- IoT Device Config ---

export interface IotSensorCapability {
  type: 'sensor';
  metricKey: string;
  unit: string;
  label: string;
}

export interface IotActuatorCapability {
  type: 'actuator';
  commandName: string;
  payloadSchema: Record<string, unknown>;
  label: string;
}

export type IotCapability = IotSensorCapability | IotActuatorCapability;

export interface IotDeviceConfig {
  deviceId: string;
  userId: string;
  topicPrefix: string;
  heartbeatIntervalSec: number;
  capabilities: IotCapability[];
  createdAt: number;
  updatedAt: number;
}

// --- Telemetry ---

export interface TelemetryMetric {
  key: string;
  value: number | boolean | string;
  unit?: string;
}

export interface TelemetryRecord {
  id?: number;
  deviceId: string;
  userId: string;
  timestamp: number;
  metrics: TelemetryMetric[];
  rssi?: number;
  battery?: number;
}

export interface TelemetryAggregate {
  deviceId: string;
  periodStart: number;
  min: number;
  max: number;
  avg: number;
  count: number;
}

// --- Commands ---

export type CommandStatus = 'PENDING' | 'SENT' | 'ACKNOWLEDGED' | 'FAILED' | 'TIMEOUT';

export interface DeviceCommand {
  id: string;
  deviceId: string;
  name: string;
  payload: Record<string, unknown>;
  status: CommandStatus;
  createdAt: number;
  resolvedAt?: number;
  failureReason?: string;
}

// --- Alerts ---

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface AlertRule {
  id: string;
  userId: string;
  deviceId?: string;
  metricKey: string;
  conditionOp: '>' | '<' | '>=' | '<=' | '==' | '!=';
  conditionValue: number;
  severity: AlertSeverity;
  cooldownMinutes: number;
  isActive: boolean;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface Alert {
  id: string;
  ruleId: string;
  deviceId: string;
  userId: string;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  triggeredAt: number;
  acknowledgedAt?: number;
  resolvedAt?: number;
  metricSnapshot?: TelemetryMetric;
}

// --- Device Status (runtime) ---

export type IotDeviceStatus = 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
