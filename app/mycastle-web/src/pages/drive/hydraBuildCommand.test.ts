import { describe, it, expect } from 'vitest';
import { hydraBuildCommand, HydraBuildRefused } from './hydraBuildCommand';

const HYDRA = '/data/Minis/Users/marcin/drive/git/MinisProjects/libs/Hydra';
const PROJECT = '/data/Minis/Users/marcin/drive/public/projects/arduboy-game';

const base = { hydraDir: HYDRA, projectDir: PROJECT, wasmImage: 'mycastle-hydra-wasm:local' };

describe('cel sprzętowy — PlatformIO', () => {
  it('wybiera środowisko przez -e', () => {
    const cmd = hydraBuildCommand({ ...base, kind: 'pio', target: 'esp32s3' });
    expect(cmd).toContain(`"${HYDRA}/docker/hydra.sh" project "${PROJECT}" pio run -e "esp32s3"`);
  });

  it('wgrywanie to osobny cel PlatformIO, nie inne polecenie', () => {
    const cmd = hydraBuildCommand({ ...base, kind: 'pio', target: 'esp32s3', upload: true });
    expect(cmd).toContain('-t upload');
  });

  it('bez celu buduje wszystkie środowiska', () => {
    // `pio run` bez `-e` to zachowanie PlatformIO, nie nasz domysł.
    const cmd = hydraBuildCommand({ ...base, kind: 'pio' });
    expect(cmd).not.toContain('-e');
  });
});

describe('cel przeglądarkowy — CMake z emscriptenem', () => {
  const wasm = { ...base, kind: 'wasm' as const, target: 'web' };

  it('nie idzie przez PlatformIO', () => {
    // Sedno błędu, od którego się zaczęło: `pio run -e web` kończył się
    // „Unknown environment names 'web'", bo `emitPlatformio` świadomie pomija
    // cele budowane CMake'em — `platform = native` nie zbuduje modułu WASM.
    const cmd = hydraBuildCommand(wasm);
    expect(cmd).not.toContain('pio run');
  });

  it('konfiguruje przez emcmake, a buduje przez cmake', () => {
    const cmd = hydraBuildCommand(wasm);
    expect(cmd).toContain('emcmake cmake -B build/wasm');
    expect(cmd).toContain('cmake --build build/wasm');
  });

  it('konfiguracja poprzedza budowę i ją warunkuje', () => {
    // Błąd konfiguracji ma zatrzymać budowę, a nie puścić kompilację przeciw
    // nieaktualnej pamięci podręcznej CMake.
    const cmd = hydraBuildCommand(wasm);
    expect(cmd.indexOf('emcmake')).toBeLessThan(cmd.indexOf('--build'));
    expect(cmd).toContain('&&');
  });

  it('podaje cel i korzeń Hydry wprost', () => {
    const cmd = hydraBuildCommand(wasm);
    expect(cmd).toContain('-D HYDRA_TARGET=web');
    // `HYDRA_ROOT` jest zmienną cache CMake: raz zapisana zła wartość przebija
    // wygenerowany plik przy każdej kolejnej konfiguracji.
    expect(cmd).toContain('-D HYDRA_ROOT=/hydra/Hydra');
  });

  it('wybiera obraz z emscriptenem — toolchain leży poza obrazem PlatformIO', () => {
    const cmd = hydraBuildCommand(wasm);
    expect(cmd).toContain('HYDRA_IMAGE="mycastle-hydra-wasm:local"');
  });

  it('bez nazwy celu odmawia, bo CMakeLists wybiera cel zmienną', () => {
    expect(() => hydraBuildCommand({ ...base, kind: 'wasm' }))
      .toThrow(HydraBuildRefused);
  });

  it('„wgraj" nie zmienia kroków — stronę otwiera klient', () => {
    const cmd = hydraBuildCommand({ ...wasm, upload: true });
    expect(cmd).toBe(hydraBuildCommand(wasm));
  });
});

describe('cel natywny', () => {
  it('odmawia wprost, zamiast wywracać się na PlatformIO', () => {
    // Odmowa z powodem zamiast `UnknownEnvNamesError`: ten drugi komunikat
    // każe szukać błędu w pliku projektu, a projekt jest w porządku.
    expect(() => hydraBuildCommand({ ...base, kind: 'native', target: 'podglad' }))
      .toThrow(/natywn/i);
  });

  it('odmowa wskazuje cel przeglądarkowy, a nie inny edytor', () => {
    // Kompilator siedzi w kontenerze z Linuksem, więc wynikiem celu natywnego
    // jest program linuksowy — na macOS nie uruchomi go żaden edytor. Odesłanie
    // do Monaco jako „rozwiązania" byłoby odesłaniem po to samo rozczarowanie.
    expect(() => hydraBuildCommand({ ...base, kind: 'native', target: 'podglad' }))
      .toThrow(/przeglądarkow/i);
  });
});

describe('cytowanie ścieżek', () => {
  it('katalogi ze spacjami nie rozpadają się na argumenty', () => {
    const cmd = hydraBuildCommand({
      ...base, kind: 'pio', target: 'esp32s3',
      projectDir: '/data/Minis/Users/jan kowalski/drive/projekt',
    });
    expect(cmd).toContain('"/data/Minis/Users/jan kowalski/drive/projekt"');
  });
});
