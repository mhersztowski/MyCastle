/**
 * Core identity & enumerations for the server-logic layer.
 *
 * A client is identified by (UserName, ClientType, ClientMajorType, Id) — see ServerLogic.md.
 */

/** Rendering kind of a client connection. */
export type ClientMajorType = 'web' | 'native';

/** Kind of client behind a connection. */
export type ClientType =
  | 'server'
  | 'desktop'
  | 'mobile'
  | 'tv'
  | 'watch'
  | 'car'
  | 'vr'
  | 'iot'
  | 'cli'
  | 'game';

/** Fully-qualified client identity. */
export interface ClientId {
  userName: string;
  device: ClientType;
  clientType: ClientMajorType;
  id: string;
}

/** `{device}-{clientType}` — the combined segment used in client MQTT topics. */
export function deviceClientSegment(c: Pick<ClientId, 'device' | 'clientType'>): string {
  return `${c.device}-${c.clientType}`;
}

/** Stable string key for a client, e.g. `alice/desktop-native/abc123`. */
export function clientKey(c: ClientId): string {
  return `${c.userName}/${deviceClientSegment(c)}/${c.id}`;
}

/** Parse a `{device}-{clientType}` segment back into its parts (null if malformed). */
export function parseDeviceClientSegment(
  seg: string,
): Pick<ClientId, 'device' | 'clientType'> | null {
  const dash = seg.lastIndexOf('-');
  if (dash <= 0) return null;
  const device = seg.slice(0, dash) as ClientType;
  const clientType = seg.slice(dash + 1) as ClientMajorType;
  if (clientType !== 'web' && clientType !== 'native') return null;
  return { device, clientType };
}
