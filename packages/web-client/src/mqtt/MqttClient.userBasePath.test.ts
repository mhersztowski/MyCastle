import { EventEmitter } from 'events';
import { PacketType } from './types';
import type { PacketData, ResponsePayload } from './types';

// --- Mock mqtt library (self-contained per test file) ---
let mockClientInstance: MockMqttClient;

class MockMqttClient extends EventEmitter {
  connected = false;
  subscribe = vi.fn((_topic: string, cb?: (err?: Error) => void) => cb?.());
  unsubscribe = vi.fn();
  publish = vi.fn((_topic: string, _message: string, cb?: (err?: Error) => void) => cb?.());
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

let uuidCounter = 0;
vi.mock('uuid', () => ({ v4: () => `uuid-${++uuidCounter}` }));

import { MqttClient } from './MqttClient';

async function connectClient(client: MqttClient): Promise<void> {
  const p = client.connect('ws://localhost:1894/mqtt');
  mockClientInstance.connected = true;
  mockClientInstance.emit('connect');
  await p;
}

function lastPacket(): PacketData {
  const calls = mockClientInstance.publish.mock.calls;
  return JSON.parse(calls[calls.length - 1][1] as string);
}

function respondTo(packet: PacketData, data: unknown): void {
  const buf = Buffer.from(
    JSON.stringify({
      type: PacketType.RESPONSE,
      id: 'r',
      timestamp: Date.now(),
      payload: { requestId: packet.id, data } as ResponsePayload,
    }),
  );
  mockClientInstance.emit('message', 'mycastle/response', buf);
}

describe('MqttClient — user base path (tenant isolation)', () => {
  let client: MqttClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    uuidCounter = 0;
    client = new MqttClient();
    await connectClient(client);
  });

  describe('outbound path prefixing', () => {
    it('prefixes a relative path with the configured base', async () => {
      client.setUserBasePath('Minis/Users/alice');
      const promise = client.readFile('notes/todo.txt');

      const packet = lastPacket();
      expect(packet.payload).toEqual({ path: 'Minis/Users/alice/notes/todo.txt' });

      respondTo(packet, { path: 'Minis/Users/alice/notes/todo.txt', content: 'x', lastModified: 't' });
      await promise;
    });

    it('uses the base path itself when the local path is empty', async () => {
      client.setUserBasePath('Minis/Users/alice');
      const promise = client.listDirectory('');

      const packet = lastPacket();
      expect(packet.payload).toEqual({ path: 'Minis/Users/alice' });

      respondTo(packet, { name: 'alice', path: 'Minis/Users/alice', type: 'directory', children: [] });
      await promise;
    });

    it('does not prefix when no base path is set', async () => {
      const promise = client.readFile('notes/todo.txt');
      expect(lastPacket().payload).toEqual({ path: 'notes/todo.txt' });
      respondTo(lastPacket(), { path: 'notes/todo.txt', content: '', lastModified: 't' });
      await promise;
    });
  });

  describe('inbound path stripping', () => {
    it('strips the base prefix from a readFile response path', async () => {
      client.setUserBasePath('Minis/Users/alice');
      const promise = client.readFile('notes/todo.txt');
      respondTo(lastPacket(), {
        path: 'Minis/Users/alice/notes/todo.txt',
        content: 'body',
        lastModified: 't',
      });
      const result = await promise;
      expect(result.path).toBe('notes/todo.txt');
      expect(result.content).toBe('body');
    });

    it('leaves an unrelated path untouched when it lacks the prefix', async () => {
      client.setUserBasePath('Minis/Users/alice');
      const promise = client.readFile('notes/todo.txt');
      respondTo(lastPacket(), { path: 'other/place.txt', content: '', lastModified: 't' });
      const result = await promise;
      expect(result.path).toBe('other/place.txt');
    });

    it('recursively strips the base prefix from a directory tree', async () => {
      client.setUserBasePath('Minis/Users/alice');
      const promise = client.listDirectory('proj');
      respondTo(lastPacket(), {
        name: 'proj',
        path: 'Minis/Users/alice/proj',
        type: 'directory',
        children: [
          {
            name: 'sub',
            path: 'Minis/Users/alice/proj/sub',
            type: 'directory',
            children: [
              { name: 'f.txt', path: 'Minis/Users/alice/proj/sub/f.txt', type: 'file' },
            ],
          },
          { name: 'top.txt', path: 'Minis/Users/alice/proj/top.txt', type: 'file' },
        ],
      });
      const tree = await promise;
      expect(tree.path).toBe('proj');
      expect(tree.children?.[0].path).toBe('proj/sub');
      expect((tree.children?.[0] as any).children[0].path).toBe('proj/sub/f.txt');
      expect(tree.children?.[1].path).toBe('proj/top.txt');
    });

    it('strips the base prefix in FILE_CHANGED callbacks', async () => {
      client.setUserBasePath('Minis/Users/alice');
      const cb = vi.fn();
      client.onFileChanged(cb);

      const buf = Buffer.from(
        JSON.stringify({
          type: PacketType.FILE_CHANGED,
          id: 'fc',
          timestamp: Date.now(),
          payload: { path: 'Minis\\Users\\alice\\notes\\todo.txt', action: 'write' },
        }),
      );
      mockClientInstance.emit('message', 'mycastle/response', buf);

      // Backslashes normalized AND base stripped
      expect(cb).toHaveBeenCalledWith('notes/todo.txt', 'write');
    });
  });

