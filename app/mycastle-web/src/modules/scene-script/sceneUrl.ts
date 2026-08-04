/**
 * sceneUrl.ts — skąd wziąć scenę: z dysku MyCastle czy z cudzego serwera.
 *
 * Sceny nie zawsze leżą w Drive. CAD-y powstają w `cad-app` i mieszkają
 * w `cad-backend`, który wystawia własny VFS po HTTP. Skrypt ma móc sięgnąć
 * i tam, bez kopiowania plików tam i z powrotem.
 *
 * Rozstrzygamy po **schemacie adresu**, a nie po zgadywaniu:
 *
 *  • `drive/projekty/dom.scene.json` — ścieżka w VFS MyCastle (jak dotąd);
 *  • `http://host/api/vfs/readFile?path=…` — VFS cudzego serwera (cad-backend);
 *  • `https://host/gdzies/plik.json` — zwykły plik; bierzemy treść, jaka przyjdzie.
 *
 * **Nie zgadujemy po rozszerzeniu.** Pierwsza wersja uznawała każdy adres
 * kończący się `.scene.json` za ścieżkę w VFS i składała z niego wywołanie
 * `/api/vfs/readFile`. Dla cad-backendu działało, ale zwykły plik na serwerze
 * plików dostawał wtedy adres, którego ten serwer nie zna — i wracało 404 bez
 * wskazówki, co poszło źle. Adres jest brany dosłownie; VFS rozpoznajemy po
 * tym, że autor sam go wskazał, albo po jawnej opcji `vfs`.
 */

/** Czy adres wskazuje poza VFS MyCastle. */
export function jestUrl(sciezka: string): boolean {
  return /^https?:\/\//i.test(sciezka.trim());
}

export interface AdresyVfs {
  /** Adres do pobrania treści. */
  read: string;
  /** Adres do zapisu; `null`, gdy serwer nie wygląda na VFS i zapisu nie ma gdzie wysłać. */
  write: string | null;
}

/**
 * Adresy odczytu i zapisu dla podanego URL-a.
 *
 * Zapis wymaga rozpoznania VFS-a: pod zwykły plik po HTTP nie da się wysłać
 * `POST`-a i udawać, że to zapis. Zamiast rzucać dopiero przy próbie, mówimy
 * o tym już tutaj, przez `write: null`.
 */
export function adresyVfs(url: string, jakoVfs = false): AdresyVfs {
  const adres = new URL(url.trim());

  // Gotowe wywołanie VFS — autor podał je wprost.
  const trasa = /\/api\/vfs\/(readFile|writeFile|stream)$/.exec(adres.pathname);
  if (trasa) {
    const bazowa = adres.pathname.replace(/\/(readFile|writeFile|stream)$/, '');
    const read = new URL(adres.toString());
    read.pathname = `${bazowa}/readFile`;
    const write = new URL(adres.toString());
    write.pathname = `${bazowa}/writeFile`;
    return { read: read.toString(), write: write.toString() };
  }

  // Ścieżka w VFS cudzego serwera — tylko na wyraźne życzenie:
  // `Scene.load('http://localhost:1897/users/marcin/projects/plan.cad.json', { vfs: true })`.
  if (jakoVfs) {
    const path = adres.pathname;
    const read = new URL(adres.origin);
    read.pathname = '/api/vfs/readFile';
    read.searchParams.set('path', path);
    const write = new URL(adres.origin);
    write.pathname = '/api/vfs/writeFile';
    write.searchParams.set('path', path);
    return { read: read.toString(), write: write.toString() };
  }

  return { read: adres.toString(), write: null };
}

/**
 * Wyciąga treść sceny z odpowiedzi serwera.
 *
 * VFS pakuje plik w `{ data: <base64> }`, bo tym samym kanałem chodzą pliki
 * binarne. Zwykły serwer oddaje treść wprost. Rozpoznajemy po kształcie
 * odpowiedzi, a nie po adresie: ten sam serwer bywa i jednym, i drugim.
 */
export function trescZOdpowiedzi(tekst: string): string {
  const przyciety = tekst.trim();
  if (!przyciety.startsWith('{')) return tekst;

  try {
    const dane = JSON.parse(przyciety) as { data?: unknown };
    if (typeof dane.data === 'string') {
      // `atob` zwraca bajty w znakach — dekodujemy je jako UTF-8, inaczej
      // polskie nazwy warstw wracałyby jako krzaki.
      const bajty = Uint8Array.from(atob(dane.data), (z) => z.charCodeAt(0));
      return new TextDecoder().decode(bajty);
    }
  } catch {
    // Nie JSON albo nie ten kształt — treść zostaje taka, jaka przyszła.
  }
  return tekst;
}

/** Pakuje treść do postaci, której oczekuje VFS przy zapisie. */
export function ciałoZapisu(tresc: string): string {
  const bajty = new TextEncoder().encode(tresc);
  let binarny = '';
  for (const b of bajty) binarny += String.fromCharCode(b);
  return JSON.stringify({ data: btoa(binarny) });
}
