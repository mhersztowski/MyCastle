/**
 * Fabryka workera obliczeń — jedyne miejsce, które zna sposób jego budowania.
 *
 * `new URL(..., import.meta.url)` to zapis, który Vite rozumie i zamienia na
 * osobny bundel; pakiety `sci-*` nie mogą go użyć, bo są budowane przez tsup do
 * `dist` i ta ścieżka przestałaby istnieć.
 */
export function createModelWorker(): Worker {
  return new Worker(new URL('./modelWorker.ts', import.meta.url), { type: 'module' });
}
