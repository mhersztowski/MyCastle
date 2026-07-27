/**
 * Testy `http_add_endpoint` — endpointów HTTP wystawianych przez skrypty.
 *
 * Sprawdzają pełną pętlę: rejestracja komendą MQTT → wywołanie po HTTP →
 * push żądania do skryptu → odpowiedź skryptu → wynik dla klienta HTTP.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ServerLogic, SERVER_CMD_TOPIC, clientResTopic, type MqttBus } from './logic';
import { attachServerMqtt } from './mqtt';

/** Broker w pamięci — zbiera publikacje i pozwala wstrzyknąć wiadomość klienta. */
class FakeBus implements MqttBus {
  published: { topic: string; payload: string }[] = [];
  private handlers: ((topic: string, payload: string) => void)[] = [];

  onMessage(handler: (topic: string, payload: string) => void): void {
    this.handlers.push(handler);
  }
  publishMessage(topic: string, payload: string): void {
    this.published.push({ topic, payload });
  }
  /** Symuluje wiadomość przysłaną przez klienta. */
  inject(topic: string, payload: string): void {
    for (const h of this.handlers) h(topic, payload);
  }
  /** Ostatnia publikacja na topiku danego klienta. */
  lastFor(clientId: string): Record<string, unknown> | null {
    const topic = clientResTopic(clientId);
    for (let i = this.published.length - 1; i >= 0; i--) {
      if (this.published[i].topic === topic) return JSON.parse(this.published[i].payload);
    }
    return null;
  }
}

const CLIENT = 'script-1';
const OWNER = 'marcin';

