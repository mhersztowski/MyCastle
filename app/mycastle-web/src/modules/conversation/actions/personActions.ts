/**
 * Akcje konwersacyjne - osoby
 */

import { DataSource } from '../../filesystem/data/DataSource';
import { actionRegistry } from './ActionRegistry';

export function registerPersonActions(dataSource: DataSource): void {
  actionRegistry.register({
    name: 'list_persons',
    description: 'Lista wszystkich osób. Opcjonalnie filtruj po nazwie.',
    category: 'persons',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Opcjonalny filtr wyszukiwania' },
      },
    },
    handler: async (params) => {
      const query = params.query as string | undefined;
      const persons = query ? dataSource.findPersons(query) : dataSource.persons;
      return persons.map(p => ({
        id: p.id,
        nick: p.nick,
        firstName: p.firstName,
        secondName: p.secondName,
      }));
    },
  });

  actionRegistry.register({
    name: 'get_person',
    description: 'Pobierz szczegóły osoby po ID.',
    category: 'persons',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID osoby' },
      },
      required: ['id'],
    },
    handler: async (params) => {
      const person = dataSource.getPersonById(params.id as string);
      if (!person) return { error: 'Osoba nie znaleziona' };
      return person.toModel();
    },
  });
}
