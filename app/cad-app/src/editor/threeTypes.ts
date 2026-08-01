/**
 * threeTypes.ts — deklaracje dostarczane edytorowi kodu w cad-app.
 *
 * Dwa zestawy:
 *  1. **`three`** — z paczki `/types/three.json` (`scripts/gen-three-types.mjs`).
 *     Wbudowany plugin IntelliSense ściąga z CDN tylko `index.d.ts`, a ten w
 *     @types/three zawiera samo `export * from "./src/Three.js"` — bez reszty
 *     drzewa nie ma ani jednej podpowiedzi.
 *  2. **globale skryptu sceny** (`scene`, `THREE`) — „Run" w Scene 3D wstrzykuje
 *     je jako parametry funkcji, więc w pliku nie ma importu, z którego
 *     TypeScript mógłby je wywnioskować.
 *
 * Wszystko wraca JEDNĄ mapą do `TextEditorWorkspace.tsPreloadDts`, czyli trafia
 * do magazynu deklaracji pluginu TS. Wcześniejsza wersja rejestrowała 573
 * osobne modele Monaco i to zabijało cały IntelliSense: każdy `createModel`
 * wywołuje synchronizację z workerem TypeScriptu, więc worker w nieskończoność
 * nadrabiał zaległości zamiast odpowiadać na zapytania o podpowiedzi.
 */
import {
  THREE_TYPES_URL, SCENE_SCRIPT_ENV_DTS, buildThreeModels, isUsableThreeBundle,
  type ThreeTypesBundle,
} from './threeTypesData';

export {
  THREE_TYPES_URL, SCENE_SCRIPT_ENV_DTS, normalizeDtsImports, isUsableThreeBundle, buildThreeModels,
  TYPES_ROOT, type ThreeTypesBundle,
} from './threeTypesData';

/**
 * Deklaracje do wstrzyknięcia w edytor: `three` + środowisko skryptu sceny.
 *
 * Brak paczki nie jest błędem krytycznym — edytor działa dalej, tracimy tylko
 * podpowiedzi dla Three.js.
 */
export async function loadEditorDts(): Promise<Record<string, string>> {
  const files: Record<string, string> = {
    'file:///scene-script-env.d.ts': SCENE_SCRIPT_ENV_DTS,
  };

  let bundle: ThreeTypesBundle;
  try {
    const res = await fetch(THREE_TYPES_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bundle = await res.json() as ThreeTypesBundle;
  } catch (e) {
    console.warn(`[threeTypes] Nie udało się pobrać ${THREE_TYPES_URL} (${(e as Error).message}). `
      + 'Uruchom `pnpm --filter cad-app gen:three-types`.');
    return files;
  }

  if (!isUsableThreeBundle(bundle)) {
    console.warn('[threeTypes] Paczka deklaracji three jest niekompletna — pomijam.');
    return files;
  }

  for (const model of buildThreeModels(bundle)) {
    // Plugin TS wysyła do workera wszystko, co dostanie; `package.json` też jest
    // czytany przez resolver, więc wchodzi do tej samej mapy.
    files[model.uri] = model.content;
  }
  console.log(`[threeTypes] Przygotowano ${Object.keys(files).length} plików deklaracji (three + scene).`);
  return files;
}
