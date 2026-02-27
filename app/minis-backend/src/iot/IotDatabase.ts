import Database from 'better-sqlite3';
import * as path from 'path';

export class IotDatabase {
  private db: Database.Database;

  constructor(dataDir: string) {
    const dbPath = path.join(dataDir, 'iot.db');
    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS iot_device_config (
        device_id   TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL,
        topic_prefix TEXT NOT NULL,
        heartbeat_interval_sec INTEGER DEFAULT 60,
        capabilities TEXT NOT NULL DEFAULT '[]',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS telemetry (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id   TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        timestamp   INTEGER NOT NULL,
        metrics     TEXT NOT NULL,
        rssi        REAL,
        battery     REAL
      );
      CREATE INDEX IF NOT EXISTS idx_telemetry_device_ts ON telemetry(device_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_telemetry_ts ON telemetry(timestamp);

      CREATE TABLE IF NOT EXISTS device_command (
        id             TEXT PRIMARY KEY,
        device_id      TEXT NOT NULL,
        name           TEXT NOT NULL,
        payload        TEXT NOT NULL DEFAULT '{}',
        status         TEXT NOT NULL DEFAULT 'PENDING',
        created_at     INTEGER NOT NULL,
        resolved_at    INTEGER,
        failure_reason TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_command_device_status ON device_command(device_id, status);

      CREATE TABLE IF NOT EXISTS alert_rule (
        id                TEXT PRIMARY KEY,
        user_id           TEXT NOT NULL,
        device_id         TEXT,
        metric_key        TEXT NOT NULL,
        condition_op      TEXT NOT NULL,
        condition_value   REAL NOT NULL,
        severity          TEXT NOT NULL DEFAULT 'INFO',
        cooldown_minutes  INTEGER DEFAULT 15,
        is_active         INTEGER DEFAULT 1,
        name              TEXT NOT NULL,
        created_at        INTEGER NOT NULL,
        updated_at        INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_alert_rule_user ON alert_rule(user_id);

      CREATE TABLE IF NOT EXISTS alert (
        id              TEXT PRIMARY KEY,
        rule_id         TEXT NOT NULL,
        device_id       TEXT NOT NULL,
        user_id         TEXT NOT NULL,
        severity        TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'OPEN',
        title           TEXT NOT NULL,
        message         TEXT NOT NULL,
        triggered_at    INTEGER NOT NULL,
        acknowledged_at INTEGER,
        resolved_at     INTEGER,
        metric_snapshot TEXT,
        FOREIGN KEY (rule_id) REFERENCES alert_rule(id)
      );
      CREATE INDEX IF NOT EXISTS idx_alert_device_status ON alert(device_id, status);
      CREATE INDEX IF NOT EXISTS idx_alert_user_status ON alert(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_alert_triggered ON alert(triggered_at);

      CREATE TABLE IF NOT EXISTS device_share (
        id              TEXT PRIMARY KEY,
        owner_user_id   TEXT NOT NULL,
        device_id       TEXT NOT NULL,
        target_user_id  TEXT NOT NULL,
        created_at      INTEGER NOT NULL,
        UNIQUE(device_id, target_user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_device_share_device ON device_share(device_id);
      CREATE INDEX IF NOT EXISTS idx_device_share_target ON device_share(target_user_id);
    `);

    // Migration: add entities column to iot_device_config
    try {
      this.db.exec(`ALTER TABLE iot_device_config ADD COLUMN entities TEXT NOT NULL DEFAULT '[]'`);
    } catch {
      // Column already exists
    }
  }

  get raw(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}
