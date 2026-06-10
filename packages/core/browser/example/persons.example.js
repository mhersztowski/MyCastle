import { ApiPerson } from '../api/ApiPerson.js';

/**
 * Przykład operacji CRUD na osobach.
 * @param {import('../api/ApiClient.js').ApiClient} client
 * @param {(...args:any[])=>void} log
 */
export async function runPersonsExample(client, log = console.log) {
  const api = new ApiPerson(client);
  log('— Persons —');

  // CREATE — zwraca PersonNode z wygenerowanym UUID
  const alice = await api.create({
    nick: 'alice', firstName: 'Alicja', secondName: 'Kowalska', description: 'QA',
  });
  log('created:', alice.id, '->', alice.getDisplayName(), '| initials:', alice.getInitials());

  // LIST — PersonNode[]
  log('list count:', (await api.list()).length);

  // GET
  const fetched = await api.get(alice.id);
  log('get:', fetched?.getDisplayName(), '| fullName:', fetched?.getFullName());

  // UPDATE (patch)
  const updated = await api.update(alice.id, { description: 'QA Lead' });
  log('updated description:', updated?.description);

  // wyszukiwanie lokalne na węzłach
  const matches = (await api.list()).filter((p) => p.matches('ali'));
  log('matches "ali":', matches.map((p) => p.getDisplayName()));

  // REMOVE
  const removed = await api.remove(alice.id);
  log('removed:', removed, '| count now:', (await api.list()).length);

  return alice;
}
