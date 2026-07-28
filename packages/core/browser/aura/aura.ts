/**
 * browser/aura/aura.ts — logika asystenta Aura dla obu ścieżek edytora
 * konwersacji: bloczków i skryptów automatyzacji.
 *
 * Wszystko, co bloczki oferują w kategoriach „Konwersacja", „VFS / Pliki",
 * „Sieć / Google", „Komponenty" i „Funkcje globalne", jest tu statyczną metodą
 * async klasy `Aura`. Generator Blockly emituje wywołania `Aura.*`, a skrypt
 * użytkownika importuje tę samą klasę:
 *
 *   import { Aura } from 'mycastle/packages/core/browser/aura/aura';
 *   await Aura.say('Cześć');
 *   const imie = await Aura.ask('Jak masz na imię?');
 *
 * Klasa nie zna Reacta ani DOM-u. Prymitywy zależne od interfejsu (dopisanie
 * wiadomości do czatu, TTS, mikrofon, model AI, VFS) dostarcza host przez
 * `Aura.setHost(...)` — strona Aury robi to przed uruchomieniem logiki.
 * Dzięki temu ta sama logika jest testowalna bez przeglądarki.
 */

// ── Typy pomocnicze ──────────────────────────────────────────────────────────

/** Konfiguracja komponentu pokazywanego w czacie (`showComponent`). */
export interface AuraComponentConfig {
  id: string;
  [key: string]: unknown;
}

/** Zapytanie o JSON z VFS — ścieżka + opcjonalne okrojenie i filtry. */
export interface AuraJsonQuery {
  path: string;
  [key: string]: unknown;
}

export interface AuraChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Decyzja użytkownika o zgłoszonej akcji w tle. */
export type AuraBackgroundResponse = 'run' | 'cancel';

/** Zgłoszenie czekające na decyzję — to widzi lista „W tle". */
export interface AuraBackgroundAction {
  id: string;
  /** Opis pokazywany użytkownikowi. */
  label: string;
  /** Czas zgłoszenia (ms) — do sortowania i pokazania „ile czeka". */
  createdAt: number;
}

/** Wynik `backgroundAction` — rozstrzygnięty dopiero po kliknięciu użytkownika. */
export interface AuraBackgroundResult {
  id: string;
  label: string;
  response: AuraBackgroundResponse;
}

/** Parametry dzwonka (`bell`). Wszystkie opcjonalne. */
export interface AuraBellOptions {
  /** Ile uderzeń, 1–8 (domyślnie 1). */
  times?: number;
  /** Ton podstawowy w Hz (domyślnie 880 — a''). */
  frequency?: number;
  /** Czas wybrzmienia pojedynczego uderzenia w sekundach (domyślnie 0.7). */
  duration?: number;
  /** Głośność 0–1 (domyślnie 0.35 — sygnał ma nie przestraszyć). */
  volume?: number;
}

/**
 * Prymitywy dostarczane przez stronę Aury. Wszystkie są „głupie" — logika
 * (kolejność kroków, obsługa błędów, kontekst rozmowy) siedzi w klasie.
 */
export interface AuraHost {
  /** Dopisuje wypowiedź asystenta do czatu. */
  appendAssistant(text: string): void;
  /** Dopisuje wypowiedź użytkownika do czatu. */
  appendUser(text: string): void;
  /** Wypowiada tekst i czeka, aż skończy mówić. */
  speak(text: string): Promise<void>;
  /** Czeka na jedną wypowiedź użytkownika (głos albo tekst). 0 = bez limitu. */
  capture(timeoutSec?: number): Promise<string>;
  /** Sygnalizuje, że trwa praca (kręciołek „myślę"). */
  setThinking(): void;
  /** Wstawia komponent do czatu. */
  showComponent(config: AuraComponentConfig): void;
  /** Uruchamia inną akcję głosową (po id, nazwie albo tagu). */
  runAction(idOrNameOrTag: string, utterance: string): Promise<void>;
  /** Wysyła rozmowę do modelu AI i zwraca odpowiedź. */
  askAi(messages: AuraChatMessage[]): Promise<string>;
  /** Czyta plik z VFS jako tekst. */
  readVfsFile(path: string): Promise<string>;
  /** Wykonuje zapytanie o JSON z VFS (ścieżka + filtry). */
  queryVfsJson(query: AuraJsonQuery): Promise<unknown>;
  /** Ostatnia wypowiedź użytkownika. */
  getLastUtterance(): string;
  /** Zapisuje ostatnią wypowiedź (po `ask`/`listen`). */
  setLastUtterance(text: string): void;
  /** Klucz Serper.dev z konfiguracji konwersacji ('' = brak). */
  getSerperKey(): string;
  /** Log diagnostyczny widoczny w panelu debug. */
  debug(message: string): void;
  /**
   * Opcjonalny własny dzwonek. Gdy host go nie ma, `bell()` syntezuje dźwięk
   * przez Web Audio — bez plików i bez pobierania czegokolwiek.
   */
  playBell?(options: Required<AuraBellOptions>): Promise<void>;
}

