export interface D2CardConfig {
  id: string;
  deviceId: string;
  ownerUserId?: string;
  entityId: string;
  label?: string;
}

export interface D2SectionConfig {
  id: string;
  title: string;
  cards: D2CardConfig[];
}

export interface Dashboard2Config {
  sections: D2SectionConfig[];
}

const KEY_PREFIX = 'iot-dashboard2';

export function loadDashboard2Config(userName: string): Dashboard2Config {
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}-${userName}`);
    if (raw) return JSON.parse(raw) as Dashboard2Config;
  } catch {}
  return { sections: [] };
}

export function saveDashboard2Config(userName: string, config: Dashboard2Config): void {
  localStorage.setItem(`${KEY_PREFIX}-${userName}`, JSON.stringify(config));
}

export function makeId(): string {
  return Math.random().toString(36).slice(2, 9);
}
