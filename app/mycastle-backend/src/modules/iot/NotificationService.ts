import { createHmac } from 'crypto';
import type { Alert, NotificationChannel } from '@mhersztowski/core';
import type { NotificationChannelStore } from './NotificationChannelStore.js';

export class NotificationService {
  constructor(private channelStore: NotificationChannelStore) {}

  /**
   * Send alert notifications to all channels referenced by an alert rule.
   * Fire-and-forget — errors are logged but never thrown to the caller.
   */
  async notifyAlert(alert: Alert, channelIds: string[]): Promise<void> {
    for (const channelId of channelIds) {
      const channel = this.channelStore.get(channelId);
      if (!channel || !channel.isActive) continue;

      this.sendWebhook(channel, alert).catch((err) => {
        console.error(`[Notify] Webhook to channel ${channelId} (${channel.name}) failed:`, err);
      });
    }
  }

  private async sendWebhook(channel: NotificationChannel, alert: Alert): Promise<void> {
    const body = JSON.stringify({
      event: 'alert',
      alert: {
        id: alert.id,
        severity: alert.severity,
        status: alert.status,
        title: alert.title,
        message: alert.message,
        deviceId: alert.deviceId,
        triggeredAt: alert.triggeredAt,
        metricSnapshot: alert.metricSnapshot,
      },
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'MyCastle-IoT/1.0',
    };

    if (channel.secret) {
      const sig = createHmac('sha256', channel.secret).update(body).digest('hex');
      headers['X-MyCastle-Signature'] = `sha256=${sig}`;
    }

    const res = await fetch(channel.webhookUrl, { method: 'POST', headers, body });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${channel.webhookUrl}`);
    }

    console.log(`[Notify] Webhook sent to ${channel.name} (${channel.webhookUrl}) — ${res.status}`);
  }

  /**
   * Send a custom webhook payload to a specific channel (used by automation actions).
   */
  async sendToChannel(channelId: string, message: string, context?: Record<string, unknown>): Promise<void> {
    const channel = this.channelStore.get(channelId);
    if (!channel || !channel.isActive) return;

    const body = JSON.stringify({ event: 'automation', message, context: context ?? {} });
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'MyCastle-IoT/1.0',
    };

    if (channel.secret) {
      const sig = createHmac('sha256', channel.secret).update(body).digest('hex');
      headers['X-MyCastle-Signature'] = `sha256=${sig}`;
    }

    const res = await fetch(channel.webhookUrl, { method: 'POST', headers, body });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${channel.webhookUrl}`);
    }
  }
}
