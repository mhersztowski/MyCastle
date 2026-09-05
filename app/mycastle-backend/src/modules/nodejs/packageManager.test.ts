import { describe, it, expect } from 'vitest';
import { detectPackageManager, installPlan, runPlan, PACKAGE_MANAGERS } from './packageManager';

describe('detectPackageManager', () => {
  it('rozpoznaje po pliku blokady', () => {
    expect(detectPackageManager(['pnpm-lock.yaml', 'package.json']).id).toBe('pnpm');
    expect(detectPackageManager(['yarn.lock']).id).toBe('yarn');
    expect(detectPackageManager(['bun.lockb']).id).toBe('bun');
    expect(detectPackageManager(['package-lock.json']).id).toBe('npm');
  });

  it('bez blokady zostaje npm — i widać, że to domysł', () => {
    // Domyślny wybór musi być odróżnialny od rozpoznanego, bo `npm install`
    // w projekcie pnpm-owym postawi **inne** drzewo zależności niż lockfile.
    const guessed = detectPackageManager(['package.json']);
    expect(guessed.id).toBe('npm');
    expect(guessed.detected).toBe(false);
    expect(detectPackageManager(['package-lock.json']).detected).toBe(true);
  });

  it('pole packageManager z package.json przebija plik blokady', () => {
    // `"packageManager": "pnpm@9"` to deklaracja autora projektu — mocniejsza
    // niż plik, który mógł zostać po poprzednim narzędziu.
    const m = detectPackageManager(['package-lock.json'], 'pnpm@9.0.0');
    expect(m.id).toBe('pnpm');
    expect(m.detected).toBe(true);
  });

  it('nieznana deklaracja nie unieważnia rozpoznania po blokadzie', () => {
    expect(detectPackageManager(['yarn.lock'], 'cheese@1').id).toBe('yarn');
  });

  it('dwa pliki blokady — wygrywa kolejność pewności, nie alfabet', () => {
    // Zostawiony `package-lock.json` obok świeżego `pnpm-lock.yaml` zdarza się
    // po migracji; to pnpm jest tym, którym projekt jest budowany.
    expect(detectPackageManager(['package-lock.json', 'pnpm-lock.yaml']).id).toBe('pnpm');
  });
});

describe('installPlan', () => {
  it('z plikiem blokady instaluje powtarzalnie', () => {
    // `install` po cichu aktualizuje lockfile, co wraca jako niezrozumiały diff
    // w gicie. Przy obecnej blokadzie chcemy instalacji dokładnie z niej.
    expect(installPlan('npm', true).args).toEqual(['ci']);
    expect(installPlan('pnpm', true).args).toEqual(['install', '--frozen-lockfile']);
    expect(installPlan('yarn', true).args).toEqual(['install', '--immutable']);
  });

  it('bez blokady instaluje zwyczajnie — nie ma z czego odtwarzać', () => {
    expect(installPlan('npm', false).args).toEqual(['install', '--include=dev']);
    expect(installPlan('pnpm', false).args).toEqual(['install']);
  });

  it('mówi, dlaczego wybrał ten wariant', () => {
    expect(installPlan('npm', true).note).toMatch(/blokad/i);
  });
});

describe('runPlan', () => {
  it('npm i pnpm wołają skrypt przez `run`', () => {
    expect(runPlan('npm', 'build')).toEqual({ command: 'npm', args: ['run', 'build'] });
    expect(runPlan('pnpm', 'build')).toEqual({ command: 'pnpm', args: ['run', 'build'] });
  });

  it('yarn woła skrypt bez `run`', () => {
    // `yarn run build` też działa, ale `yarn build` jest tym, co widnieje
    // w dokumentacji projektów yarnowych — zgodność ułatwia porównanie z tym,
    // co użytkownik robi w terminalu.
    expect(runPlan('yarn', 'build')).toEqual({ command: 'yarn', args: ['build'] });
  });

  it('każdy znany menedżer ma komendę', () => {
    for (const m of PACKAGE_MANAGERS) {
      expect(runPlan(m.id, 'x').command).toBeTruthy();
    }
  });
});