  describe('binary file operations honor the base path', () => {
    it('writeBinaryFile prefixes outbound and strips inbound path', async () => {
      client.setUserBasePath('Minis/Users/bob');
      const promise = client.writeBinaryFile('img/a.png', 'ZGF0YQ==', 'image/png');
      const packet = lastPacket();
      expect(packet.type).toBe(PacketType.FILE_WRITE_BINARY);
      expect(packet.payload).toMatchObject({ path: 'Minis/Users/bob/img/a.png', mimeType: 'image/png' });

      respondTo(packet, { path: 'Minis/Users/bob/img/a.png', mimeType: 'image/png', data: 'ZGF0YQ==' });
      const result = await promise;
      expect(result.path).toBe('img/a.png');
    });
  });
});

describe('MqttClient — size-aware upload routing (2MB boundary)', () => {
  let client: MqttClient;
  const LIMIT = 2 * 1024 * 1024;

  beforeEach(async () => {
    vi.clearAllMocks();
    uuidCounter = 0;
    client = new MqttClient();
    await connectClient(client);
  });

  it('routes a file exactly at the 2MB limit through MQTT (writeBinaryFile)', async () => {
    // Deterministic FileReader stub — the base64 encode path is exercised by the
    // small-file branch; we only care that MQTT (not HTTP) is chosen at the boundary.
    class FakeFileReader {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        this.result = 'data:application/octet-stream;base64,ZGF0YQ==';
        setTimeout(() => this.onload?.(), 0);
      }
    }
    vi.stubGlobal('FileReader', FakeFileReader as unknown as typeof FileReader);

    const atLimit = { size: LIMIT, type: 'application/octet-stream' } as unknown as File;
    const promise = client.uploadFile('big/at-limit.bin', atLimit);

    // Wait for the FileReader stub to resolve and the packet to be published.
    for (let i = 0; i < 10 && mockClientInstance.publish.mock.calls.length === 0; i++) {
      await new Promise(r => setTimeout(r, 0));
    }

    const packet = lastPacket();
    expect(packet.type).toBe(PacketType.FILE_WRITE_BINARY);
    expect(packet.payload).toMatchObject({ path: 'big/at-limit.bin', data: 'ZGF0YQ==' });
    respondTo(packet, { path: 'big/at-limit.bin', mimeType: 'application/octet-stream', data: '' });
    await promise;

    vi.unstubAllGlobals();
  });

  it('routes a file just over the 2MB limit through HTTP (XMLHttpRequest, no MQTT publish)', async () => {
    // Stub XMLHttpRequest so no real network happens and we can assert routing.
    const openSpy = vi.fn();
    const sendSpy = vi.fn();
    const setHeaderSpy = vi.fn();
    const listeners: Record<string, () => void> = {};

    class FakeXHR {
      status = 200;
      responseText = JSON.stringify({ success: true, data: { path: 'big/over.bin' } });
      upload = { addEventListener: vi.fn() };
      open = openSpy;
      send = (...args: unknown[]) => {
        sendSpy(...args);
        // Fire the load listener asynchronously to resolve the promise.
        setTimeout(() => listeners['load']?.(), 0);
      };
      setRequestHeader = setHeaderSpy;
      addEventListener = (ev: string, cb: () => void) => {
        listeners[ev] = cb;
      };
    }
    vi.stubGlobal('XMLHttpRequest', FakeXHR as unknown as typeof XMLHttpRequest);

    // A fake large blob-like object — the HTTP path never reads its contents (xhr mocked).
    const bigFile = { size: LIMIT + 1, type: 'text/plain' } as unknown as File;

    const result = await client.uploadFile('big/over.bin', bigFile);

    expect(openSpy).toHaveBeenCalledWith('POST', expect.stringMatching(/\/upload$/));
    expect(setHeaderSpy).toHaveBeenCalledWith('X-File-Path', 'big/over.bin');
    expect(sendSpy).toHaveBeenCalledWith(bigFile);
    // Crucially: nothing was published over MQTT for the large-file path.
    expect(mockClientInstance.publish).not.toHaveBeenCalled();
    expect(result).toEqual({ path: 'big/over.bin' });

    vi.unstubAllGlobals();
  });

  it('prefixes the base path for HTTP uploads too', async () => {
    const setHeaderSpy = vi.fn();
    const listeners: Record<string, () => void> = {};
    class FakeXHR {
      status = 200;
      responseText = JSON.stringify({ success: true, data: {} });
      upload = { addEventListener: vi.fn() };
      open = vi.fn();
      send = () => setTimeout(() => listeners['load']?.(), 0);
      setRequestHeader = setHeaderSpy;
      addEventListener = (ev: string, cb: () => void) => { listeners[ev] = cb; };
    }
    vi.stubGlobal('XMLHttpRequest', FakeXHR as unknown as typeof XMLHttpRequest);

    client.setUserBasePath('Minis/Users/carol');
    const bigFile = { size: LIMIT + 100, type: 'text/plain' } as unknown as File;
    await client.uploadFile('docs/big.txt', bigFile);

    expect(setHeaderSpy).toHaveBeenCalledWith('X-File-Path', 'Minis/Users/carol/docs/big.txt');
    vi.unstubAllGlobals();
  });
});

