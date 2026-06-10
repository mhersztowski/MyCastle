/**
 * @mhersztowski/core — przeglądarkowe (vanilla ES) klasy węzłów.
 *
 * Czysty JS, bez TypeScriptu i bez builda. Import wprost w przeglądarce:
 *
 *   import { PersonNode, ProjectNode, TaskNode, EventNode } from './browser/index.js';
 *
 * Klasy są wzorowane 1:1 na nodach z `packages/core/src/nodes/` (PersonNode,
 * ProjectNode, TaskNode, EventNode + bazowy NodeBase). Jedyna różnica: EventNode
 * używa natywnego Date zamiast dayjs, żeby moduł był wolny od zależności.
 */
export { NodeBase } from './NodeBase.js';
export { PersonNode } from './PersonNode.js';
export { ProjectNode } from './ProjectNode.js';
export { TaskNode } from './TaskNode.js';
export { EventNode } from './EventNode.js';

// Klienty API serwera (VFS REST) — patrz ./api/
export { ApiClient, ApiPerson, ApiProject, ApiTask, ApiEvent } from './api/index.js';
