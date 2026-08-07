/**
 * Scene.ts — sceny CAD i 3D dostępne ze skryptu.
 *
 * Skrypt deklaruje potrzebę importem, tak jak sięga po `api` i `Aura`:
 *
 *   import { Scene } from 'mycastle/scene';
 *   const scena = await Scene.load('drive/projekty/dom.scene.json');
 *
 * Import jest usuwany przed uruchomieniem (`prepareAutomateScript`), a symbol
 * wchodzi przez zasięg hosta. Świadomie **nie** jest globalny: sceny używa
 * ułamek skryptów, a każdy globalny symbol zwęża listę nazw, których autor może
 * użyć u siebie.
 *
 * Zwracany obiekt to `IScene` z `@mhersztowski/core-cad-viewer` — ten sam
 * kontrakt, którym mówi o scenach cad-app. Skrypt napisany dla rysunku działa
 * więc na scenie 3D wszędzie tam, gdzie robi rzeczy wspólne: szuka, zmienia,
 * dodaje.
 *
 * Klasa ma **same metody statyczne**: `Scene` jest tu przestrzenią nazw, a nie
 * bytem do tworzenia. Skrypt nigdy nie pisze `new Scene()`.
 */
import type { IScene } from '@mhersztowski/core-cad-viewer';
import { pustaScena, rodzajZeSciezki, scenaZTresci, trescZeSceny, type ObslugiwanyRodzaj } from './sceneFiles';
import { adresyVfs, ciałoZapisu, jestUrl, trescZOdpowiedzi } from './sceneUrl';

/** Wejście–wyjście i podgląd — wstrzykiwane przez hosta, żeby dało się to testować. */
export interface SceneHost {
  readFile(path: string): Promise<string | null>;
  writeFile(path: string, content: string): Promise<void>;
  /**
   * Pobranie po HTTP — wstrzykiwane, żeby dało się to sprawdzić testem.
   *
   * Domyślnie zwykły `fetch`. Osobno od `readFile`, bo to inny świat: inny
   * serwer, inne uprawnienia i inne powody, dla których może nie odpowiedzieć.
   */
  fetch?: typeof fetch;
  /**
   * Pokazuje scenę w panelu pod wynikiem skryptu.
   *
   * Wołane przez `load` samo z siebie: skrypt, który wczytał scenę, prawie
   * zawsze chce ją zobaczyć, a wymaganie osobnego `Scene.show(...)` znaczyłoby,
   * że połowa skryptów kończy się pustym oknem i pytaniem „czemu nic nie ma".
   */
  present?(scene: IScene, opis: { path: string; kind: ObslugiwanyRodzaj }): void;
}

let host: SceneHost | null = null;

export function setSceneHost(nowy: SceneHost | null): void {
  host = nowy;
}

/**
 * Treść spod adresu HTTP.
 *
 * `404` znaczy „nie ma pliku" i wraca jako `null`, żeby `createIfMissing`
 * działało tak samo dla Drive i dla cudzego serwera. Pozostałe błędy niosą
 * status: „nie udało się" bez numeru każe zgadywać, czy to literówka w adresie,
 * brak uprawnień, czy padnięty serwer.
 */
async function pobierzPoHttp(h: SceneHost, url: string, jakoVfs = false): Promise<string | null> {
  const { read } = adresyVfs(url, jakoVfs);
  const pobierz = h.fetch ?? fetch;

  let odpowiedz: Response;
  try {
    odpowiedz = await pobierz(read);
  } catch (blad) {
    throw new Error(
      `Nie udało się połączyć z „${read}": ${(blad as Error).message}. `
      + 'Sprawdź, czy serwer działa i czy pozwala na połączenia z tej strony (CORS).',
    );
  }

  if (odpowiedz.status === 404) return null;
  if (!odpowiedz.ok) {
    throw new Error(`Serwer odpowiedział ${odpowiedz.status} ${odpowiedz.statusText} na „${read}".`);
  }

  const tekst = await odpowiedz.text();

  /*
    Serwer aplikacji na nieznanej trasie oddaje `index.html` ze statusem 200 —
    tak zachowuje się każda strona z routingiem po stronie klienta. Bez tego
    sprawdzenia użytkownik dostawał „Unexpected token '<'" z wnętrza
    `JSON.parse`, co nie mówi ani gdzie, ani dlaczego.
  */
  if (/^\s*<(!doctype|html)\b/i.test(tekst)) {
    throw new Error(
      `Adres „${read}" zwrócił stronę HTML, nie plik sceny. `
      + 'Adres `/open/…` otwiera edytor z projektem — pliku szukaj pod ścieżką bez `/open/`, '
      + 'a żeby sięgnąć do VFS tego serwera, dodaj opcję: '
      + "Scene.load(adres, { vfs: true }).",
    );
  }

  return trescZOdpowiedzi(tekst);
}

