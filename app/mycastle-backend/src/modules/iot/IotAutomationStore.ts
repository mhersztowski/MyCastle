import type { IotAutomation, IotAutomationTrigger, IotAutomationAction } from '@mhersztowski/core';
import type { IotDatabase } from './IotDatabase.js';
import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

export class IotAutomationStore {
  private stmtInsert: Database.Statement;
  private stmtUpdate: Database.Statement;
  private stmtDelete: Database.Statement;
  private stmtGet: Database.Statement;
  private stmtListForUser: Database.Statement;
  private stmtListEnabled: Database.Statement;
  private stmtSetRunResult: Database.Statement;

  constructor(iotDb: IotDatabase) {
    const db = iotDb.raw;

    this.stmtInsert = db.prepare(
      `INSERT INTO iot_automation (id, user_id, name, enabled, trigger_json, actions_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    this.stmtUpdate = db.prepare(
      `UPDATE iot_automation SET name=?, enabled=?, trigger_json=?, actions_json=?, updated_at=? WHERE id=?`,
    );

    this.stmtDelete = db.prepare(`DELETE FROM iot_automation WHERE id = ?`);
    this.stmtGet = db.prepare(`SELECT * FROM iot_automation WHERE id = ?`);
    this.stmtListForUser = db.prepare(
      `SELECT * FROM iot_automation WHERE user_id = ? ORDER BY created_at DESC`,
    );
    this.stmtListEnabled = db.prepare(
      `SELECT * FROM iot_automation WHERE user_id = ? AND enabled = 1`,
    );

    this.stmtSetRunResult = db.prepare(
      `UPDATE iot_automation SET last_run_at=?, last_run_result=?, last_run_error=? WHERE id=?`,
    );
  }

  create(userId: string, data: {
    name: string;
    trigger: IotAutomationTrigger;
    actions: IotAutomationAction[];
    enabled?: boolean;
  }): IotAutomation {
    const id = randomUUID();
    const now = Date.now();
    this.stmtInsert.run(id, userId, data.name, data.enabled !== false ? 1 : 0, JSON.stringify(data.trigger), JSON.stringify(data.actions), now, now);
    return { id, userId, name: data.name, enabled: data.enabled !== false, trigger: data.trigger, actions: data.actions, createdAt: now, updatedAt: now };
  }

  update(id: string, patch: Partial<{ name: string; enabled: boolean; trigger: IotAutomationTrigger; actions: IotAutomationAction[] }>): IotAutomation | null {
    const existing = this.get(id);
    if (!existing) return null;
    const now = Date.now();
    const merged: IotAutomation = {
      ...existing,
      ...patch,
      updatedAt: now,
    };
    this.stmtUpdate.run(merged.name, merged.enabled ? 1 : 0, JSON.stringify(merged.trigger), JSON.stringify(merged.actions), now, id);
    return merged;
  }

  delete(id: string): boolean {
    return this.stmtDelete.run(id).changes > 0;
  }

  get(id: string): IotAutomation | null {
    const row = this.stmtGet.get(id) as any;
    return row ? this.rowToAutomation(row) : null;
  }

  listForUser(userId: string): IotAutomation[] {
    const rows = this.stmtListForUser.all(userId) as any[];
    return rows.map((r) => this.rowToAutomation(r));
  }

  listEnabledForUser(userId: string): IotAutomation[] {
    const rows = this.stmtListEnabled.all(userId) as any[];
    return rows.map((r) => this.rowToAutomation(r));
  }

  recordRunResult(id: string, result: 'success' | 'error', error?: string): void {
    this.stmtSetRunResult.run(Date.now(), result, error ?? null, id);
  }

  private rowToAutomation(row: any): IotAutomation {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      enabled: row.enabled === 1,
      trigger: JSON.parse(row.trigger_json),
      actions: JSON.parse(row.actions_json),
      lastRunAt: row.last_run_at ?? undefined,
      lastRunResult: row.last_run_result ?? undefined,
      lastRunError: row.last_run_error ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
