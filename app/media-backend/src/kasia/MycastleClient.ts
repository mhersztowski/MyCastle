/**
 * MycastleClient.ts — dostęp do plików użytkownika w MyCastle.
 *
 * ## Dlaczego MQTT, a nie REST
 *
 * Wydawałoby się, że skoro mamy nazwę i hasło, to wystarczy zalogować się po
 * HTTP i pobrać pliki. Sprawdziłem: `/files/` w MyCastle **udostępnia wyłącznie
 * `data/public`** i odpowiada 403 na wszystko inne, także z ważnym tokenem.
 * Dane PIM (`data/projects.json`, `data/tasks.json`, `data/calendar/…`) leżą
 * poza tym katalogiem i nie ma do nich trasy REST — cały MyCastle sięga po nie
 * przez VFS po MQTT, tym samym kanałem, którego używa jego własny frontend.
 *
 * Stąd ten klient: łączy się z brokerem MyCastle nazwą i hasłem z `.env`
 * i mówi tym samym protokołem, co `MqttClient` z `web-client`:
 *
 *   żądanie  → `mycastle/request`   `{ type: 'file_read', id, payload: { path } }`
 *   odpowiedź← `mycastle/response`  `{ type: 'response', payload: { requestId, data } }`
 *
 * ## Ścieżki
 *
 * Frontend MyCastle ustawia bazę przez `setUserBasePath`, więc pisze
 * `data/tasks.json`. My doklejamy ją sami: `Minis/Users/{użytkownik}/…` —
 * **bez wiodącego `/data`**, bo obsługa odczytu liczy ścieżkę od katalogu
 * danych. Szczegół w komentarzu przy `sciezka()`.
 */

import mqtt, { type MqttClient as Klient } from 'mqtt';
import { randomUUID } from 'node:crypto';
import {
  scalWydarzenia, sciezkiKalendarza, zakresDni,
  type Projekt, type Wydarzenie, type Zadanie,
} from './dane';
import { PLIK_WAGI, type PlikWagi } from './waga';

export interface KonfiguracjaMycastle {
  /** Adres brokera, np. `ws://localhost:1894/mqtt`. */
  broker: string;
  uzytkownik: string;
  haslo: string;
}

interface Oczekujace {
  resolve: (dane: unknown) => void;
  reject: (blad: Error) => void;
}

const TEMAT_ZADANIA = 'mycastle/request';
const TEMAT_ODPOWIEDZI = 'mycastle/response';

/** Ile czekamy na odpowiedź brokera, zanim uznamy żądanie za przepadłe. */
const LIMIT_MS = 15_000;

export interface DaneMycastle {
  projekty: Projekt[];
  zadania: Zadanie[];
  wydarzenia: Wydarzenie[];
  /** Pomiary wagi — obecne tylko wtedy, gdy rozmowa ich dotyczy. */
  waga?: PlikWagi;
  /** Czego nie udało się pobrać — panel i log pokazują to wprost. */
  bledy: string[];
}

export class MycastleClient {
  private klient: Klient | null = null;
  private oczekujace = new Map<string, Oczekujace>();
  private laczenie: Promise<void> | null = null;
  /** Tematy, na których czekamy na cudze wiadomości (polecenia do Kasi). */
  private nasluchy = new Map<string, (payload: unknown) => void>();

  constructor(private readonly cfg: KonfiguracjaMycastle) {}

  get skonfigurowany(): boolean {
    return Boolean(this.cfg.broker && this.cfg.uzytkownik);
  }

  get polaczony(): boolean {
    return this.klient?.connected ?? false;
  }

