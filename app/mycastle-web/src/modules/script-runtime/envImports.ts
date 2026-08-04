/**
 * envImports.ts — usuwanie importów modułów środowiska.
 *
 * Osobno od `ScriptRuntime`, bo to czysta logika na tekście: bez Monaco, bez
 * pluginów, bez sieci. Tam, gdzie mieszkała wcześniej, nie dało się jej
 * sprawdzić testem — sam import modułu ciągnął pół edytora.
 *
 * Skrypt pisze `import { Scene } from 'mycastle/scene'`, bo tak wygląda kod,
 * który da się przeczytać i któremu Monaco umie podpowiadać. Wykonanie idzie
 * przez `new AsyncFunction`, gdzie `import` jest błędem składni — więc import
 * znika, a symbol wchodzi przez kontekst. Ten sam zabieg robi runtime
 * automatyzacji dla `api` i `Aura`.
 */

/** Moduły dostarczane przez środowisko skryptu. */
const MODULY_SRODOWISKA = /^mycastle\/(scene)$/;

const IMPORT_RE = /^[ \t]*import\s+(?:type\s+)?([^;'"]*?)\s+from\s+['"]([^'"]+)['"][ \t]*;?[ \t]*$/gm;

/**
 * Usuwa importy środowiska, zostawiając resztę bez zmian.
 *
 * Import spoza listy zostaje nietknięty: lepiej, żeby autor zobaczył błąd
 * składni, niż żeby symbol po cichu był `undefined` i skrypt wywalił się
 * dopiero przy użyciu.
 */
export function stripEnvImports(code: string): string {
  return code.replace(IMPORT_RE, (match, _clause: string, spec: string) => (
    MODULY_SRODOWISKA.test(spec) ? '' : match
  ));
}
