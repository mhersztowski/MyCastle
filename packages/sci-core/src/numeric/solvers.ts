/**
 * solvers.ts — całkowanie równań ruchu.
 *
 * Pisane własnoręcznie świadomie: to trzydzieści linii na metodę, a czytanie
 * ich uczy więcej fizyki niż jakikolwiek opis. Wrapper wokół cudzej biblioteki
 * byłby dłuższy niż to.
 *
 * Trzy metody, bo różnią się tym, co psują:
 *
 *  • **Euler** — pierwszego rzędu, energia narasta. Zostaje wyłącznie jako
 *    materiał poglądowy: na wykresie widać, dlaczego nie wystarcza.
 *  • **RK4** — czwartego rzędu, domyślny wybór. Dokładny na krótkich
 *    przedziałach, ale w długiej symulacji energia powoli dryfuje.
 *  • **Verlet (leapfrog)** — drugiego rzędu, za to symplektyczny: błąd energii
 *    oscyluje wokół stałej zamiast narastać. Dlatego to on, a nie RK4, nadaje
 *    się do orbit i wahadeł liczonych przez tysiące okresów.
 *
 * Wybór metody jest więc decyzją fizyczną, nie techniczną — stąd trzy osobne
 * funkcje z jednym interfejsem zamiast jednej z przełącznikiem w środku.
 */
import { Trajectory, type Derivative, type SolveOptions, type State, type StepHook } from './trajectory';

/** Ile kroków wykonać, żeby przejść przedział — z zabezpieczeniem przed zerem. */
function stepCount(tSpan: [number, number], dt: number): number {
  const span = tSpan[1] - tSpan[0];
  if (!(dt > 0) || !(span > 0)) return 0;
  return Math.max(1, Math.round(span / dt));
}

/** Domyślne nazwy zmiennych stanu, gdy woła się solver wprost. */
function defaultNames(n: number, prefix = 'y'): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${i}`);
}

export interface SolverOptions extends SolveOptions {
  /** Nazwy zmiennych stanu — trajektoria pozwala potem czytać je po nazwie. */
  stateNames?: string[];
  /** Wywoływane po każdym kroku; obsługa zdarzeń (odbicie, próg, zatrzymanie). */
  onStep?: StepHook;
}

/**
 * Metoda Eulera: y' ≈ f(t, y), jeden krok naprzód.
 *
 * Najprostsza możliwa i właśnie dlatego pouczająca — po kilkudziesięciu
 * okresach oscylatora widać, jak amplituda rośnie z niczego.
 */
export function euler(f: Derivative, y0: State, tSpan: [number, number], options: SolverOptions): Trajectory {
  const { dt, sampleEvery = 1 } = options;
  const steps = stepCount(tSpan, dt);
  const samples = [{ t: tSpan[0], y: [...y0] }];

  let t = tSpan[0];
  let y = [...y0];
  for (let i = 0; i < steps; i += 1) {
    const dy = f(t, y);
    y = y.map((value, k) => value + dt * dy[k]);
    t += dt;

    const reaction = options.onStep?.(t, y);
    if (reaction === 'stop') { samples.push({ t, y: [...y] }); break; }
    if (reaction) y = reaction;

    if ((i + 1) % sampleEvery === 0 || i === steps - 1) samples.push({ t, y: [...y] });
  }

  return new Trajectory(samples, options.stateNames ?? defaultNames(y0.length));
}

/**
 * Runge–Kutta 4. rzędu: średnia ważona z czterech próbek pochodnej.
 *
 * Cztery wywołania `f` na krok, za to błąd maleje z czwartą potęgą kroku —
 * przy tej samej pracy jest dokładniejszy od Eulera o rzędy wielkości.
 */
export function rk4(f: Derivative, y0: State, tSpan: [number, number], options: SolverOptions): Trajectory {
  const { dt, sampleEvery = 1 } = options;
  const steps = stepCount(tSpan, dt);
  const samples = [{ t: tSpan[0], y: [...y0] }];

  let t = tSpan[0];
  let y = [...y0];
  for (let i = 0; i < steps; i += 1) {
    const k1 = f(t, y);
    const k2 = f(t + dt / 2, y.map((v, k) => v + (dt / 2) * k1[k]));
    const k3 = f(t + dt / 2, y.map((v, k) => v + (dt / 2) * k2[k]));
    const k4 = f(t + dt, y.map((v, k) => v + dt * k3[k]));

    y = y.map((v, k) => v + (dt / 6) * (k1[k] + 2 * k2[k] + 2 * k3[k] + k4[k]));
    t += dt;

    const reaction = options.onStep?.(t, y);
    if (reaction === 'stop') { samples.push({ t, y: [...y] }); break; }
    if (reaction) y = reaction;

    if ((i + 1) % sampleEvery === 0 || i === steps - 1) samples.push({ t, y: [...y] });
  }

  return new Trajectory(samples, options.stateNames ?? defaultNames(y0.length));
}

/** Przyspieszenie jako funkcja położeń: a = f(t, x). */
export type Acceleration = (t: number, x: State) => State;

/**
 * Velocity Verlet — dla układów, w których siła zależy tylko od położenia.
 *
 * Wymaga innego wejścia niż pozostałe (przyspieszenie zamiast pełnej pochodnej)
 * i to nie jest niedogodność, tylko sedno: właśnie ta struktura pozwala
 * przeplatać aktualizację położeń i prędkości tak, że błąd energii nie narasta.
 * Opakowanie go we wspólny interfejs `Derivative` zabrałoby tę własność.
 */
export function verlet(
  a: Acceleration,
  x0: State,
  v0: State,
  tSpan: [number, number],
  options: SolverOptions,
): Trajectory {
  const { dt, sampleEvery = 1 } = options;
  const steps = stepCount(tSpan, dt);

  let t = tSpan[0];
  let x = [...x0];
  let v = [...v0];
  let acc = a(t, x);

  const samples = [{ t, y: [...x, ...v] }];
  for (let i = 0; i < steps; i += 1) {
    // Położenie z pełnego kroku, prędkość z dwóch połówek — stąd „leapfrog".
    x = x.map((xi, k) => xi + v[k] * dt + 0.5 * acc[k] * dt * dt);
    const accNext = a(t + dt, x);
    v = v.map((vi, k) => vi + 0.5 * (acc[k] + accNext[k]) * dt);
    acc = accNext;
    t += dt;

    const reaction = options.onStep?.(t, [...x, ...v]);
    if (reaction === 'stop') { samples.push({ t, y: [...x, ...v] }); break; }
    if (reaction) {
      x = reaction.slice(0, x.length);
      v = reaction.slice(x.length);
      // Po zmianie położenia stare przyspieszenie już nie obowiązuje.
      acc = a(t, x);
    }

    if ((i + 1) % sampleEvery === 0 || i === steps - 1) samples.push({ t, y: [...x, ...v] });
  }

  const names = options.stateNames
    ?? [...defaultNames(x0.length, 'x'), ...defaultNames(v0.length, 'v')];
  return new Trajectory(samples, names);
}

export type SolverName = 'euler' | 'rk4';

/** Wybór metody po nazwie — dla solverów o wspólnym wejściu. */
export function solve(
  method: SolverName,
  f: Derivative,
  y0: State,
  tSpan: [number, number],
  options: SolverOptions,
): Trajectory {
  return method === 'euler' ? euler(f, y0, tSpan, options) : rk4(f, y0, tSpan, options);
}
