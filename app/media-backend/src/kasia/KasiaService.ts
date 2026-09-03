/**
 * KasiaService.ts — mózg asystentki.
 *
 * Spina magazyn, model językowy i harmonogram. Ma dwa wejścia:
 *
 *   • `powiedz(tekst)` — użytkownik coś napisał, Kasia odpowiada,
 *   • `tick(teraz)`    — upłynęła chwila; sprawdź, czy jest powód się odezwać.
 *
 * ## Czas wchodzi parametrem, nie przez `Date.now()`
 *
 * Każda metoda przyjmuje bieżącą chwilę z zewnątrz. Dzięki temu cała logika
 * spotkań i ponowień — rzeczy, które w naturalny sposób dzieją się przez wiele
 * godzin — daje się przetestować w kilkanaście milisekund i bez czekania. To
 * jedyny powód tego zabiegu, ale wystarczający: bez niego testu „ponawia po
 * dziesięciu minutach" nie dałoby się napisać uczciwie.
 *
 * ## Dwie różne rozmowy z modelem
 *
 * Odpowiadanie i inicjatywa używają **innych promptów systemowych**. Przy
 * odpowiadaniu model dostaje `promptInit` (kim jest i jak ma się zachowywać),
 * przy inicjatywie `promptUpdate` (o czym ma teraz pomyśleć) wraz z umową, że
 * brak powodu do odezwania się zgłasza słowem `MILCZ`. Bez tej umowy asystentka
 * podejmująca inicjatywę co pięć minut odzywałaby się co pięć minut — bo model
 * poproszony o wypowiedź zawsze coś powie.
 */

import type { KasiaStore } from './KasiaStore';
import {
  ADRESY_DOMYSLNE, MODELE_DOMYSLNE, utworzModel,
  type DostawcaModelu, type KonfiguracjaModelu, type KrokRozmowy,
  type Model, type NasluchStrumienia, type ZapytanieDoModelu,
} from './llm';

const DOSTAWCY: readonly DostawcaModelu[] = ['anthropic', 'openai', 'ollama'];
import {
  BladZadania,
  MILCZENIE, type Dzialanie, type FragmentPromptu, type RodzajSpotkania, type Spotkanie,
  type StanKasi, type TrybDostepnosci, type UstawieniaKasi, type WiadomoscKasi,
} from './model';
import { czyMoznaZaczepic, ustawDostepnosc as nowaDostepnosc } from './dostepnosc';
import { doZaczepienia, ponow, zaplanujPrzypomnienia } from './harmonogram';
import { dodajFragment, opisKontekstu, usunWygasle, zbudujPrompt } from './prompt';
import { opisDanych } from './dane';
import type { MycastleClient } from './MycastleClient';
import { czegoPotrzebuje, poleceniSpotkania } from './scenariusze';
import { schematyDlaModelu, wykonajNarzedzie, type WykonawcaNarzedzi } from './narzedzia';
import { analizujWage, dodajPomiar, opisWagi, PLIK_WAGI, type Pomiar, type PlikWagi } from './waga';

/** Ile ostatnich wiadomości trafia do modelu. */
const OKNO_ROZMOWY = 30;

/**
 * Ile razy najwyżej model może poprosić o narzędzia w jednej odpowiedzi.
 *
 * Bez granicy model, który uparcie prosi o to samo (a zdarza się to przy
 * niejasnym wyniku), kręciłby się w kółko, wydając tokeny i nie odpowiadając.
 * Pięć rund wystarcza na każdy sensowny ciąg — „zapisz wagę, dopisz zadanie,
 * przesuń spotkanie" to trzy — a szósta jest już sygnałem, że coś poszło nie tak.
 */
const LIMIT_RUND_NARZEDZI = 5;

export interface WynikTicku {
  /** Co Kasia powiedziała w tym przebiegu. */
  wypowiedzi: string[];
  /** Które spotkania zostały w tym przebiegu zaczepione. */
  spotkania: RodzajSpotkania[];
  bledy: string[];
}

function id(): string {
  return Math.random().toString(36).slice(2, 10);
}

const GODZINA_POPRAWNA = /^([01]?\d|2[0-3]):[0-5]\d$/;

