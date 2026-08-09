import { useEffect, useMemo, useState } from 'react';
import * as monaco from 'monaco-editor';
import { RemoteFS } from '@mhersztowski/core';
import type { FileSystemProvider } from '@mhersztowski/core';
import { TextEditorWorkspace } from '@mhersztowski/texteditor';
import { createHydraStudioPlugin } from '@mhersztowski/hydra-studio';
import { runHydraBuild } from './hydraBuild';
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
  }), [provider]);

  const extraPlugins = useMemo(() => [hydraStudioPlugin], [hydraStudioPlugin]);

  return <TextEditorWorkspace provider={provider} height="100%" extraPlugins={extraPlugins} />;
}
