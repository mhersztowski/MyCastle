import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MinisHttpServer } from './MinisHttpServer.js';
import { FileSystem } from '@mhersztowski/core-backend';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

let tmpDir: string;
let fileSystem: FileSystem;
let server: MinisHttpServer;
let port: number;
let baseUrl: string;

async function seedData() {
  const adminDir = path.join(tmpDir, 'Minis', 'Admin');
  await fs.mkdir(adminDir, { recursive: true });

  const users = {
    type: 'users',
    items: [
      { type: 'user', id: 'admin1', name: 'AdminUser', password: 'admin123', isAdmin: true, roles: ['admin'] },
      { type: 'user', id: 'user1', name: 'NormalUser', password: 'user123', isAdmin: false, roles: ['viewer'] },
    ],
  };
  await fs.writeFile(path.join(adminDir, 'Users.json'), JSON.stringify(users, null, 2));

  const deviceDefs = {
    type: 'device_defs',
    deviceDefs: [
      { type: 'device_def', id: 'dd1', name: 'SmartLight', modules: ['md1'] },
    ],
  };
  await fs.writeFile(path.join(adminDir, 'DeviceDefList.json'), JSON.stringify(deviceDefs, null, 2));

  const moduleDefs = {
    type: 'module_defs',
    moduleDefs: [
      { type: 'module_def', id: 'md1', name: 'WiFiModule', soc: 'ESP32', isProgrammable: true },
    ],
  };
  await fs.writeFile(path.join(adminDir, 'ModuleDefList.json'), JSON.stringify(moduleDefs, null, 2));

  const projectDefs = {
    type: 'project_defs',
    projectDefs: [
      { type: 'project_def', id: 'pd1', name: 'Blinky', version: '1.0', deviceDefId: 'dd1', moduleDefId: 'md1', softwarePlatform: 'Arduino', blocklyDef: '' },
    ],
  };
  await fs.writeFile(path.join(adminDir, 'ProjectDefList.json'), JSON.stringify(projectDefs, null, 2));

  // Create user directory
  const userDir = path.join(tmpDir, 'Minis', 'Users', 'NormalUser', 'Projects');
  await fs.mkdir(userDir, { recursive: true });
  // Create Device.json for user
  const devices = { type: 'devices', devices: [] };
  await fs.writeFile(path.join(tmpDir, 'Minis', 'Users', 'NormalUser', 'Device.json'), JSON.stringify(devices));
  // Create Project.json for user
  const projects = { type: 'projects', projects: [] };
  await fs.writeFile(path.join(tmpDir, 'Minis', 'Users', 'NormalUser', 'Project.json'), JSON.stringify(projects));
}

