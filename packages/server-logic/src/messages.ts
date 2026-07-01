/**
 * Message envelope + UI event vocabulary exchanged over MQTT (see ServerLogic.md).
 */

/** Generic envelope wrapping any payload sent between server, users and clients. */
export interface Envelope<T = unknown> {
  /** Discriminator, e.g. `ping`, `log`, `client.hello`, or a UI event type. */
  type: string;
  /** Optional sender identity (client key / user name / 'server'). */
  from?: string;
  /** Optional addressee. */
  to?: string;
  /** Epoch millis; stamped by the receiver when absent. */
  ts?: number;
  /** Correlation id for request/response. */
  reqId?: string;
  /** Arbitrary payload. */
  payload?: T;
}

/** Best-effort parse of a JSON payload into an Envelope (null on failure). */
export function parseEnvelope(payload: string): Envelope | null {
  try {
    const obj = JSON.parse(payload);
    if (obj && typeof obj === 'object' && typeof obj.type === 'string') return obj as Envelope;
  } catch {
    /* ignore malformed payloads */
  }
  return null;
}

export function stringifyEnvelope(env: Envelope): string {
  return JSON.stringify(env);
}

// ── Client lifecycle vocabulary (client → server, on the client outbox) ───────
//
// A client logs in, then registers its services and devices as sub-entities.
// See ServerLogic.md → "client-> server (Inbox)".

/** A service or device advertised by a client. */
export interface RegisteredEntity {
  /** Stable id, unique within the client (used in service/device topics). */
  id: string;
  /** Human-readable label. */
  name?: string;
  /** Capability tag, e.g. `virtual-mouse`, `vfs`, `display`. */
  kind?: string;
  /** Command types the entity understands. */
  capabilities?: string[];
}

export const CLIENT_MESSAGE_TYPES = [
  'client-login',
  'client-logout',
  'client-service-new',
  'client-service-remove',
  'client-device-new',
  'client-device-remove',
  'heartbeat',
] as const;

export type ClientMessageType = (typeof CLIENT_MESSAGE_TYPES)[number];

export function isClientMessage(type: string): boolean {
  return (CLIENT_MESSAGE_TYPES as readonly string[]).includes(type);
}

/** Payload of `client-login` / `client-logout`. Identity also comes from the topic. */
export interface ClientLoginPayload {
  client: import('./types').ClientId;
  name?: string;
}

/** Payload of `client-service-new` / `client-device-new` (entity in `entity`). */
export interface ClientEntityPayload {
  entity: RegisteredEntity;
}

// ── UI events (DOM-like form events relayed over MQTT) ────────────────────────

export type UiEvent =
  | { type: 'focus' | 'blur'; field: string }
  | { type: 'change' | 'input'; field: string; value: string }
  | { type: 'check'; field: string; checked: boolean }
  | { type: 'select'; field: string; value: string }
  | { type: 'click' | 'hover'; field: string }
  | { type: 'submit' | 'reset' | 'validate'; formId: string }
  | { type: 'error'; field: string; message: string }
  | { type: 'valid'; field: string }
  | { type: 'keydown' | 'keyup'; field: string; key: string }
  | { type: 'mounted' | 'unmounted' | 'visible' | 'hidden'; formId: string }
  | { type: 'fileSelected'; field: string; fileName: string; size: number }
  | { type: 'fileUploadProgress'; field: string; progress: number };

export const UI_EVENT_TYPES = [
  'focus', 'blur', 'change', 'input', 'check', 'select', 'click', 'hover',
  'submit', 'reset', 'validate', 'error', 'valid', 'keydown', 'keyup',
  'mounted', 'unmounted', 'visible', 'hidden', 'fileSelected', 'fileUploadProgress',
] as const;

export function isUiEvent(type: string): boolean {
  return (UI_EVENT_TYPES as readonly string[]).includes(type);
}