describe('MqttClient — raw pub/sub and misc requests', () => {
  let client: MqttClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    uuidCounter = 0;
    client = new MqttClient();
    await connectClient(client);
  });

  it('rawPublish forwards to the underlying client', () => {
    client.rawPublish('some/topic', 'hello');
    expect(mockClientInstance.publish).toHaveBeenCalledWith('some/topic', 'hello');
  });

  it('rawSubscribe subscribes, filters by topic, and unsubscribes', () => {
    const cb = vi.fn();
    const unsub = client.rawSubscribe('watch/topic', cb);
    expect(mockClientInstance.subscribe).toHaveBeenCalledWith('watch/topic');

    // Matching topic → callback fires
    mockClientInstance.emit('message', 'watch/topic', Buffer.from('payload-a'));
    expect(cb).toHaveBeenCalledWith('payload-a');

    // Non-matching topic → ignored
    mockClientInstance.emit('message', 'other/topic', Buffer.from('nope'));
    expect(cb).toHaveBeenCalledTimes(1);

    unsub();
    expect(mockClientInstance.unsubscribe).toHaveBeenCalledWith('watch/topic');
  });

  it('rawSubscribe on a disconnected client returns a no-op unsubscribe', () => {
    const fresh = new MqttClient();
    const unsub = fresh.rawSubscribe('x', vi.fn());
    expect(() => unsub()).not.toThrow();
  });

  it('runAutomateFlow sends an AUTOMATE_RUN packet with flow id and variables', async () => {
    const promise = client.runAutomateFlow('flow-1', { a: 1 });
    const packet = lastPacket();
    expect(packet.type).toBe(PacketType.AUTOMATE_RUN);
    expect(packet.payload).toEqual({ flowId: 'flow-1', variables: { a: 1 } });
    respondTo(packet, { ok: true });
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it('syncDirinfo sends a DIRINFO_SYNC packet with the prefixed path', async () => {
    client.setUserBasePath('base');
    const promise = client.syncDirinfo('dir');
    const packet = lastPacket();
    expect(packet.type).toBe(PacketType.DIRINFO_SYNC);
    expect(packet.payload).toEqual({ path: 'base/dir' });
    respondTo(packet, {});
    await promise;
  });
});
