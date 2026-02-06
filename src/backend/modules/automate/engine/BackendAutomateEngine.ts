/**
 * Backend Automate Engine - silnik wykonawczy flow automatyzacji (backend)
 */

import { AutomateFlowModel } from '../models/AutomateFlowModel';
import { AutomateNodeModel } from '../models/AutomateNodeModel';
import { AutomateEdgeModel } from '../models/AutomateEdgeModel';
import { AutomateSystemApiInterface } from './BackendSystemApi';
import type { LogEntry, NotificationEntry } from './BackendSystemApi';
import { AutomateSandbox } from './AutomateSandbox';

export interface ExecutionLog {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: 'running' | 'completed' | 'error' | 'skipped';
  startTime: number;
  endTime?: number;
  result?: unknown;
  error?: string;
}

export interface ExecutionResult {
  success: boolean;
  executionLog: ExecutionLog[];
  logs: LogEntry[];
  notifications: NotificationEntry[];
  variables: Record<string, unknown>;
  error?: string;
}

const MAX_NODE_EXECUTIONS = 10000;

export class BackendAutomateEngine {
  private variables: Record<string, unknown> = {};
  private executionLog: ExecutionLog[] = [];
  private isRunning = false;
  private shouldAbort = false;
  private nodeExecutionCount = 0;

