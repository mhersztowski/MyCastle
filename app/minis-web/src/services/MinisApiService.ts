import { getHttpUrl } from '@mhersztowski/web-client';
import type {
  UserModel,
  MinisDeviceDefModel,
  MinisDeviceModel,
  MinisModuleDefModel,
  MinisProjectDefModel,
  MinisProjectModel,
  IotDeviceConfig,
  TelemetryRecord,
  DeviceCommand,
  AlertRule,
  Alert,
  DeviceShare,
} from '@mhersztowski/core';

export type UserPublic = Omit<UserModel, 'password'>;

class MinisApiService {
  private getBaseUrl(): string {
    return getHttpUrl();
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.getBaseUrl()}/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // Auth
  async login(name: string, password: string): Promise<UserPublic> {
    return this.request<UserPublic>('POST', '/auth/login', { name, password });
  }

  // Admin - Users
  async getUsers(): Promise<UserPublic[]> {
    const data = await this.request<{ items: UserPublic[] }>('GET', '/admin/users');
    return data.items;
  }

  async createUser(user: { name: string; password: string; isAdmin: boolean; roles: string[] }): Promise<UserPublic> {
    return this.request<UserPublic>('POST', '/admin/users', user);
  }

  async updateUser(id: string, user: Partial<UserModel>): Promise<UserPublic> {
    return this.request<UserPublic>('PUT', `/admin/users/${encodeURIComponent(id)}`, user);
  }

  async deleteUser(id: string): Promise<void> {
    await this.request('DELETE', `/admin/users/${encodeURIComponent(id)}`);
  }

  // Admin - DeviceDefs
  async getDeviceDefs(): Promise<MinisDeviceDefModel[]> {
    const data = await this.request<{ items: MinisDeviceDefModel[] }>('GET', '/admin/devicedefs');
    return data.items;
  }

  async createDeviceDef(def: Omit<MinisDeviceDefModel, 'type' | 'id'>): Promise<MinisDeviceDefModel> {
    return this.request<MinisDeviceDefModel>('POST', '/admin/devicedefs', def);
  }

  async updateDeviceDef(id: string, def: Partial<MinisDeviceDefModel>): Promise<MinisDeviceDefModel> {
    return this.request<MinisDeviceDefModel>('PUT', `/admin/devicedefs/${encodeURIComponent(id)}`, def);
  }

  async deleteDeviceDef(id: string): Promise<void> {
    await this.request('DELETE', `/admin/devicedefs/${encodeURIComponent(id)}`);
  }

  // Admin - ModuleDefs
  async getModuleDefs(): Promise<MinisModuleDefModel[]> {
    const data = await this.request<{ items: MinisModuleDefModel[] }>('GET', '/admin/moduledefs');
    return data.items;
  }

  async createModuleDef(def: Omit<MinisModuleDefModel, 'type' | 'id'>): Promise<MinisModuleDefModel> {
    return this.request<MinisModuleDefModel>('POST', '/admin/moduledefs', def);
  }

  async updateModuleDef(id: string, def: Partial<MinisModuleDefModel>): Promise<MinisModuleDefModel> {
    return this.request<MinisModuleDefModel>('PUT', `/admin/moduledefs/${encodeURIComponent(id)}`, def);
  }

  async deleteModuleDef(id: string): Promise<void> {
    await this.request('DELETE', `/admin/moduledefs/${encodeURIComponent(id)}`);
  }

  // Admin - ProjectDefs
  async getProjectDefs(): Promise<MinisProjectDefModel[]> {
    const data = await this.request<{ items: MinisProjectDefModel[] }>('GET', '/admin/projectdefs');
    return data.items;
  }

  async createProjectDef(def: Omit<MinisProjectDefModel, 'type' | 'id'>): Promise<MinisProjectDefModel> {
    return this.request<MinisProjectDefModel>('POST', '/admin/projectdefs', def);
  }

  async updateProjectDef(id: string, def: Partial<MinisProjectDefModel>): Promise<MinisProjectDefModel> {
    return this.request<MinisProjectDefModel>('PUT', `/admin/projectdefs/${encodeURIComponent(id)}`, def);
  }

  async deleteProjectDef(id: string): Promise<void> {
    await this.request('DELETE', `/admin/projectdefs/${encodeURIComponent(id)}`);
  }

  async uploadProjectDefSources(id: string, file: File): Promise<{ success: boolean; filesExtracted: number }> {
    return this.uploadDefSources('projectdefs', id, file);
  }

  async uploadDefSources(resource: string, id: string, file: File): Promise<{ success: boolean; filesExtracted: number }> {
    const res = await fetch(`${this.getBaseUrl()}/api/admin/${resource}/${encodeURIComponent(id)}/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip' },
      body: file,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // User - Devices
  async getUserDevices(userName: string): Promise<MinisDeviceModel[]> {
    const data = await this.request<{ items: MinisDeviceModel[] }>('GET', `/users/${encodeURIComponent(userName)}/devices`);
    return data.items;
  }

  async createUserDevice(userName: string, device: Omit<MinisDeviceModel, 'type' | 'id'>): Promise<MinisDeviceModel> {
    return this.request<MinisDeviceModel>('POST', `/users/${encodeURIComponent(userName)}/devices`, device);
  }

  async updateUserDevice(userName: string, deviceName: string, device: Partial<MinisDeviceModel>): Promise<MinisDeviceModel> {
    return this.request<MinisDeviceModel>('PUT', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}`, device);
  }

