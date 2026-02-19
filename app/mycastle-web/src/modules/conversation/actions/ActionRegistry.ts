/**
 * ActionRegistry - rejestr akcji konwersacyjnych
 */

import { AiToolDefinition } from '../../ai/models/AiModels';
import { ConversationAction, ConversationActionCategory } from '../models/ConversationModels';

export class ActionRegistry {
  private actions: Map<string, ConversationAction> = new Map();

  register(action: ConversationAction): void {
    this.actions.set(action.name, action);
  }

  unregister(name: string): void {
    this.actions.delete(name);
  }

  get(name: string): ConversationAction | undefined {
    return this.actions.get(name);
  }

  getAll(): ConversationAction[] {
    return Array.from(this.actions.values());
  }

  getByCategory(category: ConversationActionCategory): ConversationAction[] {
    return this.getAll().filter(a => a.category === category);
  }

  clear(): void {
    this.actions.clear();
  }

  toToolDefinitions(categories?: ConversationActionCategory[]): AiToolDefinition[] {
    let actions = this.getAll();
    if (categories?.length) {
      actions = actions.filter(a => categories.includes(a.category));
    }
    return actions.map(a => ({
      type: 'function' as const,
      function: {
        name: a.name,
        description: a.description,
        parameters: a.parameters,
      },
    }));
  }

  async execute(name: string, params: Record<string, unknown>): Promise<unknown> {
    const action = this.actions.get(name);
    if (!action) {
      throw new Error(`Action not found: ${name}`);
    }
    return action.handler(params);
  }
}

export const actionRegistry = new ActionRegistry();