describe('http_add_endpoint', () => {
  let logic: ServerLogic;
  let bus: FakeBus;

  /** Wysyła komendę tak, jak zrobiłby to klient MQTT. */
  const sendCmd = (op: string, args: Record<string, unknown>, id = op) =>
    bus.inject(SERVER_CMD_TOPIC, JSON.stringify({ id, clientId: CLIENT, op, args }));

  /** Czeka, aż logika opublikuje push z żądaniem do skryptu. */
  const waitForPush = async (): Promise<Record<string, unknown>> => {
    for (let i = 0; i < 50; i++) {
      const msg = bus.lastFor(CLIENT);
      if (msg?.event === 'http_endpoint_request') return msg;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error('Nie doczekano się żądania wypchniętego do skryptu');
  };

  beforeEach(() => {
    // Skrócony timeout — testy nie mogą czekać 30 s na milczący skrypt. Wciąż
    // z zapasem, żeby wolniejszy przebieg nie ubił żądania przed odpowiedzią;
    // przypadek wygaśnięcia ma własną instancję z timeoutem liczonym w ms.
    logic = new ServerLogic(process.cwd(), { httpEndpointTimeoutMs: 2_000 });
    bus = new FakeBus();
    attachServerMqtt(logic, bus);
  });

  it('rejestruje endpoint i przekazuje żądanie do skryptu', async () => {
    sendCmd('http_add_endpoint', { path: '/hello', owner: OWNER });

    const call = logic.callHttpEndpoint(OWNER, {
      method: 'POST',
      path: 'hello',
      query: { a: '1' },
      headers: { 'x-test': 'yes' },
      body: { name: 'świat' },
    });

    const push = await waitForPush();
    const request = push.request as Record<string, unknown>;
    expect(request.path).toBe('hello');
    expect(request.method).toBe('POST');
    expect(request.query).toEqual({ a: '1' });
    expect(request.body).toEqual({ name: 'świat' });

    sendCmd('http_endpoint_response', {
      requestId: request.requestId,
      status: 201,
      headers: { 'x-from': 'skrypt' },
      body: { ok: true },
    });

    await expect(call).resolves.toEqual({
      status: 201,
      headers: { 'x-from': 'skrypt' },
      body: { ok: true },
    });
  });

  it('domyślnie odpowiada statusem 200', async () => {
    sendCmd('http_add_endpoint', { path: 'ping', owner: OWNER });
    const call = logic.callHttpEndpoint(OWNER, { method: 'GET', path: 'ping' });
    const push = await waitForPush();
    sendCmd('http_endpoint_response', {
      requestId: (push.request as Record<string, unknown>).requestId,
      body: 'pong',
    });
    await expect(call).resolves.toEqual({ status: 200, headers: {}, body: 'pong' });
  });

  it('zwraca 404 dla nieznanej ścieżki', async () => {
    await expect(logic.callHttpEndpoint(OWNER, { method: 'GET', path: 'brak' }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('nie udostępnia endpointu innemu użytkownikowi', async () => {
    sendCmd('http_add_endpoint', { path: 'secret', owner: OWNER });
    await expect(logic.callHttpEndpoint('ktos-inny', { method: 'GET', path: 'secret' }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('kończy się błędem 504, gdy skrypt nie odpowie', async () => {
    const impatient = new ServerLogic(process.cwd(), { httpEndpointTimeoutMs: 30 });
    const localBus = new FakeBus();
    attachServerMqtt(impatient, localBus);
    localBus.inject(SERVER_CMD_TOPIC, JSON.stringify({
      id: 'add', clientId: CLIENT, op: 'http_add_endpoint', args: { path: 'wolny', owner: OWNER },
    }));

    await expect(impatient.callHttpEndpoint(OWNER, { method: 'GET', path: 'wolny' }))
      .rejects.toMatchObject({ status: 504 });
  });

  it('propaguje błąd zgłoszony przez skrypt', async () => {
    sendCmd('http_add_endpoint', { path: 'zly', owner: OWNER });
    const call = logic.callHttpEndpoint(OWNER, { method: 'GET', path: 'zly' });
    const push = await waitForPush();
    sendCmd('http_endpoint_response', {
      requestId: (push.request as Record<string, unknown>).requestId,
      error: 'callback rzucił',
    });
    await expect(call).rejects.toMatchObject({ status: 500, message: expect.stringContaining('callback rzucił') });
  });

  it('wyrejestrowuje endpoint', async () => {
    sendCmd('http_add_endpoint', { path: 'tmp', owner: OWNER });
    sendCmd('http_remove_endpoint', { path: 'tmp', owner: OWNER });
    await expect(logic.callHttpEndpoint(OWNER, { method: 'GET', path: 'tmp' }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('listuje endpointy właściciela', () => {
    sendCmd('http_add_endpoint', { path: 'a', owner: OWNER });
    sendCmd('http_add_endpoint', { path: 'b', owner: OWNER });
    sendCmd('http_add_endpoint', { path: 'c', owner: 'ktos-inny' });
    expect(logic.httpListEndpoints(OWNER).sort()).toEqual(['a', 'b']);
  });

  it('odrzuca rejestrację bez połączenia MQTT (brak kanału zwrotnego)', async () => {
    await expect(logic.dispatch('http_add_endpoint', { path: 'x' }, { owner: OWNER }))
      .rejects.toThrow(/MQTT/);
  });

  it('publiczny endpoint da się wywołać bez właściciela', async () => {
    sendCmd('http_add_endpoint', { path: 'hook/otwarty', owner: OWNER, public: true });
    expect(logic.hasPublicHttpEndpoint('hook/otwarty')).toBe(true);

    const call = logic.callPublicHttpEndpoint({ method: 'POST', path: 'hook/otwarty', body: { a: 1 } });
    const push = await waitForPush();
    sendCmd('http_endpoint_response', {
      requestId: (push.request as Record<string, unknown>).requestId,
      body: { ok: true },
    });
    await expect(call).resolves.toMatchObject({ status: 200, body: { ok: true } });
  });

  it('endpoint prywatny nie jest osiągalny bez uwierzytelnienia', async () => {
    sendCmd('http_add_endpoint', { path: 'hook/zamkniety', owner: OWNER });
    expect(logic.hasPublicHttpEndpoint('hook/zamkniety')).toBe(false);
    await expect(logic.callPublicHttpEndpoint({ method: 'GET', path: 'hook/zamkniety' }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('nie pozwala dwóm użytkownikom przejąć tej samej publicznej ścieżki', () => {
    logic.httpAddEndpoint('hook/wspolny', CLIENT, OWNER, { public: true });
    // Ten sam właściciel może się przerejestrować (restart skryptu),
    // ale obcy nie może podmienić publicznego adresu.
    expect(() => logic.httpAddEndpoint('hook/wspolny', 'inny-klient', OWNER, { public: true })).not.toThrow();
    expect(() => logic.httpAddEndpoint('hook/wspolny', 'inny-klient', 'ktos-inny', { public: true })).toThrow(/zajęt/i);
  });

  it('ogranicza tempo wywołań publicznego endpointu', async () => {
    const limited = new ServerLogic(process.cwd(), { httpEndpointTimeoutMs: 50, publicRateLimitPerMinute: 2 });
    const localBus = new FakeBus();
    attachServerMqtt(limited, localBus);
    limited.httpAddEndpoint('hook/limit', CLIENT, OWNER, { public: true });

    // Dwa pierwsze przechodzą (i wygasają — nikt nie odpowiada), trzecie odbija się o limit.
    await limited.callPublicHttpEndpoint({ method: 'GET', path: 'hook/limit' }).catch(() => undefined);
    await limited.callPublicHttpEndpoint({ method: 'GET', path: 'hook/limit' }).catch(() => undefined);
    await expect(limited.callPublicHttpEndpoint({ method: 'GET', path: 'hook/limit' }))
      .rejects.toMatchObject({ status: 429 });
  });

  it('odrzuca ścieżki wychodzące poza przestrzeń endpointów', () => {
    expect(() => logic.httpAddEndpoint('../../etc', CLIENT, OWNER)).toThrow();
    expect(() => logic.httpAddEndpoint('', CLIENT, OWNER)).toThrow();
  });
});
