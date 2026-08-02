/**
 * defineModel.ts — model pisany ręcznie, spoza grafu wzorów.
 *
 * Graf pokrywa większość dydaktyki, ale nie wszystko: kolizje, siatki PDE i
 * geometria nie mieszczą się w układzie równań zapisanym w dokumencie. Raport
 * (3.6b) nazywa to wprost granicą automatyzacji i przewiduje drugą ścieżkę —
 * pełny kod. To jest ta ścieżka.
 *
 * Kluczowe: **kontrakt jest ten sam**. Model napisany ręcznie zwraca dokładnie
 * to samo co skompilowany z grafu, więc widoki, panel parametrów i zadania
 * działają na nim bez żadnej wiedzy o tym, skąd pochodzi. Gdyby ręczny model
 * miał własny interfejs, każdy widok musiałby znać dwa przypadki — a wtedy
 * druga ścieżka przestałaby być drugą ścieżką, a stała się drugim systemem.
 *
 * Autor podaje minimum (parametry i funkcję liczącą); resztę kontraktu —
 * obserwable, pary pochodnych, listę uwag — uzupełniamy stąd.
 */
import type { ObservableDef, ParamSchema, PhenomenonModel, PhenomenonResult } from '../graph/compileGraph';

export interface ManualModelSpec {
  /** Parametry z jednostkami i zakresami — z nich powstaje panel suwaków. */
  parameters: Array<Partial<ParamSchema> & { name: string }>;
  /**
   * Wielkości, które model pokazuje.
   *
   * `series` trafiają na wykres i do animacji, `scalar` obok niego. Autor musi
   * je wymienić, bo z kodu nie da się tego odczytać — inaczej niż z równań.
   */
  observables: Array<Partial<ObservableDef> & { name: string }>;
  /** Właściwe obliczenia. */
  run: (values: Record<string, number>, tSpan: [number, number], dt: number) => PhenomenonResult;
  /** Pary „zmienna, jej pochodna" — jeśli są, model dostaje przestrzeń fazową. */
  derivativePairs?: Array<[string, string]>;
  /** Czy model ma dynamikę w czasie. */
  dynamic?: boolean;
}

/** Zakres suwaka dobrany do rzędu wielkości — ta sama reguła co w grafie. */
function fillParameter(parameter: Partial<ParamSchema> & { name: string }): ParamSchema {
  const value = parameter.value ?? 1;
  const magnitude = Math.abs(value) || 1;
  const max = parameter.max ?? magnitude * 5;
  const min = parameter.min ?? 0;
  return {
    name: parameter.name,
    unit: parameter.unit ?? '1',
    value,
    min,
    max,
    step: parameter.step ?? (max - min) / 200,
  };
}

/**
 * Buduje model z ręcznego opisu.
 *
 * Sprawdzenia są tu, a nie w wywołującym, bo model pisany ręcznie nie ma
 * walidacji grafu za sobą: literówka w nazwie obserwabli objawiłaby się pustym
 * wykresem bez słowa wyjaśnienia.
 */
export function defineModel(spec: ManualModelSpec): PhenomenonModel {
  const issues: string[] = [];

  if (!spec.parameters.length) issues.push('Model nie ma żadnego parametru — nie będzie czym sterować.');
  if (!spec.observables.length) issues.push('Model nie ma żadnej wielkości do pokazania.');

  const parameters = spec.parameters.map(fillParameter);
  const observables: ObservableDef[] = spec.observables.map((observable) => ({
    name: observable.name,
    kind: observable.kind ?? 'series',
    unit: observable.unit,
    fromState: observable.fromState ?? (observable.kind ?? 'series') === 'series',
    formulaId: observable.formulaId,
  }));

  const duplicates = observables
    .map((o) => o.name)
    .filter((name, index, all) => all.indexOf(name) !== index);
  if (duplicates.length) issues.push(`Powtórzone wielkości: ${[...new Set(duplicates)].join(', ')}.`);

  for (const [position, velocity] of spec.derivativePairs ?? []) {
    if (!observables.some((o) => o.name === position) || !observables.some((o) => o.name === velocity)) {
      issues.push(`Para pochodnych (${position}, ${velocity}) wskazuje wielkość spoza modelu.`);
    }
  }

  return {
    parameters,
    observables,
    dynamic: spec.dynamic ?? true,
    derivativePairs: spec.derivativePairs ?? [],
    issues,
    run(values, tSpan = [0, 10], dt = 0.005) {
      const complete = { ...Object.fromEntries(parameters.map((p) => [p.name, p.value])), ...values };
      const result = spec.run(complete, tSpan, dt);
      // Uzupełniamy brakujące pola: autor ręcznego modelu ma zwrócić wyniki, a
      // nie pamiętać o kształcie struktury.
      return { scalars: result.scalars ?? {}, series: result.series ?? {}, trajectory: result.trajectory };
    },
  };
}
