import type { DeviceRegistrationRequest } from '@mhersztowski/core';
import type { IotDatabase } from './IotDatabase.js';
import type Database from 'better-sqlite3';

/**
 * Zgłoszenia urządzeń proszących o dopisanie do listy użytkownika.
 *
 * Urządzenie publikuje prośbę przy każdym połączeniu — dlatego kluczem jest
 * para (użytkownik, nazwa urządzenia), a powtórne zgłoszenie tylko odświeża
 * `last_seen_at`. Dzięki temu panel pokazuje jedną pozycję na urządzenie,
 * a nie listę rosnącą z każdym reconnectem.
 */
export class DeviceRequestStore {
  private stmtUpsert: Database.Statement;
  private stmtList: Database.Statement;
  private stmtGet: Database.Statement;
  private stmtDelete: Database.Statement;

  constructor(iotDb: IotDatabase) {
    const db = iotDb.raw;
    this.stmtUpsert = db.prepare(`
      INSERT INTO device_request
        (user_id, device_name, label, kind, sn, description, version, address, requested_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, device_name) DO UPDATE SET
        label        = excluded.label,
        kind         = excluded.kind,
        sn           = excluded.sn,
        description  = excluded.description,
        version      = excluded.version,
        address      = excluded.address,
        last_seen_at = excluded.last_seen_at
    `);
    this.stmtList = db.prepare(
      `SELECT * FROM device_request WHERE user_id = ? ORDER BY last_seen_at DESC`,
    );
    this.stmtGet = db.prepare(
      `SELECT * FROM device_request WHERE user_id = ? AND device_name = ?`,
    );
    this.stmtDelete = db.prepare(
      `DELETE FROM device_request WHERE user_id = ? AND device_name = ?`,
    );
  }

  /** Zapisuje zgłoszenie; ponowne wywołanie odświeża istniejący wpis. */
  upsert(userId: string, request: Omit<DeviceRegistrationRequest, 'type' | 'requestedAt' | 'lastSeenAt'>): DeviceRegistrationRequest {
    const now = Date.now();
    const existing = this.get(userId, request.deviceName);
    const requestedAt = existing?.requestedAt ?? now;
    this.stmtUpsert.run(
      userId,
      request.deviceName,
      request.label ?? null,
      request.kind ?? null,
      request.sn ?? null,
      request.description ?? null,
      request.version ?? null,
      request.address ?? null,
      requestedAt,
      now,
    );
    return { type: 'device-request', ...request, requestedAt, lastSeenAt: now };
  }

  list(userId: string): DeviceRegistrationRequest[] {
    return (this.stmtList.all(userId) as Record<string, unknown>[]).map(rowToRequest);
  }

  get(userId: string, deviceName: string): DeviceRegistrationRequest | null {
    const row = this.stmtGet.get(userId, deviceName) as Record<string, unknown> | undefined;
    return row ? rowToRequest(row) : null;
  }

  /** Usuwa zgłoszenie (po akceptacji albo odrzuceniu). */
  remove(userId: string, deviceName: string): boolean {
    return this.stmtDelete.run(userId, deviceName).changes > 0;
  }
}

function rowToRequest(row: Record<string, unknown>): DeviceRegistrationRequest {
  return {
    type: 'device-request',
    deviceName: String(row.device_name),
    label: (row.label as string) ?? undefined,
    kind: (row.kind as DeviceRegistrationRequest['kind']) ?? undefined,
    sn: (row.sn as string) ?? undefined,
    description: (row.description as string) ?? undefined,
    version: (row.version as string) ?? undefined,
    address: (row.address as string) ?? undefined,
    requestedAt: Number(row.requested_at),
    lastSeenAt: Number(row.last_seen_at),
  };
}
