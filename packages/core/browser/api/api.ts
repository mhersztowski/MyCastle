/**
 * browser/api/api.ts — kontrakt środowiska skryptów Automate.
 *
 * Skrypt deklaruje, czego potrzebuje, importem:
 *
 *   import { api, display } from 'mycastle/packages/core/browser/api/api';
 *   api.log.info('start');
 *   display.text('gotowe');
 *
 * Host (edytor markdown, Aura, render bezgłowy) buduje instancje **na każdy
 * przebieg** przez `createAutomateApi` / `createDisplay` i podstawia je pod te
 * nazwy. Świadomie NIE ma tu statycznego `setHost` jak w `aura/aura.ts`:
 * `display` kieruje wyniki do panelu konkretnego bloku, a `onStop`/timery są
 * własnością jednego przebiegu. Gdyby host był globalny, blok animujący coś
 * przez `requestAnimationFrame` zaczynałby pisać do panelu bloku uruchomionego
 * chwilę później — cicho i tylko przy nałożeniu przebiegów.
 *
 * Środowisko może być niepełne. Zamiast wywracać skrypt na `undefined`,
 * brakujące fragmenty zwracają zaślepki mówiące wprost, czego brakuje i
 * dlaczego (`createAutomateApi(host, { unavailableReason })`).
 */

// ── Display ──────────────────────────────────────────────────────────────────

export type DisplayItemType = 'text' | 'table' | 'list' | 'json' | 'html' | 'dom';

export interface DisplayItem {
  id: number;
  type: DisplayItemType;
  data: unknown;
  timestamp: number;
}

export interface DisplayApi {
  text(str: string): void;
  table(data: Record<string, unknown>[] | unknown[][]): void;
  list(items: unknown[]): void;
  json(obj: unknown): void;
  /** Surowy HTML — renderowany bez zmian w widoku `html`. */
  html(markup: string): void;
  /** Żywy element DOM (np. canvas Three.js) — montowany przez `appendChild`. */
  dom(element: unknown): void;
}

/** Odbiorca wyników jednego przebiegu (bufor bloku, czat Aury, plik). */
export interface DisplaySink {
  push(item: DisplayItem): void;
}

let displayItemSeq = 0;
const nextDisplayItemId = (): number => ++displayItemSeq;

/**
 * Buduje `display` dla jednego przebiegu. Każda pozycja dostaje unikatowy
 * identyfikator — renderer używa go jako klucza, więc ponowne uruchomienie
 * na pewno przemontuje element (istotne dla `dom`).
 */
export function createDisplay(sink: DisplaySink): DisplayApi {
  const emit = (type: DisplayItemType, data: unknown): void => {
    sink.push({ id: nextDisplayItemId(), type, data, timestamp: Date.now() });
  };
  return {
    text: (str) => emit('text', String(str)),
    table: (data) => emit('table', data),
    list: (items) => emit('list', items),
    json: (obj) => emit('json', obj),
    html: (markup) => emit('html', String(markup)),
    dom: (element) => emit('dom', element),
  };
}

/** `display` dla środowiska bez panelu wyników — zgłasza próbę i nic nie rysuje. */
export function createUnavailableDisplay(reason: string, onAttempt?: (method: string) => void): DisplayApi {
  const note = (method: string): void => {
    onAttempt?.(`display.${method}() jest niedostępne w tym środowisku (${reason}).`);
  };
  return {
    text: () => note('text'),
    table: () => note('table'),
    list: () => note('list'),
    json: () => note('json'),
    html: () => note('html'),
    dom: () => note('dom'),
  };
}

// ── API ──────────────────────────────────────────────────────────────────────

export interface AutomateLogApi {
  info(message: unknown, ...rest: unknown[]): void;
  warn(message: unknown, ...rest: unknown[]): void;
  error(message: unknown, ...rest: unknown[]): void;
  debug(message: unknown, ...rest: unknown[]): void;
}

/**
 * Kształt `api` widziany przez skrypt. Namespace'y są celowo luźno typowane —
 * pełne sygnatury żyją w implementacji hosta (`AutomateSystemApi`), a Monaco
 * bierze podpowiedzi z ambient `.d.ts`. Tu chodzi o granicę środowiska, nie
 * o powielenie tysiąca linii deklaracji.
 */
export interface AutomateApi {
  log: AutomateLogApi;
  [namespace: string]: unknown;
}

export interface CreateAutomateApiOptions {
  /** Wyjaśnienie dołączane do komunikatów o brakujących fragmentach. */
  unavailableReason?: string;
  /** Wywoływane przy sięgnięciu po niedostępny fragment (domyślnie `console.warn`). */
  onUnavailable?: (message: string) => void;
  /** Namespace'y, które mają być dostępne mimo braku w hoście (zaślepki bez ostrzeżeń). */
  silent?: string[];
}

/** Zaślepka namespace'u: każda metoda melduje brak zamiast rzucać TypeError. */
function unavailableNamespace(
  name: string,
  reason: string,
  report: (message: string) => void,
  silent: boolean,
): Record<string, unknown> {
  return new Proxy({}, {
    get: (_target, prop: string | symbol) => {
      if (typeof prop === 'symbol') return undefined;
      // Sondowanie w stylu `if (api.speech)` ma zwracać obiekt, a nie funkcję.
      if (prop === 'then') return undefined;
      return (...args: unknown[]): undefined => {
        if (!silent) report(`api.${name}.${prop}() jest niedostępne w tym środowisku (${reason}).`);
        void args;
        return undefined;
      };
    },
  }) as Record<string, unknown>;
}

/**
 * Buduje `api` dla jednego przebiegu z tego, co host naprawdę potrafi.
 * Brakujące namespace'y zastępuje zaślepkami — skrypt napisany dla notatki
 * uruchomiony w Aurze nie wywali się na `api.speech`, tylko powie, czego brak.
 */
export function createAutomateApi(
  host: Partial<AutomateApi>,
  options: CreateAutomateApiOptions = {},
): AutomateApi {
  const reason = options.unavailableReason ?? 'host go nie udostępnia';
  const report = options.onUnavailable ?? ((message: string) => console.warn(`[Automate] ${message}`));
  const silent = new Set(options.silent ?? []);

  return new Proxy(host as AutomateApi, {
    get: (target, prop: string | symbol, receiver) => {
      const value = Reflect.get(target, prop, receiver);
      if (value !== undefined || typeof prop === 'symbol') return value;
      if (prop === 'then') return undefined;   // obiekt nie może udawać thenable
      return unavailableNamespace(prop, reason, report, silent.has(prop));
    },
    has: () => true,   // `'speech' in api` ma być prawdą — zaślepka istnieje
  });
}

/** Kompletne `api`, w którym wszystko melduje brak — render bezgłowy, podgląd. */
export function createUnavailableApi(reason: string, onUnavailable?: (message: string) => void): AutomateApi {
  return createAutomateApi({}, { unavailableReason: reason, onUnavailable });
}

/**
 * Symbole, które host podstawia pod nazwy z importu. Trzymane razem, żeby
 * strippowanie importów i budowa zasięgu nie rozjechały się w dwóch miejscach.
 */
export interface AutomateScriptScope {
  api: AutomateApi;
  display: DisplayApi;
}

/** Nazwy eksportowane przez ten moduł — używane przy podmianie importów. */
export const AUTOMATE_SCRIPT_EXPORTS = ['api', 'display'] as const;
