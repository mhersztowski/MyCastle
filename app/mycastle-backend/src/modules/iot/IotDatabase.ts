import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export class IotDatabase {
  private db: Database.Database;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
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

    // App sessions — web/mobile/desktop presence & time tracking (admin only)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_sessions (
        id             TEXT PRIMARY KEY,
        user_id        TEXT NOT NULL,
        label          TEXT NOT NULL,
        platform       TEXT NOT NULL,
        user_agent     TEXT NOT NULL DEFAULT '',
        started_at     INTEGER NOT NULL,
        last_seen_at   INTEGER NOT NULL,
        total_seconds  INTEGER NOT NULL DEFAULT 0,
        active_seconds INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_app_sessions_user ON app_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_app_sessions_seen ON app_sessions(last_seen_at);

      CREATE TABLE IF NOT EXISTS app_session_time_buckets (
        session_id     TEXT NOT NULL,
        date           TEXT NOT NULL,
        total_seconds  INTEGER NOT NULL DEFAULT 0,
        active_seconds INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (session_id, date)
      );
      CREATE INDEX IF NOT EXISTS idx_app_bucket_session ON app_session_time_buckets(session_id);

      -- Per-project time: accumulates seconds per (user, contextType, contextId, date)
      CREATE TABLE IF NOT EXISTS app_session_project_time (
        user_id        TEXT NOT NULL,
        context_type   TEXT NOT NULL,
        context_id     TEXT NOT NULL DEFAULT '',
        date           TEXT NOT NULL,
        total_seconds  INTEGER NOT NULL DEFAULT 0,
        active_seconds INTEGER NOT NULL DEFAULT 0,
        last_seen_at   INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, context_type, context_id, date)
      );
      CREATE INDEX IF NOT EXISTS idx_app_proj_user ON app_session_project_time(user_id);
      CREATE INDEX IF NOT EXISTS idx_app_proj_date ON app_session_project_time(date);
    `);

    // Retention policies
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS retention_policy (
        user_id    TEXT NOT NULL,
        device_id  TEXT NOT NULL DEFAULT '',
        retention_days INTEGER NOT NULL DEFAULT 30,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, device_id)
      );
    `);

    // Device Twin
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS device_twin (
        device_id           TEXT PRIMARY KEY,
        user_id             TEXT NOT NULL,
        desired             TEXT NOT NULL DEFAULT '{}',
        reported            TEXT NOT NULL DEFAULT '{}',
        desired_updated_at  INTEGER NOT NULL DEFAULT 0,
        reported_updated_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_twin_user ON device_twin(user_id);
    `);

    // Notification channels
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notification_channel (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL,
        name        TEXT NOT NULL,
        type        TEXT NOT NULL DEFAULT 'webhook',
        webhook_url TEXT NOT NULL DEFAULT '',
        secret      TEXT,
        is_active   INTEGER NOT NULL DEFAULT 1,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notif_channel_user ON notification_channel(user_id);
    `);

    // IoT Automations
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS iot_automation (
        id              TEXT PRIMARY KEY,
        user_id         TEXT NOT NULL,
        name            TEXT NOT NULL,
        enabled         INTEGER NOT NULL DEFAULT 1,
        trigger_json    TEXT NOT NULL,
        actions_json    TEXT NOT NULL DEFAULT '[]',
        last_run_at     INTEGER,
        last_run_result TEXT,
        last_run_error  TEXT,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_iot_automation_user ON iot_automation(user_id);
    `);

    // Downsampled telemetry — 1-minute buckets
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS telemetry_1m (
        device_id       TEXT NOT NULL,
        user_id         TEXT NOT NULL,
        period_start    INTEGER NOT NULL,
        metrics_summary TEXT NOT NULL,
        PRIMARY KEY (device_id, period_start)
      );
      CREATE INDEX IF NOT EXISTS idx_tel1m_device_ts ON telemetry_1m(device_id, period_start);
    `);

    // Downsampled telemetry — 1-hour buckets
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS telemetry_1h (
        device_id       TEXT NOT NULL,
        user_id         TEXT NOT NULL,
        period_start    INTEGER NOT NULL,
        metrics_summary TEXT NOT NULL,
        PRIMARY KEY (device_id, period_start)
      );
      CREATE INDEX IF NOT EXISTS idx_tel1h_device_ts ON telemetry_1h(device_id, period_start);
    `);

    // Migrations
    try {
      this.db.exec(`ALTER TABLE iot_device_config ADD COLUMN entities TEXT NOT NULL DEFAULT '[]'`);
    } catch { /* already exists */ }

    try {
      this.db.exec(`ALTER TABLE iot_device_config ADD COLUMN extensions TEXT NOT NULL DEFAULT '[]'`);
    } catch { /* already exists */ }

    try {
      this.db.exec(`ALTER TABLE alert_rule ADD COLUMN notification_channel_ids TEXT NOT NULL DEFAULT '[]'`);
    } catch { /* already exists */ }
  }

  get raw(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}
