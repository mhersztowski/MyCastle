/**
 * Core identity & enumerations for the server-logic layer.
 *
 * A client is identified by (UserName, Device, ClientType, Id) — see ServerLogic.md.
 */

/** Rendering kind of a client connection. */
export type ClientType = 'web' | 'native';

/** Physical/logical device class behind a connection. */
export type DeviceKind =
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
  device: DeviceKind;
  clientType: ClientType;
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
  const device = seg.slice(0, dash) as DeviceKind;
  const clientType = seg.slice(dash + 1) as ClientType;
  if (clientType !== 'web' && clientType !== 'native') return null;
  return { device, clientType };
}
