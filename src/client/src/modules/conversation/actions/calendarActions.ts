/**
 * Akcje konwersacyjne - kalendarz
 */

import { DataSource } from '../../filesystem/data/DataSource';
import { actionRegistry } from './ActionRegistry';

export function registerCalendarActions(dataSource: DataSource): void {
  actionRegistry.register({
    name: 'list_events_today',
    description: 'Lista dzisiejszych wydarzeń z kalendarza.',
    category: 'calendar',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      const events = dataSource.getEventsByDate(new Date());
      return events.map(e => ({
        name: e.name,
        startTime: e.startTime,
        endTime: e.endTime,
        taskId: e.taskId,
      }));
    },
  });

  actionRegistry.register({
    name: 'list_events_date',
    description: 'Lista wydarzeń na podaną datę.',
    category: 'calendar',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Data w formacie YYYY-MM-DD' },
      },
      required: ['date'],
    },
    handler: async (params) => {
      const date = new Date(params.date as string);
      const events = dataSource.getEventsByDate(date);
      return events.map(e => ({
        name: e.name,
        startTime: e.startTime,
        endTime: e.endTime,
        taskId: e.taskId,
      }));
    },
  });

  actionRegistry.register({
    name: 'search_events',
    description: 'Wyszukaj wydarzenia po frazie.',
    category: 'calendar',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Fraza wyszukiwania' },
      },
      required: ['query'],
    },
    handler: async (params) => {
      const events = dataSource.findEvents(params.query as string);
      return events.map(e => ({
        name: e.name,
        startTime: e.startTime,
        endTime: e.endTime,
        taskId: e.taskId,
      }));
    },
  });
}
