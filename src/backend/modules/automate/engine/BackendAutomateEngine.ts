/**
 * Backend Automate Engine - silnik wykonawczy flow automatyzacji (backend)
 */

import { AutomateFlowModel } from '../models/AutomateFlowModel';
import { AutomateNodeModel, NODE_RUNTIME_MAP } from '../models/AutomateNodeModel';
import { AutomateEdgeModel } from '../models/AutomateEdgeModel';
import { AutomateErrorData } from '../models/AutomatePortModel';
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
const MAX_CALL_DEPTH = 10;

// Throttle state tracking (nodeId -> lastExecutionTime)
const throttleState = new Map<string, number>();

// Forward declaration to avoid circular imports
interface AutomateServiceLike {
  getFlowById(id: string): AutomateFlowModel | undefined;
}

export class BackendAutomateEngine {
  private variables: Record<string, unknown> = {};
  private executionLog: ExecutionLog[] = [];
  private isRunning = false;
  private shouldAbort = false;
  private nodeExecutionCount = 0;
  private callStack: string[] = [];
  private automateService: AutomateServiceLike | null = null;
  private api: AutomateSystemApiInterface | null = null;
  private mergeState: Map<string, Map<string, unknown>> = new Map();
  private inEdges: Map<string, AutomateEdgeModel[]> = new Map();

