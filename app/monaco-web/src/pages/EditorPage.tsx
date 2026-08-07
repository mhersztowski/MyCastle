import { useEffect, useState } from 'react';
import { RemoteFS } from '@mhersztowski/core';
import type { FileSystemProvider } from '@mhersztowski/core';
import { TextEditorWorkspace } from '@mhersztowski/texteditor';
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

  return <TextEditorWorkspace provider={provider} height="100%" />;
}
