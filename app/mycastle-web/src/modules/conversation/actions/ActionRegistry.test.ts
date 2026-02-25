import { ActionRegistry } from './ActionRegistry';
import { ConversationAction, ConversationActionCategory } from '../models/ConversationModels';

function createAction(overrides: Partial<ConversationAction> = {}): ConversationAction {
  return {
    name: 'test_action',
    description: 'A test action',
    category: 'tasks',
    parameters: { type: 'object', properties: { id: { type: 'string' } } },
    handler: vi.fn().mockResolvedValue('ok'),
    ...overrides,
  };
}

describe('ActionRegistry', () => {
  let registry: ActionRegistry;

  beforeEach(() => {
    registry = new ActionRegistry();
  });

  describe('register / get', () => {
    it('should register and retrieve an action by name', () => {
      const action = createAction({ name: 'add_task' });
      registry.register(action);

      expect(registry.get('add_task')).toBe(action);
    });

    it('should return undefined for an unregistered action', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('unregister', () => {
    it('should remove a previously registered action', () => {
      const action = createAction({ name: 'remove_me' });
      registry.register(action);
      expect(registry.get('remove_me')).toBe(action);

      registry.unregister('remove_me');
      expect(registry.get('remove_me')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all registered actions', () => {
      const a1 = createAction({ name: 'a1', category: 'tasks' });
      const a2 = createAction({ name: 'a2', category: 'calendar' });
      registry.register(a1);
      registry.register(a2);

      const all = registry.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContain(a1);
      expect(all).toContain(a2);
    });

    it('should return an empty array when no actions are registered', () => {
      expect(registry.getAll()).toEqual([]);
    });
  });

  describe('getByCategory', () => {
    it('should return only actions matching the given category', () => {
      const task1 = createAction({ name: 'task1', category: 'tasks' });
      const task2 = createAction({ name: 'task2', category: 'tasks' });
      const cal = createAction({ name: 'cal1', category: 'calendar' });
      registry.register(task1);
      registry.register(task2);
      registry.register(cal);

      const tasks = registry.getByCategory('tasks');
      expect(tasks).toHaveLength(2);
      expect(tasks).toContain(task1);
      expect(tasks).toContain(task2);
    });

    it('should return an empty array when no actions match the category', () => {
      registry.register(createAction({ name: 'a', category: 'tasks' }));

      expect(registry.getByCategory('navigation')).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should remove all registered actions', () => {
      registry.register(createAction({ name: 'a1' }));
      registry.register(createAction({ name: 'a2' }));
      expect(registry.getAll()).toHaveLength(2);

      registry.clear();
      expect(registry.getAll()).toEqual([]);
    });
  });

  describe('toToolDefinitions', () => {
    it('should convert all actions to AiToolDefinition format', () => {
      const params = { type: 'object', properties: { title: { type: 'string' } } };
      registry.register(createAction({
        name: 'create_task',
        description: 'Creates a task',
        category: 'tasks',
        parameters: params,
      }));

      const defs = registry.toToolDefinitions();
      expect(defs).toHaveLength(1);
      expect(defs[0]).toEqual({
        type: 'function',
        function: {
          name: 'create_task',
          description: 'Creates a task',
          parameters: params,
        },
      });
    });

    it('should filter by the provided categories', () => {
      registry.register(createAction({ name: 'task_action', category: 'tasks' }));
      registry.register(createAction({ name: 'cal_action', category: 'calendar' }));
      registry.register(createAction({ name: 'nav_action', category: 'navigation' }));

      const defs = registry.toToolDefinitions(['tasks', 'navigation']);
      expect(defs).toHaveLength(2);

      const names = defs.map(d => d.function.name);
      expect(names).toContain('task_action');
      expect(names).toContain('nav_action');
    });

    it('should return an empty array when no actions match the category filter', () => {
      registry.register(createAction({ name: 'a', category: 'tasks' }));

      expect(registry.toToolDefinitions(['shopping'])).toEqual([]);
    });
  });

  describe('execute', () => {
    it('should call the action handler with the given params and return its result', async () => {
      const handler = vi.fn().mockResolvedValue({ id: '123', title: 'Done' });
      registry.register(createAction({ name: 'do_thing', handler }));

      const params = { title: 'Done' };
      const result = await registry.execute('do_thing', params);

      expect(handler).toHaveBeenCalledWith(params);
      expect(result).toEqual({ id: '123', title: 'Done' });
    });

    it('should throw an error for an unknown action', async () => {
      await expect(registry.execute('unknown', {}))
        .rejects.toThrow('Action not found: unknown');
    });

    it('should propagate errors thrown by the handler', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('handler failed'));
      registry.register(createAction({ name: 'failing', handler }));

      await expect(registry.execute('failing', {}))
        .rejects.toThrow('handler failed');
    });
  });
});