  async executeFlow(flow: AutomateFlowModel, api: AutomateSystemApiInterface): Promise<ExecutionResult> {
    this.isRunning = true;
    this.shouldAbort = false;
    this.executionLog = [];
    this.nodeExecutionCount = 0;

    // Inicjalizuj zmienne z domyślnymi wartościami
    this.variables = {};
    if (flow.variables) {
      for (const v of flow.variables) {
        this.variables[v.name] = v.defaultValue ?? null;
      }
    }

    // Zbuduj mapy adjacencji
    const nodeMap = new Map<string, AutomateNodeModel>();
    for (const node of flow.nodes) {
      nodeMap.set(node.id, node);
    }

    const outEdges = new Map<string, AutomateEdgeModel[]>();
    for (const edge of flow.edges) {
      if (edge.disabled) continue;
      const list = outEdges.get(edge.sourceNodeId) || [];
      list.push(edge);
      outEdges.set(edge.sourceNodeId, list);
    }

    // Znajdź nody startowe (tylko start, manual_trigger jest wyzwalany ręcznie)
    const startNodes = flow.nodes.filter(
      n => !n.disabled && n.nodeType === 'start'
    );

    if (startNodes.length === 0) {
      this.isRunning = false;
      return {
        success: false,
        executionLog: [],
        logs: api.logs,
        notifications: api.notifications,
        variables: { ...this.variables },
        error: 'No start node found',
      };
    }

    try {
      for (const startNode of startNodes) {
        if (this.shouldAbort) break;
        await this.executeNode(startNode, nodeMap, outEdges, api, {});
      }

      this.isRunning = false;
      return {
        success: true,
        executionLog: this.executionLog,
        logs: api.logs,
        notifications: api.notifications,
        variables: { ...this.variables },
      };
    } catch (err) {
      this.isRunning = false;
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        executionLog: this.executionLog,
        logs: api.logs,
        notifications: api.notifications,
        variables: { ...this.variables },
        error: errorMsg,
      };
    }
  }

  abort(): void {
    this.shouldAbort = true;
    this.isRunning = false;
  }

  get running(): boolean {
    return this.isRunning;
  }

  private async executeNode(
    node: AutomateNodeModel,
    nodeMap: Map<string, AutomateNodeModel>,
    outEdges: Map<string, AutomateEdgeModel[]>,
    api: AutomateSystemApiInterface,
    input: Record<string, unknown>,
  ): Promise<void> {
    if (this.shouldAbort || node.disabled) return;

    this.nodeExecutionCount++;
    if (this.nodeExecutionCount > MAX_NODE_EXECUTIONS) {
      throw new Error(`Flow execution limit exceeded (${MAX_NODE_EXECUTIONS} nodes). Possible cycle detected.`);
    }

    const logEntry: ExecutionLog = {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.nodeType,
      status: 'running',
      startTime: Date.now(),
    };
    this.executionLog.push(logEntry);

    try {
      let result: unknown = undefined;
      let nextPortId: string | null = null;

      switch (node.nodeType) {
        case 'start':
          nextPortId = 'out';
          break;

        case 'manual_trigger': {
          // Manual trigger evaluates payload and sends it on 'out'
          if (node.config.useScript && node.script) {
            result = await AutomateSandbox.execute(node.script, api, input, this.variables);
          } else {
            const payloadStr = (node.config.payload as string) || '{}';
            try {
              result = JSON.parse(payloadStr);
            } catch {
              result = payloadStr;
            }
          }
          nextPortId = 'out';
          break;
        }

        case 'js_execute':
          if (node.script) {
            result = await AutomateSandbox.execute(node.script, api, input, this.variables);
          }
          nextPortId = 'out';
          break;

        case 'system_api': {
          const method = node.config.apiMethod as string;
          if (method) {
            api.log.info(`System API call: ${method}`);
          }
          nextPortId = 'out';
          break;
        }

        case 'if_else': {
          const condition = node.config.condition as string;
          let condResult = false;
          if (condition) {
            condResult = !!await AutomateSandbox.execute(
              `return (${condition})`,
              api, input, this.variables
            );
          }
          nextPortId = condResult ? 'true' : 'false';
          result = condResult;
          break;
        }

        case 'switch': {
          const expression = node.config.expression as string;
          const cases = (node.config.cases as string[]) || [];
          let switchResult: unknown = undefined;
          if (expression) {
            switchResult = await AutomateSandbox.execute(
              `return (${expression})`,
              api, input, this.variables
            );
          }
          const matchIndex = cases.findIndex(c => c === String(switchResult));
          nextPortId = matchIndex >= 0 ? `case_${matchIndex}` : 'default';
          result = switchResult;
          break;
        }

        case 'for_loop': {
          const count = (node.config.count as number) || 0;
          const indexVar = (node.config.indexVariable as string) || 'i';
          const bodyEdges = (outEdges.get(node.id) || []).filter(e => e.sourcePortId === 'body');

          for (let i = 0; i < count; i++) {
            if (this.shouldAbort) break;
            this.variables[indexVar] = i;
            for (const edge of bodyEdges) {
              const targetNode = nodeMap.get(edge.targetNodeId);
              if (targetNode) {
                await this.executeNode(targetNode, nodeMap, outEdges, api, { ...input, index: i });
              }
            }
          }
          nextPortId = 'done';
          result = count;
          break;
        }

        case 'while_loop': {
          const whileCondition = node.config.condition as string;
          const maxIter = (node.config.maxIterations as number) || 1000;
          const whileBodyEdges = (outEdges.get(node.id) || []).filter(e => e.sourcePortId === 'body');
          let iter = 0;

          while (iter < maxIter && !this.shouldAbort) {
            let condResult = false;
            if (whileCondition) {
              condResult = !!await AutomateSandbox.execute(
                `return (${whileCondition})`,
                api, input, this.variables
              );
            }
            if (!condResult) break;

            for (const edge of whileBodyEdges) {
              const targetNode = nodeMap.get(edge.targetNodeId);
              if (targetNode) {
                await this.executeNode(targetNode, nodeMap, outEdges, api, { ...input, iteration: iter });
              }
            }
            iter++;
          }
          nextPortId = 'done';
          result = iter;
          break;
        }

        case 'read_variable': {
          const varName = node.config.variableName as string;
          result = varName ? this.variables[varName] : undefined;
          nextPortId = 'out';
          break;
        }

        case 'write_variable': {
          const writeVarName = node.config.variableName as string;
          const value = node.config.value;
          if (writeVarName) {
            this.variables[writeVarName] = value;
          }
          nextPortId = 'out';
          break;
        }

        case 'log': {
          const message = node.config.message as string || '';
          const level = (node.config.level as string) || 'info';
          const logFn = api.log[level as keyof typeof api.log] || api.log.info;
          logFn(message);
          nextPortId = 'out';
          break;
        }

        case 'llm_call': {
          let prompt = '';
          if (node.config.useScript && node.script) {
            const scriptResult = await AutomateSandbox.execute(node.script, api, input, this.variables);
            prompt = String(scriptResult || '');
          } else {
            prompt = (node.config.prompt as string) || '';
          }

          if (prompt) {
            const llmResult = await api.ai.chat(prompt, {
              systemPrompt: (node.config.systemPrompt as string) || undefined,
              model: (node.config.model as string) || undefined,
              temperature: node.config.temperature as number | undefined,
              maxTokens: node.config.maxTokens as number | undefined,
            });
            result = llmResult;
            api.log.info(`LLM response (${prompt.substring(0, 50)}...): ${String(llmResult).substring(0, 200)}`);
          }
          nextPortId = 'out';
          break;
        }

        case 'notification':
          throw new Error('Node type "notification" is not supported on backend. Use client runtime for this flow.');

        case 'tts':
          throw new Error('Node type "tts" is not supported on backend. Use client runtime for this flow.');

        case 'stt':
          throw new Error('Node type "stt" is not supported on backend. Use client runtime for this flow.');

        case 'comment':
          // No-op
          break;
      }

      logEntry.status = 'completed';
      logEntry.endTime = Date.now();
      logEntry.result = result;

      // Kontynuuj do następnych nodów
      if (nextPortId) {
        const edges = (outEdges.get(node.id) || []).filter(e => e.sourcePortId === nextPortId);
        for (const edge of edges) {
          if (this.shouldAbort) break;
          const targetNode = nodeMap.get(edge.targetNodeId);
          if (targetNode) {
            await this.executeNode(targetNode, nodeMap, outEdges, api, { ...input, _result: result });
          }
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logEntry.status = 'error';
      logEntry.endTime = Date.now();
      logEntry.error = errorMsg;
      throw err;
    }
  }
}