type GlobalFn = (...args: unknown[]) => Promise<unknown> | unknown;

const asText = (v: unknown): string => String(v ?? '');

/** Host-zaślepka — logika działa (nic nie wybucha), ale nic nie widać. */
const NOOP_HOST: AuraHost = {
  appendAssistant: () => {},
  appendUser: () => {},
  speak: async () => {},
  capture: async () => '',
  setThinking: () => {},
  showComponent: () => {},
  runAction: async () => {},
  askAi: async () => '',
  readVfsFile: async () => '',
  queryVfsJson: async () => null,
  getLastUtterance: () => '',
  setLastUtterance: () => {},
  getSerperKey: () => '',
  debug: () => {},
};

// ── Klasa ────────────────────────────────────────────────────────────────────

export class Aura {
  private static host: AuraHost = NOOP_HOST;

  /** Handlery zarejestrowane przez `onActivator` — host odpala je po kodzie. */
  private static handlers: Array<() => Promise<void>> = [];
  /** Funkcje globalne z kategorii „Definicje globalne". */
  private static globals: Record<string, GlobalFn> = {};
  /** Konteksty rozmów z agentem AI (per identyfikator czatu). */
  private static agentChats: Record<string, AuraChatMessage[]> = {};
  private static currentAgentChat = 'default';
  private static agentResponseText = '';
  /** Kontekst Web Audio dla `bell()` — jeden na stronę (przeglądarki limitują ich liczbę). */
  private static audioCtx: AudioContext | null = null;
  /** Zgłoszenia czekające na decyzję użytkownika (widok „W tle"). */
  private static background: Array<AuraBackgroundAction & {
    settle: (response: AuraBackgroundResponse) => void;
  }> = [];
  /** Obserwatorzy listy zgłoszeń — UI odświeża się po każdej zmianie. */
  private static backgroundWatchers: Array<() => void> = [];
  private static backgroundSeq = 0;

  // ── Cykl życia ─────────────────────────────────────────────────────────────

  /** Podpina prymitywy interfejsu. Wołane przez stronę Aury przed logiką. */
  static setHost(host: AuraHost): void {
    Aura.host = host;
  }

  /**
   * Czyści stan jednego przebiegu (handlery aktywatorów i funkcje globalne).
   * Konteksty agenta AI zostają — rozmowa ma przeżyć pojedynczą akcję.
   */
  static beginRun(): void {
    Aura.handlers = [];
    Aura.globals = {};
  }

  /** Handlery zebrane przez `onActivator` w bieżącym przebiegu. */
  static pendingHandlers(): Array<() => Promise<void>> {
    return Aura.handlers;
  }

  /** Zamyka kontekst audio (`bell`). Osobno od `reset`, bo dźwięk nie należy do przebiegu. */
  static resetAudio(): void {
    void Aura.audioCtx?.close?.();
    Aura.audioCtx = null;
  }

  /**
   * Pełny reset — używany w testach i przy zamykaniu strony. Oczekujące
   * zgłoszenia rozstrzygamy jako `cancel`: skrypt czekający na `await` musi
   * dostać odpowiedź, inaczej zawisłby na zawsze.
   */
  static reset(): void {
    for (const item of Aura.background.splice(0)) item.settle('cancel');
    Aura.backgroundWatchers = [];
    Aura.host = NOOP_HOST;
    Aura.handlers = [];
    Aura.globals = {};
    Aura.agentChats = {};
    Aura.currentAgentChat = 'default';
    Aura.agentResponseText = '';
  }

  // ── Konwersacja ────────────────────────────────────────────────────────────

