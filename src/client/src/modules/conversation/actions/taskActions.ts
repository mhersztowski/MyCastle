/**
 * Akcje konwersacyjne - zarządzanie taskami
 */

import { DataSource } from '../../filesystem/data/DataSource';
import { mqttClient } from '../../mqttclient';
import { TaskModel } from '../../filesystem/models/TaskModel';
import { actionRegistry } from './ActionRegistry';
import { v4 as uuidv4 } from 'uuid';

const TASKS_PATH = 'data/tasks.json';

export function registerTaskActions(dataSource: DataSource): void {
  actionRegistry.register({
    name: 'list_tasks',
    description: 'Lista wszystkich tasków. Opcjonalnie filtruj po nazwie.',
    category: 'tasks',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Opcjonalny filtr wyszukiwania po nazwie' },
      },
    },
    handler: async (params) => {
      const query = params.query as string | undefined;
      const tasks = query ? dataSource.findTasks(query) : dataSource.tasks;
      return tasks.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        projectId: t.projectId,
      }));
    },
  });

  actionRegistry.register({
    name: 'get_task',
    description: 'Pobierz szczegóły taska po jego ID.',
    category: 'tasks',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID taska' },
      },
      required: ['id'],
    },
    handler: async (params) => {
      const task = dataSource.getTaskById(params.id as string);
      if (!task) return { error: 'Task nie znaleziony' };
      return task.toModel();
    },
  });

  actionRegistry.register({
    name: 'create_task',
    description: 'Utwórz nowy task.',
    category: 'tasks',
    confirmation: true,
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nazwa taska' },
        description: { type: 'string', description: 'Opis taska' },
        projectId: { type: 'string', description: 'ID projektu (opcjonalny)' },
      },
      required: ['name'],
    },
    handler: async (params) => {
      const newTask: TaskModel = {
        type: 'task',
        id: uuidv4(),
        name: params.name as string,
        description: params.description as string | undefined,
        projectId: params.projectId as string | undefined,
      };
      const tasks = dataSource.tasks.map(t => t.toModel());
      tasks.push(newTask);
      const data = { type: 'tasks', tasks };
      await mqttClient.writeFile(TASKS_PATH, JSON.stringify(data, null, 2));
      return { success: true, task: newTask };
    },
  });

  actionRegistry.register({
    name: 'update_task',
    description: 'Zaktualizuj istniejący task.',
    category: 'tasks',
    confirmation: true,
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID taska do aktualizacji' },
        name: { type: 'string', description: 'Nowa nazwa' },
        description: { type: 'string', description: 'Nowy opis' },
      },
      required: ['id'],
    },
    handler: async (params) => {
      const task = dataSource.getTaskById(params.id as string);
      if (!task) return { error: 'Task nie znaleziony' };

      const tasks = dataSource.tasks.map(t => {
        const model = t.toModel();
        if (model.id === params.id) {
          if (params.name !== undefined) model.name = params.name as string;
          if (params.description !== undefined) model.description = params.description as string;
        }
        return model;
      });
      const data = { type: 'tasks', tasks };
      await mqttClient.writeFile(TASKS_PATH, JSON.stringify(data, null, 2));
      return { success: true };
    },
  });

  actionRegistry.register({
    name: 'delete_task',
    description: 'Usuń task po ID.',
    category: 'tasks',
    confirmation: true,
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID taska do usunięcia' },
      },
      required: ['id'],
    },
    handler: async (params) => {
      const task = dataSource.getTaskById(params.id as string);
      if (!task) return { error: 'Task nie znaleziony' };

      const tasks = dataSource.tasks
        .map(t => t.toModel())
        .filter(t => t.id !== params.id);
      const data = { type: 'tasks', tasks };
      await mqttClient.writeFile(TASKS_PATH, JSON.stringify(data, null, 2));
      return { success: true, deletedId: params.id };
    },
  });

  actionRegistry.register({
    name: 'search_tasks',
    description: 'Wyszukaj taski po frazie.',
    category: 'tasks',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Fraza wyszukiwania' },
      },
      required: ['query'],
    },
    handler: async (params) => {
      const tasks = dataSource.findTasks(params.query as string);
      return tasks.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        projectId: t.projectId,
      }));
    },
  });
}
