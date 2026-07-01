// ── Server brain ──────────────────────────────────────────────────────────────
export { IotServer } from './IotServer';
export type { IotServerOptions } from './IotServer';

// ── Identity & topics ─────────────────────────────────────────────────────────
export type { ClientType, DeviceKind, ClientId } from './types';
export { deviceClientSegment, clientKey, parseDeviceClientSegment } from './types';
export {
  SERVER_INBOX,
  SERVER_OUTBOX,
  userInbox,
  userOutbox,
  clientInbox,
  clientOutbox,
  clientServiceList,
  clientDeviceList,
  serviceInbox,
  serviceOutbox,
  deviceInbox,
  deviceOutbox,
  classifyTopic,
} from './topics';
export type { TopicScope, TopicDirection, ClassifiedTopic } from './topics';

// ── Transport ─────────────────────────────────────────────────────────────────
export type { IMqttTransport, MqttMessageHandler } from './transport';
export { InMemoryTransport } from './transport';

// ── Messages & UI events ──────────────────────────────────────────────────────
export type {
  Envelope, UiEvent, RegisteredEntity, ClientMessageType,
  ClientLoginPayload, ClientEntityPayload,
} from './messages';
export {
  parseEnvelope, stringifyEnvelope, isUiEvent, UI_EVENT_TYPES,
  isClientMessage, CLIENT_MESSAGE_TYPES,
} from './messages';

// ── Collections ───────────────────────────────────────────────────────────────
export { MqttList } from './MqttList';
export type { Identifiable, MqttListBinding } from './MqttList';

// ── Client registry ───────────────────────────────────────────────────────────
export { ClientRegistry } from './ClientRegistry';
export type { ClientPresence } from './ClientRegistry';

// ── Device & service model (base classes + built-in virtual entities) ─────────
export * from './devices';

// ── Services ──────────────────────────────────────────────────────────────────
export { Service } from './services/Service';
export { LogService, EnumLogKind } from './services/LogService';
export type { ILogMessage } from './services/LogService';
export { ConsoleService } from './services/ConsoleService';
export { CronService } from './services/CronService';
export type { ICronScheduler, ScheduledHandle, CronTaskFn } from './services/CronService';
export { ActivityService } from './services/ActivityService';
export type { ActivityEntry } from './services/ActivityService';
