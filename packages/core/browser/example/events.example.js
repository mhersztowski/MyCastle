import { ApiEvent } from '../api/ApiEvent.js';

/**
 * Przykład: wydarzenia kalendarza (per dzień).
 * @param {import('../api/ApiClient.js').ApiClient} client
 * @param {(...args:any[])=>void} log
 */
export async function runEventsExample(client, log = console.log) {
  const events = new ApiEvent(client);
  const day = '2026-06-12';
  log('— Events —');

  // dodawanie do konkretnego dnia
  await events.add(day, { name: 'Standup', startTime: `${day}T09:00:00`, endTime: `${day}T09:15:00` });
  await events.add(day, { name: 'Spotkanie', startTime: `${day}T10:00:00`, endTime: `${day}T11:30:00` });

  // lista dnia — EventNode[]
  const todays = await events.listByDate(day);
  log('events on', day, ':', todays.map((e) => `${e.name} ${e.getTimeRange()} (${e.getDurationFormatted()})`));

  // sortowanie po czasie
  const sorted = todays.sort((a, b) => a.compareTo(b));
  log('first:', sorted[0]?.name);

  // usuwanie po predykacie (EventModel nie ma id)
  const removed = await events.remove(day, (e) => e.name === 'Standup');
  log('removed standup:', removed, '| remaining:', (await events.listByDate(day)).length);

  // wyczyszczenie całego dnia
  await events.clearDay(day);
  log('day cleared. events:', (await events.listByDate(day)).length);
}
