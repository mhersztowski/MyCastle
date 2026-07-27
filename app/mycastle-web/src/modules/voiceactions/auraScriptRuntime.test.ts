import { describe, expect, it } from 'vitest';
import { prepareAutomateScript } from './auraScriptRuntime';

describe('prepareAutomateScript', () => {
  it('usuwa import modułu Aury', () => {
    const { code, strippedModules } = prepareAutomateScript([
      "import { Aura } from 'mycastle/packages/core/browser/aura/aura';",
      "await Aura.say('Cześć');",
    ].join('\n'));

    expect(strippedModules).toEqual(['mycastle/packages/core/browser/aura/aura']);
    expect(code.trim()).toBe("await Aura.say('Cześć');");
  });

  it('rozpoznaje różne zapisy specyfikatora', () => {
    for (const spec of [
      'mycastle/packages/core/browser/aura/aura',
      '../../../packages/core/browser/aura/aura.ts',
      './aura/aura.js',
    ]) {
      const { strippedModules } = prepareAutomateScript(`import Aura from '${spec}';\nAura.say('x');`);
      expect(strippedModules, spec).toEqual([spec]);
    }
  });

  it('obsługuje import bez klauzuli (side effect)', () => {
    const { code, strippedModules } = prepareAutomateScript("import 'mycastle/packages/core/browser/aura/aura';\nx();");
    expect(strippedModules).toHaveLength(1);
    expect(code.trim()).toBe('x();');
  });

  it('nie rusza importów innych modułów — autor ma zobaczyć błąd, nie undefined', () => {
    const src = "import { foo } from 'inny-modul';\nfoo();";
    const { code, strippedModules } = prepareAutomateScript(src);
    expect(strippedModules).toEqual([]);
    expect(code).toBe(src);
  });

  it('nie rusza słowa „import" w treści kodu', () => {
    const src = "const s = \"import { Aura } from 'aura/aura'\";\nawait Aura.say(s);";
    expect(prepareAutomateScript(src).code).toBe(src);
  });

  it('usuwa też import kontraktu api/display', () => {
    const { code, strippedModules } = prepareAutomateScript([
      "import { api, display } from 'mycastle/packages/core/browser/api/api';",
      "import { Aura } from 'mycastle/packages/core/browser/aura/aura';",
      "api.log.info('start');",
    ].join('\n'));

    expect(strippedModules).toHaveLength(2);
    expect(code.trim()).toBe("api.log.info('start');");
  });

  it('skrypt bez importów przechodzi bez zmian', () => {
    const src = "await Aura.say('bez importu');";
    const { code, strippedModules } = prepareAutomateScript(src);
    expect(code).toBe(src);
    expect(strippedModules).toEqual([]);
  });
});
