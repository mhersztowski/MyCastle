/**
 * Symulacja funkcjonalna — czujniki bez sprzętu.
 *
 * Nie zastępuje QEMU ani Renode i nie udaje, że to robi: nie wykonuje kodu
 * wsadu. Odpowiada na jedno pytanie — „skąd czujnik bierze wartość, gdy nie ma
 * płytki" — żeby dało się rozwijać logikę aplikacji, ekrany i telemetrię przed
 * przylutowaniem czegokolwiek. Modele opisuje sekcja `simulation.sources`
 * pliku projektu.
 *
 * Wszystko jest odtwarzalne: ten sam ziarno i ta sama chwila dają tę samą
 * wartość. Symulacja, której nie da się powtórzyć, nie nadaje się do szukania
 * błędów, a po to głównie istnieje.
 */

export type SourceModel =
    | { model: 'constant'; [key: string]: unknown }
    | { model: 'atmosphere'; p_hpa?: number; t_c?: number; noise?: number }
    | { model: 'ramp'; from: number; to: number; period_s: number }
    | { model: 'sine'; center?: number; amplitude: number; period_s: number }
    | { model: 'playback'; file: string }
    | { model: 'random'; min: number; max: number };

export interface SampleAt {
    /** Chwila od początku symulacji. */
    t_us: number;
    /** Wartości kanałów — tyle, ile daje czujnik. */
    values: number[];
}

export interface SourceOptions {
    /** Ziarno generatora — zapewnia powtarzalność. */
    seed?: number;
    /** Dane odtwarzane z pliku, gdy model to `playback`. */
    playback?: readonly SampleAt[];
}

/**
 * Wylicza wartość źródła w danej chwili.
 *
 * Funkcja czysta: dostaje czas, zwraca wartość. Dzięki temu symulacja daje się
 * przewinąć w dowolne miejsce bez odtwarzania całej historii — czego stan
 * wewnętrzny by nie pozwolił.
 */
export function sampleSource(source: SourceModel, t_us: number,
                             options: SourceOptions = {}): number[] {
    const t = t_us / 1_000_000;

    switch (source.model) {
        case 'constant': {
            // Wartości podane wprost jako pola: `{ model: constant, v: 7.4, a: 0.35 }`.
            const values = Object.entries(source)
                .filter(([key, value]) => key !== 'model' && typeof value === 'number')
                .map(([, value]) => value as number);
            return values.length > 0 ? values : [0];
        }

        case 'atmosphere': {
            const pressure = source.p_hpa ?? 1013.25;
            const temperature = source.t_c ?? 21;
            const noise = source.noise ?? 0;
            return [
                pressure + jitter(t_us, options.seed ?? 0, 1) * noise,
                temperature + jitter(t_us, options.seed ?? 0, 2) * noise * 0.1,
            ];
        }

        case 'ramp': {
            // Piła, nie schodek: wartość wraca do początku po okresie.
            const phase = source.period_s > 0 ? (t % source.period_s) / source.period_s : 0;
            return [source.from + (source.to - source.from) * phase];
        }

        case 'sine': {
            const center = source.center ?? 0;
            const phase = source.period_s > 0 ? (2 * Math.PI * t) / source.period_s : 0;
            return [center + source.amplitude * Math.sin(phase)];
        }

        case 'random': {
            const value = (jitter(t_us, options.seed ?? 0, 3) + 1) / 2;
            return [source.min + (source.max - source.min) * value];
        }

        case 'playback': {
            const data = options.playback ?? [];
            if (data.length === 0) return [0];
            // Ostatnia próbka nie późniejsza niż żądana chwila — zatrzask,
            // nie interpolacja: czujnik też oddaje ostatni pomiar, a nie
            // wartość pośrednią.
            let chosen = data[0]!;
            for (const sample of data) {
                if (sample.t_us > t_us) break;
                chosen = sample;
            }
            return chosen.values;
        }
    }
}

/**
 * Powtarzalny szum w przedziale [-1, 1].
 *
 * Własny generator, a nie `Math.random()`: ten drugi nie daje się zasiać,
 * więc przebieg symulacji byłby za każdym razem inny i żadnego zaobserwowanego
 * błędu nie dałoby się odtworzyć.
 */
function jitter(t_us: number, seed: number, channel: number): number {
    let x = (t_us | 0) ^ (seed * 2654435761) ^ (channel * 40503);
    x = Math.imul(x ^ (x >>> 16), 2246822507);
    x = Math.imul(x ^ (x >>> 13), 3266489909);
    x = (x ^ (x >>> 16)) >>> 0;
    return (x / 0xffffffff) * 2 - 1;
}

/** Odczytuje modele źródeł z sekcji `simulation.sources` pliku projektu. */
export function sourcesFrom(model: unknown): Record<string, SourceModel> {
    const simulation = asRecord(asRecord(model)?.['simulation']);
    const sources = asRecord(simulation?.['sources']);
    if (!sources) return {};

    const out: Record<string, SourceModel> = {};
    for (const [name, raw] of Object.entries(sources)) {
        const source = asRecord(raw);
        if (typeof source?.['model'] === 'string') out[name] = source as SourceModel;
    }
    return out;
}

/** Krok czasu symulacji; domyślnie milisekunda. */
export function timestepOf(model: unknown): number {
    const simulation = asRecord(asRecord(model)?.['simulation']);
    const step = simulation?.['timestep_us'];
    return typeof step === 'number' && step > 0 ? step : 1000;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}