  /**
   * Łączy się z brokerem; kolejne wywołania czekają na to samo połączenie.
   *
   * Bez tej wspólnej obietnicy dwa równoległe odczyty (a pętla Kasi i żądanie
   * z panelu potrafią wypaść w tej samej chwili) otwierałyby dwa połączenia
   * i drugie z nich zostawałoby bez subskrypcji odpowiedzi.
   */
  private polacz(): Promise<void> {
    if (this.klient?.connected) return Promise.resolve();
    if (this.laczenie) return this.laczenie;

    this.laczenie = new Promise<void>((resolve, reject) => {
      /*
       * Nazwę i hasło wysyłamy **tylko razem**.
       *
       * Broker MyCastle przepuszcza połączenie anonimowe, ale rozpoznaje je po
       * tym, że **oba** pola są puste; sama nazwa bez hasła jest odrzucana jako
       * „Not authorized". Konfiguracja podaje nazwę użytkownika zawsze, bo
       * potrzebujemy jej do ścieżki VFS — a to, czy się nią logujemy, zależy
       * od tego, czy jest hasło.
       */
      const uwierzytelnianie = this.cfg.haslo
        ? { username: this.cfg.uzytkownik, password: this.cfg.haslo }
        : {};

      const klient = mqtt.connect(this.cfg.broker, {
        ...uwierzytelnianie,
        // Identyfikator musi być niepowtarzalny — broker rozłącza duplikaty,
        // a Kasia dzieli brokera z przeglądarkami i urządzeniami.
        clientId: `kasia-${randomUUID().slice(0, 8)}`,
        reconnectPeriod: 5000,
        connectTimeout: 10_000,
      });

      const gotowe = (): void => {
        klient.subscribe(TEMAT_ODPOWIEDZI, (err) => {
          if (err) { reject(err); return; }
          this.klient = klient;
          // Po ponownym połączeniu subskrypcje trzeba założyć od nowa —
          // broker ich nie pamięta, a skrypt milczałby bez śladu w logu.
          for (const temat of this.nasluchy.keys()) klient.subscribe(temat);
          resolve();
        });
      };

      klient.on('connect', gotowe);
      klient.on('message', (temat, tresc) => {
        if (temat === TEMAT_ODPOWIEDZI) { this.odbierz(tresc.toString()); return; }

        const nasluch = this.nasluchy.get(temat);
        if (!nasluch) return;
        try {
          nasluch(JSON.parse(tresc.toString()));
        } catch {
          // Wiadomość nie-JSON na naszym temacie: nie nasza sprawa.
        }
      });
      klient.on('error', (err) => {
        // Błąd po nawiązaniu połączenia nie może odrzucać obietnicy, która
        // już się rozstrzygnęła — biblioteka sama próbuje łączyć ponownie.
        if (!this.klient) reject(err);
      });
      klient.on('close', () => { this.klient = null; this.laczenie = null; });
    }).catch((err: Error) => {
      this.laczenie = null;
      throw err;
    });

    return this.laczenie;
  }

  /**
   * Nasłuch dodatkowego tematu — tak wchodzi `kasia/{user}/inbox`.
   *
   * Osobno od odpowiedzi VFS, bo to inny kierunek: tam my pytamy, tu ktoś pyta
   * nas. Jedno połączenie obsługuje oba, więc skrypt i odczyt plików nie walczą
   * o brokera.
   */
  async nasluchuj(temat: string, cb: (payload: unknown) => void): Promise<void> {
    await this.polacz();
    const klient = this.klient;
    if (!klient) throw new Error('Brak połączenia z brokerem MyCastle.');

    this.nasluchy.set(temat, cb);
    await new Promise<void>((resolve, reject) => {
      klient.subscribe(temat, (err) => (err ? reject(err) : resolve()));
    });
  }

  /** Publikuje na dowolnym temacie — Kasia odpowiada tędy skryptom. */
  async publikuj(temat: string, payload: unknown): Promise<void> {
    await this.polacz();
    this.klient?.publish(temat, JSON.stringify(payload));
  }

  private odbierz(wiadomosc: string): void {
    try {
      const pakiet = JSON.parse(wiadomosc) as {
        type: string;
        payload?: { requestId?: string; data?: unknown; message?: string };
      };
      const id = pakiet.payload?.requestId;
      if (!id) return;

      const czeka = this.oczekujace.get(id);
      if (!czeka) return;
      this.oczekujace.delete(id);

      if (pakiet.type === 'error') czeka.reject(new Error(pakiet.payload?.message ?? 'Błąd VFS'));
      else czeka.resolve(pakiet.payload?.data);
    } catch {
      // Cudza wiadomość na wspólnym temacie — nie nasza sprawa.
    }
  }