export class KasiaService {
  /** Kiedy ostatnio myślała sama — pilnuje odstępu z ustawień. */
  private ostatniaInicjatywa = 0;

  /**
   * Ostatnio pobrane dane z MyCastle wraz z chwilą pobrania.
   *
   * Bufor jest tu konieczny, nie wygodny: bez niego każdy namysł (domyślnie co
   * pięć minut) i każda wiadomość ciągnęłyby kilkanaście plików przez brokera.
   * Zadania i kalendarz zmieniają się w skali godzin, więc minuta nieświeżości
   * nic nie kosztuje, a odczytów jest kilkadziesiąt razy mniej.
   */
  private buforDanych: { o: number; opis: string; klucz: string } | null = null;

  constructor(
    private readonly store: KasiaStore,
    /*
     * Model jest podmienialny, bo dostawcę i klucz wybiera się w panelu.
     * Alternatywą byłaby fabryka wołana przy każdym zapytaniu, ale wtedy każda
     * rozmowa tworzyłaby nowego klienta HTTP — a konfiguracja zmienia się
     * kilka razy w życiu instalacji, nie kilka razy na minutę.
     */
    private model: Model,
    /** Dostęp do danych MyCastle; bez niego Kasia działa, tylko nie zna dnia. */
    private readonly mycastle?: MycastleClient,
    /**
     * Wykonawca narzędzi. Bez niego Kasia **nie dostaje narzędzi w ogóle** —
     * zamiast obiecywać działanie, którego nie wykona, po prostu go nie oferuje.
     */
    private readonly narzedzia?: WykonawcaNarzedzi,
  ) {}

  /** Podmienia model po zmianie konfiguracji w panelu. */
  podmienModel(model: Model): void {
    this.model = model;
  }

  // ── Kontekst dla modelu ────────────────────────────────────────────────────

  private kontekst(stan: StanKasi, teraz: number): string {
    return opisKontekstu({
      teraz,
      strefa: stan.ustawienia.strefaCzasowa,
      dostepnosc: stan.dostepnosc,
      spotkania: stan.spotkania,
      dane: this.buforDanych?.opis,
    });
  }

  /**
   * Odświeża dane z MyCastle, jeśli bufor się zestarzał.
   *
   * Błąd pobierania **nie przerywa** działania: Kasia potrafi rozmawiać bez
   * znajomości zadań, tylko gorzej. Zamiast rzucać wyjątek, dopisujemy do
   * kontekstu zdanie o tym, że danych nie ma — inaczej model mówiłby o pustym
   * dniu, podczas gdy naprawdę nie wiadomo, jaki ten dzień jest.
   */
  private async odswiezDane(
    teraz: number,
    strefa: string,
    rodzaj: RodzajSpotkania | null = null,
    maxWiek = 60_000,
  ): Promise<void> {
    if (!this.mycastle?.skonfigurowany) return;

    /*
     * Bufor jest kluczowany zakresem, nie samym czasem.
     *
     * Niedzielne spotkanie potrzebuje tygodnia danych i wagi, poranne — dwóch
     * dni. Bez klucza świeży bufor z porannej rozmowy zostałby użyty
     * w niedzielnym podsumowaniu i Kasia planowałaby tydzień, widząc dwa dni.
     */
    const zakres = czegoPotrzebuje(rodzaj);
    const klucz = `${zakres.wstecz}/${zakres.naprzod}/${zakres.waga}`;

    if (this.buforDanych?.klucz === klucz && teraz - this.buforDanych.o < maxWiek) return;

    try {
      const d = await this.mycastle.pobierz(teraz, strefa, zakres);
      // Błędy idą do `opisDanych`, a nie doklejane po fakcie: od nich zależy,
      // czy wolno powiedzieć „dzień jest pusty".
      const czesci = [opisDanych({
        projekty: d.projekty, zadania: d.zadania, wydarzenia: d.wydarzenia,
        teraz, strefa, bledy: d.bledy,
      })];

      if (zakres.waga) {
        czesci.push(opisWagi(analizujWage(d.waga?.pomiary ?? [], teraz, d.waga?.cel)));
      }

      this.buforDanych = { o: teraz, klucz, opis: czesci.join('\n\n') };
    } catch (err) {
      this.buforDanych = {
        o: teraz,
        klucz,
        opis: `Dane z MyCastle są w tej chwili niedostępne (${(err as Error).message}). `
          + 'Nie wnioskuj z tego, że dzień jest pusty — po prostu nie wiadomo.',
      };
    }
  }

