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

// Browser-side entity implementations.
export { BrowserDisplay, type DisplayContent } from './entities/BrowserDisplay';
export { BrowserNotification } from './entities/BrowserNotification';

// Re-export the shared model so consumers need a single import.
export * from '@mhersztowski/server-logic/web';