  private async zapytaj<T>(typ: string, payload: unknown): Promise<T> {
    await this.polacz();
    const klient = this.klient;
    if (!klient) throw new Error('Brak połączenia z brokerem MyCastle.');

    const id = randomUUID();

    return new Promise<T>((resolve, reject) => {
      this.oczekujace.set(id, { resolve: resolve as (d: unknown) => void, reject });
      klient.publish(TEMAT_ZADANIA, JSON.stringify({ type: typ, id, timestamp: Date.now(), payload }));

      setTimeout(() => {
        if (this.oczekujace.delete(id)) {
          reject(new Error(`Brak odpowiedzi z MyCastle w ${LIMIT_MS / 1000} s (${typ}).`));
        }
      }, LIMIT_MS);
    });
  }

  /**
   * Pełna ścieżka pliku w katalogu użytkownika.
   *
   * **Bez wiodącego `/data`.** Obsługa `file_read` po stronie MyCastle liczy
   * ścieżkę od katalogu danych, więc `/data/Minis/…` szuka w `data/data/Minis/…`
   * i kończy się `ENOENT` — z komunikatem, który wygląda na brak pliku, a nie na
   * zły punkt odniesienia. Frontend MyCastle tego nie widzi, bo `setUserBasePath`
   * dokleja mu bazę już w tej postaci.
   */
  private sciezka(wzgledna: string): string {
    return `Minis/Users/${this.cfg.uzytkownik}/${wzgledna}`;
  }

  /** Czyta plik JSON; `null`, gdy pliku nie ma. */
  async czytajJson<T>(wzgledna: string): Promise<T | null> {
    try {
      const dane = await this.zapytaj<{ content?: string }>('file_read', { path: this.sciezka(wzgledna) });
      if (!dane?.content) return null;
      return JSON.parse(dane.content) as T;
    } catch (err) {
      /*
       * Brak pliku to normalny stan, nie awaria: kalendarz ma plik tylko dla
       * dni, w których coś się działo. Rozpoznajemy po treści komunikatu, bo
       * protokół nie niesie kodu błędu.
       */
      const m = (err as Error).message.toLowerCase();
      if (m.includes('not found') || m.includes('enoent') || m.includes('nie istnieje')) return null;
      throw err;
    }
  }

  /** Zapisuje plik JSON w katalogu użytkownika. */
  async zapiszJson(wzgledna: string, dane: unknown): Promise<void> {
    await this.zapytaj('file_write', {
      path: this.sciezka(wzgledna),
      content: JSON.stringify(dane, null, 2),
    });
  }

  /**
   * Dopisuje zadanie do `data/tasks.json`.
   *
   * Odczyt–zmiana–zapis, bo plik jest wspólny z MyCastle i telefonem: nadpisanie
   * go listą sprzed chwili skasowałoby zadanie dodane w międzyczasie z innego
   * miejsca. Identyfikator nadajemy sami — `crypto.randomUUID`, tak jak reszta
   * systemu.
   */
  async dopiszZadanie(z: {
    name: string; dueDate?: string; projectId?: string; description?: string;
  }): Promise<string> {
    const plik = (await this.czytajJson<{ type?: string; tasks?: unknown[] }>('data/tasks.json'))
      ?? { type: 'tasks', tasks: [] };

    const id = randomUUID();
    const zadanie = {
      type: 'task',
      id,
      projectId: z.projectId ?? '',
      name: z.name,
      description: z.description ?? '',
      duration: 0,
      components: [],
      ...(z.dueDate ? { dueDate: z.dueDate } : {}),
    };

    await this.zapiszJson('data/tasks.json', {
      ...plik, type: 'tasks', tasks: [...(plik.tasks ?? []), zadanie],
    });
    return id;
  }

