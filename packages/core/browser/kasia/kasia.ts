/**
 * browser/kasia/kasia.ts — API asystentki Kasi dla skryptów.
 *
 * Używa się jej tak samo jak `Aura` w edytorze konwersacji:
 *
 *   import { Kasia } from 'mycastle/packages/core/browser/kasia/kasia';
 *
 *   await Kasia.dodajDoPromptu({
 *     kind: 'update',
 *     tekst: 'Marcin ma dziś odebrać paczkę do 18:00 — przypomnij o tym.',
 *     wygasaZa: 600,
 *   });
 *
 * ## Dlaczego przez MQTT, a nie wprost
 *
 * Kasia mieszka w `media-backend`, a skrypt wykonuje się w przeglądarce
 * otwartej na MyCastle. Bezpośrednie wywołanie znaczyłoby wystawienie API Kasi
 * na świat i wpuszczenie do niego każdej strony — a broker już jest, każdy
 * skrypt Drive ma do niego dostęp i po nim właśnie idą wszystkie inne polecenia
 * w tym systemie.
 *
 * Skutek uboczny jest korzystny: skrypt nie musi wiedzieć, gdzie Kasia stoi ani
 * czy w ogóle działa. Gdy jej nie ma, wywołanie kończy się czytelnym „brak
 * odpowiedzi", a nie błędem sieci z adresem, którego nikt nie ustawiał.
 *
 * ## Transport
 *
 * Klasa nie zna `mqtt` ani `fetch`. Transport wstrzykuje host —
 * `Kasia.setTransport(...)` — a w skryptach Drive robi to za użytkownika sam
 * runner, przekazując wbudowanego klienta. Dzięki temu logika jest testowalna
 * bez brokera i bez przeglądarki.
 */

/** Minimalny transport: publikacja i subskrypcja. Tyle daje runner Drive. */
export interface KasiaTransport {
  userName: string;
  publish(topic: string, payload: unknown): void;
  subscribe(topic: string, cb: (msg: unknown, topic: string) => void): () => void;
}

export type RodzajPromptu = 'init' | 'update';

export interface FragmentDoPromptu {
  /**
   * Identyfikator fragmentu w obrębie źródła.
   *
   * Ten sam identyfikator **nadpisuje** poprzednią treść, zamiast dokładać
   * kolejną. Bez tego skrypt uruchamiany co godzinę zostawiałby po sobie
   * dwadzieścia kopii tego samego zdania.
   */
  id?: string;
  kind: RodzajPromptu;
  tekst: string;
  /** Kto dokłada — domyślnie nazwa skryptu, jeśli host ją zna. */
  zrodlo?: string;
  /** Po ilu minutach fragment ma zniknąć. Brak = na stałe. */
  wygasaZa?: number;
}

export interface StanKasiDlaSkryptu {
  dostepnosc: { tryb: string; do?: number };
  spotkania: Array<{ rodzaj: string; godzina: string; wlaczone: boolean }>;
  fragmenty: Array<{ id: string; kind: string; zrodlo: string; tekst: string }>;
  /** Ile wiadomości jest w rozmowie — do sprawdzenia, czy Kasia w ogóle żyje. */
  wiadomosci: number;
}

interface Oczekujace {
  resolve: (dane: unknown) => void;
  reject: (blad: Error) => void;
}

/** Ile czekamy na odpowiedź Kasi. */
const LIMIT_MS = 20_000;

