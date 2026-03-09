import type { DeviceShare } from '@mhersztowski/core';
import type { IotDatabase } from './IotDatabase.js';
import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

export class DeviceShareStore {
  private stmtInsert: Database.Statement;
  private stmtDelete: Database.Statement;
  private stmtListByDevice: Database.Statement;
  private stmtListByOwner: Database.Statement;
  private stmtListByTarget: Database.Statement;

  constructor(iotDb: IotDatabase) {
    const db = iotDb.raw;
    this.stmtInsert = db.prepare(
      `INSERT INTO device_share (id, owner_user_id, device_id, target_user_id, created_at) VALUES (?, ?, ?, ?, ?)`,
    );
    this.stmtDelete = db.prepare(`DELETE FROM device_share WHERE id = ?`);
    this.stmtListByDevice = db.prepare(`SELECT * FROM device_share WHERE device_id = ?`);
    this.stmtListByOwner = db.prepare(`SELECT * FROM device_share WHERE owner_user_id = ? ORDER BY created_at DESC`);
    this.stmtListByTarget = db.prepare(`SELECT * FROM device_share WHERE target_user_id = ? ORDER BY created_at DESC`);
  }

  create(ownerUserId: string, deviceId: string, targetUserId: string): DeviceShare {
    const id = randomUUID();
    const now = Date.now();
    this.stmtInsert.run(id, ownerUserId, deviceId, targetUserId, now);
    return { id, ownerUserId, deviceId, targetUserId, createdAt: now };
  }

  delete(id: string): boolean {
    return this.stmtDelete.run(id).changes > 0;
  }

  getSharesForDevice(deviceId: string): DeviceShare[] {
    return (this.stmtListByDevice.all(deviceId) as any[]).map(this.rowToShare);
  }

  getSharesByOwner(ownerUserId: string): DeviceShare[] {
    return (this.stmtListByOwner.all(ownerUserId) as any[]).map(this.rowToShare);
  }

  getSharesForTarget(targetUserId: string): DeviceShare[] {
    return (this.stmtListByTarget.all(targetUserId) as any[]).map(this.rowToShare);
  }

  private rowToShare(row: any): DeviceShare {
    return {
      id: row.id,
      ownerUserId: row.owner_user_id,
      deviceId: row.device_id,
      targetUserId: row.target_user_id,
      createdAt: row.created_at,
    };
  }
}