  private system(stan: StanKasi, kind: 'init' | 'update', teraz: number, dodatek?: string): string {
    const baza = kind === 'init' ? stan.ustawienia.promptInit : stan.ustawienia.promptUpdate;
    const kontekst = [this.kontekst(stan, teraz), dodatek?.trim(), this.oNarzedziach()]
      .filter(Boolean).join('\n\n');
    return zbudujPrompt({ baza, fragmenty: stan.fragmenty, kind, teraz, kontekst });
  }

  /**
   * Przypomnienie o narzędziach — doklejane do promptu systemowego, nie do
   * edytowalnego.
   *
   * Dwa powody, dla których nie wystarczy opis przy samych narzędziach.
   * Po pierwsze, modele notorycznie **obiecują zamiast działać**: mówią
   * „ustawiłam", nie wywołując niczego, i użytkownik dowiaduje się o tym
   * nazajutrz, gdy budzik nie zadzwoni. Po drugie, prompt bazowy użytkownik
   * może zmienić albo skasować — a to zdanie ma obowiązywać niezależnie.
   */
  private oNarzedziach(): string {
    if (!this.narzedzia) return '';
    return 'Masz narzędzia do zmiany godzin spotkań, dopisywania zadań i wydarzeń '
      + 'oraz zapisywania wagi. Gdy w rozmowie coś ustalicie — **użyj narzędzia**. '
      + 'Nie mów, że coś zrobiłaś, jeśli nie wywołałaś narzędzia: bez tego zmiana '
      + 'nie zostanie zapisana i przepadnie po zakończeniu rozmowy.';
  }

  /**
   * Rozmowa z modelem z obsługą narzędzi.
   *
   * Model może poprosić o wykonanie narzędzi; wykonujemy je i oddajemy wyniki,
   * aż odpowie samym tekstem albo skończą się rundy. Kroki pośrednie zostają
   * **tutaj** — do trwałej rozmowy trafia tylko końcowe zdanie, bo panel ma
   * pokazywać rozmowę, a nie protokół wykonania.
   */
  private async zapytajModel(
    zapytanie: Omit<ZapytanieDoModelu, 'kroki' | 'narzedzia'>,
    teraz: number,
    strefa: string,
    /** Nasłuch fragmentów — gdy podany, odpowiedź idzie strumieniem. */
    nasluch?: NasluchStrumienia,
    /** Wołane zaraz po każdym udanym działaniu — strumień pokazuje je od razu. */
    naDzialanie?: (d: Dzialanie) => void,
  ): Promise<{ tekst: string; wykonano: Dzialanie[] }> {
    const wykonawca = this.narzedzia;
    const zNarzedziami = this.model.odpowiedzZNarzedziami?.bind(this.model);
    const strumieniem = this.model.odpowiedzStrumieniem?.bind(this.model);

    // Bez wykonawcy albo bez wsparcia w modelu — zwykła rozmowa, jak dotąd.
    if (!wykonawca || !zNarzedziami) {
      if (nasluch && strumieniem) {
        const odp = await strumieniem(zapytanie, nasluch);
        return { tekst: odp.tekst, wykonano: [] };
      }
      return { tekst: await this.model.odpowiedz(zapytanie), wykonano: [] };
    }

    const kroki: KrokRozmowy[] = [];
    const wykonano: Dzialanie[] = [];

    for (let runda = 0; runda < LIMIT_RUND_NARZEDZI; runda += 1) {
      const pytanie = { ...zapytanie, narzedzia: schematyDlaModelu(), kroki };

      /*
       * Fragmenty puszczamy **od razu**, także w rundzie narzędziowej.
       *
       * Pierwsze podejście buforowało je do końca rundy, żeby nie wypowiadać
       * urwańców przed wywołaniem narzędzia — i tym samym kasowało cały zysk ze
       * strumienia: całość i tak przychodziła jednym kawałkiem.
       *
       * Zdanie w rodzaju „Zaraz sprawdzę wagę" wypowiedziane przed zapisem
       * i „Zapisałam 84 kilogramy" po nim to nie usterka, tylko naturalna
       * rozmowa — tak samo robi Aura.
       */
      const odp = nasluch && strumieniem
        ? await strumieniem(pytanie, nasluch)
        : await zNarzedziami(pytanie);

      if (odp.narzedzia.length === 0) return { tekst: odp.tekst, wykonano };

      kroki.push({ rola: 'assistant', tresc: odp.tekst, narzedzia: odp.narzedzia });

      for (const w of odp.narzedzia) {
        const wynik = await wykonajNarzedzie(w.nazwa, w.parametry, wykonawca, teraz, strefa);
        if (wynik.ok) {
          const dzialanie: Dzialanie = { rodzaj: w.nazwa, opis: wynik.tresc, o: teraz };
          wykonano.push(dzialanie);
          naDzialanie?.(dzialanie);
        }
        kroki.push({ rola: 'narzedzie', id: w.id, nazwa: w.nazwa, wynik: wynik.tresc });
      }
    }

    /*
     * Rundy się wyczerpały. Zamiast oddać pustkę, mówimy użytkownikowi, co się
     * udało wykonać — działania są prawdziwe, brakuje tylko podsumowania modelu.
     */
    return {
      tekst: wykonano.length > 0
        ? wykonano.map((d) => d.opis).join(' ')
        : 'Nie udało mi się dokończyć tej odpowiedzi — spróbuj jeszcze raz.',
      wykonano,
    };
  }

