/**
 * Podgląd magistrali zdarzeń i wstrzykiwanie zdarzeń.
 *
 * Framework wypisuje zdarzenia w postaci, którą da się odczytać z portu:
 * `EV sense/sample 21.5 1013.2`. Panel pokazuje strumień, a wstrzykiwanie
 * pozwala sprawdzić reakcję aplikacji bez doprowadzania urządzenia do stanu,
 * w którym zdarzenie powstanie samo — czekanie na rozładowanie akumulatora,
 * żeby zobaczyć ekran ostrzeżenia, jest kiepskim sposobem na pracę.
 *
 * Wstrzyknięcie idzie tą samą drogą co polecenia shella, bo to po prostu
 * kolejne polecenie. Nie ma tu osobnego kanału, który mógłby działać
 * na stanowisku, a nie działać w terenie.
 */

import type { EventLine } from './telemetry';

/** Zdarzenie odczytane ze strumienia urządzenia. */
export interface BusEvent extends EventLine {
    /** Wartości liczbowe wyłuskane z ładunku — do rysowania przebiegu. */
    values: number[];
}

/**
 * Rozbiera wiersz zdarzenia.
 *
 * Wiersz niepasujący do wzorca zwracamy jako `undefined`, a nie jako zdarzenie
 * o pustym temacie: panel zdarzeń pokazujący śmieci z portu byłby gorszy od
 * pustego, bo trudniej dostrzec w nim to, co istotne. Śmieci widać w monitorze,
 * który po to jest.
 */
export function parseEvent(raw: string, at: number): BusEvent | undefined {
    const match = /^EV\s+(\S+)\s*(.*)$/.exec(raw.trim());
    if (!match) return undefined;

    const payload = match[2] ?? '';
    return {
        at,
        topic: match[1]!,
        payload,
        values: payload.split(/\s+/)
            .map((token) => Number(token))
            .filter((value) => Number.isFinite(value)),
    };
}

/**
 * Składa polecenie wstrzyknięcia zdarzenia.
 *
 * Wartości przechodzą przez sprawdzenie, bo polecenie leci wprost do
 * urządzenia: temat ze spacją rozpadłby się na dwa argumenty i shell wykonałby
 * coś innego, niż użytkownik zamierzał.
 */
export function injectCommand(topic: string, values: readonly number[]): string | undefined {
    if (!/^[a-z0-9][a-z0-9/_-]*$/i.test(topic)) return undefined;
    if (values.some((value) => !Number.isFinite(value))) return undefined;
    return `ev inject ${topic}${values.length > 0 ? ' ' + values.join(' ') : ''}`;
}

/** Tematy zdarzeń widziane w strumieniu — do podpowiedzi przy wstrzykiwaniu. */
export function topicsSeen(events: readonly BusEvent[]): string[] {
    return [...new Set(events.map((event) => event.topic))].sort();
}

/**
 * Zamienia strumień zdarzeń na zmiany do zapisu przebiegów.
 *
 * Każdy temat dostaje własny sygnał; wartość pierwszego kanału trafia jako
 * liczba. Dzięki temu telemetria i sygnały magistral leżą na jednej osi czasu
 * i widać, że pomiar spadł dokładnie wtedy, gdy na magistrali coś się zacięło.
 */
export function eventsToVcd(events: readonly BusEvent[], t0: number):
        { signals: { name: string; width: number; scope: string }[];
          changes: { t_us: number; signal: string; value: number | undefined }[] } {
    const topics = topicsSeen(events);
    const signals = topics.map((topic) => ({
        name: `ev_${topic.replace(/[^a-zA-Z0-9]+/g, '_')}`,
        width: 16,
        scope: 'eventbus',
    }));

    const byTopic = new Map(topics.map((topic, index) => [topic, signals[index]!.name]));
    const changes = events
        .filter((event) => event.values.length > 0)
        .map((event) => ({
            // Znacznik czasu zdarzenia jest w milisekundach zegara Studia;
            // na osi przebiegu liczy się odstęp od początku nagrania.
            t_us: Math.max(0, (event.at - t0) * 1000),
            signal: byTopic.get(event.topic)!,
            value: Math.round(event.values[0]!),
        }));

    return { signals, changes };
}
