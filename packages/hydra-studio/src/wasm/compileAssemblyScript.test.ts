/**
 * Testy kompilacji AssemblyScriptu do WebAssembly.
 *
 * Test uruchamia dokładnie tę samą funkcję, co przeglądarka — wirtualny system
 * plików sprawia, że nie ma tu ścieżki „tylko dla Node". Gdyby test chodził
 * inną drogą niż użytkownik, sprawdzałby coś innego niż to, co się popsuje.
 */

import { describe, expect, it } from 'vitest';

import { ENTRY_FILE, compileAssemblyScript, sha256Hex } from './compileAssemblyScript';

/**
 * Deklaracje importów — wycinek tego, co Hydra generuje z `wasm_bindings.def`.
 * Tutaj wystarczy tyle, ile woła moduł testowy.
 */
const HYDRA_DECL = `
@external("hydra", "millis")
export declare function millis(): i32;

@external("hydra", "gpio_mode")
export declare function gpio_mode(pin: i32, mode: i32): i32;

@external("hydra", "gpio_write")
export declare function gpio_write(pin: i32, value: i32): i32;
`;

const BLINK = `
import { millis, gpio_mode, gpio_write } from "./hydra";

const LED: i32 = 7;
let on: bool = false;
let last: i32 = 0;

export function setup(): void {
  gpio_mode(LED, 3);
  last = millis();
}

export function loop(): void {
  const now = millis();
  if (now - last < 500) return;
  last = now;
  on = !on;
  gpio_write(LED, on ? 1 : 0);
}
`;

describe('compileAssemblyScript', () => {
    it('kompiluje moduł do poprawnego WebAssembly', async () => {
        const result = await compileAssemblyScript({
            sources: { [ENTRY_FILE]: BLINK, 'assembly/hydra.ts': HYDRA_DECL },
        });

        expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
        expect(result.ok).toBe(true);

        // Nagłówek modułu WebAssembly: `\0asm` i wersja 1.
        expect(Array.from(result.wasm.slice(0, 8)))
            .toEqual([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
        expect(result.wasm.byteLength).toBeGreaterThan(50);
    }, 60_000);

    it('wynik da się uruchomić i eksportuje setup oraz loop', async () => {
        const result = await compileAssemblyScript({
            sources: { [ENTRY_FILE]: BLINK, 'assembly/hydra.ts': HYDRA_DECL },
        });
        expect(result.ok).toBe(true);

        // Instancjujemy go tym samym sposobem, co urządzenie: importy w module
        // `hydra`, żadnych innych. Gdyby kompilator zażądał czegoś spoza tej
        // powierzchni — na przykład `env.abort` — ten wiersz by się wywrócił.
        let written = -1;
        const { instance } = await WebAssembly.instantiate(
            result.wasm as unknown as BufferSource,
            {
                hydra: {
                    millis: () => 0,
                    gpio_mode: () => 1,
                    gpio_write: (_pin: number, value: number) => { written = value; return 1; },
                },
            },
        );

        const exports = instance.exports as Record<string, CallableFunction>;
        expect(typeof exports.setup).toBe('function');
        expect(typeof exports.loop).toBe('function');

        exports.setup();
        // Pierwsze `loop()` nie zdąży zmienić stanu — od `setup()` nie minęło
        // pół sekundy, a to jest zachowanie modułu, nie kompilatora.
        exports.loop();
        expect(written).toBe(-1);
    }, 60_000);

    it('błąd w kodzie jest wynikiem, a nie wyjątkiem', async () => {
        const result = await compileAssemblyScript({
            sources: {
                [ENTRY_FILE]: 'export function loop(): void { tegoNieMa(); }',
                'assembly/hydra.ts': HYDRA_DECL,
            },
        });

        expect(result.ok).toBe(false);
        expect(result.wasm.byteLength).toBe(0);
        const errors = result.diagnostics.filter(d => d.severity === 'error');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].text).toMatch(/tegoNieMa/);
    }, 60_000);

    it('brak pliku wejsciowego jest zglaszany bez wolania kompilatora', async () => {
        const result = await compileAssemblyScript({ sources: { 'assembly/hydra.ts': HYDRA_DECL } });

        expect(result.ok).toBe(false);
        expect(result.diagnostics[0].text).toContain(ENTRY_FILE);
        expect(result.elapsedMs).toBe(0);
    });

    it('tryb release daje mniejszy modul niz debug', async () => {
        const sources = { [ENTRY_FILE]: BLINK, 'assembly/hydra.ts': HYDRA_DECL };
        const release = await compileAssemblyScript({ sources, mode: 'release' });
        const debug = await compileAssemblyScript({ sources, mode: 'debug' });

        expect(release.ok && debug.ok).toBe(true);
        // Na urządzeniu z ciasną pulą ta różnica decyduje o tym, czy moduł
        // w ogóle się mieści.
        expect(release.wasm.byteLength).toBeLessThan(debug.wasm.byteLength);
    }, 120_000);
});

describe('sha256Hex', () => {
    it('daje skrot w postaci, ktorej zada `begin`', async () => {
        const hex = await sha256Hex(new Uint8Array([0x00, 0x61, 0x73, 0x6d]));
        expect(hex).toHaveLength(64);
        expect(hex).toMatch(/^[0-9a-f]{64}$/);
    });
});
