/**
 * harmonogram.ts — kiedy Kasia ma się odezwać i co robić, gdy nikt nie odpowiada.
 *
 * ## Godzina lokalna, nie „co 24 godziny"
 *
 * Spotkanie o 7:30 ma być o 7:30 przez cały rok. Liczenie przez dodawanie doby
 * przesunęłoby je o godzinę przy każdej zmianie czasu — dwa razy w roku, bez
 * żadnego śladu w kodzie, który dałoby się później znaleźć. Dlatego następne
 * wystąpienie wyznaczamy przez **odczytanie daty w strefie użytkownika**
 * i złożenie znacznika z powrotem, a nie arytmetyką na milisekundach.
 *
 * ## Przypominanie „w sposób inteligentny"
 *
 * Jedno powiadomienie o 7:30 jest bezużyteczne dla kogoś, kto o 7:30 jest pod
 * prysznicem. Ponawiamy więc, ale z odstępami, które **rosną** — pierwsze zaraz,
 * kolejne coraz rzadziej — i z granicą, po której Kasia odpuszcza. Asystentka,
 * która dopytuje w nieskończoność, zostaje wyciszona raz na zawsze, i wtedy nie
 * przypomni już o niczym.
 *
 * Odstępy odmierzamy od **ustalonej godziny**, nie od chwili ostatniej próby.
 * Inaczej jedno opóźnienie (sen, wyłączony telefon) przesuwałoby cały łańcuch
 * i wieczorne przypomnienie potrafiłoby dogonić poranne.
 */

import type { Dostepnosc, Przypomnienie, RodzajSpotkania, Spotkanie } from './model';
import { czyMoznaZaczepic } from './dostepnosc';

const MINUTA = 60_000;

/**
 * Odstępy kolejnych ponowień w minutach, liczone od ustalonej godziny.
 *
 * Pierwsze zaczepienie idzie punktualnie (0), potem po 10, 25 i 50 minutach.
 * Po czwartej próbie — czyli po niecałej półtorej godzinie — Kasia milknie:
 * jeśli ktoś nie odpowiedział przez ten czas, to nie dlatego, że nie zauważył.
 */
export const ODSTEPY_PONOWIEN: readonly number[] = [0, 10, 25, 50] as const;

// ── Czas w strefie użytkownika ───────────────────────────────────────────────

interface CzesciDaty {
  rok: number; miesiac: number; dzien: number;
  godzina: number; minuta: number; dzienTygodnia: number;
}

const DNI = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];

/** Rozkłada znacznik na części daty **w podanej strefie**. */
function czesci(znacznik: number, strefa: string): CzesciDaty {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: strefa, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(znacznik)).map((x) => [x.type, x.value]));
  const skroty = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    rok: Number(p.year), miesiac: Number(p.month), dzien: Number(p.day),
    // Północ formatuje się jako „24" w en-CA — bez tego dzień zaczynałby się o 24:00.
    godzina: Number(p.hour) % 24, minuta: Number(p.minute),
    dzienTygodnia: skroty.indexOf(String(p.weekday)),
  };
}

/**
 * Znacznik czasu dla podanej daty i godziny **lokalnej** w danej strefie.
 *
 * Strefa nie ma stałego przesunięcia, więc pierwsze przybliżenie (potraktowanie
 * daty jak UTC) trzeba poprawić o przesunięcie **obowiązujące w tym momencie**,
 * a potem sprawdzić jeszcze raz: przy zmianie czasu poprawka sama może przenieść
 * chwilę na drugą stronę granicy.
 */
function znacznikLokalny(
  rok: number, miesiac: number, dzien: number,
  godz: number, min: number, strefa: string,
): number {
  const zgadnij = Date.UTC(rok, miesiac - 1, dzien, godz, min);
  let wynik = zgadnij;

  for (let i = 0; i < 2; i += 1) {
    const c = czesci(wynik, strefa);
    const jakoUtc = Date.UTC(c.rok, c.miesiac - 1, c.dzien, c.godzina, c.minuta);
    const blad = jakoUtc - zgadnij;
    if (blad === 0) break;
    wynik -= blad;
  }
  return wynik;
}

/** `HH:MM` → godziny i minuty. Zapis niepoprawny daje północ, a nie wyjątek. */
function rozbijGodzine(hhmm: string): { godz: number; min: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return { godz: 0, min: 0 };
  return { godz: Math.min(23, Number(m[1])), min: Math.min(59, Number(m[2])) };
}

/**
 * Najbliższe wystąpienie spotkania, licząc od `od` włącznie.
 *
 * „Włącznie" jest istotne: pętla sprawdzająca co minutę trafia czasem dokładnie
 * w ustaloną godzinę i przesunięcie o dobę zgubiłoby wtedy całe spotkanie.
 */
