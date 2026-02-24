import { getHttpUrl } from '@mhersztowski/web-client';
import type {
  UserModel,
  MinisDeviceDefModel,
  MinisDeviceModel,
  MinisModuleDefModel,
  MinisProjectDefModel,
  MinisProjectModel,
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
  async login(userId: string, password: string): Promise<UserPublic> {
    return this.request<UserPublic>('POST', '/auth/login', { userId, password });
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
  async getUserDevices(userId: string): Promise<MinisDeviceModel[]> {
    const data = await this.request<{ items: MinisDeviceModel[] }>('GET', `/users/${encodeURIComponent(userId)}/devices`);
    return data.items;
  }

  async createUserDevice(userId: string, device: Omit<MinisDeviceModel, 'type' | 'id'>): Promise<MinisDeviceModel> {
    return this.request<MinisDeviceModel>('POST', `/users/${encodeURIComponent(userId)}/devices`, device);
  }

  async updateUserDevice(userId: string, deviceId: string, device: Partial<MinisDeviceModel>): Promise<MinisDeviceModel> {
    return this.request<MinisDeviceModel>('PUT', `/users/${encodeURIComponent(userId)}/devices/${encodeURIComponent(deviceId)}`, device);
  }

  async deleteUserDevice(userId: string, deviceId: string): Promise<void> {
    await this.request('DELETE', `/users/${encodeURIComponent(userId)}/devices/${encodeURIComponent(deviceId)}`);
  }

  // User - Projects
  async getUserProjects(userId: string): Promise<MinisProjectModel[]> {
    const data = await this.request<{ items: MinisProjectModel[] }>('GET', `/users/${encodeURIComponent(userId)}/projects`);
    return data.items;
  }

  async createUserProject(userId: string, projectDefId: string): Promise<MinisProjectModel> {
    return this.request<MinisProjectModel>('POST', `/users/${encodeURIComponent(userId)}/projects`, { projectDefId });
  }

  async deleteUserProject(userId: string, projectName: string): Promise<void> {
    await this.request('DELETE', `/users/${encodeURIComponent(userId)}/projects/${encodeURIComponent(projectName)}`);
  }
}

export const minisApi = new MinisApiService();
