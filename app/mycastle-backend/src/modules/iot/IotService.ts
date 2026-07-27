import type { TelemetryMetric, DeviceCommand } from '@mhersztowski/core';
import { mqttTopics } from '@mhersztowski/core';
import { IotDatabase } from './IotDatabase.js';
import { TelemetryStore } from './TelemetryStore.js';
import { DevicePresence } from './DevicePresence.js';
import type { DeviceStatusChange } from './DevicePresence.js';
import { CommandDispatcher } from './CommandDispatcher.js';
import { AlertEngine } from './AlertEngine.js';
import { DeviceShareStore } from './DeviceShareStore.js';
import { DeviceRequestStore } from './DeviceRequestStore.js';
import { IotExtensionRegistry } from './IotExtensionRegistry.js';
import { AppSessionStore } from './AppSessionStore.js';
import { RateLimiter } from './RateLimiter.js';
import { RetentionPolicyStore } from './RetentionPolicyStore.js';
import { DeviceTwinStore } from './DeviceTwinStore.js';
import { NotificationChannelStore } from './NotificationChannelStore.js';
import { NotificationService } from './NotificationService.js';
import { IotAutomationStore } from './IotAutomationStore.js';
import { IotAutomationRunner } from './IotAutomationRunner.js';
import { DownsamplingService } from './DownsamplingService.js';

export interface MqttPublishFn {
  (topic: string, payload: string): void;
}

/** How long before a SENT command is marked TIMEOUT (default: 10 minutes). */
const COMMAND_TIMEOUT_MS = 10 * 60_000;

export class IotService {
  readonly db: IotDatabase;
  readonly telemetry: TelemetryStore;
  readonly presence: DevicePresence;
  readonly commands: CommandDispatcher;
  readonly alerts: AlertEngine;
  readonly shares: DeviceShareStore;
  /** Zgłoszenia urządzeń czekających na akceptację w Electronics → Devices. */
  readonly deviceRequests: DeviceRequestStore;
  /**
   * Sprawdza, czy urządzenie jest już na liście użytkownika (`Device.json`).
   * Wstrzykiwane przez App — IotService nie zna warstwy plików. Bez tego
   * urządzenie prosiłoby o dodanie po każdym reconnekcie, mimo że dawno
   * zostało zaakceptowane.
   */
  isDeviceKnown?: (userId: string, deviceName: string) => boolean | Promise<boolean>;
  readonly extensions: IotExtensionRegistry;
  readonly appSessions: AppSessionStore;
  readonly rateLimiter: RateLimiter;
  readonly retention: RetentionPolicyStore;
  readonly twin: DeviceTwinStore;
  readonly notificationChannels: NotificationChannelStore;
  readonly notifications: NotificationService;
  readonly automations: IotAutomationStore;
  readonly automationRunner: IotAutomationRunner;
  readonly downsampling: DownsamplingService;

  private publishFn: MqttPublishFn | null = null;
  /** Komendy czekające na `command/ack` (id → uchwyt obietnicy). */
  private readonly pendingAcks = new Map<string, {
    resolve: (command: DeviceCommand) => void;
    timer: NodeJS.Timeout;
    command: DeviceCommand;
  }>();
  private commandTimeoutTimer: NodeJS.Timeout | null = null;
  private retentionTimer: NodeJS.Timeout | null = null;

  constructor(dataDir: string) {
    this.db = new IotDatabase(dataDir);
    this.telemetry = new TelemetryStore(this.db);
    this.presence = new DevicePresence();
    this.commands = new CommandDispatcher(this.db);
    this.alerts = new AlertEngine(this.db);
    this.shares = new DeviceShareStore(this.db);
    this.deviceRequests = new DeviceRequestStore(this.db);
    this.extensions = new IotExtensionRegistry((topic, payload) => this.publishFn?.(topic, payload));
    this.appSessions = new AppSessionStore(this.db);
    this.rateLimiter = new RateLimiter({ maxMessages: 120, windowMs: 60_000 });
    this.retention = new RetentionPolicyStore(this.db);
    this.twin = new DeviceTwinStore(this.db);
    this.notificationChannels = new NotificationChannelStore(this.db);
    this.notifications = new NotificationService(this.notificationChannels);
    this.automations = new IotAutomationStore(this.db);
    this.automationRunner = new IotAutomationRunner(
      this.automations,
      this.notifications,
      this.telemetry,
      () => this.publishFn,
    );
    this.downsampling = new DownsamplingService(this.db);
  }

