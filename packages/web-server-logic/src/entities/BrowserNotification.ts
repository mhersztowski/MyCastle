import { NotificationService } from '@mhersztowski/server-logic/web';

/**
 * A `notification` service backed by the browser Notifications API. Requests
 * permission on first use; degrades gracefully where Notification is absent.
 */
export class BrowserNotification extends NotificationService {
  async handle(action: string, params: Record<string, unknown>): Promise<unknown> {
    if (action !== 'notify') return super.handle(action, params);

    const title = String(params.title ?? 'MyCastle');
    const body = String(params.message ?? '');

    const N = (globalThis as { Notification?: typeof Notification }).Notification;
    if (!N) return { shown: false, reason: 'Notification API unavailable' };

    if (N.permission === 'default') {
      try { await N.requestPermission(); } catch { /* ignore */ }
    }
    if (N.permission !== 'granted') return { shown: false, reason: 'permission not granted' };

    new N(title, { body });
    return { shown: true };
  }
}