  /** Rejestruje blok wykonywany po dopasowaniu frazy aktywującej. */
  static async onActivator(_phrase: unknown, fn: () => Promise<void>): Promise<void> {
    if (typeof fn === 'function') Aura.handlers.push(fn);
  }

  /** Wypowiada tekst i czeka, aż zostanie odczytany do końca. */
  static async say(text: unknown): Promise<void> {
    const t = asText(text);
    Aura.host.appendAssistant(t);
    if (t.trim()) await Aura.host.speak(t);
  }

  /** Pyta i czeka na odpowiedź; zwraca rozpoznany tekst (pusty, gdy brak). */
  static async ask(text: unknown): Promise<string> {
    const t = asText(text);
    Aura.host.appendAssistant(t);
    if (t.trim()) await Aura.host.speak(t);
    const answer = await Aura.host.capture();
    if (answer) {
      Aura.host.appendUser(answer);
      Aura.host.setLastUtterance(answer);
    }
    return answer;
  }

  // ── Akcje w tle ────────────────────────────────────────────────────────────

  /**
   * Zgłasza akcję do listy „W tle" i CZEKA, aż użytkownik ją uruchomi albo
   * odrzuci. Zgłoszenie jest sygnalizowane dzwonkiem i zapowiedzią głosową,
   * bo skrypt zwykle działa, gdy nikt nie patrzy na ekran.
   *
   *   const wynik = await Aura.backgroundAction('Wyślij raport dzienny');
   *   if (wynik.response === 'run') { … }
   *
   * Obietnica rozstrzyga się dopiero po decyzji — dzięki temu skrypt czyta się
   * liniowo, bez callbacków. `reset()` zwalnia oczekujących jako `cancel`.
   */
  static async backgroundAction(label: unknown): Promise<AuraBackgroundResult> {
    const text = asText(label).trim() || 'Akcja w tle';
    const id = `bg-${++Aura.backgroundSeq}-${Date.now().toString(36)}`;

    let settle: (response: AuraBackgroundResponse) => void = () => {};
    const decision = new Promise<AuraBackgroundResponse>((resolve) => {
      settle = (response) => resolve(response);
    });

    Aura.background.push({ id, label: text, createdAt: Date.now(), settle });
    // Powiadamiamy UI zanim zaczniemy dzwonić i mówić — lista ma pokazać wpis
    // od razu, a nie po kilku sekundach zapowiedzi.
    Aura.notifyBackground();

    await Aura.bell().catch(() => { /* brak audio nie może wstrzymać zgłoszenia */ });
    await Aura.say('Nowa Akcja w tle');

    const response = await decision;
    return { id, label: text, response };
  }

  /** Migawka listy zgłoszeń (najstarsze pierwsze) — dla widoku „W tle". */
  static backgroundActions(): AuraBackgroundAction[] {
    return Aura.background.map(({ id, label, createdAt }) => ({ id, label, createdAt }));
  }

  /** Decyzja użytkownika: „Uruchom" albo „Odrzuć". Nieznane id ignorujemy. */
  static resolveBackgroundAction(id: unknown, response: AuraBackgroundResponse): void {
    const key = asText(id);
    const at = Aura.background.findIndex((a) => a.id === key);
    if (at < 0) return;
    const [item] = Aura.background.splice(at, 1);
    Aura.notifyBackground();
    item.settle(response === 'run' ? 'run' : 'cancel');
  }

  /** Subskrypcja zmian listy (React). Zwraca funkcję wypisującą. */
  static onBackgroundChange(callback: () => void): () => void {
    Aura.backgroundWatchers.push(callback);
    return () => {
      Aura.backgroundWatchers = Aura.backgroundWatchers.filter((c) => c !== callback);
    };
  }

  private static notifyBackground(): void {
    for (const watcher of [...Aura.backgroundWatchers]) {
      try {
        watcher();
      } catch {
        /* błąd w jednym obserwatorze nie może uciszyć pozostałych */
      }
    }
  }

