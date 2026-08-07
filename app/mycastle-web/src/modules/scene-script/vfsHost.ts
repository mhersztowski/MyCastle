/**
 * vfsHost.ts — dostęp do plików MyCastle dla `Scene.load`/`Scene.save`.
 *
 * Idzie przez **REST**, bo tym kanałem strona Drive listuje katalogi, otwiera
 * pliki i zapisuje zmiany. Host sceny sięgał wcześniej po MQTT i przewracał się
 * na „Not connected to MQTT broker" — na stronie, która poza tym działała bez
 * zarzutu, bo do niczego innego brokera nie potrzebuje. Skrypt uruchamiany
 * z Drive ma widzieć pliki dokładnie tak, jak widzi je Drive; dwa kanały to
 * dwa zestawy warunków, które muszą być spełnione naraz.
 *
 * Ścieżki zostają takie, jakimi posługują się skrypty (`drive/…`), więc
 * przykłady w podpowiedziach i dokumentacji nie zmieniają znaczenia.
 */
import type { IScene } from '@mhersztowski/core-cad-viewer';
import type { SceneHost } from './Scene';

/** Korzeń danych backendu — ten sam, którego używa reszta strony Drive. */
const KORZEN = '/data/Minis/Users';

/**
 * Zamienia ścieżkę widzianą przez skrypt na ścieżkę, którą rozumie backend.
 *
 * Odpowiednik tego, co `MqttClient` robi swoim `userBasePath` — dzięki temu ten
 * sam zapis `drive/projekty/dom.scene.json` znaczy w skrypcie to samo niezależnie
 * od tego, czy uruchomiono go w Drive, czy w bloku w notatce.
 */
export function sciezkaBackendu(userName: string, path: string): string {
  const oczyszczona = path.replace(/^\/+/, '');
  const pelna = `${KORZEN}/${userName}/${oczyszczona}`;

  // Normalizacja sama w sobie nie chroni — sprawdzamy wynik, bo `..` w środku
  // ścieżki potrafi wyprowadzić poza katalog użytkownika.
  const czesci: string[] = [];
  for (const czesc of pelna.split('/')) {
    if (czesc === '.' || czesc === '') continue;
    if (czesc === '..') czesci.pop();
    else czesci.push(czesc);
  }
  const znormalizowana = `/${czesci.join('/')}`;

  const dozwolony = `${KORZEN}/${userName}`;
  if (znormalizowana !== dozwolony && !znormalizowana.startsWith(`${dozwolony}/`)) {
    throw new Error(`Ścieżka „${path}" wychodzi poza katalog użytkownika.`);
  }
  return znormalizowana;
}

function adres(userName: string, op: string, path: string): string {
  const u = new URL(`/api/users/${encodeURIComponent(userName)}/vfs/${op}`, window.location.origin);
  u.searchParams.set('path', sciezkaBackendu(userName, path));
  return u.pathname + u.search;
}

/** UTF-8 → base64. `btoa` nie przyjmuje znaków spoza latin-1. */
function tekstNaBase64(tekst: string): string {
  const bajty = new TextEncoder().encode(tekst);
  let binarnie = '';
  for (const b of bajty) binarnie += String.fromCharCode(b);
  return btoa(binarnie);
}

function base64NaTekst(b64: string): string {
  const binarnie = atob(b64);
  const bajty = new Uint8Array(binarnie.length);
  for (let i = 0; i < binarnie.length; i += 1) bajty[i] = binarnie.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bajty);
}

export interface OpcjeHostaSceny {
  userName: string;
  authHeaders: () => Record<string, string>;
  present: (scene: IScene, opis: { path: string; kind: string }) => void;
}

export function utworzHostaSceny({ userName, authHeaders, present }: OpcjeHostaSceny): SceneHost {
  return {
    readFile: async (path) => {
      const r = await fetch(adres(userName, 'readFile', path), { headers: authHeaders() });
      // Brak pliku to nie awaria — `Scene.create` stoi właśnie na tym rozróżnieniu.
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`Nie udało się odczytać „${path}" (HTTP ${r.status}).`);
      const json = await r.json() as { data?: string };
      return base64NaTekst(json.data ?? '');
    },

    writeFile: async (path, content) => {
      const r = await fetch(adres(userName, 'writeFile', path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          data: tekstNaBase64(content),
          options: { create: true, overwrite: true },
        }),
      });
      if (!r.ok) throw new Error(`Nie udało się zapisać „${path}" (HTTP ${r.status}).`);
    },

    present,
  };
}
