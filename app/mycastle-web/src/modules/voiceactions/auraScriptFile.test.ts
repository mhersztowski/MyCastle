/**
 * Round-trip pliku skryptu Aury. Plik jest tym samym formatem, co blok
 * ```automate``` w edytorze markdown — jeśli zapis i odczyt się rozjadą,
 * skrypt otwarty w Drive przestanie być tym samym skryptem co w Aurze.
 */

import { describe, expect, it } from 'vitest';
import { buildAuraScriptFile, parseAuraScriptFile, EMPTY_AURA_SCRIPT } from './auraScriptFile';

describe('parseAuraScriptFile', () => {
  it('czyta kod i ustawienia z parametrów fence', () => {
    const text = [
      '```automate:abc-123:autorun:html:t=aura,demo:h=360:u=core_scene3d.umlproj.json:s=drive%2Fscena.json',
      'aura.say("Cześć");',
      '```',
      '',
    ].join('\n');

    const parsed = parseAuraScriptFile(text);
    expect(parsed.code).toBe('aura.say("Cześć");');
    expect(parsed.settings).toEqual({
      blockId: 'abc-123',
      autorun: true,
      viewMode: 'html',
      tags: ['aura', 'demo'],
      windowHeight: 360,
      umlProjects: ['core_scene3d.umlproj.json'],
      scenePath: 'drive/scena.json',
    });
  });

  it('przyjmuje fence bez parametrów', () => {
    const parsed = parseAuraScriptFile('```automate\naura.say("hej");\n```\n');
    expect(parsed.code).toBe('aura.say("hej");');
    expect(parsed.settings.autorun).toBe(false);
    expect(parsed.settings.viewMode).toBe('code');
    expect(parsed.settings.tags).toEqual([]);
    expect(parsed.settings.windowHeight).toBeNull();
  });

  it('przyjmuje pusty blockId zapisany jako podwójny dwukropek', () => {
    const parsed = parseAuraScriptFile('```automate::u=core_scene3d.umlproj.json\nkod();\n```');
    expect(parsed.settings.blockId).toBe('');
    expect(parsed.settings.umlProjects).toEqual(['core_scene3d.umlproj.json']);
  });

  it('token f= (powiązany plik) nie psuje pozostałych parametrów', () => {
    // Blok w notatce może wskazywać plik `.automate`; parser ustawień pliku
    // ma go zignorować, ale nie zgubić przy tym reszty tokenów.
    const parsed = parseAuraScriptFile('```automate:abc:autorun:f=automate%2Fraport.automate:h=200\nkod();\n```');
    expect(parsed.settings.blockId).toBe('abc');
    expect(parsed.settings.autorun).toBe(true);
    expect(parsed.settings.windowHeight).toBe(200);
  });

  it('zwraca pusty skrypt dla pliku bez bloku automate', () => {
    const parsed = parseAuraScriptFile('# Notatka\n\nzwykły tekst\n');
    expect(parsed.code).toBe('');
    expect(parsed.settings).toEqual(EMPTY_AURA_SCRIPT.settings);
  });

  it('zachowuje treść markdown wokół bloku', () => {
    const text = '# Powitanie\n\n```automate:x1\nkod();\n```\n\nOpis pod spodem.\n';
    const parsed = parseAuraScriptFile(text);
    expect(parsed.before.trim()).toBe('# Powitanie');
    expect(parsed.after.trim()).toBe('Opis pod spodem.');
  });

  it('bierze pierwszy blok, gdy plik ma ich kilka', () => {
    const text = '```automate:a\npierwszy();\n```\n\n```automate:b\ndrugi();\n```\n';
    expect(parseAuraScriptFile(text).code).toBe('pierwszy();');
  });
});

describe('buildAuraScriptFile', () => {
  it('pomija tokeny o wartościach domyślnych', () => {
    const text = buildAuraScriptFile({
      code: 'kod();',
      settings: { ...EMPTY_AURA_SCRIPT.settings, blockId: 'abc' },
    });
    expect(text.split('\n')[0]).toBe('```automate:abc');
  });

  it('koduje tagi i ścieżkę sceny', () => {
    const text = buildAuraScriptFile({
      code: 'kod();',
      settings: {
        blockId: 'abc',
        autorun: true,
        viewMode: 'html',
        tags: ['a b', 'c'],
        windowHeight: 420,
        umlProjects: ['p.umlproj.json'],
        scenePath: 'drive/scena.json',
      },
    });
    expect(text.split('\n')[0])
      .toBe('```automate:abc:autorun:html:t=a%20b,c:h=420:u=p.umlproj.json:s=drive%2Fscena.json');
  });

  it('round-trip zachowuje kod, ustawienia i otoczenie', () => {
    const original = {
      before: '# Powitanie\n\nSkrypt akcji „powitanie" (pl).\n',
      after: '\nDokumentacja pod spodem.\n',
      code: 'const imie = await aura.ask("Jak masz na imię?");\naura.say(`Cześć ${imie}`);',
      settings: {
        blockId: 'v-1',
        autorun: false,
        viewMode: 'code' as const,
        tags: ['aura'],
        windowHeight: 360,
        umlProjects: [],
        scenePath: '',
      },
    };

    const text = buildAuraScriptFile(original);
    const parsed = parseAuraScriptFile(text);
    expect(parsed.code).toBe(original.code);
    expect(parsed.settings).toEqual(original.settings);
    expect(buildAuraScriptFile(parsed)).toBe(text);
  });

  it('kod z potrójnym backtickiem nie rozwala fence (dłuższy ogranicznik)', () => {
    const code = 'const md = `\n```js\nx\n```\n`;';
    const text = buildAuraScriptFile({ code, settings: EMPTY_AURA_SCRIPT.settings });
    expect(parseAuraScriptFile(text).code).toBe(code);
  });
});