  async executeFlow(
    flow: AutomateFlowModel,
    api: AutomateSystemApiInterface,
    options: {
      parentCallStack?: string[];
      initialInput?: Record<string, unknown>;
      automateService?: AutomateServiceLike;
    } = {},
  ): Promise<ExecutionResult> {
    const { parentCallStack = [], initialInput = {}, automateService } = options;

    // Check for recursion
    if (parentCallStack.includes(flow.id)) {
      return {
        success: false,
        executionLog: [],
        logs: api.logs,
        notifications: api.notifications,
        variables: {},
        error: `Recursive flow call detected: ${flow.id} (${flow.name})`,
      };
    }
    if (parentCallStack.length >= MAX_CALL_DEPTH) {
      return {
        success: false,
        executionLog: [],
        logs: api.logs,
        notifications: api.notifications,
        variables: {},
        error: `Max subflow depth (${MAX_CALL_DEPTH}) exceeded`,
      };
    }

    this.isRunning = true;
    this.shouldAbort = false;
    this.executionLog = [];
    this.nodeExecutionCount = 0;
    this.mergeState = new Map();
    this.callStack = [...parentCallStack, flow.id];
    this.automateService = automateService || null;
    this.api = api;

    // Inicjalizuj zmienne z domyślnymi wartościami
    this.variables = {};
    if (flow.variables) {
      for (const v of flow.variables) {
        this.variables[v.name] = v.defaultValue ?? null;
      }
    }
    // Add parent input to variables
    if (initialInput._parentInput !== undefined) {
      this.variables._parentInput = initialInput._parentInput;
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

    // Zbuduj mapę krawędzi wchodzących (dla merge)
    const inEdges = new Map<string, AutomateEdgeModel[]>();
    for (const edge of flow.edges) {
      if (edge.disabled) continue;
      const list = inEdges.get(edge.targetNodeId) || [];
      list.push(edge);
      inEdges.set(edge.targetNodeId, list);
    }
    this.inEdges = inEdges;

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
        await this.executeNode(startNode, nodeMap, outEdges, api, initialInput);
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

  /**
   * Execute flow starting from a webhook trigger node
   */
  async executeFromWebhook(
    flow: AutomateFlowModel,
    api: AutomateSystemApiInterface,
    nodeId: string,
    webhookData: {
      payload: unknown;
      method: string;
      headers: Record<string, string>;
      query: Record<string, string>;
    },
    automateService?: AutomateServiceLike,
  ): Promise<ExecutionResult> {
    this.isRunning = true;
    this.shouldAbort = false;
    this.executionLog = [];
    this.nodeExecutionCount = 0;
    this.callStack = [flow.id];
    this.automateService = automateService || null;
    this.api = api;

    // Initialize variables with default values
    this.variables = {};
    if (flow.variables) {
      for (const v of flow.variables) {
        this.variables[v.name] = v.defaultValue ?? null;
      }
    }

    // Build adjacency maps
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

    // Zbuduj mapę krawędzi wchodzących (dla merge)
    const inEdges = new Map<string, AutomateEdgeModel[]>();
    for (const edge of flow.edges) {
      if (edge.disabled) continue;
      const list = inEdges.get(edge.targetNodeId) || [];
      list.push(edge);
      inEdges.set(edge.targetNodeId, list);
    }
    this.inEdges = inEdges;

    // Find the target webhook node
    const targetNode = nodeMap.get(nodeId);
    if (!targetNode) {
      this.isRunning = false;
      return {
        success: false,
        executionLog: [],
        logs: api.logs,
        notifications: api.notifications,
        variables: { ...this.variables },
        error: `Webhook node not found: ${nodeId}`,
      };
    }

    if (targetNode.nodeType !== 'webhook_trigger') {
      this.isRunning = false;
      return {
        success: false,
        executionLog: [],
        logs: api.logs,
        notifications: api.notifications,
        variables: { ...this.variables },
        error: `Node ${nodeId} is not a webhook_trigger`,
      };
    }

    try {
      // Pass webhook data as input
      const input: Record<string, unknown> = {
        _webhookPayload: webhookData.payload,
        _webhookMethod: webhookData.method,
        _webhookHeaders: webhookData.headers,
        _webhookQuery: webhookData.query,
      };

      await this.executeNode(targetNode, nodeMap, outEdges, api, input);

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

        case 'webhook_trigger': {
          // Webhook trigger passes incoming HTTP data as result
          result = {
            payload: input._webhookPayload,
            method: input._webhookMethod,
            headers: input._webhookHeaders,
            query: input._webhookQuery,
          };
          nextPortId = 'out';
          break;
        }

        case 'schedule_trigger': {
          // Schedule trigger passes timing info as result
          result = {
            scheduledTime: input._scheduledTime,
            cronExpression: input._cronExpression,
            timezone: input._timezone,
            scheduleNodeId: input._scheduleNodeId,
          };
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
                await this.executeNode(targetNode, nodeMap, outEdges, api, {
                  ...input,
                  index: i,
                  _incomingPortId: edge.targetPortId,
                });
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
                await this.executeNode(targetNode, nodeMap, outEdges, api, {
                  ...input,
                  iteration: iter,
                  _incomingPortId: edge.targetPortId,
                });
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
          const logInput = node.config.logInput as boolean;
          const logFn = api.log[level as keyof typeof api.log] || api.log.info;

          if (logInput) {
            // Log input object as JSON
            const inputStr = JSON.stringify(input._result ?? input, null, 2);
            logFn(message ? `${message}\n${inputStr}` : inputStr);
          } else {
            logFn(message);
          }
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

        case 'call_flow': {
          const flowId = node.config.flowId as string;
          if (!flowId) {
            throw new Error('Call Flow: No flow selected');
          }

          if (!this.automateService) {
            throw new Error('Call Flow: AutomateService not available for subflow execution');
          }

          // Load subflow
          const subflow = this.automateService.getFlowById(flowId);
          if (!subflow) {
            throw new Error(`Call Flow: Flow not found: ${flowId}`);
          }

          // Check for client-only nodes in subflow
          const clientOnlyNodes = subflow.nodes.filter(n => {
            const runtime = NODE_RUNTIME_MAP[n.nodeType];
            return runtime === 'client' && !n.disabled;
          });

          if (clientOnlyNodes.length > 0) {
            const nodeNames = clientOnlyNodes.map(n => `${n.name} (${n.nodeType})`).join(', ');
            throw new Error(`Call Flow: Subflow "${subflow.name}" contains client-only nodes: ${nodeNames}`);
          }

          // Prepare input for subflow
          const subflowInput: Record<string, unknown> = {};
          if (node.config.passInputAsPayload !== false) {
            subflowInput._parentInput = input._result;
          }

          api.log.info(`Calling subflow: ${subflow.name} (${flowId})`);

          // Execute subflow with new engine instance
          const subEngine = new BackendAutomateEngine();
          const subResult = await subEngine.executeFlow(subflow, this.api!, {
            parentCallStack: this.callStack,
            initialInput: subflowInput,
            automateService: this.automateService,
          });

          // Merge logs and notifications
          for (const log of subResult.logs) {
            api.logs.push(log);
          }
          for (const notif of subResult.notifications) {
            api.notifications.push(notif);
          }

          if (!subResult.success) {
            throw new Error(`Subflow "${subflow.name}" failed: ${subResult.error}`);
          }

          // Return subflow's final variables as result
          result = subResult.variables;
          api.log.info(`Subflow ${subflow.name} completed`);
          nextPortId = 'out';
          break;
        }

        case 'rate_limit': {
          const mode = (node.config.mode as string) || 'delay';
          const delayMs = (node.config.delayMs as number) || 1000;
          const nodeKey = `${node.id}`;

          if (mode === 'delay') {
            // Simple delay - wait then continue
            await new Promise(resolve => setTimeout(resolve, delayMs));
            api.log.info(`Delayed ${delayMs}ms`);
            nextPortId = 'out';
          } else if (mode === 'throttle') {
            // Throttle - execute max once per interval
            const now = Date.now();
            const lastExec = throttleState.get(nodeKey) || 0;

            if (now - lastExec >= delayMs) {
              throttleState.set(nodeKey, now);
              api.log.info(`Throttle passed (${delayMs}ms interval)`);
              nextPortId = 'out';
            } else {
              const remaining = delayMs - (now - lastExec);
              api.log.info(`Throttled - ${remaining}ms remaining`);
              nextPortId = 'skipped';
            }
          } else if (mode === 'debounce') {
            // Debounce - simple implementation: delay then execute
            // (Full debounce would need async cancellation which is complex in flow context)
            await new Promise(resolve => setTimeout(resolve, delayMs));
            api.log.info(`Debounced (waited ${delayMs}ms)`);
            nextPortId = 'out';
          }
          break;
        }

        case 'foreach': {
          const sourceExpr = (node.config.sourceExpression as string) || 'inp._result';
          const itemVar = (node.config.itemVariable as string) || 'item';
          const indexVar = (node.config.indexVariable as string) || 'index';
          const loopEdges = (outEdges.get(node.id) || []).filter(e => e.sourcePortId === 'loop');

          // Evaluate source expression to get array
          let sourceArray: unknown[];
          try {
            const evaluated = await AutomateSandbox.execute(
              `return (${sourceExpr})`,
              api, input, this.variables
            );
            if (!Array.isArray(evaluated)) {
              throw new Error(`Foreach source is not an array: ${typeof evaluated}`);
            }
            sourceArray = evaluated;
          } catch (evalErr) {
            throw new Error(`Foreach: Failed to evaluate source expression: ${evalErr instanceof Error ? evalErr.message : String(evalErr)}`);
          }

          api.log.info(`Foreach: Iterating over ${sourceArray.length} items`);

          // Iterate over array
          for (let i = 0; i < sourceArray.length; i++) {
            if (this.shouldAbort) break;
            const currentItem = sourceArray[i];
            this.variables[itemVar] = currentItem;
            this.variables[indexVar] = i;

            for (const edge of loopEdges) {
              const targetNode = nodeMap.get(edge.targetNodeId);
              if (targetNode) {
                await this.executeNode(targetNode, nodeMap, outEdges, api, {
                  ...input,
                  _result: currentItem,
                  [itemVar]: currentItem,
                  [indexVar]: i,
                  _incomingPortId: edge.targetPortId,
                });
              }
            }
          }

          result = sourceArray.length;
          nextPortId = 'done';
          break;
        }

        case 'comment':
          // No-op
          break;

        case 'merge': {
          const incomingPortId = (input._incomingPortId as string) || 'in_1';

          if (!this.mergeState.has(node.id)) {
            this.mergeState.set(node.id, new Map());
          }
          const nodeState = this.mergeState.get(node.id)!;
          nodeState.set(incomingPortId, input._result);

          // Sprawdź ile portów jest podłączonych
          const connectedPorts = new Set<string>();
          const nodeInEdges = this.inEdges.get(node.id) || [];
          for (const edge of nodeInEdges) {
            connectedPorts.add(edge.targetPortId);
          }

          // Czy wszystkie porty otrzymały dane?
          const allReceived = [...connectedPorts].every(portId => nodeState.has(portId));

          if (!allReceived) {
            // Czekaj na pozostałe gałęzie
            logEntry.status = 'completed';
            logEntry.endTime = Date.now();
            logEntry.result = { waiting: true, received: [...nodeState.keys()] };
            return;
          }

          // Wszystkie gałęzie dotarły - agreguj
          const mergeMode = (node.config.mode as string) || 'object';
          if (mergeMode === 'array') {
            result = [...nodeState.values()];
          } else {
            result = Object.fromEntries(nodeState.entries());
          }

          this.mergeState.delete(node.id);
          nextPortId = 'out';
          break;
        }
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
            await this.executeNode(targetNode, nodeMap, outEdges, api, {
              ...input,
              _result: result,
              _incomingPortId: edge.targetPortId,
            });
          }
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logEntry.status = 'error';
      logEntry.endTime = Date.now();
      logEntry.error = errorMsg;

      // Check if node has error port connected
      const errorEdges = (outEdges.get(node.id) || []).filter(e => e.sourcePortId === 'error');

      if (errorEdges.length > 0) {
        // Prepare error data
        const errorData: AutomateErrorData = {
          message: errorMsg,
          stack: err instanceof Error ? err.stack : undefined,
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.nodeType,
          timestamp: Date.now(),
          input,
        };

        // Continue through error port instead of propagating error
        for (const edge of errorEdges) {
          if (this.shouldAbort) break;
          const targetNode = nodeMap.get(edge.targetNodeId);
          if (targetNode) {
            await this.executeNode(targetNode, nodeMap, outEdges, api, {
              ...input,
              _result: errorData,
              _error: errorData,
              _incomingPortId: edge.targetPortId,
            });
          }
        }
        // Error was handled - don't propagate
        return;
      }

      // No error port connected - propagate error normally
      throw err;
    }
  }
}
