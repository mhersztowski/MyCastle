import { defineConfig } from 'tsup';

/**
 * Jedno wejście — paczka jest mała i ma jednego odbiorcę: przeglądarkę.
 *
 * `esptool-js` zostaje na zewnątrz, bo obie aplikacje i tak go mają;
 * wciągnięcie go tutaj oznaczałoby dwie kopie protokołu w jednym bundlu.
 */
export default defineConfig({
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: { tsconfig: 'tsconfig.build.json' },
    tsconfig: 'tsconfig.build.json',
    sourcemap: true,
    clean: true,
    external: ['esptool-js'],
});
