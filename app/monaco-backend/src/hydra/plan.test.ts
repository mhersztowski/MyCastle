import { describe, it, expect } from 'vitest';
import * as path from 'node:path';

import { planHydraBuild, HydraPlanError } from './plan';

const DATA = '/srv/monaco/data';
const HYDRA = '/opt/MinisProjects/libs/Hydra';

function plan(request: Parameters<typeof planHydraBuild>[0]) {
    return planHydraBuild(request, { dataDir: DATA, hydraDir: HYDRA });
}

describe('planHydraBuild', () => {
    it('buduje projekt z katalogu pliku .hydra, nie z samego pliku', () => {
        const result = plan({ file: '/hello-blink/hello-blink.hydra' });

        expect(result.projectDir).toBe(path.join(DATA, 'hello-blink'));
        expect(result.steps[0]?.script).toBe(path.join(HYDRA, 'docker', 'hydra.sh'));
    });

    it('przekazuje polecenie kontenera po nazwie katalogu', () => {
        // `hydra.sh project <dir> <polecenie…>` — wszystko po katalogu jest
        // poleceniem uruchamianym wewnątrz kontenera, a nie flagą skryptu.
        const { steps } = plan({ file: '/rover/rover.hydra' });

        expect(steps).toHaveLength(1);
        expect(steps[0]!.args.slice(0, 2)).toEqual(['project', path.join(DATA, 'rover')]);
        expect(steps[0]!.args.slice(2)).toEqual(['pio', 'run']);
    });

    it('wybiera środowisko PlatformIO przez -e', () => {
        const { steps } = plan({ file: '/rover/rover.hydra', target: 'esp32s3' });

        expect(steps[0]!.args.slice(2)).toEqual(['pio', 'run', '-e', 'esp32s3']);
    });

    it('wgrywanie to cel `upload`, a nie osobne polecenie', () => {
        const { steps } = plan({ file: '/rover/rover.hydra', target: 'pico', upload: true });

        expect(steps[0]!.args.slice(2)).toEqual(['pio', 'run', '-e', 'pico', '-t', 'upload']);
    });

    it('odmawia wyjścia poza katalog danych', () => {
        // Backend nie ma uwierzytelniania, więc ścieżka z żądania jest jedyną
        // granicą między edytorem a resztą dysku.
        expect(() => plan({ file: '/../../etc/passwd.hydra' })).toThrow(HydraPlanError);
        expect(() => plan({ file: '/ok/../../poza.hydra' })).toThrow(HydraPlanError);
    });

    it('przyjmuje tylko pliki .hydra', () => {
        expect(() => plan({ file: '/rover/main.cpp' })).toThrow(HydraPlanError);
    });

    it('odrzuca nazwę środowiska, która nie jest nazwą środowiska', () => {
        // Uruchamiamy bez powłoki, więc nie chodzi o wstrzyknięcie polecenia,
        // tylko o to, by błąd zgłosić tu, a nie po minucie startu kontenera.
        expect(() => plan({ file: '/rover/rover.hydra', target: 'esp32s3; rm -rf /' }))
            .toThrow(HydraPlanError);
        expect(() => plan({ file: '/rover/rover.hydra', target: '-e' })).toThrow(HydraPlanError);
    });

    it('akceptuje nazwy środowisk używane przez Hydrę', () => {
        for (const target of ['esp32s3', 'esp32c3', 'pico', 'pico2', 'stm32g4', 'host_test']) {
            expect(() => plan({ file: '/rover/rover.hydra', target })).not.toThrow();
        }
    });
});