  /**
   * Gra dzwonek sygnalizacyjny — bez plików audio i bez pobierania czegokolwiek:
   * dźwięk jest syntezowany na miejscu przez Web Audio. Uderzenie to ton
   * podstawowy plus składowa 2.76× (typowa dla dzwonu) z wykładniczym zanikiem,
   * co brzmi jak dzwonek, a nie jak „piknięcie".
   *
   *   await Aura.bell();                       // jedno uderzenie
   *   await Aura.bell(3);                      // trzy uderzenia
   *   await Aura.bell({ frequency: 660, times: 2 });
   *
   * Host może dostarczyć własną implementację (`playBell`) — np. gdy dźwięk ma
   * pójść na głośnik urządzenia, a nie do przeglądarki. Gdy nie ma ani hosta,
   * ani Web Audio (testy, Node), metoda po prostu nic nie robi.
   */
  static async bell(options?: unknown): Promise<void> {
    // Z bloczka przychodzi zwykle liczba — najczęściej chodzi o liczbę uderzeń.
    const raw: AuraBellOptions = typeof options === 'number'
      ? { times: options }
      : (options && typeof options === 'object' ? options as AuraBellOptions : {});

    const opts: Required<AuraBellOptions> = {
      // Górna granica jest po to, żeby literówka w skrypcie nie zamieniła
      // sygnału w minutowy dzwon.
      times: Math.min(8, Math.max(1, Math.round(Number(raw.times) || 1))),
      frequency: Math.min(4000, Math.max(80, Number(raw.frequency) || 880)),
      duration: Math.min(5, Math.max(0.05, Number(raw.duration) || 0.7)),
      volume: Math.min(1, Math.max(0, raw.volume === undefined ? 0.35 : Number(raw.volume))),
    };

    if (Aura.host.playBell) {
      await Aura.host.playBell(opts);
      return;
    }

    const ctx = Aura.ensureAudio();
    if (!ctx) {
      Aura.host.debug('bell: brak Web Audio — dzwonek pominięty');
      return;
    }
    // Autoplay policy usypia kontekst utworzony poza gestem użytkownika.
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch { /* zostanie cisza, ale skrypt idzie dalej */ }
    }