  /**
   * Dopisuje wydarzenie do kalendarza.
   *
   * Kalendarz trzyma jeden plik na dzień (`data/calendar/RRRR/MM/DD.json`),
   * więc dzień wyliczamy z godziny rozpoczęcia. Plik dla dnia bez wydarzeń nie
   * istnieje — brak jest tu normalnym stanem, nie awarią.
   */
  async dopiszWydarzenie(w: {
    name: string; startTime: string; endTime: string; description?: string;
  }): Promise<string> {
    const d = new Date(w.startTime);
    const sciezka = `data/calendar/${d.getUTCFullYear()}/`
      + `${String(d.getUTCMonth() + 1).padStart(2, '0')}/`
      + `${String(d.getUTCDate()).padStart(2, '0')}.json`;

    const plik = (await this.czytajJson<{ type?: string; tasks?: unknown[] }>(sciezka))
      ?? { type: 'events', tasks: [] };

    const taskId = randomUUID();
    await this.zapiszJson(sciezka, {
      ...plik,
      type: 'events',
      tasks: [...(plik.tasks ?? []), {
        type: 'event',
        taskId,
        name: w.name,
        description: w.description ?? '',
        startTime: w.startTime,
        endTime: w.endTime,
      }],
    });
    return taskId;
  }

  /**
   * Pobiera wszystko, czego Kasia potrzebuje do rozmowy o dniu.
   *
   * Odczyty idą **równolegle**, bo są niezależne, a każdy kosztuje obieg przez
   * brokera. Kalendarz to jeden plik na dzień, więc tydzień to siedem odczytów —
   * szeregowo trwałoby to sekundy przy każdym namyśle.
   *
   * Błąd pojedynczego pliku nie przerywa całości: lepiej dać Kasi zadania bez
   * kalendarza niż nic, byle powiedzieć, czego brakuje.
   */
  async pobierz(
    teraz: number,
    strefa: string,
    zakres: { wstecz: number; naprzod: number; waga: boolean } = { wstecz: 1, naprzod: 3, waga: false },
  ): Promise<DaneMycastle> {
    const bledy: string[] = [];

    const bezpiecznie = async <T>(opis: string, fn: () => Promise<T>, zapas: T): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        // Błędy biblioteki MQTT bywają bez treści („Connection refused" gubi
        // komunikat przy zerwaniu) — wtedy sama nazwa klasy mówi więcej niż nic.
        const e = err as Error;
        bledy.push(`${opis}: ${e.message || e.name || 'brak połączenia'}`);
        return zapas;
      }
    };

    // Zakres zależy od rodzaju rozmowy — patrz `scenariusze.czegoPotrzebuje`.
    const dni = zakresDni(teraz, zakres.wstecz, zakres.naprzod, strefa);

    const [projektyPlik, zadaniaPlik, dniKalendarza, wagaPlik] = await Promise.all([
      bezpiecznie('projekty', () => this.czytajJson<{ projects?: Projekt[] }>('data/projects.json'), null),
      bezpiecznie('zadania', () => this.czytajJson<{ tasks?: Zadanie[] }>('data/tasks.json'), null),
      Promise.all(sciezkiKalendarza(dni).map((s) =>
        bezpiecznie(`kalendarz ${s}`, () => this.czytajJson<{ tasks?: Wydarzenie[] }>(s), null))),
      // Wagi nie ciągniemy przy każdej rozmowie — tylko wtedy, gdy jest o niej mowa.
      zakres.waga
        ? bezpiecznie('waga', () => this.czytajJson<PlikWagi>(PLIK_WAGI), null)
        : Promise.resolve(null),
    ]);

    return {
      projekty: projektyPlik?.projects ?? [],
      zadania: zadaniaPlik?.tasks ?? [],
      wydarzenia: scalWydarzenia(dniKalendarza.map((d) => d?.tasks ?? [])),
      waga: wagaPlik ?? undefined,
      bledy,
    };
  }

  rozlacz(): void {
    this.klient?.end(true);
    this.klient = null;
    this.laczenie = null;
    for (const czeka of this.oczekujace.values()) {
      czeka.reject(new Error('Rozłączono z MyCastle.'));
    }
    this.oczekujace.clear();
  }
}
