/**
 * runScript.ts — model z kodu napisanego w dokumencie.
 *
 * Blok `simscript` z raportu (4): kod dla zjawisk, których nie ma w bibliotece.
 * Ścieżka jest celowo taka sama jak dla modeli ręcznych — skrypt wywołuje
 * `defineModel` i zwraca to, co zwróciłby plik w pakiecie. Dzięki temu
 * „eksperyment zaczyna życie jako simscript, a po dopracowaniu awansuje do
 * biblioteki" jest przenosinami pliku, a nie przepisywaniem go.
 *
 * **Skrypt jest w TypeScripcie**, nie w JS, i to jest istotne dla całej
 * ścieżki awansu: kod, który ma kiedyś trafić do pakietu, od pierwszej chwili
 * ma typy, a edytor podpowiada API rdzenia i sprawdza sygnatury. Gdyby blok
 * przyjmował JS, awans oznaczałby dopisywanie typów do gotowego kodu — czyli
 * dokładnie ten moment, w którym najłatwiej o pomyłkę.
 *
 * Uruchomienie ma dwa kroki: `sucrase` **usuwa typy** (nie sprawdza ich — od
 * sprawdzania jest edytor), a `Function` wykonuje wynik. To nie jest
 * piaskownica bezpieczeństwa i nie udajemy, że jest: skrypt w dokumencie ma
 * tyle samo uprawnień, co każdy inny kod autora dokumentu. Zasłaniamy natomiast
 * `window`, `fetch` i spółkę, żeby model fizyczny nie sięgał po przeglądarkę
 * przez pomyłkę — i żeby dało się go później uruchomić w Web Workerze bez
 * niespodzianek.
 */
import { transform } from 'sucrase';
import { defineModel, type ManualModelSpec } from './defineModel';
import { rk4, euler, verlet } from '../numeric/solvers';
import { Trajectory } from '../numeric/trajectory';
import { CONSTANTS } from '../units/constants';
import { toSI } from '../units/quantity';
import type { PhenomenonModel } from '../graph/compileGraph';
import { heliocentric, distanceFromEarth, geocentricLongitude, BODIES } from '../astro/ephemeris';

/** Co skrypt dostaje pod ręką — rdzeń biblioteki, nic więcej. */
export interface ScriptApi {
  defineModel: typeof defineModel;
  rk4: typeof rk4;
  euler: typeof euler;
  verlet: typeof verlet;
  Trajectory: typeof Trajectory;
  CONSTANTS: typeof CONSTANTS;
  toSI: typeof toSI;
  /** Deterministyczny generator — ta sama zasada co w zadaniach. */
  random: (seed: number) => () => number;
  /** Efemerydy planet — wchłonięty moduł astronomiczny. */
  heliocentric: typeof heliocentric;
  distanceFromEarth: typeof distanceFromEarth;
  geocentricLongitude: typeof geocentricLongitude;
  BODIES: typeof BODIES;
}

/**
 * Deklaracje dla edytora.
 *
 * Host (Monaco) może je wstrzyknąć jako bibliotekę dodatkową, żeby autor
 * dostał podpowiadanie i sprawdzanie typów w bloku. Trzymamy je tutaj, przy
 * definicji API, bo rozjazd deklaracji z rzeczywistością byłby gorszy niż ich
 * brak — podpowiedź do funkcji, która nie istnieje, myli bardziej niż cisza.
 */
export const SCRIPT_API_TYPES = `
declare function defineModel(spec: {
  parameters: Array<{ name: string; unit?: string; value?: number; min?: number; max?: number; step?: number }>;
  observables: Array<{ name: string; kind?: 'scalar' | 'series'; unit?: string }>;
  run: (values: Record<string, number>, tSpan: [number, number], dt: number) => {
    scalars?: Record<string, number>;
    series?: Record<string, Array<[number, number]>>;
    trajectory?: unknown;
  };
  derivativePairs?: Array<[string, string]>;
  dynamic?: boolean;
}): unknown;

declare function rk4(
  f: (t: number, y: number[]) => number[],
  y0: number[],
  tSpan: [number, number],
  options: { dt: number; sampleEvery?: number; stateNames?: string[] },
): { samples: Array<{ t: number; y: number[] }>; series(name: string): Array<[number, number]> };

declare function toSI(value: string | number, expected?: string): number;
declare function random(seed: number): () => number;
declare const CONSTANTS: Record<string, { value: number; unit: string; name: string }>;

declare function heliocentric(
  planet: string,
  date: Date | number,
  units?: 'AU' | 'm',
): { x: number; y: number; z: number; r: number } | undefined;
declare function distanceFromEarth(planet: string, date: Date | number): number | undefined;
declare function geocentricLongitude(planet: string, date: Date | number): number | undefined;
declare const BODIES: Record<string, { mass: number; radius: number; color: string }>;
`;