  // ── Rozmowa ────────────────────────────────────────────────────────────────

  /**
   * Odpowiedź na wiadomość użytkownika.
   *
   * Działa **niezależnie od dostępności**: „nie przeszkadzać" ogranicza to, czy
   * Kasia zaczepia sama, a nie czy odpowiada zagadnięta. Blokowanie odpowiedzi
   * dawałoby asystentkę, która milczy w reakcji na własne imię.
   */
  async powiedz(tekst: string, teraz: number = Date.now()): Promise<string> {
    const wiadomosc: WiadomoscKasi = { id: id(), rola: 'user', tresc: tekst, o: teraz };
    await this.store.zmien((s) => {
      s.rozmowa.push(wiadomosc);
      // Wygasłe fragmenty znikają przy każdej okazji, nie tylko w pętli:
      // `zbudujPrompt` i tak by je pominął, ale zostawałyby widoczne w panelu.
      s.fragmenty = usunWygasle(s.fragmenty, teraz);
    });

    const stan = this.store.pobierz();
    await this.odswiezDane(teraz, stan.ustawienia.strefaCzasowa);

    const { tekst: odpowiedz, wykonano } = await this.zapytajModel({
      system: this.system(stan, 'init', teraz),
      rozmowa: stan.rozmowa.slice(-OKNO_ROZMOWY),
      model: stan.ustawienia.model,
    }, teraz, stan.ustawienia.strefaCzasowa);

    // Dane mogły się zmienić pod wpływem narzędzi — bufor stracił aktualność.
    if (wykonano.length > 0) this.buforDanych = null;

    await this.store.zmien((s) => {
      s.rozmowa.push({
        id: id(), rola: 'assistant', tresc: odpowiedz, o: teraz,
        ...(wykonano.length > 0 ? { dzialania: wykonano } : {}),
      });
      /*
       * Odezwanie się użytkownika zamyka oczekujące przypomnienia.
       *
       * Cel przypomnienia jest osiągnięty w chwili, gdy człowiek odpowiada —
       * niezależnie od tego, czy odpowiedział na jego treść. Ponawianie po
       * nawiązanej rozmowie byłoby dopytywaniem o coś, o czym właśnie mówimy.
       */
      for (const p of s.przypomnienia) if (p.stan === 'oczekuje') p.stan = 'odbyte';
    });

    return odpowiedz;
  }

