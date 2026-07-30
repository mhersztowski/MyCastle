/**
 * SceneScriptTypesPlugin — dokłada do edytora kodu cad-app podpowiedzi dla
 * Three.js i dla globali skryptu sceny (`scene`, `THREE`).
 *
 * Wbudowany plugin TypeScript IntelliSense pobiera typy z `node_modules` w VFS
 * albo z CDN. W cad-app żadna z tych dróg nie działa dla Three.js: VFS
 * cad-backendu nie ma `node_modules`, a CDN oddaje tylko `index.d.ts`
 * (`export * from "./src/Three.js"`), czyli zero użytecznych podpowiedzi.
 * Dlatego deklaracje jadą z paczki `/types/three.json` budowanej lokalnie.
 *
 * Typy ładują się dopiero przy pierwszym otwarciu pliku TS/JS — 1,4 MB nie ma
 * po co pobierać komuś, kto klika po scenie i nie zaglądał w edytor.
 */
import type { IPlugin } from '@mhersztowski/texteditor';
import { ensureThreeTypes, ensureSceneScriptEnv } from './threeTypes';

export function createSceneScriptTypesPlugin(): IPlugin {
  return {
    manifest: {
      id: 'cad-app.scene-script-types',
      name: 'Scene Script Types',
      version: '1.0.0',
      description: 'Podpowiedzi Three.js i API skryptu sceny (Scene 3D → Run)',
      contributes: [],
    },

    activate(api) {
      // `scene`/`THREE` to deklaracje ambientowe — rejestrujemy od razu, są tanie.
      ensureSceneScriptEnv();

      const load = (uri: string) => {
        if (!/\.(ts|tsx|mts|cts|js|jsx|mjs)$/i.test(uri)) return;
        void ensureThreeTypes();
      };

      api.editor.onDidChangeModel(load);
    },
  };
}
