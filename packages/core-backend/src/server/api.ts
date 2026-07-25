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

import { ServerLogic, type MqttBus, type ServerResponse } from './logic';
import { handleServerCmd, type ServerCmdBody } from './http';
import { attachServerMqtt } from './mqtt';

export class ServerApi {
  /** Warstwa logiki (operacje na plikach/git). Dostępna, gdy potrzebny bezpośredni dostęp. */
  readonly logic: ServerLogic;

  constructor(dataDir: string) {
    this.logic = new ServerLogic(dataDir);
  }

  /** Podłącza kanał komend MQTT (`/server/cmd` → `/client/{clientId}`). */
  attachMqtt(bus: MqttBus): void {
    attachServerMqtt(this.logic, bus);
  }

  /** Obsługuje ciało `POST /api/server/cmd`. Nigdy nie rzuca. */
  handleHttp(body: ServerCmdBody): Promise<ServerResponse> {
    return handleServerCmd(this.logic, body);
  }
}

export {
  ServerLogic,
  GitTool,
  SERVER_CMD_TOPIC,
  clientResTopic,
} from './logic';
export type {
  MqttBus,
  ServerCommand,
  ServerResponse,
  GitResult,
  GitDiffResult,
  GitCommit,
} from './logic';
export type { ServerCmdBody } from './http';