  /**
   * Odpowiedź strumieniem — dla trasy SSE.
   *
   * Ta sama ścieżka co `powiedz`, tylko fragmenty lecą na bieżąco. Zapis do
   * rozmowy następuje **po zakończeniu**, całą wypowiedzią: rozmowa ma nieść
   * zdania, a nie kilkaset kawałków, z których każdy wywołałby zapis pliku.
   */
  async powiedzStrumieniem(
    tekstUzytkownika: string,
    nasluch: NasluchStrumienia,
    teraz: number = Date.now(),
    naDzialanie?: (d: Dzialanie) => void,
  ): Promise<string> {
    await this.store.zmien((s) => {
      s.rozmowa.push({ id: id(), rola: 'user', tresc: tekstUzytkownika, o: teraz });
      s.fragmenty = usunWygasle(s.fragmenty, teraz);
    });

    const stan = this.store.pobierz();
    await this.odswiezDane(teraz, stan.ustawienia.strefaCzasowa);

    const { tekst, wykonano } = await this.zapytajModel({
      system: this.system(stan, 'init', teraz),
      rozmowa: stan.rozmowa.slice(-OKNO_ROZMOWY),
      model: stan.ustawienia.model,
    }, teraz, stan.ustawienia.strefaCzasowa, nasluch, naDzialanie);

    if (wykonano.length > 0) this.buforDanych = null;

    await this.store.zmien((s) => {
      s.rozmowa.push({
        id: id(), rola: 'assistant', tresc: tekst, o: teraz,
        ...(wykonano.length > 0 ? { dzialania: wykonano } : {}),
      });
      for (const p of s.przypomnienia) if (p.stan === 'oczekuje') p.stan = 'odbyte';
    });

    return tekst;
  }

  // ── Pętla ──────────────────────────────────────────────────────────────────

  /**
   * Jeden przebieg pętli: spotkania najpierw, inicjatywa dopiero potem.
   *
   * Kolejność nie jest obojętna. Gdyby inicjatywa szła pierwsza, Kasia mogłaby
   * zagadnąć o drobiazgu minutę przed porannym spotkaniem — a wtedy odpowiedź
   * użytkownika zamknęłaby przypomnienie o spotkaniu, które nigdy się nie odbyło.
   */
  async tick(teraz: number = Date.now()): Promise<WynikTicku> {
    const wynik: WynikTicku = { wypowiedzi: [], spotkania: [], bledy: [] };

    await this.store.zmien((s) => {
      s.fragmenty = usunWygasle(s.fragmenty, teraz);
      s.przypomnienia = zaplanujPrzypomnienia(
        s.spotkania, s.przypomnienia, teraz, s.ustawienia.strefaCzasowa,
      );
      // Odbyte i porzucone trzymamy tylko do końca doby — inaczej lista rośnie.
      s.przypomnienia = s.przypomnienia.filter(
        (p) => p.stan === 'oczekuje' || teraz - p.ustalonaNa < 24 * 3600_000,
      );
    });

    if (!this.model.gotowy()) return wynik;

    await this.obsluzSpotkania(teraz, wynik);

    /*
     * Po zaczepieniu o spotkaniu inicjatywa czeka do następnego przebiegu.
     *
     * Inaczej Kasia wysyłałaby dwie wiadomości pod rząd — „zaczynamy poranne
     * spotkanie" i zaraz potem luźną myśl — a użytkownik odpowiadałby na drugą,
     * bo tę widzi. Przesuwamy też licznik, żeby namysł wypadł dopiero po
     * zwykłym odstępie od spotkania, a nie natychmiast po nim.
     */
    if (wynik.spotkania.length > 0) {
      this.ostatniaInicjatywa = teraz;
      return wynik;
    }

    await this.obsluzInicjatywe(teraz, wynik);
    return wynik;
  }

