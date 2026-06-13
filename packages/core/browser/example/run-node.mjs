/**
 * Uruchomienie przykładów w Node — BEZ serwera, z atrapą `fetch` (in-memory VFS).
 * Służy do sprawdzenia logiki przykładów/API offline:
 *
 *   node packages/core/browser/example/run-node.mjs
 *
 * (W przeglądarce użyj `index.html`, który gada z prawdziwym serwerem.)
 */
import { ApiClient } from '../api/ApiClient.js';
import { runPersonsExample } from './persons.example.js';
import { runProjectsTasksExample } from './projects-tasks.example.js';
import { runEventsExample } from './events.example.js';
import { runFullFlowExample } from './full-flow.example.js';
import { runScene3dExample } from './scene3d.example.js';

// ── atrapa serwera VFS w pamięci ──
const store = new Map();
globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url, 'http://localhost');
  const op = u.pathname.split('/').pop();
  const path = u.searchParams.get('path');
  const ok = (data) => ({ status: 200, ok: true, json: async () => data });
  if (op === 'readFile') {
    return store.has(path)
      ? ok({ data: store.get(path) })
      : { status: 404, ok: false, json: async () => ({}) };
  }
  if (op === 'writeFile') { store.set(path, JSON.parse(opts.body).data); return ok({ ok: true }); }
  if (op === 'mkdir') return ok({ ok: true });
  if (op === 'delete') { store.delete(path); return ok({ ok: true }); }
  return { status: 400, ok: false, json: async () => ({}) };
};

const client = new ApiClient({ userName: 'tester', token: 'dummy' });

await runPersonsExample(client);
console.log('');
await runProjectsTasksExample(client);
console.log('');
await runEventsExample(client);
console.log('');
await runFullFlowExample(client);
console.log('');
await runScene3dExample(); // brak klienta — czysta geometria
console.log('\n✓ all examples ran');
