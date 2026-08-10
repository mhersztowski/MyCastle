import { randomUUID } from 'node:crypto';
import { createHash, createHmac } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mqttTopics } from '@mhersztowski/core';
import type { IotExtension } from '../IotExtension.js';
import type { MqttPublishFn } from '../IotService.js';

/**
 * ScriptExtension — wgrywanie skryptu albo modułu WebAssembly na urządzenie.
 *
 * Druga strona `hydra::script::ScriptDelivery`. Serwer wysyła na
 * `ext/script/req`, urządzenie odpowiada na `ext/script/res`:
 *
 *   begin   {size, sha256, variant?, name?, hmac?}  otwiera transfer
 *   chunk   {seq, data}                              kolejny fragment base64
 *   commit  {}                                       weryfikacja i podmiana
 *   abort   {}                                       porzucenie transferu
 *   status  {}                                       stan i możliwości urządzenia
 *
 * ## Dlaczego fragmentowanie jest tutaj, a nie w przeglądarce
 *
 * Bufor wiadomości na urządzeniu ma 512 bajtów, a moduł waży kilkadziesiąt
 * kilobajtów. Fragmenty muszą więc powstać po drodze — a że rozmiar bufora
 * jest własnością urządzenia, a nie przeglądarki, dzielenie należy do serwera.
 * Panel wysyła cały moduł raz i dostaje postęp.
 *
 * ## Okres próbny
 *
 * Po `commit` urządzenie obserwuje nową wersję. Jeśli `loop()` zostanie
 * wyłączona po serii błędów, wraca samo do poprzedniej. `commit` wraca więc
 * od razu — sukces znaczy „wczytało się", a nie „na pewno działa".
 */

interface Pending {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface UploadOptions {
  /**
   * Postać obrazu. `wasm` dla modułu WebAssembly, `src` dla źródła skryptu.
   * Urządzenie odrzuca wariant, którego jego silnik nie wykona — **przed**
   * transferem, a nie po nim.
   */
  variant?: 'wasm' | 'src' | string;
  /** Nazwa w komunikatach o błędach skryptu, np. `=v7`. */
  name?: string;
  /**
   * Klucz podpisu. Gdy urządzenie ma ustawiony klucz, obraz bez podpisu jest
   * odrzucany: sam skrót mówi wyłącznie, że nic się nie uszkodziło w drodze —
   * napastnik policzy go równie dobrze.
   */
  hmacKey?: string;
  /** Rozmiar fragmentu w bajtach przed zakodowaniem base64. */
  chunkBytes?: number;
  /** Postęp: ile bajtów wysłano z ilu. */
  onProgress?(sent: number, total: number): void;
}

export interface DeviceScriptStatus {
  engine?: string;
  receiving?: boolean;
  received?: number;
  expected?: number;
  capacity?: number;
  trial?: boolean;
  canRollback?: boolean;
  sha256?: string;
}

/**
 * Rozmiar fragmentu.
 *
 * Bufor urządzenia to 512 bajtów na **całą** wiadomość, a base64 rozdyma
 * ładunek o jedną trzecią; do tego dochodzi obudowa JSON-a z numerem
 * fragmentu. 192 bajty dają po zakodowaniu 256 znaków i zostawiają zapas.
 */
const DEFAULT_CHUNK_BYTES = 192;

export class ScriptExtension extends EventEmitter implements IotExtension {
  readonly type = 'script';

  private readonly pending = new Map<string, Pending>();
  private readonly reqTopic: string;

  constructor(
    readonly deviceId: string,
    topicPrefix: string,
    private readonly publishFn: MqttPublishFn,
    private readonly timeoutMs = 15_000,
  ) {
    super();
    this.reqTopic = `${topicPrefix}/ext/script/req`;
  }

  // --- Publiczne API ---

  /** Stan urządzenia: silnik, pojemność slotu, czy trwa okres próbny. */
  async status(): Promise<DeviceScriptStatus> {
    return (await this.send('status')) as DeviceScriptStatus;
  }

  abort(): Promise<unknown> {
    return this.send('abort');
  }

  /**
   * Wgrywa obraz w całości: `begin`, fragmenty, `commit`.
   *
   * Przy niepowodzeniu w środku transferu wysyła `abort`, żeby nie zostawić
   * urządzenia z zajętym slotem magazynu — inaczej kolejna próba dostałaby
   * odmowę, a przyczyna byłaby już dawno zapomniana.
   */
  async upload(image: Uint8Array, options: UploadOptions = {}): Promise<void> {
    const sha256 = createHash('sha256').update(image).digest('hex');
    const chunkBytes = options.chunkBytes ?? DEFAULT_CHUNK_BYTES;

    const begin: Record<string, unknown> = { size: image.byteLength, sha256 };
    if (options.variant) begin.variant = options.variant;
    if (options.name) begin.name = options.name;
    if (options.hmacKey) {
      begin.hmac = createHmac('sha256', options.hmacKey).update(image).digest('hex');
    }

    await this.send('begin', begin);

    try {
      let seq = 0;
      for (let at = 0; at < image.byteLength; at += chunkBytes) {
        const slice = image.subarray(at, Math.min(at + chunkBytes, image.byteLength));
        await this.send('chunk', {
          seq,
          data: Buffer.from(slice).toString('base64'),
        });
        seq += 1;
        options.onProgress?.(Math.min(at + chunkBytes, image.byteLength), image.byteLength);
      }

      await this.send('commit');
    } catch (e) {
      // Sprzątanie jest tu ważniejsze niż komunikat: slot zajęty przez
      // porzucony transfer blokuje następną próbę.
      await this.send('abort').catch(() => undefined);
      throw e;
    }
  }

  // --- IotExtension ---

  handleMessage(subTopic: string, payload: unknown): void {
    if (subTopic !== 'res') return;

    const result = mqttTopics.extRes.payloadSchema.safeParse(payload);
    if (!result.success) {
      console.warn(
        `[ScriptExtension] Niepoprawny ładunek ext/script/res (device=${this.deviceId}):`,
        result.error.issues,
      );
      return;
    }

    const { id, ok, error } = result.data;
    const pending = this.pending.get(id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(id);

    if (ok) {
      pending.resolve(result.data.data ?? {});
      return;
    }

    // Kod odmowy niesie treść: `busy` znaczy trwający okres próbny,
    // `variant` — obraz nie dla tego silnika, `signature` — cudzy podpis.
    // Przekazujemy go dalej, żeby interfejs mógł powiedzieć, co się stało.
    const err = new Error(error?.message ?? 'żądanie skryptu odrzucone');
    (err as Error & { code?: string }).code = error?.code;
    pending.reject(err);
  }

  dispose(): void {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error('ScriptExtension disposed'));
    }
    this.pending.clear();
    this.removeAllListeners();
  }

  // --- Prywatne ---

  private send(op: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`skrypt: przekroczony czas (op=${op}, device=${this.deviceId})`));
      }, this.timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      // Parametry idą płasko, obok `id` i `op` — tak czytają je obie
      // biblioteki urządzenia.
      this.publishFn(this.reqTopic, JSON.stringify({ id, op, ...params }));
    });
  }
}