async function request(method: string, apiPath: string, body?: unknown) {
  const res = await fetch(`${baseUrl}/api${apiPath}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'minis-http-test-'));
  fileSystem = new FileSystem(tmpDir);
  await fileSystem.initialize();
  await seedData();

  server = new MinisHttpServer(0, fileSystem);
  await server.start();
  const address = server.getHttpServer().address();
  port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  await server.stop();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('MinisHttpServer', () => {
  describe('Auth - POST /api/auth/login', () => {
    it('returns user without password on valid login', async () => {
      const { status, data } = await request('POST', '/auth/login', { name: 'AdminUser', password: 'admin123' });
      expect(status).toBe(200);
      expect(data.name).toBe('AdminUser');
      expect(data.isAdmin).toBe(true);
      expect(data.password).toBeUndefined();
    });

    it('returns 401 on invalid password', async () => {
      const { status, data } = await request('POST', '/auth/login', { name: 'AdminUser', password: 'wrong' });
      expect(status).toBe(401);
      expect(data.error).toBeDefined();
    });

    it('returns 400 on missing fields', async () => {
      const { status } = await request('POST', '/auth/login', { name: 'AdminUser' });
      expect(status).toBe(400);
    });
  });

  describe('Admin Users CRUD', () => {
    it('GET /api/admin/users lists users without passwords', async () => {
      const { status, data } = await request('GET', '/admin/users');
      expect(status).toBe(200);
      expect(data.items).toBeDefined();
      expect(data.items.length).toBeGreaterThanOrEqual(2);
      for (const u of data.items) {
        expect(u.password).toBeUndefined();
      }
    });

    it('POST /api/admin/users creates user', async () => {
      const { status, data } = await request('POST', '/admin/users', {
        name: 'NewUser', password: 'pw123', isAdmin: false, roles: [],
      });
      expect(status).toBe(201);
      expect(data.name).toBe('NewUser');
      expect(data.id).toBeDefined();
      expect(data.password).toBeUndefined();
    });

    it('PUT /api/admin/users/:id updates user', async () => {
      const { data: list } = await request('GET', '/admin/users');
      const user = list.items.find((u: any) => u.name === 'NewUser');
      const { status, data } = await request('PUT', `/admin/users/${encodeURIComponent(user.id)}`, {
        name: 'UpdatedUser',
      });
      expect(status).toBe(200);
      expect(data.name).toBe('UpdatedUser');
    });

    it('PUT /api/admin/users/:unknownId returns 404', async () => {
      const { status } = await request('PUT', '/admin/users/nonexistent', { name: 'X' });
      expect(status).toBe(404);
    });

    it('DELETE /api/admin/users/:id removes user', async () => {
      const { data: list } = await request('GET', '/admin/users');
      const user = list.items.find((u: any) => u.name === 'UpdatedUser');
      const { status } = await request('DELETE', `/admin/users/${encodeURIComponent(user.id)}`);
      expect(status).toBe(200);

      const { data: afterList } = await request('GET', '/admin/users');
      expect(afterList.items.find((u: any) => u.name === 'UpdatedUser')).toBeUndefined();
    });
  });

  describe('Admin DeviceDefs CRUD', () => {
    it('GET /api/admin/devicedefs lists defs', async () => {
      const { status, data } = await request('GET', '/admin/devicedefs');
      expect(status).toBe(200);
      expect(data.items).toBeDefined();
    });

    it('POST + PUT + DELETE cycle', async () => {
      // Create
      const { status: createStatus, data: created } = await request('POST', '/admin/devicedefs', {
        name: 'TestDef', modules: [],
      });
      expect(createStatus).toBe(201);
      expect(created.id).toBeDefined();

      // Update
      const { status: updateStatus, data: updated } = await request('PUT', `/admin/devicedefs/${encodeURIComponent(created.id)}`, {
        name: 'RenamedDef',
      });
      expect(updateStatus).toBe(200);
      expect(updated.name).toBe('RenamedDef');

      // Delete
      const { status: deleteStatus } = await request('DELETE', `/admin/devicedefs/${encodeURIComponent(created.id)}`);
      expect(deleteStatus).toBe(200);
    });
  });

  describe('Admin ModuleDefs CRUD', () => {
    it('GET /api/admin/moduledefs lists defs', async () => {
      const { status, data } = await request('GET', '/admin/moduledefs');
      expect(status).toBe(200);
      expect(data.items).toBeDefined();
    });

    it('POST creates module def', async () => {
      const { status, data } = await request('POST', '/admin/moduledefs', {
        name: 'BLE Module', soc: 'nRF52', isProgrammable: true,
      });
      expect(status).toBe(201);
      expect(data.name).toBe('BLE Module');
    });
  });

  describe('Admin ProjectDefs CRUD', () => {
    it('GET /api/admin/projectdefs lists defs', async () => {
      const { status, data } = await request('GET', '/admin/projectdefs');
      expect(status).toBe(200);
      expect(data.items).toBeDefined();
    });

    it('POST creates project def', async () => {
      const { status, data } = await request('POST', '/admin/projectdefs', {
        name: 'NewProject', version: '2.0', deviceDefId: 'dd1', moduleDefId: 'md1',
        softwarePlatform: 'Arduino', blocklyDef: '',
      });
      expect(status).toBe(201);
      expect(data.name).toBe('NewProject');
    });
  });

  describe('User Devices', () => {
    it('GET /api/users/:userName/devices returns devices list', async () => {
      const { status, data } = await request('GET', '/users/NormalUser/devices');
      expect(status).toBe(200);
      expect(data.items).toBeDefined();
    });

    it('POST /api/users/:userName/devices creates device', async () => {
      const { status, data } = await request('POST', '/users/NormalUser/devices', {
        name: 'MyDevice', deviceDefId: 'dd1',
      });
      expect(status).toBe(201);
      expect(data.name).toBe('MyDevice');
    });

    it('returns 404 for unknown userName', async () => {
      const { status } = await request('GET', '/users/nonexistent/devices');
      expect(status).toBe(404);
    });
  });

  describe('User Projects', () => {
    it('GET /api/users/:userName/projects returns project list', async () => {
      const { status, data } = await request('GET', '/users/NormalUser/projects');
      expect(status).toBe(200);
      expect(data.items).toBeDefined();
    });

    it('POST /api/users/:userName/projects creates project', async () => {
      const { status, data } = await request('POST', '/users/NormalUser/projects', {
        name: 'MyBlinky', projectDefId: 'pd1',
      });
      expect(status).toBe(201);
      expect(data.name).toBe('MyBlinky');
      expect(data.projectDefId).toBe('pd1');
      expect(data.id).toBeDefined();
    });

    it('DELETE /api/users/:userName/projects/:name deletes project', async () => {
      // Create then delete
      const { data: created } = await request('POST', '/users/NormalUser/projects', {
        name: 'ToDelete', projectDefId: 'pd1',
      });
      const { status } = await request('DELETE', `/users/NormalUser/projects/${encodeURIComponent(created.name)}`);
      expect(status).toBe(200);
    });

    it('returns 404 for unknown userName', async () => {
      const { status } = await request('GET', '/users/nonexistent/projects');
      expect(status).toBe(404);
    });
  });

  describe('Unknown API endpoint', () => {
    it('returns 404', async () => {
      const { status } = await request('GET', '/unknown');
      expect(status).toBe(404);
    });
  });
});
