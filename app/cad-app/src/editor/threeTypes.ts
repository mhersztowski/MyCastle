/**
 * threeTypes.ts — podpowiedzi Three.js i środowiska skryptu sceny w edytorze kodu.
 *
 * Dwa niezależne kawałki:
 *  1. **Deklaracje `three`** — pobierane z `/types/three.json` (paczka robiona przez
 *     `scripts/gen-three-types.mjs`) i rejestrowane jako modele Monaco pod
 *     `file:///node_modules/@types/three/…`. Wbudowany plugin TypeScript IntelliSense
 *     ściąga z CDN tylko `index.d.ts`, a ten w @types/three zawiera samo
 *     `export * from "./src/Three.js"` — bez reszty drzewa nie ma ani jednej podpowiedzi.
 *  2. **Globalne API skryptu sceny** (`scene`, `THREE`) — bo „Run" w Scene 3D wstrzykuje
 *     je jako parametry funkcji, więc w pliku nie ma żadnego importu, z którego
 *     TypeScript mógłby je wywnioskować.
 */
import * as monaco from 'monaco-editor';
import {
  THREE_TYPES_URL, TYPES_ROOT, SCENE_SCRIPT_ENV_DTS, normalizeDtsImports, isUsableThreeBundle,
  type ThreeTypesBundle,
} from './threeTypesData';

export {
  THREE_TYPES_URL, SCENE_SCRIPT_ENV_DTS, normalizeDtsImports, isUsableThreeBundle,
  type ThreeTypesBundle,
} from './threeTypesData';

let threeTypesPromise: Promise<boolean> | null = null;

/**
 * Rejestruje deklaracje `three` w Monaco. Wykonuje się raz na sesję — kolejne
 * wywołania dostają tę samą obietnicę (edytor woła to przy każdym otwarciu pliku TS).
 */
export function ensureThreeTypes(): Promise<boolean> {
  threeTypesPromise ??= loadThreeTypes();
  return threeTypesPromise;
}

async function loadThreeTypes(): Promise<boolean> {
  let bundle: ThreeTypesBundle;
  try {
    const res = await fetch(THREE_TYPES_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bundle = await res.json() as ThreeTypesBundle;
  } catch (e) {
    // Brak paczki nie może psuć edytora — tracimy tylko podpowiedzi.
    console.warn(`[threeTypes] Nie udało się pobrać ${THREE_TYPES_URL} (${(e as Error).message}). ` +
      'Uruchom `node scripts/gen-three-types.mjs` w app/cad-app.');
    return false;
  }
  if (!isUsableThreeBundle(bundle)) {
    console.warn('[threeTypes] Paczka deklaracji three jest niekompletna — pomijam.');
    return false;
  }

  for (const [rel, content] of Object.entries(bundle)) {
    const uri = monaco.Uri.parse(`${TYPES_ROOT}/${rel}`);
    if (monaco.editor.getModel(uri)) continue;
    const language = rel.endsWith('.json') ? 'json' : 'typescript';
    monaco.editor.createModel(
      language === 'json' ? content : normalizeDtsImports(content),
      language,
      uri,
    );
  }
  console.log(`[threeTypes] Zarejestrowano ${Object.keys(bundle).length} plików deklaracji three.`);
  return true;
}

let envRegistered = false;

/** Rejestruje deklaracje globali skryptu sceny (raz na sesję). */
export function ensureSceneScriptEnv(): void {
  if (envRegistered) return;
  envRegistered = true;
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    SCENE_SCRIPT_ENV_DTS,
    'file:///scene-script-env.d.ts',
  );
}
