/**
 * PresenceService — tracks web/mobile app sessions and reports them to the
 * backend via MQTT hello + heartbeat messages, identical in structure to IoT
 * devices but carrying extra fields (platform, sessionId, isInteractive).
 *
 * Lifecycle: call start() after login, stop() on logout.
 */

export interface PresenceContext {
  type: string;
  id?: string;
}

/** Seconds without any input event before we declare the user inactive */
const INACTIVE_THRESHOLD_MS = 30_000;

// ── URL → context extraction ──────────────────────────────────────────────────

/**
 * Maps the current browser pathname to a project/section context.
 * Returns null for pages that don't map to a meaningful project
 * (login, home, generic settings).
 */
export function extractContext(pathname: string): PresenceContext | null {
  let m: RegExpMatchArray | null;

  // Code projects
  m = pathname.match(/\/user\/[^/]+\/project\/([^/]+)/);
  if (m) return { type: 'arduino', id: m[1] };

  m = pathname.match(/\/user\/[^/]+\/upython-project\/([^/]+)/);
  if (m) return { type: 'upython', id: m[1] };

  m = pathname.match(/\/user\/[^/]+\/pygame-project\/([^/]+)/);
  if (m) return { type: 'pygame', id: m[1] };

  // IoT device / smart display / virtual display
  m = pathname.match(/\/user\/[^/]+\/iot\/(?:device|smart-display|virtual-display)\/([^/]+)/);
  if (m) return { type: 'iot-device', id: m[1] };

  // Monaco editor with file path
  m = pathname.match(/\/user\/[^/]+\/editor\/monaco\/(.+)/);
  if (m) return { type: 'editor', id: decodeURIComponent(m[1]) };

  // Markdown workspace
  m = pathname.match(/\/workspace\/md\/?(.*)/);
  if (m) return { type: 'notes', id: m[1] || undefined };

  // PIM sections
  if (/\/pim\/calendar/.test(pathname)) return { type: 'pim', id: 'calendar' };
  if (/\/pim\/todolist/.test(pathname)) return { type: 'pim', id: 'todolist' };
  if (/\/pim\/project/.test(pathname)) return { type: 'pim', id: 'projects' };
  if (/\/pim\/shopping/.test(pathname)) return { type: 'pim', id: 'shopping' };
  if (/\/pim\/agent/.test(pathname)) return { type: 'pim', id: 'agent' };
  if (/\/pim\/person/.test(pathname)) return { type: 'pim', id: 'persons' };
  if (/\/pim\/automate/.test(pathname)) return { type: 'pim', id: 'automate' };

  // IoT dashboards
  if (/\/iot\/dashboard/.test(pathname)) return { type: 'iot', id: 'dashboard' };
  if (/\/iot\/alerts/.test(pathname)) return { type: 'iot', id: 'alerts' };
  if (/\/iot\/emulator/.test(pathname)) return { type: 'iot', id: 'emulator' };

  // Electronics pages
  if (/\/electronics\/arduino/.test(pathname)) return { type: 'electronics', id: 'arduino' };
  if (/\/electronics\/upython/.test(pathname)) return { type: 'electronics', id: 'upython' };
  if (/\/electronics\/pygame/.test(pathname)) return { type: 'electronics', id: 'pygame' };
  if (/\/electronics\/configuration/.test(pathname)) return { type: 'electronics', id: 'configuration' };
  if (/\/electronics\/devices/.test(pathname)) return { type: 'electronics', id: 'devices' };
  if (/\/electronics\/devicesdefs/.test(pathname)) return { type: 'electronics', id: 'devicesdefs' };

  // Fallback: any page under /admin/:user/* or /user/:user/*
  // Strip the leading /admin/:user or /user/:user prefix, use the rest as id
  m = pathname.match(/^\/admin\/[^/]+\/(.+)/);
  if (m) return { type: 'admin', id: m[1] };

  m = pathname.match(/^\/user\/[^/]+\/(.+)/);
  if (m) return { type: 'page', id: m[1] };

  return null; // home, login — skip
}

/** Heartbeat interval (ms). Must match the value sent in intervalSec field */
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_INTERVAL_SEC = HEARTBEAT_INTERVAL_MS / 1000;

const SESSION_KEY = 'minis_presence_session_id';

/** UUID v4 that works in non-secure HTTP contexts (no crypto.randomUUID needed) */
function generateUUID(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // crypto.randomUUID() requires secure context (HTTPS); fall back to Math.random
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
}

function getOrCreateSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = generateUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // sessionStorage unavailable (private mode, WebView restriction) — ephemeral id
    return generateUUID();
  }
}

