import type { TelemetryRecord, TelemetryAggregate, IotDeviceConfig } from '@mhersztowski/core';
import type { IotDatabase } from './IotDatabase.js';
import type Database from 'better-sqlite3';

export class TelemetryStore {
  private stmtInsert: Database.Statement;
  private stmtLatest: Database.Statement;
  private stmtHistory: Database.Statement;
  private stmtCleanup: Database.Statement;
  private stmtConfigUpsert: Database.Statement;
  private stmtConfigGet: Database.Statement;
  private stmtConfigDelete: Database.Statement;

  constructor(private iotDb: IotDatabase) {
    const db = iotDb.raw;

    this.stmtInsert = db.prepare(
      `INSERT INTO telemetry (device_id, user_id, timestamp, metrics, rssi, battery)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );

    this.stmtLatest = db.prepare(
      `SELECT * FROM telemetry WHERE device_id = ? ORDER BY timestamp DESC LIMIT 1`,
    );

    this.stmtHistory = db.prepare(
      `SELECT * FROM telemetry WHERE device_id = ? AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp DESC LIMIT ?`,
    );

    this.stmtCleanup = db.prepare(
      `DELETE FROM telemetry WHERE timestamp < ?`,
    );

    this.stmtConfigUpsert = db.prepare(
      `INSERT INTO iot_device_config (device_id, user_id, topic_prefix, heartbeat_interval_sec, capabilities, entities, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         user_id = excluded.user_id,
         topic_prefix = excluded.topic_prefix,
         heartbeat_interval_sec = excluded.heartbeat_interval_sec,
         capabilities = excluded.capabilities,
         entities = excluded.entities,
         updated_at = excluded.updated_at`,
    );

    this.stmtConfigGet = db.prepare(
      `SELECT * FROM iot_device_config WHERE device_id = ?`,
    );

    this.stmtConfigDelete = db.prepare(
      `DELETE FROM iot_device_config WHERE device_id = ?`,
    );
  }

  insertTelemetry(record: TelemetryRecord): void {
    this.stmtInsert.run(
      record.deviceId,
      record.userId,
      record.timestamp,
      JSON.stringify(record.metrics),
      record.rssi ?? null,
      record.battery ?? null,
    );
  }

  getLatest(deviceId: string): TelemetryRecord | null {
    const row = this.stmtLatest.get(deviceId) as any;
    return row ? this.rowToRecord(row) : null;
  }

  getHistory(deviceId: string, from: number, to: number, limit: number = 1000): TelemetryRecord[] {
    const rows = this.stmtHistory.all(deviceId, from, to, limit) as any[];
    return rows.map((r) => this.rowToRecord(r));
  }

  getAggregate(deviceId: string, metricKey: string, periodMs: number, from: number, to: number): TelemetryAggregate[] {
    const db = this.iotDb.raw;
    const stmt = db.prepare(`
      SELECT
        device_id,
        (timestamp / ?) * ? AS period_start,
        COUNT(*) AS count
      FROM telemetry
      WHERE device_id = ? AND timestamp >= ? AND timestamp <= ?
      GROUP BY device_id, period_start
      ORDER BY period_start
    `);

    const rows = stmt.all(periodMs, periodMs, deviceId, from, to) as any[];

    // For detailed min/max/avg we need to process metrics JSON in application code
    // because SQLite json_extract doesn't handle array search by key well
    const result: TelemetryAggregate[] = [];
    for (const row of rows) {
      const periodStart = row.period_start as number;
      const periodEnd = periodStart + periodMs;

      const records = this.getHistory(deviceId, periodStart, periodEnd, 10000);
      const values: number[] = [];
      for (const rec of records) {
        const metric = rec.metrics.find((m) => m.key === metricKey);
        if (metric && typeof metric.value === 'number') {
          values.push(metric.value);
        }
      }

      if (values.length > 0) {
        result.push({
          deviceId,
          periodStart,
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          count: values.length,
        });
      }
    }
    return result;
  }

  cleanup(olderThanMs: number): number {
    const result = this.stmtCleanup.run(olderThanMs);
    return result.changes;
  }

  // --- IoT Device Config ---

  upsertConfig(config: IotDeviceConfig): void {
    this.stmtConfigUpsert.run(
      config.deviceId,
      config.userId,
      config.topicPrefix,
      config.heartbeatIntervalSec,
      JSON.stringify(config.capabilities),
      JSON.stringify(config.entities ?? []),
      config.createdAt,
      config.updatedAt,
    );
  }

  getConfig(deviceId: string): IotDeviceConfig | null {
    const row = this.stmtConfigGet.get(deviceId) as any;
    return row ? this.rowToConfig(row) : null;
  }

  deleteConfig(deviceId: string): void {
    this.stmtConfigDelete.run(deviceId);
  }

  private rowToRecord(row: any): TelemetryRecord {
    return {
      id: row.id,
      deviceId: row.device_id,
      userId: row.user_id,
      timestamp: row.timestamp,
      metrics: JSON.parse(row.metrics),
      rssi: row.rssi ?? undefined,
      battery: row.battery ?? undefined,
    };
  }

  private rowToConfig(row: any): IotDeviceConfig {
    const entities = row.entities ? JSON.parse(row.entities) : [];
    return {
      deviceId: row.device_id,
      userId: row.user_id,
      topicPrefix: row.topic_prefix,
      heartbeatIntervalSec: row.heartbeat_interval_sec,
      capabilities: JSON.parse(row.capabilities),
      ...(entities.length > 0 ? { entities } : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