  async deleteUserDevice(userName: string, deviceName: string): Promise<void> {
    await this.request('DELETE', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}`);
  }

  // User - Projects
  async getUserProjects(userName: string): Promise<MinisProjectModel[]> {
    const data = await this.request<{ items: MinisProjectModel[] }>('GET', `/users/${encodeURIComponent(userName)}/projects`);
    return data.items;
  }

  async createUserProject(userName: string, data: { name: string; projectDefId: string }): Promise<MinisProjectModel> {
    return this.request<MinisProjectModel>('POST', `/users/${encodeURIComponent(userName)}/projects`, data);
  }

  async deleteUserProject(userName: string, projectName: string): Promise<void> {
    await this.request('DELETE', `/users/${encodeURIComponent(userName)}/projects/${encodeURIComponent(projectName)}`);
  }
  // IoT - Config
  async getIotConfig(userName: string, deviceName: string): Promise<IotDeviceConfig | null> {
    try {
      return await this.request<IotDeviceConfig>('GET', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/iot-config`);
    } catch {
      return null;
    }
  }

  async saveIotConfig(userName: string, deviceName: string, config: Partial<IotDeviceConfig>): Promise<IotDeviceConfig> {
    return this.request<IotDeviceConfig>('PUT', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/iot-config`, config);
  }

  // IoT - Telemetry
  async getTelemetryLatest(userName: string, deviceName: string): Promise<TelemetryRecord | { message: string }> {
    return this.request('GET', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/telemetry/latest`);
  }

  async getTelemetryHistory(userName: string, deviceName: string, from: number, to: number, limit = 1000): Promise<TelemetryRecord[]> {
    const data = await this.request<{ items: TelemetryRecord[] }>('GET', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/telemetry?from=${from}&to=${to}&limit=${limit}`);
    return data.items;
  }

  // IoT - Commands
  async sendCommand(userName: string, deviceName: string, name: string, payload: Record<string, unknown> = {}): Promise<DeviceCommand> {
    return this.request<DeviceCommand>('POST', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/commands`, { name, payload });
  }

  async getCommands(userName: string, deviceName: string, limit = 50): Promise<DeviceCommand[]> {
    const data = await this.request<{ items: DeviceCommand[] }>('GET', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/commands?limit=${limit}`);
    return data.items;
  }

  // IoT - Alert Rules
  async getAlertRules(userName: string): Promise<AlertRule[]> {
    const data = await this.request<{ items: AlertRule[] }>('GET', `/users/${encodeURIComponent(userName)}/alert-rules`);
    return data.items;
  }

  async createAlertRule(userName: string, rule: Omit<AlertRule, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<AlertRule> {
    return this.request<AlertRule>('POST', `/users/${encodeURIComponent(userName)}/alert-rules`, rule);
  }

  async updateAlertRule(userName: string, ruleId: string, updates: Partial<AlertRule>): Promise<AlertRule> {
    return this.request<AlertRule>('PUT', `/users/${encodeURIComponent(userName)}/alert-rules/${encodeURIComponent(ruleId)}`, updates);
  }

  async deleteAlertRule(userName: string, ruleId: string): Promise<void> {
    await this.request('DELETE', `/users/${encodeURIComponent(userName)}/alert-rules/${encodeURIComponent(ruleId)}`);
  }

  // IoT - Alerts
  async getAlerts(userName: string, limit = 100): Promise<Alert[]> {
    const data = await this.request<{ items: Alert[] }>('GET', `/users/${encodeURIComponent(userName)}/alerts?limit=${limit}`);
    return data.items;
  }

  async acknowledgeAlert(userName: string, alertId: string): Promise<Alert> {
    return this.request<Alert>('PATCH', `/users/${encodeURIComponent(userName)}/alerts/${encodeURIComponent(alertId)}`, { status: 'ACKNOWLEDGED' });
  }

  async resolveAlert(userName: string, alertId: string): Promise<Alert> {
    return this.request<Alert>('PATCH', `/users/${encodeURIComponent(userName)}/alerts/${encodeURIComponent(alertId)}`, { status: 'RESOLVED' });
  }

  // IoT - Device Status
  async getIotDevices(userName: string): Promise<Array<{ deviceId: string; status: string; lastSeenAt: number }>> {
    const data = await this.request<{ items: Array<{ deviceId: string; status: string; lastSeenAt: number }> }>('GET', `/users/${encodeURIComponent(userName)}/iot/devices`);
    return data.items;
  }

  // IoT - Device Sharing
  async getDeviceShares(userName: string, deviceName: string): Promise<DeviceShare[]> {
    const data = await this.request<{ items: DeviceShare[] }>('GET', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/shares`);
    return data.items;
  }

  async createDeviceShare(userName: string, deviceName: string, targetUserId: string): Promise<DeviceShare> {
    return this.request<DeviceShare>('POST', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/shares`, { targetUserId });
  }

  async deleteDeviceShare(userName: string, deviceName: string, shareId: string): Promise<void> {
    await this.request('DELETE', `/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/shares/${encodeURIComponent(shareId)}`);
  }

  async getSharedDevices(userName: string): Promise<DeviceShare[]> {
    const data = await this.request<{ items: DeviceShare[] }>('GET', `/users/${encodeURIComponent(userName)}/shared-devices`);
    return data.items;
  }

  async getMyShares(userName: string): Promise<DeviceShare[]> {
    const data = await this.request<{ items: DeviceShare[] }>('GET', `/users/${encodeURIComponent(userName)}/my-shares`);
    return data.items;
  }
}

export const minisApi = new MinisApiService();
