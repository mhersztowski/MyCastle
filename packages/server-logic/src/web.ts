/**
 * Browser-safe entry: `@mhersztowski/server-logic/web`.
 *
 * Re-exports ONLY the parts a frontend needs to talk to the server over MQTT —
 * topics, message envelopes/UI events, identity helpers and log value types.
 * It pulls in **no** runtime dependency on `minislib` or Node, so bundlers
 * (Vite/Rollup) don't choke on minislib's `mqtt` import.
 *
 * Data interfaces that happen to live in minislib-using modules
 * (`ActivityEntry`, `ClientPresence`) are re-exported **type-only** — erased at
 * build time, so no runtime import of those modules is emitted.
 */

// Topics (no minislib)
export {
  SERVER_INBOX,
  SERVER_OUTBOX,
  userInbox,
  userOutbox,
  clientInbox,
  clientOutbox,
  classifyTopic,
} from './topics';
export type { TopicScope, TopicDirection, ClassifiedTopic } from './topics';

// Identity (no minislib)
export { deviceClientSegment, clientKey, parseDeviceClientSegment } from './types';
export type { ClientType, DeviceKind, ClientId } from './types';

// Messages & UI events (no minislib)
export { parseEnvelope, stringifyEnvelope, isUiEvent, UI_EVENT_TYPES } from './messages';
export type { Envelope, UiEvent } from './messages';

// Log value types (no minislib)
export { EnumLogKind } from './log-types';
export type { ILogMessage } from './log-types';

// Type-only (erased at build — no runtime import of the minislib-using modules)
export type { ActivityEntry } from './services/ActivityService';
export type { ClientPresence } from './ClientRegistry';
