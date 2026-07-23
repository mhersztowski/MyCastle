/**
 * Anulowanie/przywracanie pojedynczego wystąpienia eventu (dla eventów powtarzalnych).
 * Anulowane wystąpienia NIE są usuwane z kalendarza — pozostają widoczne (wyszarzone),
 * a `EventNode.isCancelledOn(day)` pozwala je odróżnić. Zapis idzie do pliku dnia STARTU
 * eventu (`data/calendar/{Y}/{M}/{D}.json`), spójnie z resztą kalendarza.
 */
import { Dayjs } from 'dayjs';
import type { EventNode } from '@mhersztowski/core';
import type { EventsModel } from '@mhersztowski/core';

export async function setOccurrenceCancelled(
  writeFile: (path: string, content: string) => Promise<unknown>,
  events: EventNode[],
  event: EventNode,
  date: Dayjs,
  cancel: boolean,
): Promise<void> {
  const startDate = event.getStartDate();
  if (!startDate) return;
  const dateStr = startDate.format('YYYY-MM-DD');
  const [year, month, day] = dateStr.split('-');
  const filePath = `data/calendar/${year}/${month}/${day}.json`;
  const key = date.format('YYYY-MM-DD');

  const dayEvents = events.filter((e) => {
    const d = e.getStartDate();
    return d && d.format('YYYY-MM-DD') === dateStr;
  });
  const model: EventsModel = {
    type: 'events',
    tasks: dayEvents.map((e) => {
      const m = e.toModel();
      if (e === event) {
        const set = new Set(m.exceptions ?? []);
        if (cancel) set.add(key); else set.delete(key);
        m.exceptions = set.size ? [...set] : undefined;
      }
      return m;
    }),
  };
  await writeFile(filePath, JSON.stringify(model, null, 2));
}
