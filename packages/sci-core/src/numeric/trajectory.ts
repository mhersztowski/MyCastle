/**
 * trajectory.ts — wynik całkowania jako próbki z interpolacją.
 *
 * Solver i renderer mają różne kroki: solver dobiera krok pod dokładność, a
 * renderer pod klatki ekranu. Gdyby renderer czytał wprost tablicę kroków,
 * zmiana dokładności zmieniałaby płynność animacji — dlatego trajektoria
 * udostępnia **odczyt po czasie**, a nie po indeksie.
 */

/** Stan układu — wektor liczb w kolejności zmiennych stanu. */
export type State = number[];

export interface Sample {
  t: number;
  y: State;
}

export class Trajectory {
  constructor(
    readonly samples: Sample[],
    /** Nazwy zmiennych stanu w kolejności wektora — po nich czyta się wynik. */
    readonly stateNames: string[],
  ) {}

  get t0(): number { return this.samples[0]?.t ?? 0; }
  get t1(): number { return this.samples[this.samples.length - 1]?.t ?? 0; }
  get length(): number { return this.samples.length; }

  /**
   * Stan w dowolnej chwili — interpolacja liniowa między próbkami.
   *
   * Poza zakresem zwraca skrajną próbkę zamiast ekstrapolować: przedłużanie
   * trajektorii poza policzony przedział to zgadywanie, a na wykresie wygląda
   * jak wynik obliczeń.
   */
  at(t: number): State {
    const { samples } = this;
    if (!samples.length) return [];
    if (t <= samples[0].t) return [...samples[0].y];
    if (t >= samples[samples.length - 1].t) return [...samples[samples.length - 1].y];

    // Wyszukiwanie binarne — trajektoria bywa długa, a renderer pyta co klatkę.
    let lo = 0;
    let hi = samples.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].t <= t) lo = mid;
      else hi = mid;
    }

    const a = samples[lo];
    const b = samples[hi];
    const span = b.t - a.t;
    const u = span === 0 ? 0 : (t - a.t) / span;
    return a.y.map((value, i) => value + (b.y[i] - value) * u);
  }

  /** Wartość jednej zmiennej stanu w chwili `t`. */
  value(name: string, t: number): number {
    const index = this.stateNames.indexOf(name);
    return index < 0 ? Number.NaN : this.at(t)[index];
  }

  /** Przebieg jednej zmiennej — pary [t, wartość] do wykresu. */
  series(name: string): Array<[number, number]> {
    const index = this.stateNames.indexOf(name);
    if (index < 0) return [];
    return this.samples.map((sample) => [sample.t, sample.y[index]]);
  }
}

/** Prawa strona układu: dy/dt = f(t, y). */
export type Derivative = (t: number, y: State) => State;

/**
 * Reakcja na stan po kroku.
 *
 * Zwrócony wektor zastępuje stan (odbicie, przeskok), `'stop'` kończy
 * całkowanie, `undefined` znaczy „nic się nie stało". Zdarzenia obsługujemy
 * między krokami, a nie w prawej stronie równania: skok prędkości przy odbiciu
 * nie jest pochodną i wstawiony do `f` rozsypałby każdy solver wyższego rzędu.
 */
export type StepHook = (t: number, y: State) => State | 'stop' | undefined;

export interface SolveOptions {
  /** Krok całkowania; solvery o stałym kroku używają go wprost. */
  dt: number;
  /**
   * Co ile kroków zapisywać próbkę.
   *
   * Dokładność wymaga małego kroku, a wykres nie potrzebuje miliona punktów —
   * to są dwie różne potrzeby i mają dwa różne pokrętła.
   */
  sampleEvery?: number;
}
