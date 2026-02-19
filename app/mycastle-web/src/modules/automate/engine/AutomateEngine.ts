/**
 * Engine - silnik wykonawczy flow automatyzacji
 */

import { AutomateFlowModel, AutomateNodeModel, AutomateEdgeModel, AutomateErrorData } from '@mhersztowski/core';
import { AutomateSystemApi, LogEntry, NotificationEntry } from './AutomateSystemApi';
import { AutomateSandbox } from './AutomateSandbox';
import { DataSource } from '../../filesystem/data/DataSource';
import { automateService } from '../services/AutomateService';

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

export class AutomateEngine {
  private variables: Record<string, unknown> = {};
  private executionLog: ExecutionLog[] = [];
  private isRunning = false;
  private shouldAbort = false;
  private nodeExecutionCount = 0;
  private callStack: string[] = [];
  private dataSource: DataSource | null = null;
  private mergeState: Map<string, Map<string, unknown>> = new Map();
  private inEdges: Map<string, AutomateEdgeModel[]> = new Map();

  onNodeStart?: (nodeId: string) => void;
  onNodeComplete?: (nodeId: string, result: unknown) => void;
  onNodeError?: (nodeId: string, error: string) => void;
  onLog?: (entry: ExecutionLog) => void;

  async executeFlow(
    flow: AutomateFlowModel,
    dataSource: DataSource,
    parentCallStack: string[] = [],
    initialInput: Record<string, unknown> = {},
  ): Promise<ExecutionResult> {
    // Check for recursion
    if (parentCallStack.includes(flow.id)) {
      return {
        success: false,
        executionLog: [],
        logs: [],
        notifications: [],
        variables: {},
        error: `Recursive flow call detected: ${flow.id} (${flow.name})`,
      };
    }
    if (parentCallStack.length >= MAX_CALL_DEPTH) {
      return {
        success: false,
        executionLog: [],
        logs: [],
        notifications: [],
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
    this.dataSource = dataSource;

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

    const api = new AutomateSystemApi(dataSource, this.variables);

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

  abort(): void {
    this.shouldAbort = true;
    this.isRunning = false;
  }

  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Execute flow starting from a specific node (e.g., manual_trigger)
   */
  async executeFromNode(flow: AutomateFlowModel, dataSource: DataSource, nodeId: string): Promise<ExecutionResult> {
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

    const api = new AutomateSystemApi(dataSource, this.variables);

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

    const targetNode = nodeMap.get(nodeId);
    if (!targetNode) {
      this.isRunning = false;
      return {
        success: false,
        executionLog: [],
        logs: api.logs,
        notifications: api.notifications,
        variables: { ...this.variables },
        error: `Node not found: ${nodeId}`,
      };
    }

    try {
      await this.executeNode(targetNode, nodeMap, outEdges, api, {});

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

  private async executeNode(
    node: AutomateNodeModel,
    nodeMap: Map<string, AutomateNodeModel>,
    outEdges: Map<string, AutomateEdgeModel[]>,
    api: AutomateSystemApi,
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
    this.onNodeStart?.(node.id);
    this.onLog?.(logEntry);

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

        case 'notification': {
          const notifMessage = node.config.message as string || '';
          const severity = (node.config.severity as 'success' | 'info' | 'warning' | 'error') || 'info';
          api.notify(notifMessage, severity);
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

        case 'tts': {
          let ttsText = '';
          if (node.config.useScript && node.script) {
            const scriptResult = await AutomateSandbox.execute(node.script, api, input, this.variables);
            ttsText = String(scriptResult || '');
          } else {
            ttsText = (node.config.text as string) || '';
          }

          if (ttsText) {
            await api.speech.say(ttsText, {
              voice: (node.config.voice as string) || undefined,
              speed: node.config.speed as number | undefined,
            });
            api.log.info(`TTS: "${ttsText.substring(0, 100)}..."`);
          }
          result = ttsText;
          nextPortId = 'out';
          break;
        }

        case 'stt': {
          api.log.info('STT: Node requires user interaction (microphone) - use api.speech in js_execute instead');
          nextPortId = 'out';
          break;
        }

        case 'call_flow': {
          const flowId = node.config.flowId as string;
          if (!flowId) {
            throw new Error('Call Flow: No flow selected');
          }

          // Load subflow
          const subflowNode = automateService.getFlowById(flowId);
          if (!subflowNode) {
            throw new Error(`Call Flow: Flow not found: ${flowId}`);
          }
          const subflow = subflowNode.toModel();

          // Check runtime compatibility - client can't call backend-only flows
          if (subflow.runtime === 'backend') {
            throw new Error(`Call Flow: Cannot call backend-only flow "${subflow.name}" from client`);
          }

          // Prepare input for subflow
          const subflowInput: Record<string, unknown> = {};
          if (node.config.passInputAsPayload !== false) {
            subflowInput._parentInput = input._result;
          }

          api.log.info(`Calling subflow: ${subflow.name} (${flowId})`);

          // Execute subflow with new engine instance
          const subEngine = new AutomateEngine();
          // Copy callbacks for nested execution
          subEngine.onNodeStart = this.onNodeStart;
          subEngine.onNodeComplete = this.onNodeComplete;
          subEngine.onNodeError = this.onNodeError;
          subEngine.onLog = this.onLog;

          const subResult = await subEngine.executeFlow(
            subflow,
            this.dataSource!,
            this.callStack,
            subflowInput,
          );

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
          // Nie wykonuj nic
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
            this.onLog?.(logEntry);
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
      this.onNodeComplete?.(node.id, result);
      this.onLog?.(logEntry);

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
      this.onNodeError?.(node.id, errorMsg);
      this.onLog?.(logEntry);

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
