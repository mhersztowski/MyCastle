/**
 * @mhersztowski/core — przeglądarkowe klasy API (vanilla ES).
 *
 * Klienty wywołujące operacje serwera (VFS REST) na danych PIM użytkownika.
 * Wszystkie operują na plikach JSON pod `data/Minis/Users/{userName}/` i zwracają
 * węzły (PersonNode/ProjectNode/TaskNode/EventNode).
 *
 *   import { ApiClient, ApiPerson, ApiProject, ApiTask, ApiEvent } from './api/index.js';
 *   const client = new ApiClient({ userName: 'marcin', token });
 *   const persons = new ApiPerson(client);
 *   await persons.create({ nick: 'mh' });
 */
export { ApiClient } from './ApiClient.js';
export { ApiPerson } from './ApiPerson.js';
export { ApiProject } from './ApiProject.js';
export { ApiTask } from './ApiTask.js';
export { ApiEvent } from './ApiEvent.js';