describe('planHydraBuild — cel natywny', () => {
    const native = {
        file: '/desktop-preview/desktop-preview.hydra',
        target: 'podglad',
        kind: 'native' as const,
        preset: 'native-linux-arm64',
    };

    it('konfiguruje i buduje w dwóch krokach, bez powłoki', () => {
        /*
         * `cmake --preset X && cmake --build --preset X` w jednym wywołaniu
         * wymagałoby powłoki, a wtedy nazwa celu z żądania przestaje być samym
         * argumentem. Dwa kroki znaczą też, że błąd konfiguracji zatrzymuje
         * budowę zamiast kompilować przeciw nieaktualnej pamięci podręcznej.
         */
        const { steps } = plan(native);

        expect(steps).toHaveLength(2);
        expect(steps[0]!.args.slice(2)).toEqual([
            'cmake', '--preset', 'native-linux-arm64', '-D', 'HYDRA_TARGET=podglad',
        ]);
        expect(steps[1]!.args.slice(2)).toEqual([
            'cmake', '--build', '--preset', 'native-linux-arm64',
        ]);
    });

    it('każdy krok idzie tym samym kanałem co budowanie wsadu', () => {
        const { steps, projectDir } = plan(native);

        for (const step of steps) {
            expect(step.script).toBe(path.join(HYDRA, 'docker', 'hydra.sh'));
            expect(step.args.slice(0, 2)).toEqual(['project', projectDir]);
        }
    });

    it('wymaga presetu — bez niego cmake nie wie, dla jakiej maszyny budować', () => {
        expect(() => plan({ ...native, preset: undefined })).toThrow(HydraPlanError);
    });

    it('wymaga celu — CMakeLists.txt wybiera cel zmienną, nie zgaduje', () => {
        expect(() => plan({ ...native, target: undefined })).toThrow(HydraPlanError);
    });

    it('odrzuca preset, który nie jest nazwą presetu', () => {
        expect(() => plan({ ...native, preset: 'native-linux-arm64 && rm -rf /' }))
            .toThrow(HydraPlanError);
    });

    it('nie uruchamia programu, dopóki nikt o to nie prosi', () => {
        expect(plan(native).steps).toHaveLength(2);
    });

    it('„wgrywanie" celu natywnego znaczy uruchomienie na tej maszynie', () => {
        /*
         * Wsad wgrywa się na płytkę, a program natywny nie ma dokąd jechać —
         * jego „urządzeniem docelowym" jest ta maszyna. Uruchamiamy go **poza
         * kontenerem**: WSLg pokazuje okno SDL na pulpicie Windows, a kontener
         * musiałby dostać do tego osobno przekazane gniazdo Waylanda.
         */
        const { steps, projectDir } = plan({ ...native, upload: true, executable: 'desktop-preview' });

        expect(steps).toHaveLength(3);
        const run = steps[2]!;
        expect(run.script).toBe(path.join(projectDir, 'build', 'native-linux-arm64', 'desktop-preview'));
        expect(run.args).toEqual([]);
        // Program szuka zasobów względem katalogu projektu, nie katalogu budowy.
        expect(run.cwd).toBe(projectDir);
    });

    it('odrzuca nazwę programu, która wychodzi z katalogu budowy', () => {
        expect(() => plan({ ...native, upload: true, executable: '../../../bin/sh' }))
            .toThrow(HydraPlanError);
        expect(() => plan({ ...native, upload: true, executable: '/bin/sh' }))
            .toThrow(HydraPlanError);
    });

    it('wymaga nazwy programu, żeby wiedzieć, co uruchomić', () => {
        expect(() => plan({ ...native, upload: true })).toThrow(HydraPlanError);
    });
});

describe('planHydraBuild — cel natywny dla Windows', () => {
    const win = {
        file: '/desktop-preview/desktop-preview.hydra',
        target: 'podglad',
        kind: 'native' as const,
        preset: 'native-win-arm64',
        os: 'windows' as const,
        executable: 'desktop-preview.exe',
    };

    it('konfiguruje przez toolchain mingw, nie przez preset', () => {
        /*
         * Preset `native-win-arm64` Hydry opisuje budowanie na Windows
         * generatorem Visual Studio. Tutaj kompilator jest w kontenerze
         * linuksowym, więc cel wskazujemy flagami — preset odwołałby się do
         * generatora, którego w tym obrazie nie ma.
         */
        const { steps } = plan(win);
        const configure = steps[0]!.args.slice(2);

        expect(configure).toContain('-DCMAKE_SYSTEM_NAME=Windows');
        expect(configure).toContain('-DCMAKE_CXX_COMPILER=aarch64-w64-mingw32-g++');
        expect(configure).toContain('-DHYDRA_TARGET=podglad');
        expect(configure.some((a) => a.startsWith('-DCMAKE_PREFIX_PATH='))).toBe(true);
    });

    it('linkuje runtime statycznie, żeby wynik dało się przenieść', () => {
        // Bez tego obok `.exe` muszą leżeć `libc++.dll` i `libwinpthread-1.dll`
        // z kontenera — czyli pliki, o których odbiorca nie ma prawa wiedzieć.
        const configure = plan(win).steps[0]!.args;
        expect(configure.some((a) => a.includes('-static'))).toBe(true);
    });

    it('dokłada SDL2.dll i pakuje wynik do archiwum', () => {
        // `.exe` bez SDL2.dll nie uruchomi się u odbiorcy, a pojedynczy plik
        // wykonywalny nie ma jak go ze sobą zabrać — stąd archiwum.
        const { steps } = plan(win);
        const commands = steps.map((s) => s.args[2]);

        expect(commands).toEqual(['cmake', 'cmake', 'cp', 'zip']);
        // Archiwum leży w katalogu budowy, więc nazwa jest końcem ścieżki.
        expect(steps[3]!.args.some((a) => a.endsWith('/desktop-preview.zip'))).toBe(true);
        expect(steps[3]!.args.some((a) => a.endsWith('/SDL2.dll'))).toBe(true);
    });

    it('uruchamianie na Windows nie ma sensu w kontenerze linuksowym', () => {
        // Program dla Windows nie wystartuje w obrazie, w którym powstał.
        // Milczące pominięcie kroku wyglądałoby jak nieudane uruchomienie.
        expect(() => plan({ ...win, upload: true })).toThrow(HydraPlanError);
    });
});
