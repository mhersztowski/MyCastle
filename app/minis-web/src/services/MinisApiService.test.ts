import { describe, it, expect, beforeEach, vi } from 'vitest';
import { minisApi } from './MinisApiService';

vi.mock('@mhersztowski/web-client', () => ({
  getHttpUrl: () => 'http://test-host',
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('MinisApiService', () => {
  describe('login', () => {
    it('sends POST with userId and password', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'u1', name: 'Alice', isAdmin: false }));
      const user = await minisApi.login('u1', 'pass');
      expect(user.name).toBe('Alice');
      expect(mockFetch).toHaveBeenCalledWith('http://test-host/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'u1', password: 'pass' }),
      });
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'Invalid credentials' }, 401));
      await expect(minisApi.login('u1', 'wrong')).rejects.toThrow('Invalid credentials');
    });
  });

  describe('getUsers', () => {
    it('extracts items from response', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [{ id: 'u1', name: 'Alice' }] }));
      const users = await minisApi.getUsers();
      expect(users).toEqual([{ id: 'u1', name: 'Alice' }]);
    });
  });

  describe('createUser', () => {
    it('sends POST with user data', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'u2', name: 'Bob' }));
      const user = await minisApi.createUser({ name: 'Bob', password: 'pw', isAdmin: false, roles: [] });
      expect(user.name).toBe('Bob');
      expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    });
  });

  describe('updateUser', () => {
    it('sends PUT with encoded id', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'u1', name: 'Updated' }));
      await minisApi.updateUser('u1', { name: 'Updated' });
      expect(mockFetch.mock.calls[0][0]).toContain('/admin/users/u1');
      expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
    });
  });

  describe('deleteUser', () => {
    it('sends DELETE', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));
      await minisApi.deleteUser('u1');
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    });
  });

  describe('DeviceDefs CRUD', () => {
    it('getDeviceDefs extracts items', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [{ id: 'dd1', name: 'Light' }] }));
      const defs = await minisApi.getDeviceDefs();
      expect(defs[0].name).toBe('Light');
    });

    it('createDeviceDef sends POST', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'dd2', name: 'Motor' }));
      const def = await minisApi.createDeviceDef({ name: 'Motor', modules: [] } as any);
      expect(def.name).toBe('Motor');
    });

    it('deleteDeviceDef sends DELETE', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));
      await minisApi.deleteDeviceDef('dd1');
      expect(mockFetch.mock.calls[0][0]).toContain('/admin/devicedefs/dd1');
    });
  });

  describe('ModuleDefs CRUD', () => {
    it('getModuleDefs extracts items', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [{ id: 'md1', name: 'WiFi' }] }));
      const defs = await minisApi.getModuleDefs();
      expect(defs[0].name).toBe('WiFi');
    });
  });

  describe('ProjectDefs CRUD', () => {
    it('getProjectDefs extracts items', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [{ id: 'pd1', name: 'Blinky' }] }));
      const defs = await minisApi.getProjectDefs();
      expect(defs[0].name).toBe('Blinky');
    });
  });

  describe('User Devices', () => {
    it('getUserDevices extracts items', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [{ id: 'd1', deviceDefId: 'dd1', isAssembled: false, sn: 'SN001' }] }));
      const devices = await minisApi.getUserDevices('u1');
      expect(devices[0].id).toBe('d1');
      expect(mockFetch.mock.calls[0][0]).toContain('/users/u1/devices');
    });

    it('createUserDevice sends POST', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'd2', deviceDefId: 'dd1', isAssembled: false, sn: 'SN002' }));
      const device = await minisApi.createUserDevice('u1', { deviceDefId: 'dd1' } as any);
      expect(device.id).toBe('d2');
    });

    it('deleteUserDevice sends DELETE with both ids', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));
      await minisApi.deleteUserDevice('u1', 'd1');
      expect(mockFetch.mock.calls[0][0]).toContain('/users/u1/devices/d1');
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    });
  });

  describe('User Projects', () => {
    it('getUserProjects extracts items', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [{ id: 'p1', name: 'Proj' }] }));
      const projects = await minisApi.getUserProjects('u1');
      expect(projects[0].name).toBe('Proj');
    });

    it('createUserProject sends POST with name and projectDefId', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'p2', name: 'NewProj' }));
      await minisApi.createUserProject('u1', { name: 'NewProj', projectDefId: 'pd1' });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.projectDefId).toBe('pd1');
      expect(body.name).toBe('NewProj');
    });

    it('deleteUserProject sends DELETE', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));
      await minisApi.deleteUserProject('u1', 'p1');
      expect(mockFetch.mock.calls[0][0]).toContain('/users/u1/projects/p1');
    });
  });

  describe('uploadDefSources', () => {
    it('sends file with Content-Type: application/zip', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, filesExtracted: 3 }));
      const file = new File(['zipdata'], 'test.zip', { type: 'application/zip' });
      const result = await minisApi.uploadDefSources('projectdefs', 'pd1', file);
      expect(result.success).toBe(true);
      expect(mockFetch.mock.calls[0][0]).toContain('/admin/projectdefs/pd1/sources');
      expect(mockFetch.mock.calls[0][1].headers['Content-Type']).toBe('application/zip');
    });
  });

  describe('error handling', () => {
    it('throws with error message from body', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'Custom error' }, 500));
      await expect(minisApi.getUsers()).rejects.toThrow('Custom error');
    });

    it('falls back to HTTP status text when no error in body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('not json')),
      });
      await expect(minisApi.getUsers()).rejects.toThrow('Internal Server Error');
    });
  });
});
