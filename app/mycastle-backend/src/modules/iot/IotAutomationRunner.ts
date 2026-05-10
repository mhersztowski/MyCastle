import * as cron from 'node-cron';
import type { IotAutomation, IotAutomationAction, TelemetryMetric } from '@mhersztowski/core';
import type { IotAutomationStore } from './IotAutomationStore.js';
import type { NotificationService } from './NotificationService.js';
import type { MqttPublishFn } from './IotService.js';
import type { TelemetryStore } from './TelemetryStore.js';

export class IotAutomationRunner {
  private cronTasks = new Map<string, cron.ScheduledTask>();

  constructor(
    private store: IotAutomationStore,
    private notifications: NotificationService,
    private telemetryStore: TelemetryStore,
    private getPublishFn: () => MqttPublishFn | null,
  ) {}

  /** Load all enabled cron automations for a user and schedule them. */
  syncCronForUser(userId: string): void {
    // Stop existing tasks for this user
    for (const [key, task] of this.cronTasks) {
      if (key.startsWith(`${userId}/`)) {
        task.stop();
        this.cronTasks.delete(key);
      }
    }

    const automations = this.store.listEnabledForUser(userId);
    for (const auto of automations) {
      if (auto.trigger.type !== 'cron') continue;
      this.scheduleCron(auto);
    }
  }

  private scheduleCron(auto: IotAutomation): void {
    if (auto.trigger.type !== 'cron') return;
    const { expression, timezone } = auto.trigger;

    if (!cron.validate(expression)) {
      console.warn(`[IotAutomation] Invalid cron expression "${expression}" for automation "${auto.name}"`);
      return;
    }

    const key = `${auto.userId}/${auto.id}`;
    const task = cron.schedule(expression, async () => {
      console.log(`[IotAutomation] Cron triggered: ${auto.name}`);
      await this.executeActions(auto, {});
    }, { timezone: timezone ?? 'UTC' });

    this.cronTasks.set(key, task);
    console.log(`[IotAutomation] Scheduled cron "${auto.name}" (${expression})`);
  }

  /**
   * Evaluate telemetry-triggered automations for a device.
   * Called from IotService.handleTelemetry().
   */
  async evaluateTelemetry(userId: string, deviceId: string, metrics: TelemetryMetric[]): Promise<void> {
    const automations = this.store.listEnabledForUser(userId);
    for (const auto of automations) {
      if (auto.trigger.type !== 'telemetry') continue;
      const t = auto.trigger;

      if (t.deviceId && t.deviceId !== deviceId) continue;

      const metric = metrics.find((m) => m.key === t.metricKey);
      if (!metric || typeof metric.value !== 'number') continue;

      if (!this.checkOp(metric.value, t.op, t.value)) continue;

      console.log(`[IotAutomation] Telemetry triggered: ${auto.name} (${t.metricKey} ${t.op} ${t.value})`);
      await this.executeActions(auto, { deviceId, metric });
    }
  }

  private async executeActions(auto: IotAutomation, context: Record<string, unknown>): Promise<void> {
    for (const action of auto.actions) {
      try {
        await this.executeAction(action, context);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[IotAutomation] Action failed in "${auto.name}":`, msg);
        this.store.recordRunResult(auto.id, 'error', msg);
        return;
      }
    }
    this.store.recordRunResult(auto.id, 'success');
  }

  private async executeAction(action: IotAutomationAction, context: Record<string, unknown>): Promise<void> {
    if (action.type === 'send_command') {
      const config = this.telemetryStore.getConfig(action.deviceId);
      if (!config) throw new Error(`Device ${action.deviceId} not found`);

      const publish = this.getPublishFn();
      if (!publish) throw new Error('MQTT not available');

      const id = crypto.randomUUID();
      publish(
        `${config.topicPrefix}/command`,
        JSON.stringify({ id, name: action.commandName, payload: action.payload ?? {} }),
      );
    } else if (action.type === 'notify') {
      await this.notifications.sendToChannel(action.channelId, action.message, context);
    }
  }

  private checkOp(value: number, op: string, threshold: number): boolean {
    switch (op) {
      case '>': return value > threshold;
      case '<': return value < threshold;
      case '>=': return value >= threshold;
      case '<=': return value <= threshold;
      case '==': return value === threshold;
      case '!=': return value !== threshold;
      default: return false;
    }
  }

  dispose(): void {
    for (const task of this.cronTasks.values()) task.stop();
    this.cronTasks.clear();
  }
}
