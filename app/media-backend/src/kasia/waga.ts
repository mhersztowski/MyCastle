/**
 * waga.ts — pomiary masy ciała i ich interpretacja.
 *
 * Pomiary leżą w VFS MyCastle (`data/waga.json`), a nie w danych Media.
 * Powód: to dane osobiste użytkownika, tak samo jak zadania i kalendarz —
 * mają być widoczne w MyCastle i na telefonie, a nie zamknięte w aplikacji,
 * która akurat je zbiera.
 *
 * ## Dlaczego trend, a nie ostatni pomiar
 *
 * Masa ciała waha się w ciągu doby o kilogram albo więcej — woda, posiłek,
 * pora dnia. Różnica „wczoraj minus dziś" mierzy głównie te wahania, nie
 * postęp. Dlatego kierunek liczymy z **różnicy średnich tygodniowych**:
 * uśrednienie zjada szum, a tydzień jest naturalnym okresem, bo w takim rytmie
 * odbywa się HersztuWeekly.
 *
 * To rozróżnienie ma konsekwencję dla zachowania Kasi: przy jednym pomiarze
 * nie wolno jej mówić o spadku ani o wzroście, bo nie ma z czego. Milczenie
 * o trendzie jest tu poprawną odpowiedzią, a nie brakiem.
 */

/** Ścieżka w katalogu użytkownika MyCastle — względna, jak `data/tasks.json`. */
export const PLIK_WAGI = 'data/waga.json';

export interface Pomiar {
  /** Dzień pomiaru w zapisie `RRRR-MM-DD`. Bez godziny — waży się raz dziennie. */
  data: string;
  kg: number;
  uwaga?: string;
}

/** Kształt pliku `data/waga.json`. */
export interface PlikWagi {
  type: 'waga';
  pomiary: Pomiar[];
  /** Cel w kilogramach; opcjonalny, bo nie każdy go ma. */
  cel?: number;
}

export interface AnalizaWagi {
  ostatni: Pomiar | null;
  /** Ile dni temu był ostatni pomiar; `null`, gdy nie ma żadnego. */
  dniOdPomiaru: number | null;
  /**
   * Zmiana w kilogramach: średnia z ostatnich 7 dni minus średnia z 7 wcześniejszych.
   * `null`, gdy któryś tydzień jest pusty — wtedy nie ma czego porównywać.
   */
  trendTygodniowy: number | null;
  /** Ile kilogramów do celu; `null`, gdy cel nie jest ustawiony. */
  doCelu: number | null;
  /** Czy minęło dość czasu, żeby wypadało przypomnieć o ważeniu. */
  dawnoSieNieWazyl: boolean;
  liczbaPomiarow: number;
}

const DZIEN = 24 * 3600_000;

/** Po ilu dniach bez pomiaru Kasia ma o nim przypomnieć. */
const PROG_PRZYPOMNIENIA_DNI = 8;

const DATA_POPRAWNA = /^\d{4}-\d{2}-\d{2}$/;

/** Znacznik czasu południa danego dnia — pora dnia nie ma tu znaczenia. */
function znacznik(data: string): number {
  return new Date(`${data}T12:00:00Z`).getTime();
}

function srednia(pomiary: Pomiar[]): number | null {
  if (pomiary.length === 0) return null;
  return pomiary.reduce((s, p) => s + p.kg, 0) / pomiary.length;
}