export function nastepneWystapienie(s: Spotkanie, od: number, strefa: string): number {
  const { godz, min } = rozbijGodzine(s.godzina);
  const c = czesci(od, strefa);

  const kandydat = (przesuniecieDni: number): number => {
    const dzien = new Date(Date.UTC(c.rok, c.miesiac - 1, c.dzien + przesuniecieDni));
    return znacznikLokalny(
      dzien.getUTCFullYear(), dzien.getUTCMonth() + 1, dzien.getUTCDate(),
      godz, min, strefa,
    );
  };

  if (s.dzienTygodnia == null) {
    const dzis = kandydat(0);
    return dzis >= od ? dzis : kandydat(1);
  }

  // Tygodniowe: szukamy najbliższego pasującego dnia, najwyżej tydzień naprzód.
  for (let d = 0; d <= 7; d += 1) {
    const chwila = kandydat(d);
    if (chwila < od) continue;
    if (czesci(chwila, strefa).dzienTygodnia === s.dzienTygodnia) return chwila;
  }
  return kandydat(7);
}

// ── Planowanie ───────────────────────────────────────────────────────────────

function idPrzypomnienia(rodzaj: RodzajSpotkania, ustalonaNa: number): string {
  return `${rodzaj}-${ustalonaNa}`;
}

/**
 * Uzupełnia listę przypomnień o brakujące wystąpienia.
 *
 * Funkcja jest **idempotentna** — wołana co minutę nie mnoży wpisów. Dla każdego
 * włączonego spotkania pilnuje, żeby istniało dokładnie jedno przypomnienie
 * w stanie `oczekuje`; jeśli w międzyczasie zmieniła się godzina spotkania,
 * czekający wpis jest przestawiany, a nie dublowany.
 */
export function zaplanujPrzypomnienia(
  spotkania: Spotkanie[],
  istniejace: Przypomnienie[],
  teraz: number,
  strefa: string,
): Przypomnienie[] {
  const wynik = [...istniejace];

  for (const s of spotkania) {
    if (!s.wlaczone) continue;

    const czekajace = wynik.find((p) => p.rodzaj === s.rodzaj && p.stan === 'oczekuje');

    /*
     * Czekające przypomnienie zostawiamy nietknięte — także wtedy, gdy jego
     * godzina już minęła.
     *
     * Kusi, żeby je tu przestawić „na nowy termin", ale ta funkcja nie odróżnia
     * dwóch sytuacji: zmiany godziny w rozmowie i zwykłego upływu czasu.
     * Przestawianie kasowało zaległości — przypomnienie przespane do rana
     * dostawało termin na jutro i spotkanie przepadało po cichu. Zmianę godziny
     * obsługuje `ustawSpotkanie`, usuwając nieruszone przypomnienie; następne
     * wywołanie tej funkcji założy je z nową godziną.
     */
    if (czekajace) continue;

    const termin = nastepneWystapienie(s, teraz, strefa);
    wynik.push({
      id: idPrzypomnienia(s.rodzaj, termin),
      rodzaj: s.rodzaj,
      ustalonaNa: termin,
      nastepnaProba: termin,
      prob: 0,
      stan: 'oczekuje',
    });
  }

  return wynik;
}

/** Kolejna próba zaczepienia albo porzucenie, gdy próby się wyczerpały. */
export function ponow(p: Przypomnienie): Przypomnienie {
  const nastepnyIndeks = p.prob + 1;
  if (nastepnyIndeks >= ODSTEPY_PONOWIEN.length) {
    return { ...p, prob: nastepnyIndeks, stan: 'porzucone' };
  }

  // Suma odstępów od ustalonej godziny — łańcuch nie dryfuje przy opóźnieniach.
  const odUstalonej = ODSTEPY_PONOWIEN
    .slice(0, nastepnyIndeks + 1)
    .reduce((a, b) => a + b, 0);

  return {
    ...p,
    prob: nastepnyIndeks,
    nastepnaProba: p.ustalonaNa + odUstalonej * MINUTA,
  };
}

/**
 * Przypomnienia, które należy teraz wysłać.
 *
 * Tryb „nie przeszkadzać" **wstrzymuje**, a nie kasuje: wpis zostaje w stanie
 * `oczekuje` i wróci, gdy tryb minie. Dzięki temu wyłączony na noc telefon nie
 * zjada porannego spotkania — a jednocześnie Kasia nie wysypuje po przebudzeniu
 * wszystkich zaległości naraz, bo każdy rodzaj ma najwyżej jedno oczekujące.
 */
export function doZaczepienia(
  przypomnienia: Przypomnienie[],
  dostepnosc: Dostepnosc,
  teraz: number,
): Przypomnienie[] {
  if (!czyMoznaZaczepic(dostepnosc, teraz)) return [];
  return przypomnienia.filter((p) => p.stan === 'oczekuje' && p.nastepnaProba <= teraz);
}

/** Opis spotkania dla panelu i dla promptu. */
export function opisSpotkania(s: Spotkanie): string {
  const kiedy = s.dzienTygodnia != null
    ? `w ${DNI[s.dzienTygodnia] === 'niedziela' ? 'niedzielę' : DNI[s.dzienTygodnia]} o ${s.godzina}`
    : `codziennie o ${s.godzina}`;
  const pewnosc = s.uzgodnione ? '' : ' (godzina domyślna, nieuzgodniona)';
  return `${s.rodzaj} — ${kiedy}${pewnosc}`;
}
