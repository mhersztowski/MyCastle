/**
 * Przygotowanie kodu skryptu do wykonania.
 *
 * Skrypt pisze się tak, jak każdy inny moduł — deklarując, czego potrzebuje:
 *
 *   import { api, display } from 'mycastle/packages/core/browser/api/api';
 *   import { Aura } from 'mycastle/packages/core/browser/aura/aura';
 *
 * ale wykonanie idzie przez `new Function` / `AutomateSandbox`, gdzie instrukcja
 * `import` jest błędem składni. Dlatego importy wskazujące na moduły środowiska
 * są usuwane, a same symbole wstrzykiwane do zasięgu przez hosta — skrypt
 * zachowuje czytelną formę, a runtime nie potrzebuje bundlera.
 *
 * Importy z innych modułów zostają nietknięte: lepiej, żeby autor zobaczył
 * błąd składni, niż żeby symbol po cichu był `undefined`.
 */

/**
 * Moduły środowiska: logika Aury, kontrakt `api`/`display`, API backendu (`Server`),
 * sceny CAD/3D (`mycastle/scene`) oraz asystentka Kasia (`kasia/kasia`).
 *
 * `mycastle/scene` i `mycastle/kasia` są **nazwami, nie ścieżkami** — moduły nie
 * leżą w `packages/` albo są składane przez hosta, więc dopisujemy je osobnymi
 * członami.
 */
const ENV_MODULE_RE =
  /(^|\/)(aura\/aura|api\/api|server\/api|kasia\/kasia)(\.ts|\.js)?$|^mycastle\/(scene|kasia)$/;

const IMPORT_RE = /^[ \t]*import\s+(?:type\s+)?([^;'"]*?)\s+from\s+['"]([^'"]+)['"][ \t]*;?[ \t]*$/gm;
const SIDE_EFFECT_IMPORT_RE = /^[ \t]*import\s+['"]([^'"]+)['"][ \t]*;?[ \t]*$/gm;

export interface PreparedScript {
  code: string;
  /** Specyfikatory usuniętych importów — diagnostyka i testy. */
  strippedModules: string[];
}

/**
 * Usuwa importy modułów środowiska. Zwrócony kod można podać wprost do
 * `AutomateSandbox.execute` — `api`, `display`, `Aura` i `aura` dostarcza
 * hostScope tego przebiegu.
 */
export function prepareAutomateScript(source: string): PreparedScript {
  const strippedModules: string[] = [];

  const strip = (match: string, spec: string): string => {
    if (!ENV_MODULE_RE.test(spec)) return match;
    strippedModules.push(spec);
    return '';
  };

  const code = source
    .replace(IMPORT_RE, (match, _clause: string, spec: string) => strip(match, spec))
    .replace(SIDE_EFFECT_IMPORT_RE, (match, spec: string) => strip(match, spec));

  return { code, strippedModules };
}
