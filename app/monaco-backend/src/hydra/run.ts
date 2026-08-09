import { spawn } from 'node:child_process';

/**
 * Uruchomienie `hydra.sh` i strumień jego wyjścia.
 *
 * Bez powłoki: `spawn` dostaje skrypt i tablicę argumentów, więc nazwy
 * katalogów ze spacjami i znakami specjalnymi nie wymagają cytowania, a treść
 * żądania nie może się rozrosnąć do dodatkowego polecenia.
 */

export interface HydraRunHandle {
    /** Przerwanie budowania — używane, gdy klient rozłączy się w trakcie. */
    cancel(): void;
    /** Kod wyjścia procesu. */
    done: Promise<number>;
}

export function runHydra(
    script: string,
    args: string[],
    onLine: (line: string) => void,
    cwd?: string,
): HydraRunHandle {
    const child = spawn(script, args, {
        /*
         * Całe środowisko, nie wybrane zmienne.
         *
         * `hydra.sh` woła `docker`, który bez ścieżki systemowej się nie
         * znajdzie, a uruchomiony program natywny potrzebuje `WAYLAND_DISPLAY`
         * i `DISPLAY` — bez nich WSLg nie ma gdzie pokazać okna i SDL kończy
         * się „No available video device".
         */
        env: { ...process.env, TERM: 'dumb' },
        stdio: ['ignore', 'pipe', 'pipe'],
        ...(cwd ? { cwd } : {}),
    });

    // Strumień przychodzi porcjami dowolnej długości, niekoniecznie po wierszu —
    // ostatni, niepełny fragment czeka na dalszy ciąg. Oba strumienie idą do
    // jednego bufora, bo PlatformIO pisze ostrzeżenia na stderr i przeplot
    // z postępem jest tu informacją, a nie szumem.
    let pending = '';
    const consume = (chunk: Buffer): void => {
        pending += chunk.toString('utf8');
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? '';
        for (const line of lines) onLine(stripAnsi(line));
    };

    child.stdout.on('data', consume);
    child.stderr.on('data', consume);

    const done = new Promise<number>((resolve) => {
        child.on('error', (err) => {
            // Najczęstszy przypadek: nie ma `hydra.sh` albo nie ma dockera.
            onLine(`Nie udało się uruchomić budowania: ${err.message}`);
            resolve(127);
        });
        child.on('close', (code) => {
            if (pending) onLine(stripAnsi(pending));
            resolve(code ?? 0);
        });
    });

    return {
        /*
         * Najpierw uprzejmie, potem stanowczo.
         *
         * Program okienkowy potrafi zignorować SIGTERM — pętla zdarzeń SDL
         * obsługuje sygnał po swojemu i wraca do rysowania. Bez eskalacji
         * zamknięcie karty zostawiało okno na pulpicie i proces przy życiu,
         * a kolejne uruchomienie dokładało następne.
         */
        cancel: () => {
            child.kill('SIGTERM');
            const hard = setTimeout(() => child.kill('SIGKILL'), 3_000);
            // `unref`, żeby oczekiwanie na dobicie nie trzymało procesu
            // backendu przy zamykaniu serwera.
            hard.unref();
            void done.finally(() => clearTimeout(hard));
        },
        done,
    };
}

/** Panel Kompilacja pokazuje tekst, a nie terminal — sekwencje sterujące tylko przeszkadzają. */
function stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\r/g, '');
}
