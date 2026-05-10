import type { DeviceTwin } from '@mhersztowski/core';
import type { IotDatabase } from './IotDatabase.js';
import type Database from 'better-sqlite3';

export class DeviceTwinStore {
  private stmtUpsert: Database.Statement;
  private stmtGet: Database.Statement;
  private stmtUpdateDesired: Database.Statement;
  private stmtUpdateReported: Database.Statement;
  private stmtDelete: Database.Statement;

  constructor(iotDb: IotDatabase) {
    const db = iotDb.raw;

    this.stmtUpsert = db.prepare(
      `INSERT INTO device_twin (device_id, user_id, desired, reported, desired_updated_at, reported_updated_at)
       VALUES (?, ?, ?, '{}', ?, 0)
       ON CONFLICT(device_id) DO NOTHING`,
    );

    this.stmtGet = db.prepare(
      `SELECT * FROM device_twin WHERE device_id = ?`,
    );

    this.stmtUpdateDesired = db.prepare(
      `INSERT INTO device_twin (device_id, user_id, desired, reported, desired_updated_at, reported_updated_at)
       VALUES (?, ?, ?, '{}', ?, 0)
       ON CONFLICT(device_id) DO UPDATE SET
         desired = excluded.desired,
         desired_updated_at = excluded.desired_updated_at`,
    );

    this.stmtUpdateReported = db.prepare(
      `INSERT INTO device_twin (device_id, user_id, desired, reported, desired_updated_at, reported_updated_at)
       VALUES (?, ?, '{}', ?, 0, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         reported = excluded.reported,
         reported_updated_at = excluded.reported_updated_at`,
    );

    this.stmtDelete = db.prepare(`DELETE FROM device_twin WHERE device_id = ?`);
  }

  get(deviceId: string): DeviceTwin | null {
    const row = this.stmtGet.get(deviceId) as any;
    return row ? this.rowToTwin(row) : null;
  }

  /** Deep-merge patch into desired state and persist. Returns updated twin. */
  patchDesired(deviceId: string, userId: string, patch: Record<string, unknown>): DeviceTwin {
    const existing = this.get(deviceId);
    const merged = { ...(existing?.desired ?? {}), ...patch };
    const now = Date.now();
    this.stmtUpdateDesired.run(deviceId, userId, JSON.stringify(merged), now);
    return {
      deviceId,
      userId,
      desired: merged,
      reported: existing?.reported ?? {},
      desiredUpdatedAt: now,
      reportedUpdatedAt: existing?.reportedUpdatedAt ?? 0,
    };
  }

  /** Replace reported state with device-reported values. Returns updated twin. */
  updateReported(deviceId: string, userId: string, reported: Record<string, unknown>): DeviceTwin {
    const existing = this.get(deviceId);
    const now = Date.now();
    this.stmtUpdateReported.run(deviceId, userId, JSON.stringify(reported), now);
    return {
      deviceId,
      userId,
      desired: existing?.desired ?? {},
      reported,
      desiredUpdatedAt: existing?.desiredUpdatedAt ?? 0,
      reportedUpdatedAt: now,
    };
  }

  /**
   * Keys present in desired but different (or missing) in reported.
   * Useful to show the operator what still needs to sync.
   */
  getDelta(twin: DeviceTwin): Record<string, { desired: unknown; reported: unknown }> {
    const delta: Record<string, { desired: unknown; reported: unknown }> = {};
    for (const [k, v] of Object.entries(twin.desired)) {
      if (JSON.stringify(twin.reported[k]) !== JSON.stringify(v)) {
        delta[k] = { desired: v, reported: twin.reported[k] };
      }
    }
    return delta;
  }

  delete(deviceId: string): void {
    this.stmtDelete.run(deviceId);
  }

  private rowToTwin(row: any): DeviceTwin {
    return {
      deviceId: row.device_id,
      userId: row.user_id,
      desired: JSON.parse(row.desired),
      reported: JSON.parse(row.reported),
      desiredUpdatedAt: row.desired_updated_at,
      reportedUpdatedAt: row.reported_updated_at,
    };
  }
}
