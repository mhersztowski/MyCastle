import { EventEmitter } from 'events';
import { PacketType } from './types';
import type { PacketData, ResponsePayload, ErrorPayload, FileChangedPayload } from './types';

// --- Mock mqtt library ---
let mockClientInstance: MockMqttClient;

class MockMqttClient extends EventEmitter {
  connected = false;

  subscribe = vi.fn((_topic: string, cb?: (err?: Error) => void) => {
    cb?.();
  });

  publish = vi.fn((_topic: string, _message: string, cb?: (err?: Error) => void) => {
    cb?.();
  });

  end = vi.fn();
}

vi.mock('mqtt', () => ({
  default: {
    connect: vi.fn(() => {
      mockClientInstance = new MockMqttClient();
      return mockClientInstance;
    }),
  },
}));

// Mock uuid to return predictable IDs
let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: () => `test-uuid-${++uuidCounter}`,
}));

// Import after mocks are set up
import { MqttClient } from './MqttClient';

// Helper: connect a client and mark the mock as connected
async function connectClient(client: MqttClient, brokerUrl = 'ws://localhost:1894/mqtt'): Promise<void> {
  const connectPromise = client.connect(brokerUrl);
  mockClientInstance.connected = true;
  mockClientInstance.emit('connect');
  await connectPromise;
}

// Helper: simulate a response message arriving on the response topic
function simulateResponse(data: PacketData): void {
  const buffer = Buffer.from(JSON.stringify(data));
  mockClientInstance.emit('message', 'mycastle/response', buffer);
}