function wymagajHosta(): SceneHost {
  if (!host) {
    throw new Error('Sceny są niedostępne w tym miejscu — brak połączenia z dyskiem.');
  }
  return host;
}

export interface LoadOptions {
  /** Rodzaj sceny, gdy nazwa pliku go nie zdradza. */
  kind?: ObslugiwanyRodzaj;
  /**
   * Adres jest **ścieżką w VFS** cudzego serwera, a nie zwykłym plikiem.
   *
   * Wtedy `http://localhost:1897/users/marcin/plan.cad.json` zamienia się na
   * `…/api/vfs/readFile?path=/users/marcin/plan.cad.json`. Bez tej opcji adres
   * jest pobierany dosłownie — zgadywanie po rozszerzeniu psuło zwykłe serwery
   * plików.
   */
  vfs?: boolean;
  /** Wczytać bez pokazywania panelu — dla skryptów, które tylko przeliczają. */
  silent?: boolean;
  /** Utworzyć pustą scenę, gdy pliku nie ma; domyślnie brak pliku to błąd. */
  createIfMissing?: boolean;
}

export class Scene {
  /**
   * Wczytuje scenę z dysku użytkownika i pokazuje ją w panelu.
   *
   * @param path Ścieżka w Drive (`drive/projekty/dom.scene.json`) **albo** pełny
   *   adres pliku na innym serwerze
   *   (`http://localhost:1897/users/marcin/projects/plan.cad.json`) — tak leżą
   *   projekty zrobione w cad-app.
   */
  static async load(path: string, options: LoadOptions = {}): Promise<IScene> {
    const h = wymagajHosta();

    const kind = options.kind ?? rodzajZeSciezki(path);
    if (!kind) {
      throw new Error(
        `Nie wiem, jakiego rodzaju jest scena „${path}". Nazwij plik „*.scene.json" albo `
        + '„*.cad.json", albo podaj rodzaj: Scene.load(ścieżka, { kind: \'scene3d\' }).',
      );
    }

    const tresc = jestUrl(path) ? await pobierzPoHttp(h, path, options.vfs) : await h.readFile(path);
    if (tresc === null) {
      if (!options.createIfMissing) throw new Error(`Nie ma pliku „${path}".`);
      const nowa = pustaScena(kind);
      if (!options.silent) h.present?.(nowa, { path, kind });
      return nowa;
    }

    const scena = scenaZTresci(tresc, kind);
    if (!options.silent) h.present?.(scena, { path, kind });
    return scena;
  }

  /**
   * Zapisuje scenę na dysk użytkownika.
   *
   * Ścieżka jest podawana osobno, a nie brana z `load`: skrypt bywa
   * „wczytaj wzorzec, zmień, zapisz jako nowy" i zapamiętane źródło byłoby
   * wtedy pułapką.
   */
  static async save(path: string, scene: IScene, options: { vfs?: boolean } = {}): Promise<void> {
    const h = wymagajHosta();
    const tresc = trescZeSceny(scene);

    if (!jestUrl(path)) {
      await h.writeFile(path, tresc);
      return;
    }

    const { write } = adresyVfs(path, options.vfs);
    if (!write) {
      throw new Error(
        `Pod adres „${path}" nie da się zapisać — to zwykły plik po HTTP, a nie VFS. `
        + 'Zapisz do Drive albo podaj adres serwera z VFS (np. cad-backend).',
      );
    }

    const pobierz = h.fetch ?? fetch;
    const odpowiedz = await pobierz(write, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: ciałoZapisu(tresc),
    });
    if (!odpowiedz.ok) {
      throw new Error(`Zapis „${path}" nie powiódł się: ${odpowiedz.status} ${odpowiedz.statusText}.`);
    }
  }

  /** Pusta scena bez pliku — do zbudowania czegoś od zera i zapisania przez `save`. */
  static create(kind: ObslugiwanyRodzaj, options: { silent?: boolean } = {}): IScene {
    const scena = pustaScena(kind);
    if (!options.silent) host?.present?.(scena, { path: '(nowa)', kind });
    return scena;
  }
}
