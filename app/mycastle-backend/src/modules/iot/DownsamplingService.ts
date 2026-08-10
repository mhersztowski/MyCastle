import type { IotDatabase } from './IotDatabase.js';
import type Database from 'better-sqlite3';

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;

/**
 * Aggregates raw telemetry rows into 1-minute and 1-hour buckets.
 * Runs in background: every minute for 1m buckets, every hour for 1h buckets.
 *
 * Schema of metrics_summary (JSON):
 *   { [metricKey]: { min, max, avg, count, unit? } }
 */
export class DownsamplingService {
  private stmtRawForPeriod: Database.Statement;
  private stmtUpsert1m: Database.Statement;
  private stmtUpsert1h: Database.Statement;
  private stmtRaw1mForPeriod: Database.Statement;
  private minuteTimer: NodeJS.Timeout | null = null;
  private hourTimer: NodeJS.Timeout | null = null;

  constructor(private iotDb: IotDatabase) {
    const db = iotDb.raw;

    this.stmtRawForPeriod = db.prepare(
      `SELECT metrics, rssi, battery FROM telemetry
       WHERE device_id = ? AND timestamp >= ? AND timestamp < ?`,
    );

    this.stmtUpsert1m = db.prepare(
      `INSERT INTO telemetry_1m (device_id, user_id, period_start, metrics_summary)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(device_id, period_start) DO UPDATE SET metrics_summary = excluded.metrics_summary`,
    );

    this.stmtUpsert1h = db.prepare(
      `INSERT INTO telemetry_1h (device_id, user_id, period_start, metrics_summary)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(device_id, period_start) DO UPDATE SET metrics_summary = excluded.metrics_summary`,
    );

    this.stmtRaw1mForPeriod = db.prepare(
      `SELECT metrics_summary FROM telemetry_1m
       WHERE device_id = ? AND period_start >= ? AND period_start < ?`,
    );
  }

  start(): void {
    // Run 1m aggregation every minute, starting aligned to next minute boundary
    const msToNextMin = MIN_MS - (Date.now() % MIN_MS);
    setTimeout(() => {
      this.aggregate1m();
      this.minuteTimer = setInterval(() => this.aggregate1m(), MIN_MS);
    }, msToNextMin);

    // Run 1h aggregation every hour, starting aligned to next hour boundary
    const msToNextHour = HOUR_MS - (Date.now() % HOUR_MS);
    setTimeout(() => {
      this.aggregate1h();
      this.hourTimer = setInterval(() => this.aggregate1h(), HOUR_MS);
    }, msToNextHour);
  }

  stop(): void {
    if (this.minuteTimer) { clearInterval(this.minuteTimer); this.minuteTimer = null; }
    if (this.hourTimer) { clearInterval(this.hourTimer); this.hourTimer = null; }
  }

  private aggregate1m(): void {
    const db = this.iotDb.raw;
    const now = Date.now();
    const prevMinStart = Math.floor((now - MIN_MS) / MIN_MS) * MIN_MS;

    // Find all devices that had telemetry in the last 2 minutes
    const devicesStmt = db.prepare(
      `SELECT DISTINCT device_id, user_id FROM telemetry WHERE timestamp >= ? AND timestamp < ?`,
    );
    const devices = devicesStmt.all(prevMinStart - MIN_MS, now) as Array<{ device_id: string; user_id: string }>;

    for (const { device_id, user_id } of devices) {
      const rows = this.stmtRawForPeriod.all(device_id, prevMinStart, prevMinStart + MIN_MS) as Array<{ metrics: string }>;
      if (rows.length === 0) continue;

      const summary = this.buildSummary(rows.map((r) => JSON.parse(r.metrics)));
      this.stmtUpsert1m.run(device_id, user_id, prevMinStart, JSON.stringify(summary));
    }
  }

  private aggregate1h(): void {
    const now = Date.now();
    const prevHourStart = Math.floor((now - HOUR_MS) / HOUR_MS) * HOUR_MS;

    // Aggregate 1m buckets into 1h
    const stmtDevices = this.iotDb.raw.prepare(
      `SELECT DISTINCT device_id, user_id FROM telemetry_1m WHERE period_start >= ? AND period_start < ?`,
    );
    const devices = stmtDevices.all(prevHourStart, prevHourStart + HOUR_MS) as Array<{ device_id: string; user_id: string }>;

    for (const { device_id, user_id } of devices) {
      const rows = this.stmtRaw1mForPeriod.all(device_id, prevHourStart, prevHourStart + HOUR_MS) as Array<{ metrics_summary: string }>;
      if (rows.length === 0) continue;

      // Merge 1m summaries into 1h summary
      const allSummaries = rows.map((r) => JSON.parse(r.metrics_summary) as Record<string, { min: number; max: number; avg: number; count: number }>);
      const merged: Record<string, { min: number; max: number; avg: number; count: number }> = {};

      for (const s of allSummaries) {
        for (const [key, val] of Object.entries(s)) {
          if (!merged[key]) {
            merged[key] = { ...val };
          } else {
            const prev = merged[key];
            const totalCount = prev.count + val.count;
            merged[key] = {
              min: Math.min(prev.min, val.min),
              max: Math.max(prev.max, val.max),
              avg: (prev.avg * prev.count + val.avg * val.count) / totalCount,
              count: totalCount,
            };
          }
        }
      }

      this.stmtUpsert1h.run(device_id, user_id, prevHourStart, JSON.stringify(merged));
    }
  }

  private buildSummary(metricsArrays: Array<Array<{ key: string; value: unknown; unit?: string }>>): Record<string, { min: number; max: number; avg: number; count: number; unit?: string }> {
    const accum: Record<string, { values: number[]; unit?: string }> = {};

    for (const metrics of metricsArrays) {
      for (const m of metrics) {
        if (typeof m.value !== 'number') continue;
        if (!accum[m.key]) accum[m.key] = { values: [], unit: m.unit };
        accum[m.key].values.push(m.value);
      }
    }

    const result: Record<string, { min: number; max: number; avg: number; count: number; unit?: string }> = {};
    for (const [key, { values, unit }] of Object.entries(accum)) {
      if (values.length === 0) continue;
      result[key] = {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        count: values.length,
        ...(unit ? { unit } : {}),
      };
    }
    return result;
  }
}