  private async obsluzSpotkania(teraz: number, wynik: WynikTicku): Promise<void> {
    const stan = this.store.pobierz();
    const czekajace = doZaczepienia(stan.przypomnienia, stan.dostepnosc, teraz);

    for (const p of czekajace) {
      const polecenie = poleceniSpotkania(p.rodzaj, { proba: p.prob });

      try {
        // Każde spotkanie widzi inny wycinek danych — niedzielne tydzień i wagę.
        await this.odswiezDane(teraz, stan.ustawienia.strefaCzasowa, p.rodzaj, 0);
        const { tekst: tresc } = await this.zapytajModel({
          system: this.system(stan, 'init', teraz, polecenie),
          rozmowa: stan.rozmowa.slice(-OKNO_ROZMOWY),
          model: stan.ustawienia.model,
        }, teraz, stan.ustawienia.strefaCzasowa);

        if (tresc) {
          wynik.wypowiedzi.push(tresc);
          wynik.spotkania.push(p.rodzaj);
          await this.store.zmien((s) => {
            s.rozmowa.push({
              id: id(), rola: 'assistant', tresc, o: teraz, zInicjatywy: true,
            });
            const cel = s.przypomnienia.find((x) => x.id === p.id);
            if (cel) Object.assign(cel, ponow(cel));
          });
        }
      } catch (err) {
        wynik.bledy.push(`Spotkanie ${p.rodzaj}: ${(err as Error).message}`);
      }
    }
  }

