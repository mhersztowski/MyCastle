/**
 * Testy mostu WebSocket → TCP.
 *
 * Most jest jedyną drogą, którą aplikacja Hydry uruchomiona w karcie dosięga
 * sieci, więc sprawdzamy go na **prawdziwym** gnieździe TCP, a nie na atrapie:
 * to, czy bajty przechodzą w obie strony i czy zamknięcie po jednej stronie
 * zamyka drugą, jest własnością warstwy transportowej, a nie naszego kodu.
 */

import { createServer, type Server, type Socket } from 'node:net';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import { TcpBridge, isPrivateAddress } from './TcpBridge';

/** Echo z prefiksem — po odpowiedzi widać, że przeszła przez serwer, a nie odbiła się po drodze. */
function startEchoServer(): Promise<{ server: Server; port: number; sockets: Socket[] }> {
  const sockets: Socket[] = [];
  const server = createServer((socket) => {
    sockets.push(socket);
    socket.on('data', (chunk) => socket.write(Buffer.concat([Buffer.from('>'), chunk])));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: (server.address() as { port: number }).port, sockets });
    });
  });
}

function once(ws: WebSocket, event: 'open' | 'close' | 'message'): Promise<unknown> {
  return new Promise((resolve) => ws.once(event, (arg: unknown) => resolve(arg)));
}

describe('isPrivateAddress', () => {
  it('rozpoznaje pętlę zwrotną i sieci prywatne', () => {
    for (const host of ['localhost', '127.0.0.1', '10.0.0.5', '192.168.1.10',
                        '172.16.0.1', '172.31.255.255', '::1', 'broker.local']) {
      expect(isPrivateAddress(host), host).toBe(true);
    }
  });

  it('nie uznaje adresów publicznych za prywatne', () => {
    for (const host of ['8.8.8.8', '1.1.1.1', 'system.asgeupos.pl',
                        '172.32.0.1', '172.15.0.1', 'broker.hivemq.com']) {
      expect(isPrivateAddress(host), host).toBe(false);
    }
  });
});

describe('TcpBridge — dopuszczanie hostów', () => {
  it('domyślnie przepuszcza sieć prywatną i odrzuca publiczną', () => {
    const bridge = new TcpBridge({ allow: [] });
    expect(bridge.allows('192.168.1.10')).toBe(true);
    expect(bridge.allows('system.asgeupos.pl')).toBe(false);
    bridge.close();
  });

  it('wypisany host publiczny przechodzi', () => {
    const bridge = new TcpBridge({ allow: ['system.asgeupos.pl'] });
    expect(bridge.allows('system.asgeupos.pl')).toBe(true);
    expect(bridge.allows('broker.hivemq.com')).toBe(false);
    bridge.close();
  });

  it('gwiazdka znosi ograniczenie', () => {
    const bridge = new TcpBridge({ allow: ['*'] });
    expect(bridge.allows('8.8.8.8')).toBe(true);
    bridge.close();
  });
});

describe('TcpBridge — przepływ bajtów', () => {
  let echo: Awaited<ReturnType<typeof startEchoServer>>;
  let http: HttpServer;
  let bridge: TcpBridge;
  let bridgePort: number;

  beforeEach(async () => {
    echo = await startEchoServer();
    bridge = new TcpBridge({ allow: [], log: () => { /* cisza w testach */ } });
    http = createHttpServer();
    http.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head));
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', () => resolve()));
    bridgePort = (http.address() as { port: number }).port;
  });

  afterEach(async () => {
    bridge.close();
    await new Promise<void>((resolve) => http.close(() => resolve()));
    await new Promise<void>((resolve) => echo.server.close(() => resolve()));
  });

  const url = (host: string, port: number) =>
    `ws://127.0.0.1:${bridgePort}${TcpBridge.PATH}?host=${host}&port=${port}`;

  it('przenosi bajty w obie strony', async () => {
    const ws = new WebSocket(url('127.0.0.1', echo.port));
    await once(ws, 'open');

    ws.send(Buffer.from([0x10, 0x20, 0x30]), { binary: true });
    const reply = await once(ws, 'message') as Buffer;

    expect(Buffer.from(reply)).toEqual(Buffer.from([0x3e, 0x10, 0x20, 0x30]));
    ws.close();
  });

  it('nie gubi bajtów wysłanych przed nawiązaniem TCP', async () => {
    // Karta nie ma jak zaczekać: `open` WebSocketu przychodzi zwykle przed
    // nawiązaniem połączenia TCP po stronie mostu. Pierwszy pakiet MQTT
    // CONNECT idzie właśnie w tym oknie.
    const ws = new WebSocket(url('127.0.0.1', echo.port));
    ws.on('open', () => ws.send(Buffer.from('CONNECT'), { binary: true }));

    const reply = await once(ws, 'message') as Buffer;
    expect(Buffer.from(reply).toString()).toBe('>CONNECT');
    ws.close();
  });

  it('zamknięcie po stronie serwera zamyka gniazdo karty', async () => {
    const ws = new WebSocket(url('127.0.0.1', echo.port));
    await once(ws, 'open');
    ws.send(Buffer.from('x'), { binary: true });
    await once(ws, 'message');

    for (const socket of echo.sockets) socket.destroy();
    await once(ws, 'close');
    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });

  it('odmawia połączenia poza sieć prywatną', async () => {
    const ws = new WebSocket(url('8.8.8.8', 53));
    const error = await new Promise<Error>((resolve) => ws.once('error', resolve));
    expect(error.message).toContain('403');
  });

  it('odmawia żądania bez portu', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${bridgePort}${TcpBridge.PATH}?host=127.0.0.1`);
    const error = await new Promise<Error>((resolve) => ws.once('error', resolve));
    expect(error.message).toContain('400');
  });

  it('nieosiągalny port kończy się zamknięciem, a nie zawieszeniem', async () => {
    // Port zamkniętego serwera: odmowa przychodzi od jądra od razu.
    await new Promise<void>((resolve) => echo.server.close(() => resolve()));
    const ws = new WebSocket(url('127.0.0.1', echo.port));
    await once(ws, 'open');
    await once(ws, 'close');
    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });
});
