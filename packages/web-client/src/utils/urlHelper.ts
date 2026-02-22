/**
 * Configurable URL helpers for connecting to MyCastle backend.
 * Defaults to auto-detecting from window.location (works in production behind nginx proxy).
 * Apps can call configureUrls() to override (e.g. from Vite env vars in dev mode).
 */

let _httpUrl: string | undefined;
let _mqttUrl: string | undefined;

export function configureUrls(options: { httpUrl?: string; mqttUrl?: string }): void {
  _httpUrl = options.httpUrl || undefined;
  _mqttUrl = options.mqttUrl || undefined;
}

export function getHttpUrl(): string {
  if (_httpUrl) return _httpUrl;
  return `${window.location.protocol}//${window.location.host}`;
}

export function getMqttUrl(): string {
  if (_mqttUrl) return _mqttUrl;
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${window.location.host}/mqtt`;
}
