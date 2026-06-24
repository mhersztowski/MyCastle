/*
 * IoT Server — publish/subscribe example.
 *
 * Open this file in MyCastle **Drive**, then click ▶ "Uruchom w przeglądarce".
 * The Drive sandbox injects two globals:
 *
 *   client   — MQTT over MyCastle's built-in connection:
 *                client.publish(topic, payload)        // object → JSON
 *                client.subscribe(topic, (msg, topic)) // msg = parsed JSON or string
 *                                                       // returns an unsubscribe() fn
 *                client.userName                        // current user
 *   console  — console.log/info/warn/error/debug → right-panel console
 *
 * It talks to the backend `@mhersztowski/server-logic` IotServer, whose control
 * plane lives on:
 *   server/inbox   — commands you send TO the server
 *   server/outbox  — everything the server emits (you listen here)
 *
 * Subscriptions stay live after the run — incoming messages keep printing until
 * you hit ⏹ Stop (or re-run / close the panel).
 */

const SERVER_INBOX = 'server/inbox';
const SERVER_OUTBOX = 'server/outbox';

console.log('Connected as:', client.userName);
console.log('Subscribing to', SERVER_OUTBOX, '…');

// 1) Listen to everything the server emits and pretty-print by message type.
client.subscribe(SERVER_OUTBOX, (msg) => {
  if (!msg || typeof msg !== 'object') { console.log('◀', msg); return; }
  switch (msg.type) {
    case 'pong':
      console.info('◀ pong  reqId =', msg.reqId);
      break;
    case 'server.ready':
      console.info('◀ server.ready');
      break;
    case 'log.entry':
      console.log('◀ log  [' + msg.payload?.kind + ']', msg.payload?.message);
      break;
    case 'activity.entry':
      console.log('◀ activity  [' + msg.payload?.kind + ']', msg.payload?.message);
      break;
    case 'clients.snapshot':
    case 'clients.changed':
      console.log('◀ clients:', (msg.payload || []).length);
      break;
    default:
      console.log('◀', msg.type, msg);
  }
});

// 2) Send a few commands to the server inbox.
const reqId = 'drive-' + Date.now();
console.log('▶ ping', reqId);
client.publish(SERVER_INBOX, { type: 'ping', reqId });

console.log('▶ clients.list');
client.publish(SERVER_INBOX, { type: 'clients.list' });

console.log('▶ log (writes a server log entry)');
client.publish(SERVER_INBOX, {
  type: 'log',
  payload: { message: 'Hello from Drive (' + client.userName + ')', kind: 'log' },
});

console.log('▶ activity.list');
client.publish(SERVER_INBOX, { type: 'activity.list' });

// 3) Custom request/response on your own topics (not the server) — uncomment to try:
//
//   const myTopic = client.userName + '/desktop-web/drive/outbox';
//   client.subscribe(client.userName + '/inbox', (m) => console.log('to me:', m));
//   client.publish(myTopic, { type: 'hello', from: 'drive-example' });

console.log('Listening… press ⏹ Stop to end the subscription.');
