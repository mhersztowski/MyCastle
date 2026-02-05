/**
 * Akcje konwersacyjne - operacje na plikach
 */

import { mqttClient } from '../../mqttclient';
import { actionRegistry } from './ActionRegistry';

export function registerFileActions(): void {
  actionRegistry.register({
    name: 'read_file',
    description: 'Odczytaj zawartość pliku.',
    category: 'files',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Ścieżka do pliku' },
      },
      required: ['path'],
    },
    handler: async (params) => {
      const file = await mqttClient.readFile(params.path as string);
      if (!file?.content) return { error: 'Plik nie znaleziony lub pusty' };
      return { path: params.path, content: file.content };
    },
  });

  actionRegistry.register({
    name: 'write_file',
    description: 'Zapisz zawartość do pliku.',
    category: 'files',
    confirmation: true,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Ścieżka do pliku' },
        content: { type: 'string', description: 'Zawartość do zapisania' },
      },
      required: ['path', 'content'],
    },
    handler: async (params) => {
      await mqttClient.writeFile(params.path as string, params.content as string);
      return { success: true, path: params.path };
    },
  });

  actionRegistry.register({
    name: 'list_directory',
    description: 'Wylistuj zawartość katalogu.',
    category: 'files',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Ścieżka do katalogu' },
      },
      required: ['path'],
    },
    handler: async (params) => {
      const tree = await mqttClient.listDirectory(params.path as string);
      const items = tree.children?.map(c => ({
        name: c.name,
        type: c.children ? 'directory' : 'file',
      })) || [];
      return { path: params.path, items };
    },
  });
}
