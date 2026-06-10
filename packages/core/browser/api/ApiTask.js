import { TaskNode } from '../TaskNode.js';

/**
 * ApiTask — CRUD zadań na serwerze.
 *
 * Backend: plik `data/tasks.json` w formacie { type: 'tasks', tasks: TaskModel[] }.
 * Zadania linkują się do projektu przez pole `projectId`. Metody zwracają TaskNode.
 */
const TASKS_PATH = 'data/tasks.json';

export class ApiTask {
  constructor(client) { this.client = client; }

  async _load() {
    const data = await this.client.readJson(TASKS_PATH, { type: 'tasks', tasks: [] });
    if (Array.isArray(data)) return data;
    return Array.isArray(data?.tasks) ? data.tasks : [];
  }
  async _save(tasks) {
    return this.client.writeJson(TASKS_PATH, { type: 'tasks', tasks });
  }

  /** @returns {Promise<TaskNode[]>} */
  async list() { return TaskNode.fromModels(await this._load()); }

  /** Zadania danego projektu. @returns {Promise<TaskNode[]>} */
  async listByProject(projectId) {
    const items = await this._load();
    return TaskNode.fromModels(items.filter((t) => t.projectId === projectId));
  }

  /** @returns {Promise<TaskNode|null>} */
  async get(id) {
    const items = await this._load();
    const m = items.find((t) => t.id === id);
    return m ? TaskNode.fromModel(m) : null;
  }

  /** @returns {Promise<TaskNode>} */
  async create(model) {
    const items = await this._load();
    const task = {
      type: 'task',
      id: model.id ?? crypto.randomUUID(),
      projectId: model.projectId,
      name: model.name ?? '',
      description: model.description,
      duration: model.duration,
      cost: model.cost,
      components: model.components,
    };
    items.push(task);
    await this._save(items);
    return TaskNode.fromModel(task);
  }

  /** @returns {Promise<TaskNode|null>} */
  async update(id, patch) {
    const items = await this._load();
    const idx = items.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], ...patch, type: 'task', id };
    await this._save(items);
    return TaskNode.fromModel(items[idx]);
  }

  /** @returns {Promise<boolean>} */
  async remove(id) {
    const items = await this._load();
    const next = items.filter((t) => t.id !== id);
    if (next.length === items.length) return false;
    await this._save(next);
    return true;
  }

  /** Nadpisanie całej listy (TaskNode[] lub TaskModel[]). */
  async save(tasksOrNodes) {
    const items = tasksOrNodes.map((t) => (typeof t.toModel === 'function' ? t.toModel() : t));
    await this._save(items);
    return true;
  }
}