function id(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class Kasia {
  private static transport: KasiaTransport | null = null;
  private static odsubskrybuj: (() => void) | null = null;
  private static oczekujace = new Map<string, Oczekujace>();
  /** Domyślne źródło fragmentów — host ustawia je na nazwę skryptu. */
  private static zrodlo = 'skrypt';

  /**
   * Podłącza transport. W skryptach Drive woła to runner, nie użytkownik.
   *
   * Subskrypcja `outbox` zakładana jest raz, przy pierwszym podłączeniu —
   * inaczej każde polecenie zostawiałoby po sobie nasłuch, a skrypt kończący
   * pracę zostawiałby ich kilkanaście.
   */
  static setTransport(transport: KasiaTransport, zrodlo?: string): void {
    if (this.transport === transport) {
      if (zrodlo) this.zrodlo = zrodlo;
      return;
    }

    this.odsubskrybuj?.();
    this.transport = transport;
    if (zrodlo) this.zrodlo = zrodlo;

    this.odsubskrybuj = transport.subscribe(`minis/${transport.userName}/kasia/outbox`, (msg) => {
      const m = msg as { requestId?: string; ok?: boolean; data?: unknown; error?: string };
      if (!m?.requestId) return;              // wypowiedź z inicjatywy — nie nasza sprawa
      const czeka = this.oczekujace.get(m.requestId);
      if (!czeka) return;
      this.oczekujace.delete(m.requestId);
      if (m.ok === false) czeka.reject(new Error(m.error ?? 'Kasia odmówiła.'));
      else czeka.resolve(m.data);
    });
  }

  /** Odpina transport — host woła to przy zatrzymaniu skryptu. */
  static clearTransport(): void {
    this.odsubskrybuj?.();
    this.odsubskrybuj = null;
    this.transport = null;
    for (const czeka of this.oczekujace.values()) czeka.reject(new Error('Skrypt zatrzymany.'));
    this.oczekujace.clear();
  }

  private static async wyslij<T>(type: string, payload?: unknown): Promise<T> {
    const transport = this.transport;
    if (!transport) {
      throw new Error(
        'Kasia nie ma transportu. W skrypcie Drive powinien go ustawić runner; '
        + 'poza nim wywołaj Kasia.setTransport({ userName, publish, subscribe }).',
      );
    }

    const requestId = id();

    return new Promise<T>((resolve, reject) => {
      this.oczekujace.set(requestId, { resolve: resolve as (d: unknown) => void, reject });
      transport.publish(`minis/${transport.userName}/kasia/inbox`, { id: requestId, type, payload });

      setTimeout(() => {
        if (this.oczekujace.delete(requestId)) {
          reject(new Error(
            `Kasia nie odpowiedziała w ${LIMIT_MS / 1000} s. Sprawdź, czy media-backend działa `
            + 'i czy jest podłączony do tego samego brokera.',
          ));
        }
      }, LIMIT_MS);
    });
  }

  // ── Prompt ─────────────────────────────────────────────────────────────────

  /**
   * Dokłada fragment do promptu Kasi.
   *
   * `init` zmienia to, **kim Kasia jest** — wiedzę stałą, obowiązującą w każdej
   * rozmowie („kot ma na imię Filemon", „w czwartki pracuję zdalnie").
   * `update` zmienia to, **o czym ma teraz pomyśleć**, gdy podejmuje inicjatywę
   * („sprawdź, czy paczka została odebrana").
   *
   * Pomyłka w wyborze nie psuje działania, ale daje dziwne zachowanie: wiedza
   * wrzucona do `update` jest widziana tylko przy samodzielnym namyśle, a
   * jednorazowe polecenie w `init` zostaje na zawsze.
   */
  static async dodajDoPromptu(f: FragmentDoPromptu): Promise<void> {
    if (!f?.tekst?.trim()) throw new Error('Fragment bez treści.');
    await this.wyslij('fragment.dodaj', {
      id: f.id,
      kind: f.kind === 'init' ? 'init' : 'update',
      tekst: f.tekst,
      zrodlo: f.zrodlo ?? this.zrodlo,
      wygasaZa: f.wygasaZa,
    });
  }

  /** Usuwa wcześniej dołożony fragment. */
  static async usunZPromptu(idFragmentu: string, zrodlo?: string): Promise<void> {
    await this.wyslij('fragment.usun', { id: idFragmentu, zrodlo: zrodlo ?? this.zrodlo });
  }

  // ── Rozmowa ────────────────────────────────────────────────────────────────

  /**
   * Każe Kasi powiedzieć coś użytkownikowi.
   *
   * Wypowiedź trafia do rozmowy oznaczona jako pochodząca z inicjatywy —
   * i **podlega dostępności**: przy „nie przeszkadzać" nie zostanie wysłana.
   * Skrypt nie może obejść wyciszenia, bo wtedy przycisk „śpię" przestałby
   * cokolwiek znaczyć.
   */
  static async powiedz(tekst: string): Promise<{ wyslano: boolean; powod?: string }> {
    return this.wyslij('powiedz', { tekst });
  }

  /** Zadaje Kasi pytanie i czeka na odpowiedź modelu. */
  static async zapytaj(tekst: string): Promise<string> {
    const w = await this.wyslij<{ odpowiedz: string }>('zapytaj', { tekst });
    return w.odpowiedz;
  }

  // ── Stan ───────────────────────────────────────────────────────────────────

  static async stan(): Promise<StanKasiDlaSkryptu> {
    return this.wyslij<StanKasiDlaSkryptu>('stan');
  }

  /** Czy wolno teraz zaczepiać — do sprawdzenia przed wysłaniem powiadomienia. */
  static async czyMoznaZaczepic(): Promise<boolean> {
    const s = await this.stan();
    return s.dostepnosc.tryb === 'dostepny';
  }

  /** Zapisuje pomiar wagi (trafia do `data/waga.json` w MyCastle). */
  static async zapiszWage(kg: number, uwaga?: string): Promise<void> {
    await this.wyslij('waga.zapisz', { kg, uwaga });
  }
}

/** Alias dla skryptów pisanych małą literą, jak `aura` obok `Aura`. */
export const kasia = Kasia;
