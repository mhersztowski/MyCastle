import { PersonNode } from '../PersonNode.js';

/**
 * ApiPerson — CRUD osób na serwerze.
 *
 * Backend: plik `data/persons.json` w formacie { type: 'persons', items: PersonModel[] }
 * (tolerujemy też legacy gołą tablicę). Metody zwracają PersonNode.
 *
 *   const api = new ApiPerson(client);
 *   const list = await api.list();
 *   const p = await api.create({ nick: 'mh', firstName: 'Marcin' });
 *   await api.update(p.id, { description: '...' });
 *   await api.remove(p.id);
 */
const PERSONS_PATH = 'data/persons.json';

export class ApiPerson {
  constructor(client) { this.client = client; }

  async _load() {
    const data = await this.client.readJson(PERSONS_PATH, { type: 'persons', items: [] });
    if (Array.isArray(data)) return data; // legacy bare array
    return Array.isArray(data?.items) ? data.items : [];
  }
  async _save(items) {
    return this.client.writeJson(PERSONS_PATH, { type: 'persons', items });
  }

  /** @returns {Promise<PersonNode[]>} */
  async list() { return PersonNode.fromModels(await this._load()); }

  /** @returns {Promise<PersonNode|null>} */
  async get(id) {
    const items = await this._load();
    const m = items.find((p) => p.id === id);
    return m ? PersonNode.fromModel(m) : null;
  }

  /** @returns {Promise<PersonNode>} */
  async create(model) {
    const items = await this._load();
    const person = {
      type: 'person',
      id: model.id ?? crypto.randomUUID(),
      nick: model.nick,
      firstName: model.firstName,
      secondName: model.secondName,
      description: model.description,
    };
    items.push(person);
    await this._save(items);
    return PersonNode.fromModel(person);
  }

  /** Aktualizacja częściowa (patch). @returns {Promise<PersonNode|null>} */
  async update(id, patch) {
    const items = await this._load();
    const idx = items.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], ...patch, type: 'person', id };
    await this._save(items);
    return PersonNode.fromModel(items[idx]);
  }

  /** @returns {Promise<boolean>} czy coś usunięto */
  async remove(id) {
    const items = await this._load();
    const next = items.filter((p) => p.id !== id);
    if (next.length === items.length) return false;
    await this._save(next);
    return true;
  }

  /** Nadpisanie całej listy (przyjmuje PersonNode[] lub PersonModel[]). */
  async save(personsOrNodes) {
    const items = personsOrNodes.map((p) => (typeof p.toModel === 'function' ? p.toModel() : p));
    await this._save(items);
    return true;
  }
}
