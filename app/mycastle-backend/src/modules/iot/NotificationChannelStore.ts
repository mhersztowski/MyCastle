import type { NotificationChannel } from '@mhersztowski/core';
import type { IotDatabase } from './IotDatabase.js';
import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

export class NotificationChannelStore {
  private stmtInsert: Database.Statement;
  private stmtUpdate: Database.Statement;
  private stmtDelete: Database.Statement;
  private stmtGet: Database.Statement;
  private stmtListForUser: Database.Statement;

  constructor(iotDb: IotDatabase) {
    const db = iotDb.raw;

    this.stmtInsert = db.prepare(
      `INSERT INTO notification_channel (id, user_id, name, type, webhook_url, secret, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    );

    this.stmtUpdate = db.prepare(
      `UPDATE notification_channel SET name=?, webhook_url=?, secret=?, is_active=?, updated_at=? WHERE id=?`,
    );

    this.stmtDelete = db.prepare(`DELETE FROM notification_channel WHERE id = ?`);
    this.stmtGet = db.prepare(`SELECT * FROM notification_channel WHERE id = ?`);
    this.stmtListForUser = db.prepare(
      `SELECT * FROM notification_channel WHERE user_id = ? ORDER BY created_at DESC`,
    );
  }

  create(userId: string, data: { name: string; webhookUrl: string; secret?: string }): NotificationChannel {
    const id = randomUUID();
    const now = Date.now();
    this.stmtInsert.run(id, userId, data.name, 'webhook', data.webhookUrl, data.secret ?? null, now, now);
    return { id, userId, name: data.name, type: 'webhook', webhookUrl: data.webhookUrl, secret: data.secret, isActive: true, createdAt: now, updatedAt: now };
  }

  update(id: string, patch: Partial<{ name: string; webhookUrl: string; secret: string | null; isActive: boolean }>): NotificationChannel | null {
    const existing = this.get(id);
    if (!existing) return null;
    const now = Date.now();
    const merged = {
      name: patch.name ?? existing.name,
      webhookUrl: patch.webhookUrl ?? existing.webhookUrl,
      secret: 'secret' in patch ? patch.secret ?? null : existing.secret ?? null,
      isActive: patch.isActive !== undefined ? patch.isActive : existing.isActive,
    };
    this.stmtUpdate.run(merged.name, merged.webhookUrl, merged.secret, merged.isActive ? 1 : 0, now, id);
    return { ...existing, ...merged, secret: merged.secret ?? undefined, updatedAt: now };
  }

  delete(id: string): boolean {
    return this.stmtDelete.run(id).changes > 0;
  }

  get(id: string): NotificationChannel | null {
    const row = this.stmtGet.get(id) as any;
    return row ? this.rowToChannel(row) : null;
  }

  listForUser(userId: string): NotificationChannel[] {
    const rows = this.stmtListForUser.all(userId) as any[];
    return rows.map((r) => this.rowToChannel(r));
  }

  private rowToChannel(row: any): NotificationChannel {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      type: 'webhook',
      webhookUrl: row.webhook_url,
      secret: row.secret ?? undefined,
      isActive: row.is_active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
