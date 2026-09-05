/**
 * NpmProcessRegistry — skrypty npm działające **dłużej niż jedno żądanie**.
 *
 * Bez tego „środowisko uruchomieniowe" kończyło się na zadaniach jednorazowych:
 * `npm run build` przechodził, bo kończy się sam, ale `npm run dev` umierał
 * razem z zamknięciem strumienia SSE. Serwer deweloperski ma działać dalej,
 * a użytkownik ma móc go zatrzymać — i zobaczyć, pod jaki adres wejść.
 *
 * ## Dlaczego bufor kołowy, a nie plik z logiem
 *
 * Serwer deweloperski potrafi wypisać megabajty przy każdym przeładowaniu.
 * Zapisywanie tego do Drive zapchałoby katalog użytkownika czymś, czego nikt
 * nigdy nie przeczyta. Trzymamy ostatnie N linii w pamięci — tyle, ile mieści
 * się na ekranie z zapasem, i tyle, ile realnie się ogląda.
 *
 * ## Dlaczego proces jest ubijany grupą
 *
 * `npm run dev` to npm, który uruchamia `vite`, który uruchamia esbuild.
 * `kill` na samym npm zostawia dzieci trzymające port — następne uruchomienie
 * kończy się wtedy „port already in use", bez widocznej przyczyny.
 */

import { spawn, type ChildProcess } from 'child_process';

import { detectServerUrl } from './detectPort';

/** Ile ostatnich linii wyjścia trzymamy — patrz nagłówek. */
const LOG_LINES = 500;

export interface NpmProcessInfo {
    /** `użytkownik:katalog:skrypt` — jeden działający proces na tę trójkę. */
    key: string;
    user: string;
    /** Katalog projektu względem `drive/`. */
    dir: string;
    script: string;
    command: string;
    startedAt: number;
    /** Adres wyłuskany z wyjścia; `null`, dopóki się nie pojawi. */
    url: string | null;
    running: boolean;
    exitCode: number | null;
}

interface Entry extends NpmProcessInfo {
    proc: ChildProcess | null;
    lines: string[];
}

export interface StartOptions {
    user: string;
    dir: string;
    script: string;
    cwd: string;
    command: string;
    args: string[];
    env: Record<string, string>;
}

export function processKey(user: string, dir: string, script: string): string {
    return `${user}:${dir}:${script}`;
}

export class NpmProcessRegistry {
    private entries = new Map<string, Entry>();

    /**
     * Uruchamia skrypt w tle.
     *
     * Ponowne uruchomienie tej samej trójki **zastępuje** poprzedni proces.
     * Dwa serwery deweloperskie tego samego projektu walczyłyby o port,
     * a drugi umierałby z komunikatem niezwiązanym z tym, co użytkownik zrobił.
     */
    start(options: StartOptions): NpmProcessInfo {
        const key = processKey(options.user, options.dir, options.script);
        this.stop(key);

        const proc = spawn(options.command, options.args, {
            cwd: options.cwd,
            env: options.env,
            // Bez powłoki: argumenty idą do procesu jako tablica, więc nazwa
            // skryptu nie ma jak zostać wykonana jako polecenie.
            shell: false,
            // Własna grupa procesów — patrz nagłówek klasy.
            detached: true,
        });

        const entry: Entry = {
            key,
            user: options.user,
            dir: options.dir,
            script: options.script,
            command: `${options.command} ${options.args.join(' ')}`,
            startedAt: Date.now(),
            url: null,
            running: true,
            exitCode: null,
            proc,
            lines: [],
        };
        this.entries.set(key, entry);

        const append = (chunk: Buffer): void => {
            const text = chunk.toString();
            for (const line of text.split(/\r?\n/)) {
                if (!line) continue;
                entry.lines.push(line);
                if (entry.lines.length > LOG_LINES) entry.lines.shift();
                // Pierwszy adres wygrywa: przeładowania wypisują go ponownie,
                // a zmiana odsyłacza pod ręką użytkownika wygląda na usterkę.
                if (!entry.url) entry.url = detectServerUrl(line);
            }
        };

        proc.stdout?.on('data', append);
        proc.stderr?.on('data', append);

        proc.on('close', (code, signal) => {
            entry.running = false;
            entry.exitCode = code;
            entry.proc = null;
            entry.lines.push(code === null ? `[zatrzymany: ${signal ?? 'sygnał'}]` : `[zakończony kodem ${code}]`);
        });
        proc.on('error', (err) => {
            entry.running = false;
            entry.proc = null;
            entry.lines.push(`[błąd uruchomienia] ${err.message}`);
        });

        return this.infoOf(entry);
    }

    /** Zatrzymuje proces razem z jego dziećmi. */
    stop(key: string): boolean {
        const entry = this.entries.get(key);
        const proc = entry?.proc;
        if (!entry || !proc?.pid) return false;
        try {
            // Ujemny PID = cała grupa procesów. `npm run dev` to npm, który
            // uruchamia bundler — ubicie samego npm zostawia dziecko na porcie.
            process.kill(-proc.pid, 'SIGTERM');
        } catch {
            try { proc.kill('SIGTERM'); } catch { /* już nie żyje */ }
        }
        entry.running = false;
        entry.proc = null;
        return true;
    }

    list(user: string): NpmProcessInfo[] {
        return [...this.entries.values()]
            .filter((e) => e.user === user)
            .map((e) => this.infoOf(e))
            .sort((a, b) => b.startedAt - a.startedAt);
    }

    logs(key: string): string[] | null {
        return this.entries.get(key)?.lines ?? null;
    }

    info(key: string): NpmProcessInfo | null {
        const entry = this.entries.get(key);
        return entry ? this.infoOf(entry) : null;
    }

    /** Sprząta wpisy po procesach, które skończyły się dawno temu. */
    forget(key: string): void {
        const entry = this.entries.get(key);
        if (entry && !entry.running) this.entries.delete(key);
    }

    shutdownAll(): void {
        for (const key of this.entries.keys()) this.stop(key);
        this.entries.clear();
    }

    private infoOf(entry: Entry): NpmProcessInfo {
        const { proc: _proc, lines: _lines, ...info } = entry;
        return info;
    }
}
