/**
 * Auto-detect backend URLs from window.location when VITE_* env vars are not set.
 * This allows the app to work from any URL (local IP, domain, etc.) without rebuilding.
 */

export function getHttpUrl(): string {
  if (import.meta.env.VITE_HTTP_URL) {
    return import.meta.env.VITE_HTTP_URL;
  }
  return `${window.location.protocol}//${window.location.host}`;
}

export function getMqttUrl(): string {
  if (import.meta.env.VITE_MQTT_URL) {
    return import.meta.env.VITE_MQTT_URL;
  }
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${window.location.host}/mqtt`;
}
