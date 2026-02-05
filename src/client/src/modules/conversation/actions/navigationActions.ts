/**
 * Akcje konwersacyjne - nawigacja po aplikacji
 */

import { NavigateFunction } from 'react-router-dom';
import { actionRegistry } from './ActionRegistry';

const AVAILABLE_PAGES = [
  { path: '/agent', name: 'Castle Agent', description: 'Głosowy asystent AI' },
  { path: '/todolist', name: 'Lista zadań', description: 'Widok tasków do zrobienia' },
  { path: '/calendar', name: 'Kalendarz', description: 'Widok kalendarza' },
  { path: '/person', name: 'Osoby', description: 'Zarządzanie osobami' },
  { path: '/project', name: 'Projekty', description: 'Zarządzanie projektami' },
  { path: '/filesystem/list', name: 'Pliki', description: 'Przeglądarka plików' },
  { path: '/automate', name: 'Automatyzacje', description: 'Lista flow automatyzacji' },
  { path: '/objectviewer', name: 'Object Viewer', description: 'Przeszukiwanie obiektów' },
  { path: '/settings/ai', name: 'Ustawienia AI', description: 'Konfiguracja providera AI' },
  { path: '/settings/speech', name: 'Ustawienia Speech', description: 'Konfiguracja TTS/STT' },
];

export function registerNavigationActions(navigate: NavigateFunction): void {
  actionRegistry.register({
    name: 'navigate_to',
    description: 'Nawiguj do strony w aplikacji. Dostępne ścieżki: /agent, /todolist, /calendar, /person, /project, /filesystem/list, /automate, /objectviewer, /settings/ai, /settings/speech, /editor/simple/{path}, /viewer/md/{path}, /designer/ui/{id}, /designer/automate/{id}',
    category: 'navigation',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Ścieżka strony np. /calendar lub /todolist' },
      },
      required: ['path'],
    },
    handler: async (params) => {
      const path = params.path as string;
      navigate(path);
      return { success: true, navigatedTo: path };
    },
  });

  actionRegistry.register({
    name: 'get_available_pages',
    description: 'Zwróć listę dostępnych stron w aplikacji.',
    category: 'navigation',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      return AVAILABLE_PAGES;
    },
  });
}