  start(publishFn: MqttPublishFn): void {
    this.publishFn = publishFn;
    this.presence.start();
    this.downsampling.start();

    this.presence.on('statusChange', (change: DeviceStatusChange) => {
      const statusPayload = JSON.stringify({ status: change.status, lastSeenAt: change.lastSeenAt });
      this.publishFn?.(
        `minis/${change.userId}/${change.deviceId}/status`,
        statusPayload,
      );

      const shareList = this.shares.getSharesForDevice(change.deviceId);
      for (const share of shareList) {
        this.publishFn?.(
          `minis/${share.targetUserId}/shared/${change.userId}/${change.deviceId}/status`,
          statusPayload,
        );
      }
    });

    // Mark SENT commands as TIMEOUT every minute
    this.commandTimeoutTimer = setInterval(() => this.checkCommandTimeouts(), 60_000);
    this.commandTimeoutTimer.unref();

    // Run retention cleanup once at start, then daily
    this.runRetentionCleanup();
    this.retentionTimer = setInterval(() => this.runRetentionCleanup(), 24 * 60 * 60_000);
    this.retentionTimer.unref();
  }

  stop(): void {
    this.presence.stop();
    this.extensions.dispose();
    this.automationRunner.dispose();
    this.downsampling.stop();
    this.rateLimiter.dispose();
    if (this.commandTimeoutTimer) { clearInterval(this.commandTimeoutTimer); this.commandTimeoutTimer = null; }
    if (this.retentionTimer) { clearInterval(this.retentionTimer); this.retentionTimer = null; }
    this.db.close();
  }

  // ---------------------------------------------------------------------------
  // Telemetry
  // ---------------------------------------------------------------------------

