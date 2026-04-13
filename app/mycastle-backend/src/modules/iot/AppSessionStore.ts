import type { AppSession, AppSessionDayStat, AppSessionPlatform, AppSessionContext, ProjectTimeStat } from '@mhersztowski/core';
import type { IotDatabase } from './IotDatabase.js';

/** Raw row as stored in SQLite */
interface SessionRow {
  id: string;
  user_id: string;
  label: string;
  platform: string;
  user_agent: string;
  started_at: number;
  last_seen_at: number;
  total_seconds: number;
  active_seconds: number;
}

/** Row from app_session_time_buckets */
interface BucketRow {
  session_id: string;
  date: string; // YYYY-MM-DD
  total_seconds: number;
  active_seconds: number;
}

interface ProjectTimeRow {
  user_id: string;
  context_type: string;
  context_id: string;
  date: string;
  total_seconds: number;
  active_seconds: number;
  last_seen_at: number;
}

function rowToSession(row: SessionRow): AppSession {
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    platform: row.platform as AppSessionPlatform,
    userAgent: row.user_agent,
    startedAt: row.started_at,
    lastSeenAt: row.last_seen_at,
    totalSeconds: row.total_seconds,
    activeSeconds: row.active_seconds,
  };
}

export class AppSessionStore {
  private db: IotDatabase;

  constructor(db: IotDatabase) {
    this.db = db;
  }

  /** Upsert session on hello — create if new, update label/lastSeenAt if reconnect */
  upsert(session: Pick<AppSession, 'id' | 'userId' | 'label' | 'platform' | 'userAgent'>): void {
    const now = Date.now();
    this.db.raw.prepare(`
      INSERT INTO app_sessions (id, user_id, label, platform, user_agent, started_at, last_seen_at, total_seconds, active_seconds)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
      ON CONFLICT(id) DO UPDATE SET
        label        = excluded.label,
        last_seen_at = excluded.last_seen_at
    `).run(session.id, session.userId, session.label, session.platform, session.userAgent, now, now);
  }

  /**
   * Record a heartbeat tick.
   * @param sessionId     session UUID
   * @param intervalSec   seconds since last heartbeat
   * @param isInteractive whether the user was actively interacting
   * @param context       current page/project context (optional)
   */
  recordHeartbeat(
    sessionId: string,
    intervalSec: number,
    isInteractive: boolean,
    context?: AppSessionContext,
  ): void {
    const now = Date.now();
    const todayIso = new Date().toISOString().slice(0, 10);
    const activeDelta = isInteractive ? intervalSec : 0;

    // Update session totals
    this.db.raw.prepare(`
      UPDATE app_sessions
      SET last_seen_at   = ?,
          total_seconds  = total_seconds  + ?,
          active_seconds = active_seconds + ?
      WHERE id = ?
    `).run(now, intervalSec, activeDelta, sessionId);

    // Upsert session daily bucket
    this.db.raw.prepare(`
      INSERT INTO app_session_time_buckets (session_id, date, total_seconds, active_seconds)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(session_id, date) DO UPDATE SET
        total_seconds  = total_seconds  + excluded.total_seconds,
        active_seconds = active_seconds + excluded.active_seconds
    `).run(sessionId, todayIso, intervalSec, activeDelta);

    // Upsert project/context time (only when context is provided)
    if (context) {
      const session = this.db.raw.prepare(
        'SELECT user_id FROM app_sessions WHERE id = ?'
      ).get(sessionId) as { user_id: string } | undefined;

      if (session) {
        this.db.raw.prepare(`
          INSERT INTO app_session_project_time
            (user_id, context_type, context_id, date, total_seconds, active_seconds, last_seen_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, context_type, context_id, date) DO UPDATE SET
            total_seconds  = total_seconds  + excluded.total_seconds,
            active_seconds = active_seconds + excluded.active_seconds,
            last_seen_at   = excluded.last_seen_at
        `).run(
          session.user_id,
          context.type,
          context.id ?? '',
          todayIso,
          intervalSec,
          activeDelta,
          now,
        );
      }
    }
  }

  /**
   * Returns aggregated project-time stats (last 7 days) grouped by
   * (userId, contextType, contextId), sorted by total_seconds DESC.
   */
  getProjectStats(userId?: string): ProjectTimeStat[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 6);
    const cutoffDate = cutoff.toISOString().slice(0, 10);

    // Aggregate totals per (user, type, id)
    const totals = (userId
      ? this.db.raw.prepare(`
          SELECT user_id, context_type, context_id,
                 SUM(total_seconds) AS total_seconds,
                 SUM(active_seconds) AS active_seconds,
                 MAX(last_seen_at) AS last_seen_at
          FROM app_session_project_time
          WHERE user_id = ?
          GROUP BY user_id, context_type, context_id
          ORDER BY total_seconds DESC
        `).all(userId)
      : this.db.raw.prepare(`
          SELECT user_id, context_type, context_id,
                 SUM(total_seconds) AS total_seconds,
                 SUM(active_seconds) AS active_seconds,
                 MAX(last_seen_at) AS last_seen_at
          FROM app_session_project_time
          GROUP BY user_id, context_type, context_id
          ORDER BY total_seconds DESC
        `).all()
    ) as ProjectTimeRow[];

    return totals.map((row) => {
      const buckets = this.db.raw.prepare(`
        SELECT date, total_seconds, active_seconds
        FROM app_session_project_time
        WHERE user_id = ? AND context_type = ? AND context_id = ? AND date >= ?
        ORDER BY date ASC
      `).all(row.user_id, row.context_type, row.context_id, cutoffDate) as ProjectTimeRow[];

      return {
        userId: row.user_id,
        contextType: row.context_type,
        contextId: row.context_id,
        totalSeconds: row.total_seconds,
        activeSeconds: row.active_seconds,
        lastSeenAt: row.last_seen_at,
        days: buckets.map((b) => ({
          date: b.date,
          totalSeconds: b.total_seconds,
          activeSeconds: b.active_seconds,
        })),
      };
    });
  }

  getAll(): AppSession[] {
    const rows = this.db.raw.prepare(
      'SELECT * FROM app_sessions ORDER BY last_seen_at DESC'
    ).all() as SessionRow[];
    return rows.map(rowToSession);
  }

  getByUser(userId: string): AppSession[] {
    const rows = this.db.raw.prepare(
      'SELECT * FROM app_sessions WHERE user_id = ? ORDER BY last_seen_at DESC'
    ).all(userId) as SessionRow[];
    return rows.map(rowToSession);
  }

  /** Weekly stats (last 7 days) for all sessions of a user, or all users when userId is undefined */
  getWeeklyStats(userId?: string): Array<{ session: AppSession; days: AppSessionDayStat[] }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 6);
    const cutoffDate = cutoff.toISOString().slice(0, 10);

    const sessions = userId ? this.getByUser(userId) : this.getAll();

    return sessions.map((session) => {
      const buckets = this.db.raw.prepare(`
        SELECT date, total_seconds, active_seconds
        FROM app_session_time_buckets
        WHERE session_id = ? AND date >= ?
        ORDER BY date ASC
      `).all(session.id, cutoffDate) as BucketRow[];

      const days: AppSessionDayStat[] = buckets.map((b) => ({
        date: b.date,
        totalSeconds: b.total_seconds,
        activeSeconds: b.active_seconds,
      }));

      return { session, days };
    });
  }
}
