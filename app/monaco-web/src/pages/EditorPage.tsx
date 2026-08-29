import { useEffect, useMemo, useState } from 'react';
import * as monaco from 'monaco-editor';
import { RemoteFS } from '@mhersztowski/core';
import type { FileSystemProvider } from '@mhersztowski/core';
import { TextEditorWorkspace } from '@mhersztowski/texteditor';
import { createHydraStudioPlugin } from '@mhersztowski/hydra-studio';
import { runHydraBuild } from './hydraBuild';
import { collectHydraFirmware } from './hydraFlash';
import { FlashPanel, supportsWebSerial } from './FlashPanel';
import type { FlashFileEntry } from '@mhersztowski/web-serial';
import '../editor/monacoWorkers';

/**
 * Strona edytora — jedyna strona aplikacji.
 *
 * Montuje katalog danych monaco-backendu przez `RemoteFS` na `/api/vfs`
 * i oddaje go gotowemu `TextEditorWorkspace` z pakietu `texteditor` — temu
 * samemu komponentowi, który w MyCastle obsługuje edytor kodu w Drive.
 * Wszystkie wbudowane pluginy (IntelliSense TS/Python/C++, podgląd i LSP
 * markdownu, edytor MJD, zwijanie) wchodzą razem z nim.
 *
 * Agent AI i terminal są wyłączone: backend nie wystawia ani endpointu na
 * klucz API, ani gniazda `/ws/terminal`. Nie ma też `projectDeps` — akcje
 * projektowe (Compile / Flash / Build) idą przez trasy `/api/users/{id}/…`,
 * których ten backend nie zna, a wymagają nazwy użytkownika, której w aplikacji
 * bez logowania nie ma. Włączenie każdej z tych rzeczy to jedna flaga tutaj
 * i odpowiednia trasa po stronie backendu.
 */
export function EditorPage() {
  const [provider] = useState<FileSystemProvider>(() => new RemoteFS({ baseUrl: '/api/vfs' }));

  /*
   * Stan okna wgrywania.
   *
   * Okno otwiera się **zanim** wsad zostanie zebrany, a nie po. Zbieranie
   * czyta trzy pliki z katalogu budowy i przy megabajtowym wsadzie potrafi
   * potrwać — bez okna od razu przycisk wygląda przez ten czas na martwy.
   */
  const [flashOpen, setFlashOpen]   = useState(false);
  const [flashFiles, setFlashFiles] = useState<FlashFileEntry[] | undefined>(undefined);
  const [flashLabel, setFlashLabel] = useState<string | undefined>(undefined);
  const [flashError, setFlashError] = useState<string | null>(null);

  // Na świeżym backendzie katalog danych bywa pusty — `mkdir('/')` sprawia, że
  // eksplorator listuje korzeń zamiast pokazać błąd 404.
  useEffect(() => {
    provider.mkdir?.('/').catch(() => {});
  }, [provider]);

  /**
   * Hydra Studio — otwarcie pliku `.hydra` z eksploratora pokazuje interfejs
   * projektu obok zwykłej zakładki tekstowej.
   *
   * Modele bierzemy wprost z Monaco, bo wtyczka nanosi zmiany przedziałami
   * tekstu: formularz i tekst patrzą wtedy na ten sam model, a cofanie działa
   * krok po kroku.
   *
   * Budowanie idzie przez `POST /api/hydra/build` monaco-backendu, który
   * uruchamia kontener Hydry (`docker/hydra.sh`) i strumieniuje jego wyjście.
   * Paczki i schemat zostają niepodłączone — panel projektu, walidacja
   * i biblioteka komponentów działają bez nich.
   */
  const hydraStudioPlugin = useMemo(() => createHydraStudioPlugin({
    models: {
      getModel: (uri: string) =>
        monaco.editor.getModels().find((m) => m.uri.toString() === uri || m.uri.path === uri)
        ?? undefined,
    },
    async runBuild(request, onLine) {
      // Treść bierzemy z modelu edytora, a nie z dysku: `platformio.ini`
      // powstaje z tego, co widać na ekranie, łącznie z niezapisanymi zmianami.
      const model = monaco.editor.getModels().find((m) => m.uri.path === request.file);
      return runHydraBuild(request, model?.getValue() ?? '', provider, onLine);
    },

    /*
     * Wgranie wsadu z przeglądarki — jedyna droga, która tutaj może zadziałać.
     *
     * `project.upload` woła `pio run -t upload` w kontenerze, a `hydra.sh` nie
     * przekazuje mu żadnego `--device`: PlatformIO nie widzi tam portu
     * szeregowego w ogóle. Nawet gdyby widział, byłby to port serwera, a nie
     * osoby siedzącej przed przeglądarką.
     *
     * Opcja jest warunkowa, bo jej obecność decyduje o widoczności polecenia
     * w palecie. Bez Web Serial lepiej go nie pokazać niż pokazać martwy —
     * Firefox i Safari tego API nie mają.
     */
    ...(supportsWebSerial() ? {
      async flashFromBrowser(request) {
        setFlashLabel(`${request.target} · ${request.mcu}`);
        setFlashFiles(undefined);
        setFlashOpen(true);
        try {
          setFlashFiles(await collectHydraFirmware(request, provider));
        } catch (e) {
          setFlashError(e instanceof Error ? e.message : String(e));
        }
      },
    } : {}),
  }), [provider]);

  const extraPlugins = useMemo(() => [hydraStudioPlugin], [hydraStudioPlugin]);

  return (
    <>
      <TextEditorWorkspace provider={provider} height="100%" extraPlugins={extraPlugins} />
      <FlashPanel
        open={flashOpen}
        onClose={() => { setFlashOpen(false); setFlashFiles(undefined); setFlashError(null); }}
        files={flashFiles}
        label={flashLabel}
        error={flashError}
      />
    </>
  );
}
