import type { DeviceCommand, CommandStatus } from '@mhersztowski/core';
import type { IotDatabase } from './IotDatabase.js';
import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

export class CommandDispatcher {
  private stmtInsert: Database.Statement;
  private stmtUpdateStatus: Database.Statement;
  private stmtGetById: Database.Statement;
  private stmtListByDevice: Database.Statement;

  constructor(_iotDb: IotDatabase) {
    const db = _iotDb.raw;

    this.stmtInsert = db.prepare(
      `INSERT INTO device_command (id, device_id, name, payload, status, created_at)
       VALUES (?, ?, ?, ?, 'PENDING', ?)`,
    );

    this.stmtUpdateStatus = db.prepare(
      `UPDATE device_command SET status = ?, resolved_at = ?, failure_reason = ? WHERE id = ?`,
    );

    this.stmtGetById = db.prepare(
      `SELECT * FROM device_command WHERE id = ?`,
    );

    this.stmtListByDevice = db.prepare(
      `SELECT * FROM device_command WHERE device_id = ? ORDER BY created_at DESC LIMIT ?`,
    );
  }

  createCommand(deviceId: string, name: string, payload: Record<string, unknown>): DeviceCommand {
    const id = randomUUID();
    const now = Date.now();
    this.stmtInsert.run(id, deviceId, name, JSON.stringify(payload), now);
    return {
      id,
      deviceId,
      name,
      payload,
      status: 'PENDING',
      createdAt: now,
    };
  }

  updateStatus(commandId: string, status: CommandStatus, failureReason?: string): void {
    const resolvedAt = status === 'PENDING' || status === 'SENT' ? null : Date.now();
    this.stmtUpdateStatus.run(status, resolvedAt, failureReason ?? null, commandId);
  }

  getCommand(commandId: string): DeviceCommand | null {
    const row = this.stmtGetById.get(commandId) as any;
    return row ? this.rowToCommand(row) : null;
  }

  listCommands(deviceId: string, limit: number = 50): DeviceCommand[] {
    const rows = this.stmtListByDevice.all(deviceId, limit) as any[];
    return rows.map((r) => this.rowToCommand(r));
  }

  private rowToCommand(row: any): DeviceCommand {
    return {
      id: row.id,
      deviceId: row.device_id,
      name: row.name,
      payload: JSON.parse(row.payload),
      status: row.status,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at ?? undefined,
      failureReason: row.failure_reason ?? undefined,
    };
  }
}