  handleTelemetry(userId: string, deviceId: string, payload: { metrics: TelemetryMetric[]; timestamp?: number; rssi?: number; battery?: number }): void {
    const record = {
      deviceId,
      userId,
      timestamp: payload.timestamp ?? Date.now(),
      metrics: payload.metrics,
      rssi: payload.rssi,
      battery: payload.battery,
    };

    this.telemetry.insertTelemetry(record);

    const config = this.telemetry.getConfig(deviceId);
    const heartbeatSec = config?.heartbeatIntervalSec ?? 60;
    this.presence.recordHeartbeat(deviceId, userId, heartbeatSec);

    // Alert evaluation + notifications
    const triggered = this.alerts.evaluate(deviceId, userId, payload.metrics);
    for (const alert of triggered) {
      this.publishFn?.(`minis/${userId}/${deviceId}/alert`, JSON.stringify(alert));

      // Send webhook notifications for this rule
      const rule = this.alerts.getRule(alert.ruleId);
      if (rule?.notificationChannelIds?.length) {
        this.notifications.notifyAlert(alert, rule.notificationChannelIds);
      }
    }

    // Telemetry-triggered automations (fire-and-forget)
    this.automationRunner.evaluateTelemetry(userId, deviceId, payload.metrics).catch((err) =>
      console.error('[IotService] automation runner error:', err),
    );

    const recordJson = JSON.stringify(record);
    this.publishFn?.(`minis/${userId}/${deviceId}/telemetry/live`, recordJson);

    const shareList = this.shares.getSharesForDevice(deviceId);
    for (const share of shareList) {
      this.publishFn?.(
        `minis/${share.targetUserId}/shared/${userId}/${deviceId}/telemetry/live`,
        recordJson,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Prośba o dopisanie do listy urządzeń
  // ---------------------------------------------------------------------------

  /**
   * Urządzenie prosi o dodanie do listy użytkownika. Zgłoszenie tylko czeka —
   * wpis powstaje dopiero po akceptacji w Electronics → Devices, więc samo
   * podłączenie się do brokera nie wystarcza, by trafić na listę.
   */
  async handleRegisterRequest(userId: string, deviceId: string, payload: {
    label?: string;
    kind?: 'firmware' | 'desktop' | 'mobile' | 'web' | 'service';
    sn?: string;
    description?: string;
    version?: string;
    address?: string;
  }): Promise<void> {
    // Urządzenie zgłasza się przy każdym połączeniu — jeśli użytkownik już je
    // zaakceptował, prośba jest bezprzedmiotowa i nie może wracać do panelu.
    if (await this.isDeviceKnown?.(userId, deviceId)) {
      this.deviceRequests.remove(userId, deviceId);
      return;
    }
    this.deviceRequests.upsert(userId, { deviceName: deviceId, ...payload });
    console.log(`[IoT] register-request: userId=${userId} deviceId=${deviceId} kind=${payload.kind ?? '?'}`);
  }

  // ---------------------------------------------------------------------------
  // Hello
  // ---------------------------------------------------------------------------

  handleHello(userId: string, deviceId: string, payload: {
    uptime?: number;
    extensions?: Array<{ type: string; enabled: boolean; options?: Record<string, unknown> }>;
    entities?: unknown[];
    platform?: 'web' | 'mobile' | 'desktop';
    sessionId?: string;
    label?: string;
    userAgent?: string;
  }): void {
    console.log(`[IoT] hello: userId=${userId} deviceId=${deviceId}`);

    if (payload.platform && payload.sessionId) {
      this.appSessions.upsert({
        id: payload.sessionId,
        userId,
        label: payload.label ?? payload.platform,
        platform: payload.platform,
        userAgent: payload.userAgent ?? '',
      });
      return;
    }

    const existing = this.telemetry.getConfig(deviceId);
    const heartbeatSec = existing?.heartbeatIntervalSec ?? 60;
    const topicPrefix = existing?.topicPrefix ?? `minis/${userId}/${deviceId}`;
    const now = Date.now();

    if (payload.entities?.length || payload.extensions?.length) {
      const merged = {
        deviceId,
        userId,
        topicPrefix,
        heartbeatIntervalSec: heartbeatSec,
        capabilities: existing?.capabilities ?? [],
        entities: (payload.entities ?? existing?.entities ?? []) as import('@mhersztowski/core').IotEntity[],
        extensions: payload.extensions ?? existing?.extensions,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      this.telemetry.upsertConfig(merged);
      this.extensions.syncFromConfig(merged);
    } else if (existing) {
      this.extensions.syncFromConfig(existing);
    }

    this.presence.recordHeartbeat(deviceId, userId, heartbeatSec);

    // Push current desired twin state to device on (re)connect
    const twinRecord = this.twin.get(deviceId);
    if (twinRecord && Object.keys(twinRecord.desired).length > 0) {
      this.publishFn?.(
        `minis/${userId}/${deviceId}/twin/desired`,
        JSON.stringify(twinRecord.desired),
      );
    }

    // Load cron automations for this user
    this.automationRunner.syncCronForUser(userId);
  }

  // ---------------------------------------------------------------------------
  // Heartbeat
  // ---------------------------------------------------------------------------

  handleHeartbeat(userId: string, deviceId: string, payload: {
    uptime?: number;
    rssi?: number;
    battery?: number;
    sessionId?: string;
    intervalSec?: number;
    isInteractive?: boolean;
    context?: { type: string; id?: string };
  }): void {
    if (payload.sessionId) {
      this.appSessions.recordHeartbeat(
        payload.sessionId,
        payload.intervalSec ?? 30,
        payload.isInteractive ?? false,
        payload.context,
      );
      return;
    }

    const config = this.telemetry.getConfig(deviceId);
    const heartbeatSec = config?.heartbeatIntervalSec ?? 60;
    this.presence.recordHeartbeat(deviceId, userId, heartbeatSec);
    if (config) this.extensions.syncFromConfig(config);
  }

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------

  handleCommandAck(_deviceId: string, payload: { id: string; status: 'ACKNOWLEDGED' | 'FAILED'; reason?: string }): void {
    this.commands.updateStatus(payload.id, payload.status, payload.reason);
    // Odblokuj `sendCommandAndWait`, jeśli ktoś czeka na to potwierdzenie.
    const pending = this.pendingAcks.get(payload.id);
    if (pending) {
      this.pendingAcks.delete(payload.id);
      clearTimeout(pending.timer);
      pending.resolve({ ...pending.command, status: payload.status, failureReason: payload.reason });
    }
  }

  /**
   * Wysyła komendę i czeka na potwierdzenie urządzenia (`command/ack`).
   *
   * `sendCommand` wraca od razu ze statusem `SENT` — dobre dla „wystrzel
   * i zapomnij", bezużyteczne dla skryptu, który potrzebuje wyniku. Tu czekamy
   * na odpowiedź; po przekroczeniu czasu zwracamy komendę ze statusem `TIMEOUT`
   * zamiast rzucać, żeby wywołujący mógł zdecydować, co z tym zrobić.
   */
  sendCommandAndWait(
    deviceId: string,
    name: string,
    cmdPayload: Record<string, unknown>,
    timeoutMs = 15_000,
  ): Promise<DeviceCommand> {
    const command = this.sendCommand(deviceId, name, cmdPayload);
    if (command.status !== 'SENT') {
      // Urządzenie nieznane albo brak połączenia MQTT — nie ma na co czekać.
      return Promise.resolve(command);
    }
    return new Promise<DeviceCommand>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingAcks.delete(command.id);
        resolve({ ...command, status: 'TIMEOUT' as DeviceCommand['status'] });
      }, timeoutMs);
      this.pendingAcks.set(command.id, { resolve, timer, command });
    });
  }