export function analizujWage(pomiary: Pomiar[], teraz: number, cel?: number): AnalizaWagi {
  const uporzadkowane = [...pomiary].sort((a, b) => znacznik(a.data) - znacznik(b.data));
  const ostatni = uporzadkowane.at(-1) ?? null;

  /*
   * Liczymy różnicę **dni**, nie godzin.
   *
   * Pomiar niesie samą datę, więc kotwiczymy go w południe; „teraz" trzeba
   * sprowadzić do tej samej pory, inaczej ważenie o poranku wypada przed
   * południem tego samego dnia i wychodzi „−1 dni temu" — co w opisie czyta się
   * jak pomiar z przyszłości. Zero od dołu, bo data z przyszłości (ktoś wpisał
   * jutrzejszą) też nie powinna dawać liczby ujemnej.
   */
  const dzisPoludnie = new Date(teraz);
  dzisPoludnie.setUTCHours(12, 0, 0, 0);
  const dniOdPomiaru = ostatni
    ? Math.max(0, Math.round((dzisPoludnie.getTime() - znacznik(ostatni.data)) / DZIEN))
    : null;

  const wOkresie = (odDni: number, doDni: number): Pomiar[] =>
    uporzadkowane.filter((p) => {
      const wiek = (teraz - znacznik(p.data)) / DZIEN;
      return wiek >= doDni && wiek < odDni;
    });

  const sredniaTeraz = srednia(wOkresie(7, 0));
  const sredniaWczesniej = srednia(wOkresie(14, 7));

  return {
    ostatni,
    dniOdPomiaru,
    trendTygodniowy: sredniaTeraz != null && sredniaWczesniej != null
      ? sredniaTeraz - sredniaWczesniej
      : null,
    doCelu: cel != null && ostatni ? ostatni.kg - cel : null,
    dawnoSieNieWazyl: dniOdPomiaru == null || dniOdPomiaru >= PROG_PRZYPOMNIENIA_DNI,
    liczbaPomiarow: uporzadkowane.length,
  };
}

/**
 * Dopisuje pomiar; pomiar z tego samego dnia **zastępuje** poprzedni.
 *
 * Ktoś, kto waży się drugi raz tego samego ranka, poprawia odczyt, a nie
 * zgłasza drugiego pomiaru. Dwa wpisy z jednego dnia zaburzałyby średnią
 * tygodniową, dając temu dniu podwójną wagę.
 */
export function dodajPomiar(pomiary: Pomiar[], nowy: Pomiar): Pomiar[] {
  if (!DATA_POPRAWNA.test(nowy.data)) {
    throw new Error(`Niepoprawna data „${nowy.data}" — oczekiwano zapisu RRRR-MM-DD.`);
  }
  if (!Number.isFinite(nowy.kg) || nowy.kg <= 20 || nowy.kg >= 400) {
    throw new Error(`Niemożliwa waga: ${nowy.kg} kg.`);
  }

  return [...pomiary.filter((p) => p.data !== nowy.data), nowy]
    .sort((a, b) => znacznik(a.data) - znacznik(b.data));
}

/** Liczba po polsku — przecinek dziesiętny, bez zbędnych zer. */
function liczba(x: number, miejsc = 1): string {
  return x.toFixed(miejsc).replace('.', ',').replace(/,0$/, '');
}

/** Opis wagi dla modelu — zdania, nie tabela liczb. */
export function opisWagi(a: AnalizaWagi): string {
  if (!a.ostatni) {
    return 'Waga: nie ma żadnego zapisanego pomiaru.';
  }

  const linie = [
    `Waga: ostatni pomiar ${liczba(a.ostatni.kg)} kg`
    + (a.dniOdPomiaru === 0 ? ' (dzisiaj).' : ` (${a.dniOdPomiaru} dni temu).`),
  ];

  if (a.trendTygodniowy != null) {
    const zmiana = a.trendTygodniowy;
    /*
     * Poniżej 0,2 kg tygodniowo nie nazywamy kierunkiem.
     *
     * Taka różnica mieści się w błędzie samego ważenia i w wahaniach wody.
     * Nazwanie jej „spadkiem" dałoby Kasi powód do gratulacji za szum.
     */
    const kierunek = Math.abs(zmiana) < 0.2
      ? 'bez wyraźnej zmiany'
      : zmiana < 0 ? `spadek o ${liczba(-zmiana)} kg` : `wzrost o ${liczba(zmiana)} kg`;
    linie.push(`  Tydzień do tygodnia (średnie): ${kierunek}.`);
  } else if (a.liczbaPomiarow < 4) {
    linie.push('  Za mało pomiarów, żeby mówić o kierunku — nie zgaduj trendu.');
  }

  if (a.doCelu != null) {
    linie.push(a.doCelu > 0
      ? `  Do celu brakuje ${liczba(a.doCelu)} kg.`
      : `  Cel osiągnięty (${liczba(-a.doCelu)} kg poniżej).`);
  }

  if (a.dawnoSieNieWazyl) {
    linie.push(`  Od ostatniego ważenia minęło ${a.dniOdPomiaru} dni — przypomnij o nim.`);
  }

  return linie.join('\n');
}
