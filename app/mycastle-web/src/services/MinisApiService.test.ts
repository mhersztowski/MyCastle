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
    it('sends POST with name and password', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ token: 'jwt-123', user: { id: 'u1', name: 'Alice', isAdmin: false } }));
      const result = await minisApi.login('Alice', 'pass');
      expect(result.user.name).toBe('Alice');
      expect(result.token).toBe('jwt-123');
      expect(mockFetch).toHaveBeenCalledWith('http://test-host/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice', password: 'pass' }),
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

  describe('IoT Config with entities', () => {
    it('saveIotConfig sends entities in body', async () => {
      const config = {
        topicPrefix: 'minis/u1/dev1',
        heartbeatIntervalSec: 60,
        capabilities: [{ type: 'sensor' as const, metricKey: 'temp', unit: '°C', label: 'Temperature' }],
        entities: [
          { id: 'temp', type: 'sensor' as const, name: 'Temperature', unit: '°C', deviceClass: 'temperature' },
          { id: 'relay', type: 'switch' as const, name: 'Relay' },
        ],
      };
      mockFetch.mockResolvedValueOnce(jsonResponse({ ...config, deviceId: 'dev1', userId: 'u1', createdAt: 1, updatedAt: 2 }));
      const result = await minisApi.saveIotConfig('u1', 'dev1', config);
      expect(result.entities).toHaveLength(2);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.entities).toHaveLength(2);
      expect(body.entities[0].type).toBe('sensor');
      expect(body.entities[1].type).toBe('switch');
      expect(body.capabilities).toHaveLength(1);
    });

    it('getIotConfig returns null on error', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'Not found' }, 404));
      const result = await minisApi.getIotConfig('u1', 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('Device Sharing', () => {
    it('getDeviceShares extracts items', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [{ id: 's1', ownerUserId: 'u1', deviceId: 'd1', targetUserId: 'u2', createdAt: 1000 }] }));
      const shares = await minisApi.getDeviceShares('u1', 'd1');
      expect(shares).toHaveLength(1);
      expect(shares[0].targetUserId).toBe('u2');
      expect(mockFetch.mock.calls[0][0]).toContain('/users/u1/devices/d1/shares');
      expect(mockFetch.mock.calls[0][1].method).toBe('GET');
    });

    it('createDeviceShare sends POST with targetUserId', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 's2', ownerUserId: 'u1', deviceId: 'd1', targetUserId: 'u3', createdAt: 2000 }));
      const share = await minisApi.createDeviceShare('u1', 'd1', 'u3');
      expect(share.targetUserId).toBe('u3');
      expect(mockFetch.mock.calls[0][1].method).toBe('POST');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.targetUserId).toBe('u3');
    });

    it('deleteDeviceShare sends DELETE with all ids', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));
      await minisApi.deleteDeviceShare('u1', 'd1', 's1');
      expect(mockFetch.mock.calls[0][0]).toContain('/users/u1/devices/d1/shares/s1');
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    });

    it('getSharedDevices extracts items', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [{ id: 's3', ownerUserId: 'u2', deviceId: 'd2', targetUserId: 'u1', createdAt: 3000 }] }));
      const shares = await minisApi.getSharedDevices('u1');
      expect(shares).toHaveLength(1);
      expect(shares[0].ownerUserId).toBe('u2');
      expect(mockFetch.mock.calls[0][0]).toContain('/users/u1/shared-devices');
    });

    it('getMyShares extracts items', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [{ id: 's4', ownerUserId: 'u1', deviceId: 'd1', targetUserId: 'u3', createdAt: 4000 }] }));
      const shares = await minisApi.getMyShares('u1');
      expect(shares).toHaveLength(1);
      expect(shares[0].targetUserId).toBe('u3');
      expect(mockFetch.mock.calls[0][0]).toContain('/users/u1/my-shares');
      expect(mockFetch.mock.calls[0][1].method).toBe('GET');
    });
  });

  describe('Arduino API', () => {
    it('getArduinoBoards extracts items', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [{ fqbn: 'esp32:esp32:esp32', name: 'ESP32' }] }));
      const boards = await minisApi.getArduinoBoards();
      expect(boards).toHaveLength(1);
      expect(boards[0].fqbn).toBe('esp32:esp32:esp32');
      expect(mockFetch.mock.calls[0][0]).toContain('/arduino/boards');
    });

    it('getArduinoPorts extracts items', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [{ address: '/dev/ttyUSB0', protocol: 'serial' }] }));
      const ports = await minisApi.getArduinoPorts();
      expect(ports).toHaveLength(1);
      expect(ports[0].address).toBe('/dev/ttyUSB0');
    });

    it('compileProject sends POST with sketchName and fqbn', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, output: 'OK', exitCode: 0, outputFiles: ['sketch.bin'] }));
      const result = await minisApi.compileProject('alice', 'proj1', 'blink', 'esp32:esp32:esp32');
      expect(result.success).toBe(true);
      expect(result.outputFiles).toContain('sketch.bin');
      expect(mockFetch.mock.calls[0][0]).toContain('/users/alice/projects/proj1/compile');
      expect(mockFetch.mock.calls[0][1].method).toBe('POST');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.sketchName).toBe('blink');
      expect(body.fqbn).toBe('esp32:esp32:esp32');
    });

    it('uploadFirmware sends POST with sketchName, fqbn, port', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, output: 'Done', exitCode: 0 }));
      const result = await minisApi.uploadFirmware('alice', 'proj1', 'blink', 'esp32:esp32:esp32', '/dev/ttyUSB0');
      expect(result.success).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.port).toBe('/dev/ttyUSB0');
    });

    it('getProjectOutput extracts items', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [{ name: 'sketch.bin', size: 1024 }] }));
      const files = await minisApi.getProjectOutput('alice', 'proj1');
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe('sketch.bin');
      expect(mockFetch.mock.calls[0][0]).toContain('/users/alice/projects/proj1/output');
    });

    it('fetchOutputBinary returns binary string', async () => {
      const fakeData = new Uint8Array([0x00, 0x48, 0x65, 0x6c, 0x6f]);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(fakeData.buffer),
      });
      const binary = await minisApi.fetchOutputBinary('alice', 'proj1', 'sketch.bin');
      expect(binary.length).toBe(5);
      expect(binary.charCodeAt(1)).toBe(0x48); // 'H'
      expect(mockFetch.mock.calls[0][0]).toContain('/users/alice/projects/proj1/output/sketch.bin');
    });

    it('fetchOutputBinary throws on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      await expect(minisApi.fetchOutputBinary('alice', 'proj1', 'missing.bin')).rejects.toThrow('HTTP 404');
    });
  });

  describe('Sketch files', () => {
    it('listSketches extracts items', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: ['blink', 'fade'] }));
      const sketches = await minisApi.listSketches('alice', 'proj1');
      expect(sketches).toEqual(['blink', 'fade']);
      expect(mockFetch.mock.calls[0][0]).toContain('/users/alice/projects/proj1/sketches');
    });

    it('readSketchFile returns content', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ content: 'void setup() {}' }));
      const content = await minisApi.readSketchFile('alice', 'proj1', 'blink', 'blink.ino');
      expect(content).toBe('void setup() {}');
      expect(mockFetch.mock.calls[0][0]).toContain('/sketches/blink/blink.ino');
    });

    it('writeSketchFile sends PUT with content', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));
      await minisApi.writeSketchFile('alice', 'proj1', 'blink', 'blink.ino', '// updated');
      expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.content).toBe('// updated');
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
