import type { RetentionPolicy } from '@mhersztowski/core';
import type { IotDatabase } from './IotDatabase.js';
import type Database from 'better-sqlite3';

const GLOBAL_KEY = '';

export class RetentionPolicyStore {
  private stmtUpsert: Database.Statement;
  private stmtGet: Database.Statement;
  private stmtDelete: Database.Statement;
  private stmtListForUser: Database.Statement;

  constructor(iotDb: IotDatabase) {
    const db = iotDb.raw;

    this.stmtUpsert = db.prepare(
      `INSERT INTO retention_policy (user_id, device_id, retention_days, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, device_id) DO UPDATE SET
         retention_days = excluded.retention_days,
         updated_at = excluded.updated_at`,
    );

    this.stmtGet = db.prepare(
      `SELECT * FROM retention_policy WHERE user_id = ? AND device_id = ?`,
    );

    this.stmtDelete = db.prepare(
      `DELETE FROM retention_policy WHERE user_id = ? AND device_id = ?`,
    );

    this.stmtListForUser = db.prepare(
      `SELECT * FROM retention_policy WHERE user_id = ?`,
    );
  }

  /** Set or update retention policy. Pass undefined deviceId for the user-global policy. */
  set(policy: RetentionPolicy): void {
    this.stmtUpsert.run(
      policy.userId,
      policy.deviceId ?? GLOBAL_KEY,
      policy.retentionDays,
      policy.updatedAt,
    );
  }

  /** Get per-device policy; falls back to user-global; falls back to null. */
  getEffective(userId: string, deviceId: string): RetentionPolicy | null {
    const device = this.stmtGet.get(userId, deviceId) as any;
    if (device) return this.rowToPolicy(device);

    const global = this.stmtGet.get(userId, GLOBAL_KEY) as any;
    if (global) return this.rowToPolicy(global);

    return null;
  }

  getGlobal(userId: string): RetentionPolicy | null {
    const row = this.stmtGet.get(userId, GLOBAL_KEY) as any;
    return row ? this.rowToPolicy(row) : null;
  }

  getForDevice(userId: string, deviceId: string): RetentionPolicy | null {
    const row = this.stmtGet.get(userId, deviceId) as any;
    return row ? this.rowToPolicy(row) : null;
  }

  listForUser(userId: string): RetentionPolicy[] {
    const rows = this.stmtListForUser.all(userId) as any[];
    return rows.map((r) => this.rowToPolicy(r));
  }

  delete(userId: string, deviceId?: string): void {
    this.stmtDelete.run(userId, deviceId ?? GLOBAL_KEY);
  }

  private rowToPolicy(row: any): RetentionPolicy {
    return {
      userId: row.user_id,
      deviceId: row.device_id === GLOBAL_KEY ? undefined : row.device_id,
      retentionDays: row.retention_days,
      updatedAt: row.updated_at,
    };
  }
}
