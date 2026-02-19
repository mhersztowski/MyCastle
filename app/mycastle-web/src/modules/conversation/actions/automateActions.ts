/**
 * Akcje konwersacyjne - automatyzacje
 */

import { DataSource } from '../../filesystem/data/DataSource';
import { automateService, AutomateEngine } from '../../automate';
import { actionRegistry } from './ActionRegistry';
import { mqttClient } from '../../mqttclient';

export function registerAutomateActions(dataSource: DataSource): void {
  actionRegistry.register({
    name: 'list_flows',
    description: 'Lista dostępnych flow automatyzacji.',
    category: 'automate',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      const flows = automateService.getAllFlows();
      return flows.map(f => ({
        id: f.id,
        name: f.name,
        description: f.description,
        runtime: f.runtime || 'client',
      }));
    },
  });

  actionRegistry.register({
    name: 'run_flow',
    description: 'Uruchom flow automatyzacji po ID.',
    category: 'automate',
    confirmation: true,
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID flow do uruchomienia' },
      },
      required: ['id'],
    },
    handler: async (params) => {
      const flowNode = automateService.getFlowById(params.id as string);
      if (!flowNode) return { error: 'Flow nie znaleziony' };

      const flow = flowNode.toModel();

      if (flow.runtime === 'backend' || flow.runtime === 'universal') {
        // Execute on backend via MQTT
        const result = await mqttClient.runAutomateFlow(flow.id) as {
          success: boolean;
          logs: Array<{ level: string; message: string }>;
          notifications: Array<{ message: string }>;
          error?: string;
        };
        return {
          success: result.success,
          logs: result.logs?.map(l => `[${l.level}] ${l.message}`) || [],
          notifications: result.notifications?.map(n => n.message) || [],
          error: result.error,
        };
      }

      // Local execution for client flows
      const engine = new AutomateEngine();
      const result = await engine.executeFlow(flow, dataSource);

      return {
        success: result.success,
        logs: result.logs.map(l => `[${l.level}] ${l.message}`),
        notifications: result.notifications.map(n => n.message),
        error: result.error,
      };
    },
  });
}
