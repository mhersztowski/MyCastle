/**
 * openTarget.ts — otwieranie pliku z backendu wprost z adresu przeglądarki.
 *
 * Edytor nie ma routera, więc adres jest jedynym trwałym „wskaźnikiem" na
 * projekt: `/open/<ścieżka w VFS>` (albo `?open=<ścieżka>`) uruchamia aplikację
 * w trybie wynikającym z ROZSZERZENIA pliku i wczytuje jego treść. Dzięki temu
 * link do projektu można wkleić w notatce, wysłać komuś albo zapisać w zakładkach.
 *
 *   /open/users/marcin/projects/silnik.cad3d.json   → CAD 3D + wczytany projekt
 *   /open/users/marcin/projects/scena.scene.json    → Scene 3D
 *
 * Tryb bierze się z rozszerzenia, a nie z osobnego segmentu adresu, bo pliki
 * i tak niosą tę informację (`*.cad3d.json`), a dublowanie jej w URL-u
 * pozwoliłoby na sprzeczność („/open/cad/…/x.scene.json").
 */

/** Tryby edytora, które potrafimy otworzyć z adresu. */
export type OpenMode = 'cad' | 'cad3d' | 'scene3d' | 'electronics' | 'pcb' | 'map' | 'notes' | 'rysik';

export interface OpenTarget {
  /** Ścieżka pliku w VFS backendu, bez wiodącego `/`. */
  vfsPath: string;
  mode: OpenMode;
}

/**
 * Rozszerzenie → tryb. Kolejność ma znaczenie: `.cad3d.json` musi być sprawdzone
 * przed `.cad.json`, inaczej dłuższe rozszerzenie nigdy by nie trafiło.
 */
const EXTENSION_MODES: Array<[string, OpenMode]> = [
  ['.cad3d.json', 'cad3d'],
  ['.scene.json', 'scene3d'],
  ['.elec.json', 'electronics'],
  ['.pcb.json', 'pcb'],
  ['.map.json', 'map'],
  ['.notes.json', 'notes'],
  ['.cad.json', 'cad'],
  ['.qmd', 'rysik'],
];

/** Tryb dla ścieżki pliku; `null`, gdy rozszerzenie jest nieznane. */
export function modeForFile(path: string): OpenMode | null {
  const lower = String(path ?? '').toLowerCase();
  for (const [ext, mode] of EXTENSION_MODES) {
    if (lower.endsWith(ext)) return mode;
  }
  return null;
}

/** Wszystkie obsługiwane rozszerzenia — np. do filtrów w oknie wyboru pliku. */
export function openableExtensions(): string[] {
  return EXTENSION_MODES.map(([ext]) => ext);
}

/**
 * Czyta cel otwarcia z adresu. Obsługiwane formy:
 *   • `/open/users/x/projects/a.cad.json`
 *   • `/?open=/users/x/projects/a.cad.json`
 * Zwraca `null`, gdy adres nie wskazuje pliku albo rozszerzenie jest nieznane.
 */
export function parseOpenTarget(pathname: string, search = ''): OpenTarget | null {
  const fromPath = /^\/open\/(.+)$/.exec(pathname ?? '');
  let raw = fromPath ? decodeURIComponent(fromPath[1]) : '';

  if (!raw && search) {
    const param = new URLSearchParams(search.startsWith('?') ? search : `?${search}`).get('open');
    if (param) raw = param;
  }
  if (!raw) return null;

  // Ścieżki traktujemy jako bezwzględne w VFS; wiodące `/` tylko przeszkadza
  // przy sklejaniu, a `..` odrzucamy, żeby link nie próbował wyjść poza VFS.
  const vfsPath = raw.replace(/^\/+/, '').split('?')[0].split('#')[0];
  if (!vfsPath || vfsPath.split('/').includes('..')) return null;

  const mode = modeForFile(vfsPath);
  return mode ? { vfsPath, mode } : null;
}

/** Adres otwierający dany plik — do kopiowania „linku do projektu". */
export function buildOpenUrl(vfsPath: string): string {
  const clean = String(vfsPath ?? '').replace(/^\/+/, '');
  return `/open/${clean.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Adres, na jaki powinien wskazywać edytor po otwarciu pliku — albo `null`, gdy
 * pliku nie da się odtworzyć z adresu (nieznane rozszerzenie). Wydzielone z
 * `syncOpenUrl`, bo cała decyzja daje się sprawdzić bez przeglądarki.
 */
export function openUrlFor(vfsPath: string): string | null {
  const clean = String(vfsPath ?? '').replace(/^\/+/, '');
  if (!clean || !modeForFile(clean)) return null;
  return buildOpenUrl(clean);
}

/**
 * Ustawia adres przeglądarki na `/open/<plik>` po otwarciu projektu z backendu,
 * żeby dało się go odświeżyć, dodać do zakładek albo skopiować komuś link.
 *
 * Używa `replaceState`, a nie `pushState`: edytor nie obsługuje cofania (nie
 * potrafi na `popstate` przywrócić poprzedniego projektu), więc wpis w historii
 * prowadziłby do stanu, w którym adres kłamie o zawartości ekranu.
 *
 * Przy nierozpoznanym pliku adres zostaje bez zmian — lepszy poprzedni niż taki,
 * który po odświeżeniu nic nie otworzy.
 */
export function syncOpenUrl(vfsPath: string): void {
  const url = openUrlFor(vfsPath);
  if (!url || typeof window === 'undefined' || window.location.pathname === url) return;
  window.history.replaceState(window.history.state, '', url + window.location.search + window.location.hash);
}
