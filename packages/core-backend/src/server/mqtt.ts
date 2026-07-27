/**
 * server/mqtt.ts — realizacja API backendu przez MQTT.
 *
 * Nasłuchuje komend na topiku `/server/cmd` (koperta `ServerCommand`) i publikuje
 * odpowiedź (`ServerResponse`) na `/client/{MqttClientId}` nadawcy.
 */

import {
  ServerLogic,
  SERVER_CMD_TOPIC,
  clientResTopic,
  type MqttBus,
  type ServerCommand,
  type ServerResponse,
} from './logic';

/** Podłącza obsługę komend do brokera MQTT. Zwraca tę samą instancję logiki. */
export function attachServerMqtt(logic: ServerLogic, bus: MqttBus): void {
  // Logika zapamiętuje szynę, bo część operacji (endpointy HTTP skryptów) wypycha
  // wiadomości do klienta poza cyklem żądanie-odpowiedź.
  logic.attachBus(bus);

  bus.onMessage((topic, payload) => {
    if (topic !== SERVER_CMD_TOPIC) return;

    let cmd: ServerCommand;
    try {
      cmd = JSON.parse(payload) as ServerCommand;
    } catch {
      return; // niepoprawny JSON — ignorujemy
    }
    if (!cmd?.clientId || !cmd?.id) return;

    const reply = (res: ServerResponse) =>
      bus.publishMessage(clientResTopic(cmd.clientId), JSON.stringify(res));

    logic
      // clientId jest potrzebny operacjom z kanałem zwrotnym (`http_add_endpoint`).
      .dispatch(cmd.op, cmd.args ?? {}, { clientId: cmd.clientId })
      .then((result) => reply({ id: cmd.id, ok: true, result }))
      .catch((err) =>
        reply({ id: cmd.id, ok: false, error: err instanceof Error ? err.message : String(err) }),
      );
  });
}