/**
 * Nazwy zasłonięte w zakresie skryptu.
 *
 * Nie obrona przed złośliwym kodem (ten i tak ma `globalThis`), tylko ochrona
 * przed przypadkowym sięgnięciem po przeglądarkę z modelu fizycznego.
 */
const SHADOWED = [
  'window', 'document', 'globalThis', 'self', 'fetch', 'XMLHttpRequest',
  'localStorage', 'sessionStorage', 'indexedDB', 'WebSocket', 'importScripts',
  'process', 'require',
];
// `eval` i `arguments` świadomie poza listą: w trybie strict nie wolno ich użyć
// jako nazw parametrów, więc próba zasłonięcia wywala każdy skrypt na starcie.
// Sam tryb strict i tak ogranicza `eval` do jego własnego zakresu.

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ScriptResult {
  model?: PhenomenonModel;
  issues: string[];
  /** Kod po usunięciu typów — pomaga zrozumieć błąd wykonania. */
  compiled?: string;
}

/**
 * Usuwa typy z kodu TypeScript.
 *
 * Wydzielone, bo błąd składni trzeba odróżnić od błędu wykonania: pierwszy
 * wskazuje miejsce w kodzie, drugi dotyczy już działającego modelu.
 */
export function stripTypes(code: string): { js?: string; error?: string } {
  try {
    // `imports: false` — skrypt nie ma modułów, API przychodzi przez zakres.
    const { code: js } = transform(code, {
      transforms: ['typescript'],
      disableESTransforms: true,
    });
    return { js };
  } catch (error) {
    return { error: `Błąd składni: ${(error as Error).message}` };
  }
}

/**
 * Uruchamia skrypt i odbiera model.
 *
 * Skrypt ma zwrócić wynik `defineModel(...)` — przez `return` albo przez
 * przypisanie do `model`. Druga forma jest dla wygody: `return` na najwyższym
 * poziomie bloku w dokumencie wygląda dziwnie.
 */
export function runScript(code: string, api: Partial<ScriptApi> = {}): ScriptResult {
  const stripped = stripTypes(code);
  if (stripped.error || stripped.js === undefined) return { issues: [stripped.error ?? 'Nie umiem odczytać skryptu.'] };

  const full: ScriptApi = {
    defineModel,
    rk4,
    euler,
    verlet,
    Trajectory,
    CONSTANTS,
    toSI,
    random: seededRandom,
    heliocentric,
    distanceFromEarth,
    geocentricLongitude,
    BODIES,
    ...api,
  };

  const names = [...Object.keys(full), ...SHADOWED];
  const values = [...Object.values(full), ...SHADOWED.map(() => undefined)];

  try {
    // `model` deklarowane wewnątrz, żeby skrypt mógł je przypisać bez `return`,
    // i odczytane na końcu, gdy `return` nie padł.
    const body = `"use strict";\nlet model;\n${stripped.js}\n;return model;`;
    const factory = new Function(...names, body) as (...args: unknown[]) => unknown;
    const result = factory(...values);

    if (!result || typeof result !== 'object') {
      return {
        issues: ['Skrypt nie zwrócił modelu. Zakończ go `return defineModel({...})` albo przypisz do `model`.'],
        compiled: stripped.js,
      };
    }

    const model = result as PhenomenonModel;
    if (!Array.isArray(model.parameters) || typeof model.run !== 'function') {
      return { issues: ['Zwrócona wartość nie jest modelem — użyj `defineModel({...})`.'], compiled: stripped.js };
    }

    return { model, issues: model.issues ?? [], compiled: stripped.js };
  } catch (error) {
    return { issues: [`Błąd w skrypcie: ${(error as Error).message}`], compiled: stripped.js };
  }
}

export type { ManualModelSpec };
