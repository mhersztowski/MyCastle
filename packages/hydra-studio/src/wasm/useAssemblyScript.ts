/**
 * Kompilacja AssemblyScriptu widziana od strony interfejsu.
 *
 * Panel chce trzech rzeczy: wywołać kompilację, wiedzieć że trwa i dostać
 * wynik. Wszystko poniżej — worker, numerowanie żądań, odrzucanie spóźnionych
 * odpowiedzi — jest tu, żeby nie musiał o tym wiedzieć.
 *
 * **Spóźnione wyniki.** Kompilacja trwa ułamek sekundy albo dłużej, a
 * użytkownik pisze dalej. Bez numerowania żądań wynik starszej kompilacji
 * potrafi przyjść po nowszej i nadpisać świeżą diagnostykę tą sprzed dwóch
 * znaków — objaw wygląda jak „edytor pokazuje błędy, których już nie ma".
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { compileAssemblyScript, type CompileRequest, type CompileResult } from './compileAssemblyScript';
import type { WorkerRequest, WorkerResponse } from './ascWorker';

export interface AssemblyScriptCompiler {
    compile(request: CompileRequest): void;
    /** Czy trwa kompilacja — do wygaszenia przycisku i pokazania wskaźnika. */
    busy: boolean;
    /** Wynik ostatniej **niespóźnionej** kompilacji. */
    result: CompileResult | null;
}

/**
 * Tworzy workera. Wydzielone, bo `new URL(..., import.meta.url)` bundler
 * rozpoznaje statycznie — musi stać dosłownie w kodzie, inaczej Vite nie
 * zbuduje osobnej paczki dla wątku.
 */
function spawnWorker(): Worker | null {
    try {
        // `.js`, nie `.ts`: adres rozwiązuje bundler odbiorcy względem paczki
        // wydanej, a tam leży już skompilowany plik. tsup buduje go jako
        // osobne wejście właśnie po to.
        return new Worker(new URL('./ascWorker.js', import.meta.url), { type: 'module' });
    } catch {
        // Środowiska bez workerów (testy w Node, starsze osadzenia) dostają
        // ścieżkę zapasową — wolniej i z zajętym wątkiem, ale działa.
        return null;
    }
}

export function useAssemblyScript(): AssemblyScriptCompiler {
    const workerRef = useRef<Worker | null>(null);
    const nextId = useRef(0);
    const latest = useRef(0);

    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<CompileResult | null>(null);

    useEffect(() => {
        const worker = spawnWorker();
        workerRef.current = worker;
        if (!worker) return undefined;

        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
            const { id, ...compiled } = event.data;
            // Wynik starszy niż ostatnie żądanie milczy — patrz nagłówek.
            if (id !== latest.current) return;
            setResult(compiled);
            setBusy(false);
        };

        return () => {
            worker.terminate();
            workerRef.current = null;
        };
    }, []);

    const compile = useCallback((request: CompileRequest) => {
        const id = ++nextId.current;
        latest.current = id;
        setBusy(true);

        const worker = workerRef.current;
        if (worker) {
            worker.postMessage({ id, ...request } satisfies WorkerRequest);
            return;
        }

        // Bez workera kompilujemy na miejscu. Ta sama funkcja, ten sam wynik —
        // różnica jest wyłącznie w tym, który wątek stoi.
        void compileAssemblyScript(request).then(compiled => {
            if (id !== latest.current) return;
            setResult(compiled);
            setBusy(false);
        });
    }, []);

    return { compile, busy, result };
}
