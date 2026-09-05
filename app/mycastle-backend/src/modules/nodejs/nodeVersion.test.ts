import { describe, it, expect } from 'vitest';
import { majorOf, readRequirement, versionWarning } from './nodeVersion';

describe('majorOf', () => {
  it('czyta zapisy, jakie faktycznie występują', () => {
    expect(majorOf('v20.11.0')).toBe(20);
    expect(majorOf('20')).toBe(20);
    expect(majorOf('20.x')).toBe(20);
    expect(majorOf('>=18.17')).toBe(18);
    expect(majorOf('^22.0.0')).toBe(22);
  });

  it('napis bez liczby nie udaje wersji', () => {
    expect(majorOf('lts/hydrogen')).toBeNull();
    expect(majorOf('')).toBeNull();
  });
});

describe('readRequirement', () => {
  it('.nvmrc ma pierwszeństwo przed engines', () => {
    // `.nvmrc` mówi „ta wersja"; `engines` bywa zakresem odziedziczonym po
    // szablonie projektu i nikt go od tamtej pory nie ruszał.
    const r = readRequirement('20', '>=16')!;
    expect(r.source).toBe('.nvmrc');
    expect(r.minMajor).toBe(20);
  });

  it('bez .nvmrc bierze engines', () => {
    expect(readRequirement(null, '>=18.17')!.source).toBe('engines.node');
  });

  it('brak obu to brak wymagania', () => {
    expect(readRequirement(null, undefined)).toBeNull();
    expect(readRequirement('   ', undefined)).toBeNull();
  });
});

describe('versionWarning', () => {
  it('starszy Node niż wymagany — ostrzeżenie z powodem', () => {
    const w = versionWarning(readRequirement(null, '>=20'), 'v18.19.0')!;
    expect(w).toMatch(/20/);
    expect(w).toMatch(/v18\.19\.0/);
    // Objaw jest mylący, więc komunikat go nazywa.
    expect(w).toMatch(/node_modules/);
  });

  it('zgodny albo nowszy — cisza', () => {
    expect(versionWarning(readRequirement(null, '>=18'), 'v20.11.0')).toBeNull();
    expect(versionWarning(readRequirement(null, '>=20'), 'v20.11.0')).toBeNull();
  });

  it('nowszy Node nie jest ostrzegany', () => {
    // Górne ograniczenia w `engines` są prawie zawsze zdezaktualizowane,
    // a ostrzeżenie padające przy każdym uruchomieniu przestaje być czytane.
    expect(versionWarning(readRequirement(null, '18.x'), 'v22.0.0')).toBeNull();
  });

  it('nieczytelne wymaganie nie generuje szumu', () => {
    expect(versionWarning(readRequirement('lts/hydrogen', undefined), 'v18.0.0')).toBeNull();
  });
});