  sendCommand(deviceId: string, name: string, cmdPayload: Record<string, unknown>): DeviceCommand {
    const command = this.commands.createCommand(deviceId, name, cmdPayload);

    const config = this.telemetry.getConfig(deviceId);
    if (config && this.publishFn) {
      this.publishFn(
        `${config.topicPrefix}/command`,
        JSON.stringify({ id: command.id, name: command.name, payload: command.payload }),
      );
      this.commands.updateStatus(command.id, 'SENT');
      command.status = 'SENT';
    }

    return command;
  }

  /** Publish a raw MQTT message through the service's broker connection. */
  publish(topic: string, payload: string): void {
    this.publishFn?.(topic, payload);
  }

  // ---------------------------------------------------------------------------
  // Twin: device reports its state
  // ---------------------------------------------------------------------------

  handleTwinReported(userId: string, deviceId: string, reported: Record<string, unknown>): void {
    this.twin.updateReported(deviceId, userId, reported);
    console.log(`[IoT] twin reported updated: ${deviceId}`);
  }

  // ---------------------------------------------------------------------------
  // MQTT routing
  // ---------------------------------------------------------------------------

  handleMqttMessage(topic: string, payload: string): void {
    const parts = topic.split('/');
    if (parts.length < 4 || parts[0] !== 'minis') return;

    const userName = parts[1];
    const deviceName = parts[2];
    const msgType = parts.slice(3).join('/');

    // Rate-limit only UNSOLICITED, device-initiated state traffic (telemetry /
    // heartbeat / hello / twin). SOLICITED responses — extension replies
    // (`ext/*/res`) and command acks — are bounded by the server's own request
    // rate, so limiting them is wrong: it drops legitimate request-response
    // traffic (e.g. a VFS folder read answering N requests), which makes MqttFS
    // time out (15 s), the HTTP call hang, the client retry, and the whole thing
    // snowball into a readfile storm. Never rate-limit `ext/*` or `command/ack`.
    const isUnsolicited = ['telemetry', 'heartbeat', 'hello', 'register-request'].includes(msgType) || msgType === 'twin/reported';
    if (isUnsolicited && !this.rateLimiter.allow(deviceName)) return;

    let raw: unknown;
    try {
      raw = JSON.parse(payload);
    } catch {
      console.warn(`[IoT] Failed to parse JSON from topic=${topic}: ${payload}`);
      return;
    }

    switch (msgType) {
      case 'telemetry': {
        const result = mqttTopics.telemetry.payloadSchema.safeParse(raw);
        if (!result.success) { console.warn(`[IoT] telemetry schema mismatch:`, result.error.issues); return; }
        this.handleTelemetry(userName, deviceName, result.data);
        break;
      }
      case 'heartbeat': {
        const result = mqttTopics.heartbeat.payloadSchema.safeParse(raw);
        if (!result.success) { console.warn(`[IoT] heartbeat schema mismatch:`, result.error.issues); return; }
        this.handleHeartbeat(userName, deviceName, result.data);
        break;
      }
      case 'hello': {
        const result = mqttTopics.hello.payloadSchema.safeParse(raw);
        if (!result.success) { console.warn(`[IoT] hello schema mismatch:`, result.error.issues); return; }
        this.handleHello(userName, deviceName, result.data);
        break;
      }
      case 'register-request': {
        const result = mqttTopics.registerRequest.payloadSchema.safeParse(raw);
        if (!result.success) { console.warn(`[IoT] register-request schema mismatch:`, result.error.issues); return; }
        void this.handleRegisterRequest(userName, deviceName, result.data);
        break;
      }
      case 'command/ack': {
        const result = mqttTopics.commandAck.payloadSchema.safeParse(raw);
        if (!result.success) return;
        this.handleCommandAck(deviceName, result.data);
        break;
      }
      case 'twin/reported': {
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          this.handleTwinReported(userName, deviceName, raw as Record<string, unknown>);
        }
        break;
      }
      default: {
        if (msgType.startsWith('ext/')) {
          const extParts = msgType.split('/');
          if (extParts.length >= 3) {
            const extType = extParts[1];
            const subTopic = extParts.slice(2).join('/');
            this.extensions.handleMessage(deviceName, userName, extType, subTopic, raw);
          }
        }
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Background jobs
  // ---------------------------------------------------------------------------

  private checkCommandTimeouts(): void {
    const db = this.db.raw;
    const cutoff = Date.now() - COMMAND_TIMEOUT_MS;
    const stmt = db.prepare(
      `UPDATE device_command SET status = 'TIMEOUT', resolved_at = ? WHERE status = 'SENT' AND created_at < ?`,
    );
    const result = stmt.run(Date.now(), cutoff);
    if (result.changes > 0) {
      console.log(`[IoT] Marked ${result.changes} command(s) as TIMEOUT`);
    }
  }

  private runRetentionCleanup(): void {
    const db = this.db.raw;

    // Per-user / per-device policies
    const policies = db.prepare(`SELECT * FROM retention_policy`).all() as Array<{
      user_id: string; device_id: string; retention_days: number;
    }>;

    let totalDeleted = 0;
    for (const p of policies) {
      const cutoff = Date.now() - p.retention_days * 24 * 60 * 60_000;
      const stmt = p.device_id
        ? db.prepare(`DELETE FROM telemetry WHERE user_id = ? AND device_id = ? AND timestamp < ?`)
        : db.prepare(`DELETE FROM telemetry WHERE user_id = ? AND timestamp < ?`);

      const result = p.device_id
        ? (stmt as any).run(p.user_id, p.device_id, cutoff)
        : (stmt as any).run(p.user_id, cutoff);

      totalDeleted += result.changes;
    }

    // Also cleanup old downsampled data
    const ds1mCutoff = Date.now() - 7 * 24 * 60 * 60_000; // 7 days
    const ds1hCutoff = Date.now() - 90 * 24 * 60 * 60_000; // 90 days
    const del1m = db.prepare(`DELETE FROM telemetry_1m WHERE period_start < ?`).run(ds1mCutoff);
    const del1h = db.prepare(`DELETE FROM telemetry_1h WHERE period_start < ?`).run(ds1hCutoff);

    if (totalDeleted > 0 || del1m.changes > 0 || del1h.changes > 0) {
      console.log(`[IoT] Retention cleanup: raw=${totalDeleted}, 1m=${del1m.changes}, 1h=${del1h.changes} rows deleted`);
    }
  }
}