    // Odstęp krótszy niż wybrzmienie — uderzenia mają się nakładać jak w dzwonie.
    const gap = Math.max(0.12, opts.duration * 0.45);
    for (let i = 0; i < opts.times; i++) {
      Aura.strike(ctx, ctx.currentTime + i * gap, opts);
    }
    // Czekamy do wybrzmienia, żeby `await Aura.bell()` znaczyło „po dzwonku".
    const totalMs = ((opts.times - 1) * gap + opts.duration) * 1000;
    await new Promise((resolve) => setTimeout(resolve, totalMs));
  }

  /** Pojedyncze uderzenie: dwa oscylatory z własnym wygaszaniem. */
  private static strike(ctx: AudioContext, at: number, opts: Required<AuraBellOptions>): void {
    // 2.76 to pierwsza istotna składowa nieharmoniczna dzwonu; sam ton podstawowy
    // brzmiałby jak sygnał testowy.
    const partials: [number, number][] = [[1, 1], [2.76, 0.45]];
    for (const [ratio, level] of partials) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(opts.frequency * ratio, at);

      const peak = Math.max(0.0001, opts.volume * level);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.008);           // szybki atak
      gain.gain.exponentialRampToValueAtTime(0.0001, at + opts.duration); // długi zanik

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + opts.duration + 0.05);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
  }

  /** Leniwie tworzy kontekst audio; `null`, gdy środowisko go nie ma. */
  private static ensureAudio(): AudioContext | null {
    if (Aura.audioCtx) return Aura.audioCtx;
    const g = globalThis as { AudioContext?: new () => AudioContext; webkitAudioContext?: new () => AudioContext };
    const Ctor = g.AudioContext ?? g.webkitAudioContext;
    if (!Ctor) return null;
    try {
      Aura.audioCtx = new Ctor();
    } catch {
      Aura.audioCtx = null;
    }
    return Aura.audioCtx;
  }

  /** Nasłuchuje z opcjonalnym limitem sekund; 0 = bez limitu. */
  static async listen(timeout: unknown): Promise<string> {
    const secs = Number(timeout) || 0;
    Aura.host.appendAssistant(`🎧 Słucham${secs ? ` (do ${secs}s)` : ''}... powiedz lub wpisz odpowiedź.`);
    const heard = await Aura.host.capture(secs);
    if (heard) {
      Aura.host.appendUser(heard);
      Aura.host.setLastUtterance(heard);
    } else {
      Aura.host.appendAssistant('(nie usłyszałem odpowiedzi)');
    }
    return heard;
  }

  /** Ostatnia wypowiedź użytkownika. */
  static async lastUtterance(): Promise<string> {
    return Aura.host.getLastUtterance();
  }

  /** Czy ostatnia wypowiedź zawiera podany fragment (bez względu na wielkość liter). */
  static async utteranceContains(fragment: unknown): Promise<boolean> {
    return Aura.host.getLastUtterance().toLowerCase().includes(asText(fragment).toLowerCase());
  }

  /** Uruchamia inną akcję głosową (id, nazwa albo tag). */
  static async callAction(idOrNameOrTag: unknown): Promise<void> {
    const key = asText(idOrNameOrTag);
    if (!key) return;
    await Aura.host.runAction(key, Aura.host.getLastUtterance());
  }

  /** Pauza w sekundach. */
  static async wait(seconds: unknown): Promise<void> {
    const ms = (Number(seconds) || 0) * 1000;
    if (ms <= 0) return;
    await new Promise<void>(resolve => setTimeout(resolve, ms));
  }

  /** Kończy konwersację komunikatem na ekranie (bez odczytu głosem). */
  static async endConversation(message: unknown): Promise<void> {
    const t = asText(message).trim();
    if (t) Aura.host.appendAssistant(t);
  }

  // ── Komponenty ─────────────────────────────────────────────────────────────

  /**
   * Wstawia komponent (wbudowany albo z Programming → Components) do czatu.
   * Bloczek przekazuje konfigurację jako JSON-string, skrypt może podać obiekt.
   */
  static async showComponent(config: unknown): Promise<void> {
    let parsed: AuraComponentConfig | null = null;
    if (config && typeof config === 'object') {
      parsed = config as AuraComponentConfig;
    } else {
      try { parsed = JSON.parse(asText(config) || 'null') as AuraComponentConfig | null; }
      catch { parsed = null; }
    }
    if (!parsed || !parsed.id) return;
    Aura.host.showComponent(parsed);
  }

  // ── Agent AI ───────────────────────────────────────────────────────────────

  /** Zaczyna nowy kontekst rozmowy z agentem (albo czyści istniejący). */
  static async agentNewChat(id: unknown): Promise<void> {
    const key = asText(id) || 'default';
    Aura.agentChats[key] = [];
    Aura.currentAgentChat = key;
  }

  /** Wysyła prompt do agenta w bieżącym kontekście i zapamiętuje odpowiedź. */
  static async agentSendPrompt(prompt: unknown): Promise<string> {
    const text = asText(prompt);
    const key = Aura.currentAgentChat;
    const history = Aura.agentChats[key] ?? (Aura.agentChats[key] = []);
    history.push({ role: 'user', content: text });
    Aura.host.setThinking();
    const answer = await Aura.host.askAi(history);
    history.push({ role: 'assistant', content: answer });
    Aura.agentResponseText = answer;
    return answer;
  }

  /** Ostatnia odpowiedź agenta AI. */
  static async agentResponse(): Promise<string> {
    return Aura.agentResponseText;
  }

  // ── Sieć ───────────────────────────────────────────────────────────────────

  /**
   * Wyszukiwanie w Google przez Serper.dev. Zwraca listę adresów URL; przy
   * braku klucza albo błędzie mówi o tym w czacie i zwraca pustą listę —
   * skrypt nie musi opakowywać wywołania w try/catch.
   */
  static async googleSearch(query: unknown): Promise<string[]> {
    const q = asText(query).trim();
    if (!q) return [];
    const apiKey = Aura.host.getSerperKey();
    Aura.host.debug(`googleSearch: q="${q}" serperKey=${apiKey ? 'jest' : 'BRAK'}`);
    if (!apiKey) {
      Aura.host.appendAssistant('⚠️ Wygoogluj: wpisz klucz Serper.dev API w Edytorze Konwersacji (sekcja „Wygoogluj (Serper.dev)").');
      return [];
    }
    try {
      // Przez proxy backendu — Serper nie pozwala wołać się z przeglądarki (CORS).
      const res = await fetch('/api/search/web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, apiKey, count: 10 }),
      });
      if (!res.ok) {
        const body = await res.text();
        Aura.host.debug(`googleSearch: HTTP ${res.status} — ${body.slice(0, 200)}`);
        if (res.status === 404) {
          Aura.host.appendAssistant('⚠️ Wygoogluj: backend nie zna trasy /api/search/web (404) — zrestartuj backend (pnpm dev:backend).');
        } else if (res.status === 401 || res.status === 403) {
          Aura.host.appendAssistant(`⚠️ Wygoogluj: błędny/nieaktywny klucz Serper.dev (HTTP ${res.status}).`);
        } else {
          Aura.host.appendAssistant(`⚠️ Wygoogluj: błąd wyszukiwania (HTTP ${res.status}).`);
        }
        return [];
      }
      const data = await res.json() as { urls?: unknown };
      const urls = (Array.isArray(data.urls) ? data.urls : []).map(asText).filter(Boolean);
      Aura.host.debug(`googleSearch: OK, ${urls.length} wyników`);
      if (urls.length === 0) Aura.host.appendAssistant('ℹ️ Wygoogluj: 0 wyników dla tego zapytania.');
      return urls;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Aura.host.debug(`googleSearch: wyjątek — ${msg}`);
      Aura.host.appendAssistant(`⚠️ Wygoogluj: błąd połączenia (${msg}).`);
      return [];
    }
  }

  // ── VFS / Pliki ────────────────────────────────────────────────────────────

  /** Czyta plik z VFS jako tekst. */
  static async vfsReadFile(path: unknown): Promise<string> {
    const p = asText(path);
    if (!p) return '';
    return Aura.host.readVfsFile(p);
  }

  /**
   * Czyta JSON z VFS z opcjonalnym okrojeniem ścieżki i filtrami. Bloczek
   * przekazuje konfigurację jako JSON-string, skrypt może podać obiekt.
   */
  static async vfsReadJson(config: unknown): Promise<unknown> {
    let query: AuraJsonQuery | null = null;
    if (config && typeof config === 'object') {
      query = config as AuraJsonQuery;
    } else {
      try { query = JSON.parse(asText(config) || '{}') as AuraJsonQuery; }
      catch { query = null; }
    }
    if (!query || !query.path) return null;
    return Aura.host.queryVfsJson(query);
  }

  // ── Funkcje globalne ───────────────────────────────────────────────────────

  /** Rejestruje funkcję globalną (kategoria „Definicje globalne"). */
  static async registerGlobal(name: unknown, fn: GlobalFn): Promise<void> {
    const key = asText(name);
    if (key && typeof fn === 'function') Aura.globals[key] = fn;
  }

  /** Woła funkcję globalną; brak funkcji nie przerywa skryptu. */
  static async callGlobal(name: unknown, ...args: unknown[]): Promise<unknown> {
    const key = asText(name);
    const fn = Aura.globals[key];
    if (typeof fn !== 'function') {
      Aura.host.debug(`callGlobal: brak funkcji globalnej „${key}"`);
      return undefined;
    }
    return await fn(...args);
  }
}

