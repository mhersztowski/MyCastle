/**
 * `@mhersztowski/web-server-logic` — browser client for the server-logic control
 * plane (see docs/ServerLogic.md). Provides a client-node engine that registers
 * devices/services and answers their commands over an injected MQTT transport.
 */

export type { ClientTransport } from './transport';
export { InMemoryClientTransport } from './transport';
export { Emitter } from './emitter';

export {
  WebServerLogicClient,
  type WebServerLogicClientOptions,
  type WebClientEvents,
  type CommandEvent,
} from './WebServerLogicClient';

// Browser-side entity implementations (klasowe — dziedzicz po Device/Service).
export { BrowserDisplay, type DisplayContent } from './entities/BrowserDisplay';
export { BrowserNotification } from './entities/BrowserNotification';

// Re-export wspólnego modelu — bazy klasowe (ClientEntity/Device/Service),
// katalog i typy — żeby konsument budował client/service/device z jednego importu.
export * from '@mhersztowski/server-logic/web';
