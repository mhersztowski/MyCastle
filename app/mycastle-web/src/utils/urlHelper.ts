import { configureUrls, getHttpUrl, getMqttUrl } from '@mhersztowski/web-client';

// Configure from Vite env vars if present (dev mode)
const viteHttpUrl = import.meta.env.VITE_HTTP_URL;
const viteMqttUrl = import.meta.env.VITE_MQTT_URL;
if (viteHttpUrl || viteMqttUrl) {
  configureUrls({ httpUrl: viteHttpUrl, mqttUrl: viteMqttUrl });
}

export { getHttpUrl, getMqttUrl };