/**
 * Obiekt zgodny ze starym API skryptów (`aura.say(...)`). Nowy kod powinien
 * używać `Aura.*` — ten alias istnieje, żeby skrypty napisane wcześniej
 * działały bez przepisywania.
 */
export const aura = {
  onActivator: (phrase: unknown, fn: () => Promise<void>) => Aura.onActivator(phrase, fn),
  say: (text: unknown) => Aura.say(text),
  ask: (text: unknown) => Aura.ask(text),
  listen: (timeout: unknown) => Aura.listen(timeout),
  lastUtterance: () => Aura.lastUtterance(),
  utteranceContains: (fragment: unknown) => Aura.utteranceContains(fragment),
  callAction: (id: unknown) => Aura.callAction(id),
  wait: (seconds: unknown) => Aura.wait(seconds),
  bell: (options?: unknown) => Aura.bell(options),
  backgroundAction: (label: unknown) => Aura.backgroundAction(label),
  endConversation: (message: unknown) => Aura.endConversation(message),
  showComponent: (config: unknown) => Aura.showComponent(config),
  agentNewChat: (id: unknown) => Aura.agentNewChat(id),
  agentSendPrompt: (prompt: unknown) => Aura.agentSendPrompt(prompt),
  agentResponse: () => Aura.agentResponse(),
  googleSearch: (query: unknown) => Aura.googleSearch(query),
  vfsReadFile: (path: unknown) => Aura.vfsReadFile(path),
  vfsReadJson: (config: unknown) => Aura.vfsReadJson(config),
  callGlobal: (name: unknown, ...args: unknown[]) => Aura.callGlobal(name, ...args),
  registerGlobal: (name: unknown, fn: GlobalFn) => Aura.registerGlobal(name, fn),
};

export default Aura;
