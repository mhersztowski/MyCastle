import { z } from 'zod';

// --- Types ---

export type MqttDirection = 'device→server' | 'server→device' | 'server→client' | 'server→shared';

export interface MqttTopicDef<T extends z.ZodTypeAny = z.ZodTypeAny> {
  pattern: string;
  description: string;
  direction: MqttDirection;
  payloadSchema: T;
  tags?: string[];
}

export function defineMqttTopic<T extends z.ZodTypeAny>(
  def: MqttTopicDef<T>,
): MqttTopicDef<T> {
  return def;
}

export type MqttPayload<T extends MqttTopicDef> = z.infer<T['payloadSchema']>;

// --- Shared schemas ---

const telemetryMetricSchema = z.object({
  key: z.string(),
  value: z.union([z.number(), z.boolean(), z.string()]),
  unit: z.string().optional(),
});

// --- Topic definitions ---

export const telemetry = defineMqttTopic({
  pattern: 'minis/{userName}/{deviceName}/telemetry',
  description: 'Raw telemetry data from device',
  direction: 'device→server',
  tags: ['IoT', 'Telemetry'],
  payloadSchema: z.object({
    metrics: z.array(telemetryMetricSchema),
    timestamp: z.number().optional(),
    rssi: z.number().optional(),
    battery: z.number().optional(),
  }),
});

export const heartbeat = defineMqttTopic({
  pattern: 'minis/{userName}/{deviceName}/heartbeat',
  description: 'Device heartbeat (keep-alive)',
  direction: 'device→server',
  tags: ['IoT', 'Presence'],
  payloadSchema: z.object({
    uptime: z.number().optional(),
    rssi: z.number().optional(),
    battery: z.number().optional(),
  }),
});

export const command = defineMqttTopic({
  pattern: 'minis/{userName}/{deviceName}/command',
  description: 'Command sent to device',
  direction: 'server→device',
  tags: ['IoT', 'Command'],
  payloadSchema: z.object({
    id: z.string(),
    name: z.string(),
    payload: z.record(z.unknown()),
  }),
});

export const commandAck = defineMqttTopic({
  pattern: 'minis/{userName}/{deviceName}/command/ack',
  description: 'Device acknowledges or rejects a command',
  direction: 'device→server',
  tags: ['IoT', 'Command'],
  payloadSchema: z.object({
    id: z.string(),
    status: z.enum(['ACKNOWLEDGED', 'FAILED']),
    reason: z.string().optional(),
  }),
});

export const status = defineMqttTopic({
  pattern: 'minis/{userName}/{deviceName}/status',
  description: 'Device online/offline status change',
  direction: 'server→client',
  tags: ['IoT', 'Presence'],
  payloadSchema: z.object({
    status: z.enum(['ONLINE', 'OFFLINE', 'UNKNOWN']),
    lastSeenAt: z.number(),
  }),
});

export const telemetryLive = defineMqttTopic({
  pattern: 'minis/{userName}/{deviceName}/telemetry/live',
  description: 'Republished telemetry for frontend subscribers',
  direction: 'server→client',
  tags: ['IoT', 'Telemetry'],
  payloadSchema: z.object({
    deviceId: z.string(),
    userId: z.string(),
    timestamp: z.number(),
    metrics: z.array(telemetryMetricSchema),
    rssi: z.number().optional(),
    battery: z.number().optional(),
  }),
});

export const alert = defineMqttTopic({
  pattern: 'minis/{userName}/{deviceName}/alert',
  description: 'Alert triggered by telemetry rule evaluation',
  direction: 'server→client',
  tags: ['IoT', 'Alert'],
  payloadSchema: z.object({
    id: z.string(),
    ruleId: z.string(),
    deviceId: z.string(),
    userId: z.string(),
    severity: z.enum(['INFO', 'WARNING', 'CRITICAL']),
    status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']),
    title: z.string(),
    message: z.string(),
    triggeredAt: z.number(),
    metricSnapshot: telemetryMetricSchema.optional(),
  }),
});

export const sharedTelemetryLive = defineMqttTopic({
  pattern: 'minis/{targetUser}/shared/{ownerUser}/{deviceName}/telemetry/live',
  description: 'Telemetry forwarded to users with shared device access',
  direction: 'server→shared',
  tags: ['IoT', 'Telemetry', 'Sharing'],
  payloadSchema: z.object({
    deviceId: z.string(),
    userId: z.string(),
    timestamp: z.number(),
    metrics: z.array(telemetryMetricSchema),
    rssi: z.number().optional(),
    battery: z.number().optional(),
  }),
});

export const sharedStatus = defineMqttTopic({
  pattern: 'minis/{targetUser}/shared/{ownerUser}/{deviceName}/status',
  description: 'Device status forwarded to users with shared device access',
  direction: 'server→shared',
  tags: ['IoT', 'Presence', 'Sharing'],
  payloadSchema: z.object({
    status: z.enum(['ONLINE', 'OFFLINE', 'UNKNOWN']),
    lastSeenAt: z.number(),
  }),
});

// --- Registry ---

export const mqttTopics = {
  telemetry,
  heartbeat,
  command,
  commandAck,
  status,
  telemetryLive,
  alert,
  sharedTelemetryLive,
  sharedStatus,
} as const;

export type MqttTopicRegistry = typeof mqttTopics;
export type MqttTopicName = keyof MqttTopicRegistry;

// --- Matching ---

/**
 * Match a concrete MQTT topic against registered patterns.
 * Pattern params use `{paramName}` syntax (e.g. `minis/{userName}/{deviceName}/telemetry`).
 * Returns the matched definition and extracted params, or null if no match.
 */
export function matchTopic(fullTopic: string): { name: MqttTopicName; def: MqttTopicDef; params: Record<string, string> } | null {
  const parts = fullTopic.split('/');

  for (const [name, def] of Object.entries(mqttTopics)) {
    const patternParts = def.pattern.split('/');
    if (patternParts.length !== parts.length) continue;

    const params: Record<string, string> = {};
    let matched = true;

    for (let i = 0; i < patternParts.length; i++) {
      const pp = patternParts[i];
      if (pp.startsWith('{') && pp.endsWith('}')) {
        params[pp.slice(1, -1)] = parts[i];
      } else if (pp !== parts[i]) {
        matched = false;
        break;
      }
    }

    if (matched) return { name: name as MqttTopicName, def, params };
  }

  return null;
}
