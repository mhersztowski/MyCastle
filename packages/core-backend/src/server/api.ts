/**
 * server/api.ts — REALIZACJA API backendu (punkt wejścia / orchestrator).
 *
 * Spina logikę (`logic.ts`) z dwoma transportami:
 *   • HTTP  — `POST /api/server/cmd` (patrz `http.ts`),
 *   • MQTT  — `/server/cmd` → `/client/{MqttClientId}` (patrz `mqtt.ts`).
 *
 * Aplikacja tworzy jedną instancję `ServerApi(dataDir)`, po czym:
 *   • w init MQTT:  `serverApi.attachMqtt(mqttServer)`,
 *   • w routerze HTTP: `await serverApi.handleHttp(body)` dla `POST /api/server/cmd`.
 */

import {
  ServerLogic,
  type ServerLogicOptions,
  type MqttBus,
  type ServerResponse,
  type DispatchContext,
} from './logic';
import { handleServerCmd, handleEndpointCall, type ServerCmdBody, type EndpointCallResult } from './http';
import { attachServerMqtt } from './mqtt';

export class ServerApi {
  /** Warstwa logiki (operacje na plikach/git/email). Dostępna, gdy potrzebny bezpośredni dostęp. */
  readonly logic: ServerLogic;

  constructor(dataDir: string, opts: ServerLogicOptions = {}) {
    this.logic = new ServerLogic(dataDir, opts);
  }

  /** Podłącza kanał komend MQTT (`/server/cmd` → `/client/{clientId}`). */
  attachMqtt(bus: MqttBus): void {
    attachServerMqtt(this.logic, bus);
  }

  /**
   * Obsługuje ciało `POST /api/server/cmd`. Nigdy nie rzuca.
   * `ctx.owner` (zweryfikowany JWT) jest autorytatywny dla operacji email.
   */
  handleHttp(body: ServerCmdBody, ctx: DispatchContext = {}): Promise<ServerResponse> {
    return handleServerCmd(this.logic, body, ctx);
  }

  /**
   * Obsługuje `ANY /api/server/ep/{path}` — przekazuje żądanie skryptowi, który
   * zarejestrował ścieżkę przez `http_add_endpoint`. `ctx.owner` (JWT) decyduje,
   * czyje endpointy są widoczne; bez `owner` widoczne są tylko publiczne.
   * Nigdy nie rzuca.
   */
  /** Czy pod tą ścieżką stoi endpoint dostępny bez JWT (router pyta przed auth). */
  hasPublicEndpoint(path: string): boolean {
    return this.logic.hasPublicHttpEndpoint(path);
  }

  handleEndpoint(
    req: { method: string; path: string; query?: Record<string, string>; headers?: Record<string, string>; body?: unknown },
    ctx: DispatchContext = {},
  ): Promise<EndpointCallResult> {
    return handleEndpointCall(this.logic, req, ctx);
  }
}

export {
  ServerLogic,
  GitTool,
  HttpEndpointError,
  SERVER_CMD_TOPIC,
  clientResTopic,
} from './logic';
export type {
  ServerLogicOptions,
  SecretsProvider,
  DispatchContext,
  IotProvider,
  IotDeviceInfo,
  IotCommandResult,
  MqttBus,
  ServerCommand,
  ServerResponse,
  ServerPush,
  HttpEndpointRequest,
  HttpEndpointResponse,
  IotLogLevel,
  IotLogPacket,
  GitResult,
  GitDiffResult,
  GitCommit,
  EmailSummary,
  EmailMessage,
  EmailAttachmentMeta,
  EmailSendResult,
  EmailSendOptions,
  Mail,
  ZipResult,
  ProjectBuildResult,
} from './logic';
export type { ServerCmdBody, EndpointCallResult } from './http';