describe('MqttClient', () => {
  let client: MqttClient;

  beforeEach(() => {
    vi.clearAllMocks();
    uuidCounter = 0;
    client = new MqttClient();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------
  // 1. connect / disconnect
  // -------------------------------------------------------
  describe('connect / disconnect', () => {
    it('connects to the given broker URL', async () => {
      const mqtt = (await import('mqtt')).default;
      await connectClient(client, 'ws://broker:1894/mqtt');

      expect(mqtt.connect).toHaveBeenCalledWith('ws://broker:1894/mqtt', expect.objectContaining({
        protocol: 'ws',
      }));
    });

    it('uses wss protocol when broker URL starts with wss', async () => {
      const mqtt = (await import('mqtt')).default;
      await connectClient(client, 'wss://secure-broker/mqtt');

      expect(mqtt.connect).toHaveBeenCalledWith('wss://secure-broker/mqtt', expect.objectContaining({
        protocol: 'wss',
      }));
    });

    it('sets isConnected based on underlying client connected property', async () => {
      expect(client.isConnected).toBe(false);

      await connectClient(client);

      expect(client.isConnected).toBe(true);
    });

    it('subscribes to the response topic on connect', async () => {
      await connectClient(client);

      expect(mockClientInstance.subscribe).toHaveBeenCalledWith(
        'mycastle/response',
        expect.any(Function),
      );
    });

    it('rejects when subscribe fails on connect', async () => {
      const subscribeError = new Error('Subscribe failed');

      const connectPromise = client.connect('ws://localhost/mqtt');
      // Override subscribe to fail
      mockClientInstance.subscribe.mockImplementationOnce((_topic: string, cb?: (err?: Error) => void) => {
        cb?.(subscribeError);
      });
      mockClientInstance.emit('connect');

      await expect(connectPromise).rejects.toThrow('Subscribe failed');
    });

    it('rejects when the client emits an error event', async () => {
      const connectPromise = client.connect('ws://localhost/mqtt');
      mockClientInstance.emit('error', new Error('Connection refused'));

      await expect(connectPromise).rejects.toThrow('Connection refused');
    });

    it('does not call mqtt.connect twice if connect is called twice', async () => {
      const mqtt = (await import('mqtt')).default;

      const promise1 = client.connect('ws://localhost/mqtt');
      const promise2 = client.connect('ws://localhost/mqtt');

      // mqtt.connect should only be called once
      expect(mqtt.connect).toHaveBeenCalledTimes(1);

      mockClientInstance.connected = true;
      mockClientInstance.emit('connect');
      await Promise.all([promise1, promise2]);
    });

    it('disconnect calls end() and resets state', async () => {
      await connectClient(client);

      client.disconnect();

      expect(mockClientInstance.end).toHaveBeenCalled();
      expect(client.isConnected).toBe(false);
    });
  });

  // -------------------------------------------------------
  // 2. request-response pattern
  // -------------------------------------------------------
  describe('request-response pattern', () => {
    it('readFile sends FILE_READ packet and resolves with file content', async () => {
      await connectClient(client);

      const readPromise = client.readFile('test/file.txt');

      // Extract the published packet
      const publishCall = mockClientInstance.publish.mock.calls[0];
      const packet: PacketData = JSON.parse(publishCall[1]);

      expect(packet.type).toBe(PacketType.FILE_READ);
      expect(packet.payload).toEqual({ path: 'test/file.txt' });
      expect(publishCall[0]).toBe('mycastle/request');

      // Simulate response
      simulateResponse({
        type: PacketType.RESPONSE,
        id: 'resp-1',
        timestamp: Date.now(),
        payload: {
          requestId: packet.id,
          data: { path: 'test/file.txt', content: 'hello', lastModified: '2026-01-01' },
        } as ResponsePayload,
      });

      const result = await readPromise;
      expect(result).toEqual({
        path: 'test/file.txt',
        content: 'hello',
        lastModified: '2026-01-01',
      });
    });

    it('writeFile sends FILE_WRITE packet', async () => {
      await connectClient(client);

      const writePromise = client.writeFile('data/notes.json', '{"key":"value"}');

      const packet: PacketData = JSON.parse(mockClientInstance.publish.mock.calls[0][1]);
      expect(packet.type).toBe(PacketType.FILE_WRITE);
      expect(packet.payload).toEqual({ path: 'data/notes.json', content: '{"key":"value"}' });

      // Resolve it
      simulateResponse({
        type: PacketType.RESPONSE,
        id: 'resp-2',
        timestamp: Date.now(),
        payload: {
          requestId: packet.id,
          data: { path: 'data/notes.json', content: '{"key":"value"}', lastModified: '2026-01-01' },
        } as ResponsePayload,
      });

      await writePromise;
    });

    it('rejects when not connected', async () => {
      await expect(client.readFile('any/path.txt')).rejects.toThrow('Not connected to MQTT broker');
    });

    it('rejects when publish fails', async () => {
      await connectClient(client);

      mockClientInstance.publish.mockImplementationOnce(
        (_topic: string, _message: string, cb?: (err?: Error) => void) => {
          cb?.(new Error('Publish error'));
        },
      );

      await expect(client.readFile('any/path.txt')).rejects.toThrow('Publish error');
    });

    it('rejects on request timeout', async () => {
      vi.useFakeTimers();

      await connectClient(client);

      const readPromise = client.readFile('slow/file.txt');

      // Advance timers past the 30s default timeout
      vi.advanceTimersByTime(30_001);

      await expect(readPromise).rejects.toThrow('Request timeout');
    });
  });

  // -------------------------------------------------------
  // 3. Response handling
  // -------------------------------------------------------
  describe('response handling', () => {
    it('resolves pending request on RESPONSE packet', async () => {
      await connectClient(client);

      const promise = client.deleteFile('old/file.txt');

      const packet: PacketData = JSON.parse(mockClientInstance.publish.mock.calls[0][1]);

      simulateResponse({
        type: PacketType.RESPONSE,
        id: 'resp-3',
        timestamp: Date.now(),
        payload: { requestId: packet.id, data: { success: true } } as ResponsePayload,
      });

      await expect(promise).resolves.toEqual({ success: true });
    });

    it('rejects pending request on ERROR packet', async () => {
      await connectClient(client);

      const promise = client.readFile('missing/file.txt');

      const packet: PacketData = JSON.parse(mockClientInstance.publish.mock.calls[0][1]);

      simulateResponse({
        type: PacketType.ERROR,
        id: 'err-1',
        timestamp: Date.now(),
        payload: { requestId: packet.id, message: 'File not found' } as ErrorPayload,
      });

      await expect(promise).rejects.toThrow('File not found');
    });

    it('ignores response for unknown requestId', async () => {
      await connectClient(client);

      // Should not throw
      simulateResponse({
        type: PacketType.RESPONSE,
        id: 'resp-unknown',
        timestamp: Date.now(),
        payload: { requestId: 'non-existent-id', data: {} } as ResponsePayload,
      });
    });

    it('ignores malformed JSON messages without throwing', async () => {
      await connectClient(client);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const buffer = Buffer.from('not valid json');
      mockClientInstance.emit('message', 'mycastle/response', buffer);

      expect(consoleSpy).toHaveBeenCalledWith('Error parsing response:', expect.any(SyntaxError));
      consoleSpy.mockRestore();
    });
  });

  // -------------------------------------------------------
  // 4. File change callbacks
  // -------------------------------------------------------
  describe('file change callbacks', () => {
    it('fires fileChange callbacks on FILE_CHANGED packet', async () => {
      await connectClient(client);

      const callback = vi.fn();
      client.onFileChanged(callback);

      simulateResponse({
        type: PacketType.FILE_CHANGED,
        id: 'fc-1',
        timestamp: Date.now(),
        payload: { path: 'data/notes.json', action: 'write' } as FileChangedPayload,
      });

      expect(callback).toHaveBeenCalledWith('data/notes.json', 'write');
    });

    it('onFileChanged registers callback and receives events', async () => {
      await connectClient(client);

      const cb1 = vi.fn();
      const cb2 = vi.fn();
      client.onFileChanged(cb1);
      client.onFileChanged(cb2);

      simulateResponse({
        type: PacketType.FILE_CHANGED,
        id: 'fc-2',
        timestamp: Date.now(),
        payload: { path: 'file.txt', action: 'delete' } as FileChangedPayload,
      });

      expect(cb1).toHaveBeenCalledWith('file.txt', 'delete');
      expect(cb2).toHaveBeenCalledWith('file.txt', 'delete');
    });

    it('offFileChanged removes callback so it no longer fires', async () => {
      await connectClient(client);

      const callback = vi.fn();
      client.onFileChanged(callback);
      client.offFileChanged(callback);

      simulateResponse({
        type: PacketType.FILE_CHANGED,
        id: 'fc-3',
        timestamp: Date.now(),
        payload: { path: 'any/file.txt', action: 'write' } as FileChangedPayload,
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('disconnect clears all file change callbacks', async () => {
      await connectClient(client);

      const callback = vi.fn();
      client.onFileChanged(callback);

      client.disconnect();

      // Re-connect and trigger a FILE_CHANGED -- old callback should not fire
      await connectClient(client);

      simulateResponse({
        type: PacketType.FILE_CHANGED,
        id: 'fc-4',
        timestamp: Date.now(),
        payload: { path: 'any/file.txt', action: 'write' } as FileChangedPayload,
      });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------
  // 5. Path normalization
  // -------------------------------------------------------
  describe('path normalization', () => {
    it('normalizes backslashes to forward slashes in readFile response', async () => {
      await connectClient(client);

      const promise = client.readFile('data\\notes.json');

      const packet: PacketData = JSON.parse(mockClientInstance.publish.mock.calls[0][1]);

      simulateResponse({
        type: PacketType.RESPONSE,
        id: 'norm-1',
        timestamp: Date.now(),
        payload: {
          requestId: packet.id,
          data: { path: 'data\\notes.json', content: '{}', lastModified: '2026-01-01' },
        } as ResponsePayload,
      });

      const result = await promise;
      expect(result.path).toBe('data/notes.json');
    });

    it('normalizes backslashes in listDirectory tree paths', async () => {
      await connectClient(client);

      const promise = client.listDirectory('root');

      const packet: PacketData = JSON.parse(mockClientInstance.publish.mock.calls[0][1]);

      simulateResponse({
        type: PacketType.RESPONSE,
        id: 'norm-2',
        timestamp: Date.now(),
        payload: {
          requestId: packet.id,
          data: {
            name: 'root',
            path: 'root',
            type: 'directory',
            children: [
              { name: 'sub', path: 'root\\sub', type: 'directory', children: [] },
              { name: 'file.txt', path: 'root\\file.txt', type: 'file' },
            ],
          },
        } as ResponsePayload,
      });

      const result = await promise;
      expect(result.path).toBe('root');
      expect(result.children?.[0].path).toBe('root/sub');
      expect(result.children?.[1].path).toBe('root/file.txt');
    });
  });
});