  private async obsluzInicjatywe(teraz: number, wynik: WynikTicku): Promise<void> {
    const stan = this.store.pobierz();
    const coMin = stan.ustawienia.inicjatywaCoMin;

    if (coMin <= 0) return;
    if (teraz - this.ostatniaInicjatywa < coMin * 60_000) return;
    // Zapytanie kosztuje, więc przy wyciszeniu nawet go nie wysyłamy.
    if (!czyMoznaZaczepic(stan.dostepnosc, teraz)) return;

    this.ostatniaInicjatywa = teraz;
    await this.odswiezDane(teraz, stan.ustawienia.strefaCzasowa);

    try {
      const tresc = await this.model.odpowiedz({
        system: this.system(stan, 'update', teraz),
        rozmowa: stan.rozmowa.slice(-OKNO_ROZMOWY),
        model: stan.ustawienia.model,
      });

      /*
       * `MILCZ` bywa opakowane w kropkę albo cudzysłów — model rzadko odpowiada
       * dokładnie jednym słowem. Porównanie na sztywno dawałoby wypowiedź
       * o treści „MILCZ." wysłaną użytkownikowi.
       */
      const milczy = tresc.replace(/[."'\s]/g, '').toUpperCase() === MILCZENIE;
      if (milczy || !tresc) return;

      wynik.wypowiedzi.push(tresc);
      await this.store.zmien((s) => {
        s.rozmowa.push({ id: id(), rola: 'assistant', tresc, o: teraz, zInicjatywy: true });
      });
    } catch (err) {
      wynik.bledy.push(`Inicjatywa: ${(err as Error).message}`);
    }
  }

  // ── Ustawienia ─────────────────────────────────────────────────────────────

  async ustawDostepnosc(
    tryb: TrybDostepnosci, teraz: number = Date.now(), minut?: number,
  ): Promise<StanKasi> {
    return this.store.zmien((s) => { s.dostepnosc = nowaDostepnosc(tryb, teraz, minut); });
  }

  async ustawSpotkanie(
    rodzaj: RodzajSpotkania, zmiany: Partial<Pick<Spotkanie, 'godzina' | 'dzienTygodnia' | 'wlaczone'>>,
  ): Promise<StanKasi> {
    if (zmiany.godzina != null && !GODZINA_POPRAWNA.test(zmiany.godzina)) {
      throw new BladZadania(`Niepoprawna godzina „${zmiany.godzina}" — oczekiwano zapisu HH:MM.`);
    }

    return this.store.zmien((s) => {
      const cel = s.spotkania.find((x) => x.rodzaj === rodzaj);
      if (!cel) throw new BladZadania(`Nie znam spotkania ${rodzaj}.`);
      Object.assign(cel, zmiany);
      /*
       * Zmiana godziny znaczy, że ktoś ją świadomie wybrał — a to jest różnica,
       * którą Kasia widzi w prompcie: o godzinę domyślną wypada dopytać,
       * uzgodnionej się nie podważa.
       */
      if (zmiany.godzina != null) cel.uzgodnione = true;

      // Czekające przypomnienie musi pójść za nową godziną (patrz harmonogram).
      s.przypomnienia = s.przypomnienia.filter(
        (p) => !(p.rodzaj === rodzaj && p.stan === 'oczekuje' && p.prob === 0),
      );
    });
  }

  async zapiszUstawienia(zmiany: Partial<UstawieniaKasi>): Promise<StanKasi> {
    return this.store.zmien((s) => { s.ustawienia = { ...s.ustawienia, ...zmiany }; });
  }

  /**
   * Zapisuje pomiar wagi w VFS MyCastle.
   *
   * Odczyt–zmiana–zapis, a nie dopisanie na końcu: plik może być w międzyczasie
   * zmieniony z telefonu albo z MyCastle, a nadpisanie go listą sprzed minuty
   * skasowałoby tamten wpis. Przy jednym użytkowniku ważącym się raz dziennie
   * wyścig jest mało prawdopodobny, ale koszt ostrożności to jeden odczyt.
   */
  async zapiszWage(pomiar: Pomiar): Promise<{ ok: true; pomiarow: number }> {
    if (!this.mycastle?.skonfigurowany) {
      throw new BladZadania('Brak dostępu do MyCastle — nie ma gdzie zapisać wagi.', 503);
    }

    const plik = (await this.mycastle.czytajJson<PlikWagi>(PLIK_WAGI))
      ?? { type: 'waga' as const, pomiary: [] };

    /*
     * `waga.ts` nie zna warstwy HTTP i rzuca zwykły `Error`, więc zamieniamy go
     * tutaj na błąd żądania. Bez tego literówka w liczbie wraca jako 500 —
     * czyli „awaria serwera" zamiast „popraw dane".
     */
    let pomiary: Pomiar[];
    try {
      pomiary = dodajPomiar(plik.pomiary ?? [], pomiar);
    } catch (err) {
      throw new BladZadania((err as Error).message);
    }
    await this.mycastle.zapiszJson(PLIK_WAGI, { ...plik, type: 'waga', pomiary });

    // Bufor stracił aktualność — następne pytanie ma zobaczyć nowy pomiar.
    this.buforDanych = null;
    return { ok: true, pomiarow: pomiary.length };
  }

  /**
   * Dopisuje wypowiedź Kasi zleconą z zewnątrz (przez skrypt).
   *
   * Nie pyta modelu — treść przychodzi gotowa. Oznaczamy ją jako pochodzącą
   * z inicjatywy, bo z punktu widzenia użytkownika tym właśnie jest: Kasia
   * odzywa się, choć nikt jej o nic nie pytał.
   */
  async wypowiedzZInicjatywy(tresc: string, teraz: number = Date.now()): Promise<void> {
    await this.store.zmien((s) => {
      s.rozmowa.push({ id: id(), rola: 'assistant', tresc, o: teraz, zInicjatywy: true });
    });
  }

  /** Konfiguracja TTS/STT — backend ją tylko przechowuje, używa jej przeglądarka. */
  async zapiszGlos(glos: unknown): Promise<{ ok: true }> {
    await this.store.zmien((s) => { s.glos = glos; });
    return { ok: true };
  }

  /**
   * Zmiana dostawcy modelu.
   *
   * Klucz idzie do sekretów (osobny plik, nigdy nie wraca do klienta), reszta
   * do zwykłych ustawień. Po zapisie model jest tworzony od nowa, żeby zmiana
   * działała od razu, a nie dopiero po restarcie backendu.
   */
  async ustawModel(
    zmiany: { dostawca?: string; model?: string; adres?: string; klucz?: string },
    utworz: (cfg: KonfiguracjaModelu) => Model = utworzModel,
  ): Promise<{ ok: true; gotowy: boolean; brakuje: string | null }> {
    if (zmiany.dostawca != null && !DOSTAWCY.includes(zmiany.dostawca as DostawcaModelu)) {
      throw new BladZadania(`Nieznany dostawca „${zmiany.dostawca}". Dozwolone: ${DOSTAWCY.join(', ')}.`);
    }

    if (zmiany.klucz != null) await this.store.zapiszSekrety({ kluczModelu: zmiany.klucz });

    const stan = await this.store.zmien((s) => {
      if (zmiany.dostawca != null) {
        const d = zmiany.dostawca as DostawcaModelu;
        s.ustawienia.dostawca = d;
        /*
         * Zmiana dostawcy przestawia adres i model na domyślne dla niego —
         * chyba że przyszły w tym samym żądaniu. Bez tego wybór „Ollama"
         * zostawiałby adres Anthropica i kończył się błędem połączenia,
         * z którego nie wynika, że trzeba jeszcze poprawić dwa inne pola.
         */
        if (zmiany.adres == null) s.ustawienia.adresModelu = ADRESY_DOMYSLNE[d];
        if (zmiany.model == null) s.ustawienia.model = MODELE_DOMYSLNE[d];
      }
      if (zmiany.adres != null) s.ustawienia.adresModelu = zmiany.adres;
      if (zmiany.model != null) s.ustawienia.model = zmiany.model;
    });

    this.model = utworz({
      dostawca: stan.ustawienia.dostawca,
      klucz: this.store.pobierzSekrety().kluczModelu,
      adres: stan.ustawienia.adresModelu,
      model: stan.ustawienia.model,
    });

    return { ok: true, gotowy: this.model.gotowy(), brakuje: this.model.czegoBrakuje() };
  }

  // ── API dla skryptów ───────────────────────────────────────────────────────

  async dodajFragment(
    f: Omit<FragmentPromptu, 'dodanoO'> & { dodanoO?: number },
    teraz: number = Date.now(),
  ): Promise<StanKasi> {
    return this.store.zmien((s) => {
      s.fragmenty = dodajFragment(s.fragmenty, { ...f, dodanoO: f.dodanoO ?? teraz });
    });
  }

  async usunFragment(idFragmentu: string, zrodlo: string): Promise<StanKasi> {
    return this.store.zmien((s) => {
      s.fragmenty = s.fragmenty.filter((f) => !(f.id === idFragmentu && f.zrodlo === zrodlo));
    });
  }

  stan(): StanKasi {
    return this.store.pobierz();
  }

  /**
   * Przygotowuje rozmowę na życzenie: dane w jej zakresie i to, o czym ma być.
   *
   * Wołane przez narzędzie `rozpocznij_spotkanie`, gdy Marcin prosi o poranne
   * czy niedzielne poza porą. Bez tego model prowadziłby podsumowanie tygodnia,
   * widząc dwa dni kalendarza i nie znając wagi — bo zakres danych zależy od
   * rodzaju rozmowy (patrz `scenariusze.czegoPotrzebuje`).
   *
   * Zwracamy **dane razem ze scenariuszem**, w jednym tekście: to wraca do
   * modelu jako wynik narzędzia, a on ma na tej podstawie poprowadzić rozmowę
   * w tej samej odpowiedzi.
   */
  async przygotujSpotkanie(rodzaj: RodzajSpotkania, teraz: number = Date.now()): Promise<string> {
    const strefa = this.store.pobierz().ustawienia.strefaCzasowa;
    await this.odswiezDane(teraz, strefa, rodzaj, 0);

    const dane = this.buforDanych?.opis ?? 'Brak dostępu do danych MyCastle.';
    return `${poleceniSpotkania(rodzaj, { proba: 0 })}\n\n${dane}`;
  }

  /** Czy model jest skonfigurowany — panel pokazuje to, zanim ktoś napisze. */
  modelGotowy(): boolean {
    return this.model.gotowy();
  }

  /**
   * Co Kasia wie w tej chwili o dniu — dokładnie ten tekst, który dostaje model.
   *
   * Podgląd jest tu po to, żeby dało się rozstrzygnąć, czy Kasia mówi bzdury,
   * bo źle rozumuje, czy dlatego, że dostała złe dane. Bez tego jedyną drogą
   * byłoby zgadywanie z jej wypowiedzi.
   */
  async podgladDanych(
    rodzaj: RodzajSpotkania | null = null,
    teraz: number = Date.now(),
  ): Promise<string> {
    const strefa = this.store.pobierz().ustawienia.strefaCzasowa;
    // Wymuszamy świeżość: podgląd ma pokazywać stan teraz, a nie sprzed minuty.
    await this.odswiezDane(teraz, strefa, rodzaj, 0);
    return this.buforDanych?.opis ?? 'Dostęp do MyCastle nie jest skonfigurowany.';
  }

  /** Czego brakuje do działania modelu; `null`, gdy wszystko jest. */
  czegoBrakujeModelowi(): string | null {
    return this.model.czegoBrakuje?.() ?? null;
  }
}
