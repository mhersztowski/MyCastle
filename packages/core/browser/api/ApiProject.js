import { ProjectNode } from '../ProjectNode.js';

/**
 * ApiProject — CRUD projektów na serwerze.
 *
 * Backend: plik `data/projects.json` w formacie { type: 'projects', projects: ProjectModel[] }.
 * Projekty są przechowywane „płasko" (zadania osobno w tasks.json, linkowane przez projectId).
 * Metody zwracają ProjectNode.
 */
const PROJECTS_PATH = 'data/projects.json';

export class ApiProject {
  constructor(client) { this.client = client; }

  async _load() {
    const data = await this.client.readJson(PROJECTS_PATH, { type: 'projects', projects: [] });
    if (Array.isArray(data)) return data;
    return Array.isArray(data?.projects) ? data.projects : [];
  }
  async _save(projects) {
    return this.client.writeJson(PROJECTS_PATH, { type: 'projects', projects });
  }

  /** @returns {Promise<ProjectNode[]>} */
  async list() { return ProjectNode.fromModels(await this._load()); }

  /** @returns {Promise<ProjectNode|null>} */
  async get(id) {
    const items = await this._load();
    const m = items.find((p) => p.id === id);
    return m ? ProjectNode.fromModel(m) : null;
  }

  /** @returns {Promise<ProjectNode>} */
  async create(model) {
    const items = await this._load();
    const project = {
      type: 'project',
      id: model.id ?? crypto.randomUUID(),
      name: model.name ?? '',
      description: model.description ?? '',
      cost: model.cost,
      components: model.components,
    };
    items.push(project);
    await this._save(items);
    return ProjectNode.fromModel(project);
  }

  /** @returns {Promise<ProjectNode|null>} */
  async update(id, patch) {
    const items = await this._load();
    const idx = items.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], ...patch, type: 'project', id };
    await this._save(items);
    return ProjectNode.fromModel(items[idx]);
  }

  /** @returns {Promise<boolean>} */
  async remove(id) {
    const items = await this._load();
    const next = items.filter((p) => p.id !== id);
    if (next.length === items.length) return false;
    await this._save(next);
    return true;
  }

  /** Nadpisanie całej listy (ProjectNode[] lub ProjectModel[]). */
  async save(projectsOrNodes) {
    const items = projectsOrNodes.map((p) => (typeof p.toModel === 'function' ? p.toModel() : p));
    await this._save(items);
    return true;
  }
}
