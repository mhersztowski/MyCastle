import type { AlertRule, Alert, TelemetryMetric, AlertSeverity, AlertStatus } from '@mhersztowski/core';
import type { IotDatabase } from './IotDatabase.js';
import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

export class AlertEngine {
  private stmtInsertRule: Database.Statement;
  private stmtUpdateRule: Database.Statement;
  private stmtDeleteRule: Database.Statement;
  private stmtGetRule: Database.Statement;
  private stmtListRules: Database.Statement;
  private stmtActiveRulesForDevice: Database.Statement;
  private stmtInsertAlert: Database.Statement;
  private stmtUpdateAlertStatus: Database.Statement;
  private stmtGetAlert: Database.Statement;
  private stmtListAlerts: Database.Statement;
  private stmtLastAlertForRule: Database.Statement;

  constructor(private iotDb: IotDatabase) {
    const db = iotDb.raw;

    this.stmtInsertRule = db.prepare(
      `INSERT INTO alert_rule (id, user_id, device_id, metric_key, condition_op, condition_value, severity, cooldown_minutes, is_active, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    this.stmtUpdateRule = db.prepare(
      `UPDATE alert_rule SET device_id=?, metric_key=?, condition_op=?, condition_value=?, severity=?, cooldown_minutes=?, is_active=?, name=?, updated_at=? WHERE id=?`,
    );

    this.stmtDeleteRule = db.prepare(`DELETE FROM alert_rule WHERE id = ?`);
    this.stmtGetRule = db.prepare(`SELECT * FROM alert_rule WHERE id = ?`);
    this.stmtListRules = db.prepare(`SELECT * FROM alert_rule WHERE user_id = ? ORDER BY created_at DESC`);

    this.stmtActiveRulesForDevice = db.prepare(
      `SELECT * FROM alert_rule WHERE is_active = 1 AND (device_id = ? OR device_id IS NULL) AND user_id = ?`,
    );

    this.stmtInsertAlert = db.prepare(
      `INSERT INTO alert (id, rule_id, device_id, user_id, severity, status, title, message, triggered_at, metric_snapshot)
       VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)`,
    );

    this.stmtUpdateAlertStatus = db.prepare(
      `UPDATE alert SET status=?, acknowledged_at=?, resolved_at=? WHERE id=?`,
    );

    this.stmtGetAlert = db.prepare(`SELECT * FROM alert WHERE id = ?`);

    this.stmtListAlerts = db.prepare(
      `SELECT * FROM alert WHERE user_id = ? ORDER BY triggered_at DESC LIMIT ?`,
    );

    this.stmtLastAlertForRule = db.prepare(
      `SELECT * FROM alert WHERE rule_id = ? ORDER BY triggered_at DESC LIMIT 1`,
    );
  }

  // --- Alert Rules CRUD ---

  createRule(rule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>): AlertRule {
    const id = randomUUID();
    const now = Date.now();
    this.stmtInsertRule.run(
      id, rule.userId, rule.deviceId ?? null, rule.metricKey,
      rule.conditionOp, rule.conditionValue, rule.severity,
      rule.cooldownMinutes, rule.isActive ? 1 : 0, rule.name, now, now,
    );
    return { ...rule, id, createdAt: now, updatedAt: now };
  }

  updateRule(id: string, update: Partial<Omit<AlertRule, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>): AlertRule | null {
    const existing = this.getRule(id);
    if (!existing) return null;
    const merged = { ...existing, ...update, updatedAt: Date.now() };
    this.stmtUpdateRule.run(
      merged.deviceId ?? null, merged.metricKey, merged.conditionOp,
      merged.conditionValue, merged.severity, merged.cooldownMinutes,
      merged.isActive ? 1 : 0, merged.name, merged.updatedAt, id,
    );
    return merged;
  }

  deleteRule(id: string): boolean {
    const result = this.stmtDeleteRule.run(id);
    return result.changes > 0;
  }

  getRule(id: string): AlertRule | null {
    const row = this.stmtGetRule.get(id) as any;
    return row ? this.rowToRule(row) : null;
  }

  listRules(userId: string): AlertRule[] {
    const rows = this.stmtListRules.all(userId) as any[];
    return rows.map((r) => this.rowToRule(r));
  }

  // --- Alert Evaluation ---

  evaluate(deviceId: string, userId: string, metrics: TelemetryMetric[]): Alert[] {
    const rules = this.stmtActiveRulesForDevice.all(deviceId, userId) as any[];
    const triggered: Alert[] = [];

    for (const ruleRow of rules) {
      const rule = this.rowToRule(ruleRow);
      const metric = metrics.find((m) => m.key === rule.metricKey);
      if (!metric || typeof metric.value !== 'number') continue;

      if (!this.checkCondition(metric.value, rule.conditionOp, rule.conditionValue)) continue;

      // Check cooldown
      const lastAlert = this.stmtLastAlertForRule.get(rule.id) as any;
      if (lastAlert) {
        const cooldownMs = rule.cooldownMinutes * 60 * 1000;
        if (Date.now() - lastAlert.triggered_at < cooldownMs) continue;
      }

      const alert = this.createAlert(rule, deviceId, userId, metric);
      triggered.push(alert);
    }

    return triggered;
  }

  // --- Alerts CRUD ---

  getAlert(id: string): Alert | null {
    const row = this.stmtGetAlert.get(id) as any;
    return row ? this.rowToAlert(row) : null;
  }

  listAlerts(userId: string, limit: number = 100): Alert[] {
    const rows = this.stmtListAlerts.all(userId, limit) as any[];
    return rows.map((r) => this.rowToAlert(r));
  }

  acknowledgeAlert(id: string): Alert | null {
    const now = Date.now();
    this.stmtUpdateAlertStatus.run('ACKNOWLEDGED', now, null, id);
    return this.getAlert(id);
  }

  resolveAlert(id: string): Alert | null {
    const now = Date.now();
    this.stmtUpdateAlertStatus.run('RESOLVED', null, now, id);
    return this.getAlert(id);
  }

  private createAlert(rule: AlertRule, deviceId: string, userId: string, metric: TelemetryMetric): Alert {
    const id = randomUUID();
    const now = Date.now();
    const title = `${rule.name}: ${metric.key} ${rule.conditionOp} ${rule.conditionValue}`;
    const message = `${metric.key} = ${metric.value}${metric.unit ? ' ' + metric.unit : ''}`;

    this.stmtInsertAlert.run(
      id, rule.id, deviceId, userId, rule.severity,
      title, message, now, JSON.stringify(metric),
    );

    return {
      id, ruleId: rule.id, deviceId, userId,
      severity: rule.severity, status: 'OPEN',
      title, message, triggeredAt: now, metricSnapshot: metric,
    };
  }

  private checkCondition(value: number, op: string, threshold: number): boolean {
    switch (op) {
      case '>': return value > threshold;
      case '<': return value < threshold;
      case '>=': return value >= threshold;
      case '<=': return value <= threshold;
      case '==': return value === threshold;
      case '!=': return value !== threshold;
      default: return false;
    }
  }

  private rowToRule(row: any): AlertRule {
    return {
      id: row.id,
      userId: row.user_id,
      deviceId: row.device_id ?? undefined,
      metricKey: row.metric_key,
      conditionOp: row.condition_op,
      conditionValue: row.condition_value,
      severity: row.severity as AlertSeverity,
      cooldownMinutes: row.cooldown_minutes,
      isActive: row.is_active === 1,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToAlert(row: any): Alert {
    return {
      id: row.id,
      ruleId: row.rule_id,
      deviceId: row.device_id,
      userId: row.user_id,
      severity: row.severity as AlertSeverity,
      status: row.status as AlertStatus,
      title: row.title,
      message: row.message,
      triggeredAt: row.triggered_at,
      acknowledgedAt: row.acknowledged_at ?? undefined,
      resolvedAt: row.resolved_at ?? undefined,
      metricSnapshot: row.metric_snapshot ? JSON.parse(row.metric_snapshot) : undefined,
    };
  }
}
