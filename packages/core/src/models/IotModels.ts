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
  entities?: IotEntity[];
  createdAt: number;
  updatedAt: number;
}

// --- Entities (Home Assistant-inspired) ---

export type IotEntityType = 'sensor' | 'binary_sensor' | 'switch' | 'number' | 'button' | 'select';

export interface IotEntityBase {
  id: string;
  type: IotEntityType;
  name: string;
  icon?: string;
  deviceClass?: string;
}

export interface IotSensorEntity extends IotEntityBase {
  type: 'sensor';
  unit: string;
}

export interface IotBinarySensorEntity extends IotEntityBase {
  type: 'binary_sensor';
  onLabel?: string;
  offLabel?: string;
}

export interface IotSwitchEntity extends IotEntityBase {
  type: 'switch';
}

export interface IotNumberEntity extends IotEntityBase {
  type: 'number';
  min: number;
  max: number;
  step: number;
  unit?: string;
}

export interface IotButtonEntity extends IotEntityBase {
  type: 'button';
}

export interface IotSelectEntity extends IotEntityBase {
  type: 'select';
  options: string[];
}

export type IotEntity = IotSensorEntity | IotBinarySensorEntity | IotSwitchEntity
  | IotNumberEntity | IotButtonEntity | IotSelectEntity;

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

// --- Device Sharing ---

export interface DeviceShare {
  id: string;
  ownerUserId: string;
  deviceId: string;
  targetUserId: string;
  createdAt: number;
}

// --- Device Status (runtime) ---

export type IotDeviceStatus = 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