function detectPlatform(): 'web' | 'mobile' {
  const ua = navigator.userAgent;
  if (/ReactNative|wv|WebView/i.test(ua)) return 'mobile';
  try {
    if (window.matchMedia('(max-width: 600px) and (pointer: coarse)').matches) return 'mobile';
  } catch {
    // matchMedia not available in this WebView
  }
  return 'web';
}

function buildLabel(): string {
  const ua = navigator.userAgent;
  // Extract browser name
  let browser = 'Browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
  // Extract OS
  let os = 'Unknown OS';
  if (/Windows NT/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad/.test(ua)) os = 'iOS';
  const platform = detectPlatform();
  if (platform === 'mobile') return `Mobile (${os})`;
  return `${browser} / ${os}`;
}

export class PresenceService {
  private publish: ((topic: string, payload: string) => void) | null = null;
  private userName: string | null = null;
  private sessionId: string | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivityAt = Date.now();
  private platform: 'web' | 'mobile' = 'web';
  private currentContext: PresenceContext | null = null;

  private readonly onActivity = () => {
    this.lastActivityAt = Date.now();
  };

  private readonly onNavigation = () => {
    this.currentContext = extractContext(window.location.pathname);
  };

  /** Called once after login */
  start(publishFn: (topic: string, payload: string) => void, userName: string): void {
    if (this.heartbeatTimer) this.stop(); // guard: don't double-start
    this.publish = publishFn;
    this.userName = userName;
    this.sessionId = getOrCreateSessionId();
    this.platform = detectPlatform();
    this.lastActivityAt = Date.now();

    // Listen for user activity
    const opts: AddEventListenerOptions = { passive: true, capture: true };
    document.addEventListener('mousemove', this.onActivity, opts);
    document.addEventListener('mousedown', this.onActivity, opts);
    document.addEventListener('keydown', this.onActivity, opts);
    document.addEventListener('touchstart', this.onActivity, opts);
    document.addEventListener('pointerdown', this.onActivity, opts);

    // Track route changes (React Router uses history API)
    window.addEventListener('popstate', this.onNavigation);
    // Intercept pushState/replaceState which React Router uses
    this.patchHistory();
    this.currentContext = extractContext(window.location.pathname);

    // Send hello immediately
    this.sendHello();

    // Start heartbeat loop
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  /** Called on logout */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    const opts: EventListenerOptions = { capture: true };
    document.removeEventListener('mousemove', this.onActivity, opts);
    document.removeEventListener('mousedown', this.onActivity, opts);
    document.removeEventListener('keydown', this.onActivity, opts);
    document.removeEventListener('touchstart', this.onActivity, opts);
    document.removeEventListener('pointerdown', this.onActivity, opts);
    window.removeEventListener('popstate', this.onNavigation);
    this.publish = null;
    this.userName = null;
    this.currentContext = null;
    // Keep sessionId in sessionStorage — browser tab lifecycle handles it
  }

  // Monkey-patch history.pushState/replaceState to detect SPA navigation.
  // Wrapped in try/catch — in some WebViews the history object is read-only.
  private _historyPatched = false;
  private patchHistory(): void {
    if (this._historyPatched) return;
    this._historyPatched = true;
    try {
      const self = this;
      const orig = { push: history.pushState.bind(history), replace: history.replaceState.bind(history) };
      history.pushState = function (...args) {
        orig.push(...args);
        self.onNavigation();
      };
      history.replaceState = function (...args) {
        orig.replace(...args);
        self.onNavigation();
      };
    } catch {
      // history API read-only in this environment — navigation tracking unavailable,
      // context will be fixed at the page loaded at session start
    }
  }

  private get topicPrefix(): string {
    // Use a synthetic device name so backend routes correctly: minis/{user}/app-{sessionId}/...
    const sid = this.sessionId ?? 'unknown';
    return `minis/${this.userName}/app-${sid}`;
  }

  private get isInteractive(): boolean {
    return Date.now() - this.lastActivityAt < INACTIVE_THRESHOLD_MS;
  }

  private sendHello(): void {
    if (!this.publish || !this.userName || !this.sessionId) return;
    const payload = JSON.stringify({
      platform: this.platform,
      sessionId: this.sessionId,
      label: buildLabel(),
      userAgent: navigator.userAgent,
    });
    this.publish(`${this.topicPrefix}/hello`, payload);
  }

  private sendHeartbeat(): void {
    if (!this.publish || !this.userName || !this.sessionId) return;
    const body: Record<string, unknown> = {
      sessionId: this.sessionId,
      intervalSec: HEARTBEAT_INTERVAL_SEC,
      isInteractive: this.isInteractive,
    };
    if (this.currentContext) body.context = this.currentContext;
    this.publish(`${this.topicPrefix}/heartbeat`, JSON.stringify(body));
  }
}

export const presenceService = new PresenceService();
