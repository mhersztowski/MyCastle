import { EntityRegistry } from '../entity/EntityRegistry';
import type { Entity, EntityInput } from '../entity/types';
import { EventBus } from '../events/EventBus';
import { HistoryManager } from '../history/HistoryManager';
import type { Layer } from '../layer/Layer';
import { LayerSystem } from '../layer/LayerSystem';
import { SelectionManager } from '../selection/SelectionManager';
import { SnapEngine } from '../snap/SnapEngine';
import type { Units, ViewMode } from '../types';

export interface ProjectSettings {
  name: string;
  units: Units;
  gridSize: number;
  precision: number;
}

export interface ProjectData {
  version: string;
  settings: ProjectSettings;
  layers: { layers: Layer[]; activeId: string };
  entities: Entity[];
}

const DEFAULT_SETTINGS: ProjectSettings = {
  name: 'Untitled',
  units: 'mm',
  gridSize: 10,
  precision: 2,
};

export class Project {
  readonly entityRegistry = new EntityRegistry();
  readonly layerSystem = new LayerSystem();
  readonly historyManager = new HistoryManager();
  readonly selectionManager: SelectionManager;
  readonly snapEngine = new SnapEngine();
  readonly eventBus = new EventBus();

  settings: ProjectSettings = { ...DEFAULT_SETTINGS };
  viewMode: ViewMode = '2d';

  constructor() {
    this.selectionManager = new SelectionManager(this.entityRegistry);
    this.snapEngine.setGridSize(this.settings.gridSize);
  }

  // --- Entity operations (go through history) ---

  addEntity(input: EntityInput): Entity {
    const layerId = input.layerId || this.layerSystem.getActiveId();
    const entity = this.entityRegistry.add({ ...input, layerId });

    this.historyManager.push({
      type: 'add-entity',
      description: `Add ${entity.type}`,
      undo: () => {
        this.entityRegistry.remove(entity.id);
        this.selectionManager.deselect(entity.id);
        this.eventBus.emit('entity:removed', { id: entity.id });
      },
      redo: () => {
        this.entityRegistry.addWithId(entity);
        this.eventBus.emit('entity:added', entity);
      },
    });

    this.eventBus.emit('entity:added', entity);
    return entity;
  }

  removeEntity(id: string): void {
    const entity = this.entityRegistry.get(id);
    if (!entity) return;

    this.entityRegistry.remove(id);
    this.selectionManager.deselect(id);

    this.historyManager.push({
      type: 'remove-entity',
      description: `Remove ${entity.type}`,
      undo: () => {
        this.entityRegistry.addWithId(entity);
        this.eventBus.emit('entity:added', entity);
      },
      redo: () => {
        this.entityRegistry.remove(id);
        this.selectionManager.deselect(id);
        this.eventBus.emit('entity:removed', { id });
      },
    });

    this.eventBus.emit('entity:removed', { id });
  }

  updateEntity(id: string, changes: Partial<Entity>): void {
    const before = this.entityRegistry.get(id);
    if (!before) return;
    const after = this.entityRegistry.update(id, changes);
    if (!after) return;

    this.historyManager.push({
      type: 'update-entity',
      description: `Update ${before.type}`,
      undo: () => {
        this.entityRegistry.update(id, before);
        this.eventBus.emit('entity:updated', before);
      },
      redo: () => {
        this.entityRegistry.update(id, after);
        this.eventBus.emit('entity:updated', after);
      },
    });

    this.eventBus.emit('entity:updated', after);
  }

  batchUpdate(operations: Array<{ id: string; changes: Partial<Entity> }>, description = 'Batch update'): void {
    const befores: Entity[] = [];
    const afters: Entity[] = [];

    for (const op of operations) {
      const before = this.entityRegistry.get(op.id);
      if (!before) continue;
      const after = this.entityRegistry.update(op.id, op.changes);
      if (!after) continue;
      befores.push(before);
      afters.push(after);
      this.eventBus.emit('entity:updated', after);
    }

    if (befores.length === 0) return;

    this.historyManager.push({
      type: 'batch-update',
      description,
      undo: () => {
        for (const before of befores) {
          this.entityRegistry.update(before.id, before);
          this.eventBus.emit('entity:updated', before);
        }
      },
      redo: () => {
        for (const after of afters) {
          this.entityRegistry.update(after.id, after);
          this.eventBus.emit('entity:updated', after);
        }
      },
    });
  }

  batchAdd(inputs: EntityInput[], description = 'Copy entities'): Entity[] {
    const entities: Entity[] = [];

    for (const input of inputs) {
      const layerId = input.layerId || this.layerSystem.getActiveId();
      const entity = this.entityRegistry.add({ ...input, layerId });
      entities.push(entity);
      this.eventBus.emit('entity:added', entity);
    }

    if (entities.length === 0) return [];

    this.historyManager.push({
      type: 'batch-add',
      description,
      undo: () => {
        for (const e of entities) {
          this.entityRegistry.remove(e.id);
          this.selectionManager.deselect(e.id);
          this.eventBus.emit('entity:removed', { id: e.id });
        }
      },
      redo: () => {
        for (const e of entities) {
          this.entityRegistry.addWithId(e);
          this.eventBus.emit('entity:added', e);
        }
      },
    });

    return entities;
  }

  removeSelected(): void {
    const ids = this.selectionManager.getSelected();
    const entities = ids.map(id => this.entityRegistry.get(id)).filter(Boolean) as Entity[];
    if (entities.length === 0) return;

    for (const e of entities) {
      this.entityRegistry.remove(e.id);
      this.selectionManager.deselect(e.id);
    }

    this.historyManager.push({
      type: 'remove-entities',
      description: `Remove ${entities.length} entity/entities`,
      undo: () => {
        for (const e of entities) {
          this.entityRegistry.addWithId(e);
          this.eventBus.emit('entity:added', e);
        }
      },
      redo: () => {
        for (const e of entities) {
          this.entityRegistry.remove(e.id);
          this.selectionManager.deselect(e.id);
          this.eventBus.emit('entity:removed', { id: e.id });
        }
      },
    });

    for (const e of entities) {
      this.eventBus.emit('entity:removed', { id: e.id });
    }
    this.eventBus.emit('selection:changed', []);
  }

  undo(): void {
    const op = this.historyManager.undo();
    if (op) this.eventBus.emit('history:changed', this.historyManager.getDescription());
  }

  redo(): void {
    const op = this.historyManager.redo();
    if (op) this.eventBus.emit('history:changed', this.historyManager.getDescription());
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
    this.eventBus.emit('viewmode:changed', mode);
  }

  // --- Serialization ---

  toJSON(): ProjectData {
    return {
      version: '1.0.0',
      settings: { ...this.settings },
      layers: this.layerSystem.toData(),
      entities: this.entityRegistry.toData(),
    };
  }

  static fromJSON(data: ProjectData): Project {
    const project = new Project();
    project.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    project.layerSystem.fromData(data.layers);
    project.entityRegistry.fromData(data.entities);
    project.snapEngine.setGridSize(project.settings.gridSize);
    return project;
  }

  reset(): void {
    this.entityRegistry.clear();
    this.layerSystem.clear();
    this.historyManager.clear();
    this.selectionManager.clear();
    this.settings = { ...DEFAULT_SETTINGS };
    this.eventBus.emit('project:loaded', null);
  }
}
