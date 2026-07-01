import { describe, it, expect } from 'vitest';
import {
  clientOutbox, deviceInbox, deviceOutbox, stringifyEnvelope, parseEnvelope,
  type ClientId,
} from '@mhersztowski/server-logic/web';
import { InMemoryClientTransport } from './transport';
import { WebServerLogicClient } from './WebServerLogicClient';
import { BrowserDisplay } from './entities/BrowserDisplay';

const clientId: ClientId = { userName: 'alice', device: 'desktop', clientType: 'web', id: 'browser1' };

const flush = () => new Promise((r) => setTimeout(r, 0));

function typesOn(t: InMemoryClientTransport, topic: string): string[] {
  return t.published.filter((m) => m.topic === topic).map((m) => parseEnvelope(m.payload)?.type ?? '?');
}

describe('WebServerLogicClient', () => {
  it('logs in and announces registered devices on connect', () => {
    const t = new InMemoryClientTransport();
    const client = new WebServerLogicClient({ transport: t, userName: 'alice', id: 'browser1', heartbeatMs: 0 });
    client.register(new BrowserDisplay('disp'));
    client.connect();

    const out = typesOn(t, clientOutbox(clientId));
    expect(out).toContain('client-login');
    expect(out).toContain('client-device-new');
  });

  it('routes an inbox command to the entity and replies on the outbox', async () => {
    const t = new InMemoryClientTransport();
    const client = new WebServerLogicClient({ transport: t, userName: 'alice', id: 'browser1', heartbeatMs: 0 });
    let rendered = '';
    client.register(new BrowserDisplay('disp', (c) => { rendered = c.text; }));
    client.connect();

    t.inject(deviceInbox(clientId, 'disp'),
      stringifyEnvelope({ type: 'show_text', reqId: 'r1', payload: { text: 'hi' } }));
    await flush();

    expect(rendered).toBe('hi');
    const reply = t.published.filter((m) => m.topic === deviceOutbox(clientId, 'disp')).map((m) => parseEnvelope(m.payload))[0];
    expect(reply).toMatchObject({ type: 'show_text.ok', reqId: 'r1' });
  });

  it('returns data for query actions', async () => {
    const t = new InMemoryClientTransport();
    const client = new WebServerLogicClient({ transport: t, userName: 'alice', id: 'browser1', heartbeatMs: 0 });
    client.register(new BrowserDisplay('disp'));
    client.connect();

    t.inject(deviceInbox(clientId, 'disp'), stringifyEnvelope({ type: 'get', reqId: 'g1' }));
    await flush();

    const reply = t.published.filter((m) => m.topic === deviceOutbox(clientId, 'disp')).map((m) => parseEnvelope(m.payload)).pop();
    expect(reply?.type).toBe('get.ok');
    expect((reply?.payload as { content?: { text: string } })?.content?.text).toBe('');
  });

  it('sends logout + device-remove on disconnect', () => {
    const t = new InMemoryClientTransport();
    const client = new WebServerLogicClient({ transport: t, userName: 'alice', id: 'browser1', heartbeatMs: 0 });
    client.register(new BrowserDisplay('disp'));
    client.connect();
    client.disconnect();

    const out = typesOn(t, clientOutbox(clientId));
    expect(out).toContain('client-device-remove');
    expect(out).toContain('client-logout');
    expect(client.connected).toBe(false);
  });
});
