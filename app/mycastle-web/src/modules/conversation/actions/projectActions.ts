/**
 * Akcje konwersacyjne - projekty
 */

import { DataSource } from '../../filesystem/data/DataSource';
import { actionRegistry } from './ActionRegistry';

export function registerProjectActions(dataSource: DataSource): void {
  actionRegistry.register({
    name: 'list_projects',
    description: 'Lista wszystkich projektów. Opcjonalnie filtruj po nazwie.',
    category: 'projects',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Opcjonalny filtr wyszukiwania' },
      },
    },
    handler: async (params) => {
      const query = params.query as string | undefined;
      const projects = query ? dataSource.findProjects(query) : dataSource.projects;
      return projects.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
      }));
    },
  });

  actionRegistry.register({
    name: 'get_project',
    description: 'Pobierz szczegóły projektu po ID.',
    category: 'projects',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID projektu' },
      },
      required: ['id'],
    },
    handler: async (params) => {
      const project = dataSource.getProjectById(params.id as string);
      if (!project) return { error: 'Projekt nie znaleziony' };
      return project.toModel();
    },
  });
}
