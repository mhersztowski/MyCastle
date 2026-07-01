import { describe, it, expect } from 'vitest';
import { IotServer } from './IotServer';
import { InMemoryTransport } from './transport';
import {
  clientOutbox, userOutbox, SERVER_INBOX, SERVER_OUTBOX,
  deviceOutbox, serviceInbox, classifyTopic,
} from './topics';
import { MqttList } from './MqttList';
import type { ClientId } from './types';

const alice: ClientId = { userName: 'alice', device: 'desktop', clientType: 'native', id: 'c1' };

describe('topics', () => {
  it('classifies server/user/client topics', () => {
    expect(classifyTopic(SERVER_INBOX)).toMatchObject({ scope: 'server', direction: 'inbox' });
    expect(classifyTopic('alice/outbox')).toMatchObject({ scope: 'user', direction: 'outbox', userName: 'alice' });
    expect(classifyTopic(clientOutbox(alice))).toMatchObject({
      scope: 'client',
      direction: 'outbox',
      client: alice,
    });
    expect(classifyTopic('minis/alice/dev/hello').scope).toBe('unknown');
  });

  it('classifies service/device sub-entity topics', () => {
    expect(classifyTopic(serviceInbox(alice, 'vfs'))).toMatchObject({
      scope: 'service', direction: 'inbox', client: alice, serviceId: 'vfs',
    });
    expect(classifyTopic(deviceOutbox(alice, 'vmouse'))).toMatchObject({
      scope: 'device', direction: 'outbox', client: alice, deviceId: 'vmouse',
    });
  });
});

describe('IotServer', () => {
  it('answers ping on the server inbox', () => {
    const t = new InMemoryTransport();
    const server = new IotServer({ transport: t });
    server.start();
    t.inject(SERVER_INBOX, JSON.stringify({ type: 'ping', reqId: 'x1' }));
    const pong = t.published.find((m) => m.topic === SERVER_OUTBOX && m.payload.includes('"pong"'));
    expect(pong).toBeTruthy();
  });

  it('registers a client from hello and emits ui events', () => {
    const t = new InMemoryTransport();
    const server = new IotServer({ transport: t });
    const seen: string[] = [];
    server.onUiEvent.connect((c, e) => seen.push(`${c.userName}:${e.type}`));
    server.start();

    t.inject(userOutbox('alice'), JSON.stringify({ type: 'client.hello', payload: { client: alice } }));
    expect(server.clients.byUser('alice')).toHaveLength(1);

    t.inject(clientOutbox(alice), JSON.stringify({ type: 'click', field: 'submitButton' }));
    expect(seen).toContain('alice:click');
  });

  it('handles the client-login → device-new lifecycle and device outbox', () => {
    const t = new InMemoryTransport();
    const server = new IotServer({ transport: t });
    const deviceMsgs: string[] = [];
    server.onDeviceMessage.connect((c, id, e) => deviceMsgs.push(`${c.id}/${id}:${e.type}`));
    server.start();

    t.inject(clientOutbox(alice), JSON.stringify({ type: 'client-login', payload: { client: alice } }));
    expect(server.clients.byUser('alice')).toHaveLength(1);

    t.inject(clientOutbox(alice), JSON.stringify({
      type: 'client-device-new',
      payload: { entity: { id: 'vmouse', name: 'Virtual Mouse', kind: 'virtual-mouse' } },
    }));
    const presence = server.clients.byUser('alice')[0];
    expect(presence.devices.map((d) => d.id)).toContain('vmouse');

    t.inject(deviceOutbox(alice, 'vmouse'), JSON.stringify({ type: 'move.ok' }));
    expect(deviceMsgs).toContain('c1/vmouse:move.ok');

    t.inject(clientOutbox(alice), JSON.stringify({ type: 'client-logout', payload: { client: alice } }));
    expect(server.clients.byUser('alice')).toHaveLength(0);
  });
});

describe('MqttList', () => {
  it('does CRUD and broadcasts snapshots', () => {
    const t = new InMemoryTransport();
    const list = new MqttList<{ id: string; name: string }>();
    list.bind(t, { requestTopic: 'list/req', snapshotTopic: 'list/snap' });

    t.inject('list/req', JSON.stringify({ type: 'create', payload: { id: '1', name: 'a' } }));
    expect(list.get('1')?.name).toBe('a');

    t.inject('list/req', JSON.stringify({ type: 'update', payload: { id: '1', patch: { name: 'b' } } }));
    expect(list.get('1')?.name).toBe('b');

    t.inject('list/req', JSON.stringify({ type: 'remove', payload: { id: '1' } }));
    expect(list.size).toBe(0);
  });
});
