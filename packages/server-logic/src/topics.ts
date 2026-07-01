/**
 * MQTT topic registry for the server-logic layer (see ServerLogic.md).
 *
 * Convention (no leading slash — a leading `/` creates an empty MQTT level):
 *   server:   `server/inbox`                                  `server/outbox`
 *   user:     `{user}/inbox`                                  `{user}/outbox`                    → manage clients
 *   client:   `{user}/{dev}-{ct}/{id}/inbox`                  `{user}/{dev}-{ct}/{id}/outbox`    → login/logout + register services/devices
 *   service:  `{user}/{dev}-{ct}/{id}/service/{sid}/inbox`    `.../service/{sid}/outbox`
 *   device:   `{user}/{dev}-{ct}/{id}/device/{did}/inbox`     `.../device/{did}/outbox`
 *
 * Per-client collections (MqttList): `.../service-list`, `.../device-list`.
 *
 * "inbox"  = messages addressed TO the entity (the server writes here).
 * "outbox" = messages sent BY the entity (the server reads here).
 */

import { type ClientId, deviceClientSegment, parseDeviceClientSegment } from './types';

export const SERVER_INBOX = 'server/inbox';
export const SERVER_OUTBOX = 'server/outbox';

export function userInbox(userName: string): string {
  return `${userName}/inbox`;
}
export function userOutbox(userName: string): string {
  return `${userName}/outbox`;
}

/** `{user}/{dev}-{ct}/{id}` — the base for a client and all its sub-entities. */
function clientBase(c: ClientId): string {
  return `${c.userName}/${deviceClientSegment(c)}/${c.id}`;
}

export function clientInbox(c: ClientId): string {
  return `${clientBase(c)}/inbox`;
}
export function clientOutbox(c: ClientId): string {
  return `${clientBase(c)}/outbox`;
}

/** MqttList base topics for the client's registered services / devices. */
export function clientServiceList(c: ClientId): string {
  return `${clientBase(c)}/service-list`;
}
export function clientDeviceList(c: ClientId): string {
  return `${clientBase(c)}/device-list`;
}

export function serviceInbox(c: ClientId, serviceId: string): string {
  return `${clientBase(c)}/service/${serviceId}/inbox`;
}
export function serviceOutbox(c: ClientId, serviceId: string): string {
  return `${clientBase(c)}/service/${serviceId}/outbox`;
}

export function deviceInbox(c: ClientId, deviceId: string): string {
  return `${clientBase(c)}/device/${deviceId}/inbox`;
}
export function deviceOutbox(c: ClientId, deviceId: string): string {
  return `${clientBase(c)}/device/${deviceId}/outbox`;
}

export type TopicScope = 'server' | 'user' | 'client' | 'service' | 'device' | 'unknown';
export type TopicDirection = 'inbox' | 'outbox';

export interface ClassifiedTopic {
  scope: TopicScope;
  direction?: TopicDirection;
  userName?: string;
  /** Present for `scope` of `client`, `service` or `device`. */
  client?: ClientId;
  /** Present only for `scope === 'service'`. */
  serviceId?: string;
  /** Present only for `scope === 'device'`. */
  deviceId?: string;
}

/** Reserved top-level segments that are NOT user names. */
const RESERVED = new Set(['server']);

/**
 * Classify an arbitrary MQTT topic into the server-logic scheme. Topics that
 * don't fit (e.g. `minis/...` IoT topics) return `{ scope: 'unknown' }`.
 */
export function classifyTopic(topic: string): ClassifiedTopic {
  const parts = topic.split('/').filter(Boolean);

  if (parts[0] === 'server' && parts.length === 2 && isDir(parts[1])) {
    return { scope: 'server', direction: parts[1] as TopicDirection };
  }
  if (parts.length < 2 || RESERVED.has(parts[0])) return { scope: 'unknown' };

  const userName = parts[0];
  const last = parts[parts.length - 1];
  if (!isDir(last)) return { scope: 'unknown' };
  const direction = last as TopicDirection;

  // `{user}/inbox|outbox`
  if (parts.length === 2) return { scope: 'user', direction, userName };

  // `{user}/{dev}-{ct}/{id}/inbox|outbox`
  if (parts.length === 4) {
    const dc = parseDeviceClientSegment(parts[1]);
    if (!dc) return { scope: 'unknown' };
    return {
      scope: 'client',
      direction,
      userName,
      client: { userName, device: dc.device, clientType: dc.clientType, id: parts[2] },
    };
  }

  // `{user}/{dev}-{ct}/{id}/service|device/{sid}/inbox|outbox`
  if (parts.length === 6 && (parts[3] === 'service' || parts[3] === 'device')) {
    const dc = parseDeviceClientSegment(parts[1]);
    if (!dc) return { scope: 'unknown' };
    const client: ClientId = { userName, device: dc.device, clientType: dc.clientType, id: parts[2] };
    if (parts[3] === 'service') {
      return { scope: 'service', direction, userName, client, serviceId: parts[4] };
    }
    return { scope: 'device', direction, userName, client, deviceId: parts[4] };
  }

  return { scope: 'unknown' };
}

function isDir(s: string): boolean {
  return s === 'inbox' || s === 'outbox';
}
