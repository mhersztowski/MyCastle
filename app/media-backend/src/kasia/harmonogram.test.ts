import { describe, it, expect } from 'vitest';
import {
  nastepneWystapienie, zaplanujPrzypomnienia, ponow, doZaczepienia,
  ODSTEPY_PONOWIEN, opisSpotkania,
} from './harmonogram';
import type { Spotkanie, Przypomnienie } from './model';

const STREFA = 'Europe/Warsaw';
const MIN = 60_000;

/** Znacznik czasu z godziny lokalnej w Warszawie — czytelniej niż liczby. */
const chwila = (iso: string) => new Date(iso).getTime();

const poranne: Spotkanie = {
  rodzaj: 'HersztuMorning', godzina: '07:30', wlaczone: true, uzgodnione: true,
};
const tygodniowe: Spotkanie = {
  rodzaj: 'HersztuWeekly', godzina: '18:00', dzienTygodnia: 0, wlaczone: true, uzgodnione: true,
};

describe('nastepneWystapienie', () => {
  it('dla spotkania codziennego wskazuje dzisiejszą godzinę, gdy jeszcze nie minęła', () => {
    // 27 sierpnia 2026, 06:00 czasu warszawskiego (UTC+2)
    const teraz = chwila('2026-08-27T04:00:00Z');
    const wynik = nastepneWystapienie(poranne, teraz, STREFA);
    expect(new Date(wynik).toISOString()).toBe('2026-08-27T05:30:00.000Z');   // 07:30 lokalnie
  });

  it('przeskakuje na jutro, gdy dzisiejsza godzina już minęła', () => {
    const teraz = chwila('2026-08-27T06:00:00Z');   // 08:00 lokalnie, po 07:30
    const wynik = nastepneWystapienie(poranne, teraz, STREFA);
    expect(new Date(wynik).toISOString()).toBe('2026-08-28T05:30:00.000Z');
  });

  it('dokładnie o ustalonej godzinie liczy to jako wystąpienie bieżące', () => {
    const teraz = chwila('2026-08-27T05:30:00Z');
    expect(nastepneWystapienie(poranne, teraz, STREFA)).toBe(teraz);
  });

  it('spotkanie tygodniowe trafia w podany dzień tygodnia', () => {
    // środa 26 sierpnia 2026 → najbliższa niedziela to 30 sierpnia
    const teraz = chwila('2026-08-26T10:00:00Z');
    const wynik = new Date(nastepneWystapienie(tygodniowe, teraz, STREFA));
    expect(wynik.getUTCDay()).toBe(0);
    expect(wynik.toISOString()).toBe('2026-08-30T16:00:00.000Z');   // 18:00 lokalnie
  });

  it('w sam dzień tygodniowy przed godziną zostaje na dziś', () => {
    const teraz = chwila('2026-08-30T10:00:00Z');   // niedziela, 12:00 lokalnie
    expect(new Date(nastepneWystapienie(tygodniowe, teraz, STREFA)).toISOString())
      .toBe('2026-08-30T16:00:00.000Z');
  });

  it('w dzień tygodniowy po godzinie przeskakuje o cały tydzień', () => {
    const teraz = chwila('2026-08-30T17:00:00Z');   // niedziela, 19:00 lokalnie
    expect(new Date(nastepneWystapienie(tygodniowe, teraz, STREFA)).toISOString())
      .toBe('2026-09-06T16:00:00.000Z');
  });

  /*
   * Zmiana czasu jest tu prawdziwym testem, a nie ozdobą: gdyby liczyć przez
   * dodawanie 24 godzin, spotkanie przesunęłoby się o godzinę dwa razy w roku
   * i nikt by nie wiedział dlaczego.
   */
  it('trzyma godzinę lokalną przy przejściu na czas zimowy', () => {
    // Zmiana: niedziela 25 października 2026, 03:00 → 02:00 lokalnego.
    const przed = chwila('2026-10-24T05:00:00Z');   // sobota, 07:00 lokalnie (UTC+2)
    const wynik = nastepneWystapienie(poranne, przed + 24 * 60 * MIN, STREFA);
    // Po zmianie 07:30 lokalnego to 06:30 UTC, nie 05:30.
    expect(new Date(wynik).toISOString()).toBe('2026-10-25T06:30:00.000Z');
  });
});

describe('zaplanujPrzypomnienia', () => {
  const teraz = chwila('2026-08-27T04:00:00Z');   // 06:00 lokalnie

  it('tworzy przypomnienie dla każdego włączonego spotkania', () => {
    const p = zaplanujPrzypomnienia([poranne, tygodniowe], [], teraz, STREFA);
    expect(p.map((x) => x.rodzaj).sort()).toEqual(['HersztuMorning', 'HersztuWeekly']);
    expect(p.every((x) => x.stan === 'oczekuje')).toBe(true);
  });

  it('pomija spotkania wyłączone', () => {
    const p = zaplanujPrzypomnienia([{ ...poranne, wlaczone: false }], [], teraz, STREFA);
    expect(p).toEqual([]);
  });

  it('nie duplikuje przypomnienia, które już czeka', () => {
    const pierwsze = zaplanujPrzypomnienia([poranne], [], teraz, STREFA);
    const drugie = zaplanujPrzypomnienia([poranne], pierwsze, teraz + MIN, STREFA);
    expect(drugie).toHaveLength(1);
    expect(drugie[0].id).toBe(pierwsze[0].id);
  });

  it('po odbyciu spotkania planuje następne wystąpienie', () => {
    const odbyte: Przypomnienie[] = [{
      id: 'x', rodzaj: 'HersztuMorning',
      ustalonaNa: chwila('2026-08-27T05:30:00Z'),
      nastepnaProba: chwila('2026-08-27T05:30:00Z'), prob: 1, stan: 'odbyte',
    }];
    const po = chwila('2026-08-27T06:00:00Z');   // 08:00 lokalnie
    const p = zaplanujPrzypomnienia([poranne], odbyte, po, STREFA);
    const nowe = p.find((x) => x.stan === 'oczekuje');
    expect(nowe).toBeDefined();
    expect(new Date(nowe!.ustalonaNa).toISOString()).toBe('2026-08-28T05:30:00.000Z');
  });

  it('nie przestawia czekającego przypomnienia — po usunięciu zakłada je z nową godziną', () => {
    // Zmianę godziny obsługuje `ustawSpotkanie`, usuwając nieruszony wpis.
    // Tutaj sprawdzamy drugą połowę tej umowy.
    const przesuniete = { ...poranne, godzina: '09:00' };
    const nowe = zaplanujPrzypomnienia([przesuniete], [], teraz, STREFA);
    expect(new Date(nowe[0].ustalonaNa).toISOString()).toBe('2026-08-27T07:00:00.000Z');
  });

  it('zaległe przypomnienie zostaje zaległe, zamiast przeskoczyć na jutro', () => {
    // Bez tego przespane spotkanie przepadałoby po cichu.
    const zaplanowane = zaplanujPrzypomnienia([poranne], [], teraz, STREFA);
    const poGodzinie = chwila('2026-08-27T08:00:00Z');   // 10:00 lokalnie, długo po 07:30
    const po = zaplanujPrzypomnienia([poranne], zaplanowane, poGodzinie, STREFA);
    expect(po).toHaveLength(1);
    expect(new Date(po[0].ustalonaNa).toISOString()).toBe('2026-08-27T05:30:00.000Z');
  });
});

describe('ponow', () => {
  const bazowe: Przypomnienie = {
    id: 'p1', rodzaj: 'HersztuMorning',
    ustalonaNa: chwila('2026-08-27T05:30:00Z'),
    nastepnaProba: chwila('2026-08-27T05:30:00Z'), prob: 0, stan: 'oczekuje',
  };

  it('odstępy rosną, a nie powtarzają się co tyle samo', () => {
    let p = bazowe;
    const odstepy: number[] = [];
    for (let i = 0; i < ODSTEPY_PONOWIEN.length; i += 1) {
      const poprzednia = p.nastepnaProba;
      p = ponow(p);
      if (p.stan === 'oczekuje') odstepy.push((p.nastepnaProba - poprzednia) / MIN);
    }
    expect(odstepy).toEqual([...odstepy].sort((a, b) => a - b));
    expect(new Set(odstepy).size).toBeGreaterThan(1);
  });

  it('po wyczerpaniu prób odpuszcza, zamiast zaczepiać w nieskończoność', () => {
    let p = bazowe;
    for (let i = 0; i <= ODSTEPY_PONOWIEN.length; i += 1) p = ponow(p);
    expect(p.stan).toBe('porzucone');
  });

  it('liczy próby', () => {
    expect(ponow(bazowe).prob).toBe(1);
    expect(ponow(ponow(bazowe)).prob).toBe(2);
  });

  it('ponowienia odmierza od ustalonej godziny, nie od chwili próby', () => {
    // Inaczej opóźnienie jednej próby przesuwałoby cały łańcuch.
    // Dwa ponowienia = trzecia próba, czyli suma trzech pierwszych odstępów.
    const p = ponow(ponow(bazowe));
    expect(p.nastepnaProba - bazowe.ustalonaNa)
      .toBe((ODSTEPY_PONOWIEN[0] + ODSTEPY_PONOWIEN[1] + ODSTEPY_PONOWIEN[2]) * MIN);
  });

  it('cztery próby mieszczą się w półtorej godziny od ustalonej godziny', () => {
    let p = bazowe;
    const chwile: number[] = [];
    while (p.stan === 'oczekuje') {
      chwile.push((p.nastepnaProba - bazowe.ustalonaNa) / MIN);
      p = ponow(p);
    }
    expect(chwile).toEqual([0, 10, 35, 85]);
    expect(p.stan).toBe('porzucone');
  });
});

describe('doZaczepienia', () => {
  const czekajace: Przypomnienie = {
    id: 'p1', rodzaj: 'HersztuMorning',
    ustalonaNa: chwila('2026-08-27T05:30:00Z'),
    nastepnaProba: chwila('2026-08-27T05:30:00Z'), prob: 0, stan: 'oczekuje',
  };
  const dostepny = { tryb: 'dostepny' as const, od: 0 };

  it('zwraca przypomnienie, którego termin nadszedł', () => {
    expect(doZaczepienia([czekajace], dostepny, czekajace.nastepnaProba)).toHaveLength(1);
  });

  it('milczy przed terminem', () => {
    expect(doZaczepienia([czekajace], dostepny, czekajace.nastepnaProba - MIN)).toHaveLength(0);
  });

  it('milczy, gdy użytkownik śpi — ale przypomnienia nie kasuje', () => {
    const spi = { tryb: 'spie' as const, od: 0 };
    expect(doZaczepienia([czekajace], spi, czekajace.nastepnaProba)).toHaveLength(0);
  });

  it('po przebudzeniu zaległe przypomnienie wciąż czeka', () => {
    const spi = { tryb: 'spie' as const, od: 0, do: czekajace.nastepnaProba + 60 * MIN };
    const pozniej = czekajace.nastepnaProba + 90 * MIN;
    expect(doZaczepienia([czekajace], spi, pozniej)).toHaveLength(1);
  });

  it('pomija odbyte i porzucone', () => {
    const inne: Przypomnienie[] = [
      { ...czekajace, id: 'a', stan: 'odbyte' },
      { ...czekajace, id: 'b', stan: 'porzucone' },
    ];
    expect(doZaczepienia(inne, dostepny, czekajace.nastepnaProba)).toHaveLength(0);
  });
});

describe('opisSpotkania', () => {
  it('opisuje spotkanie codzienne godziną', () => {
    expect(opisSpotkania(poranne)).toContain('07:30');
  });

  it('dla tygodniowego podaje dzień po polsku', () => {
    expect(opisSpotkania(tygodniowe)).toMatch(/niedziel/i);
  });

  it('zaznacza, że godzina jest tylko domyślna', () => {
    expect(opisSpotkania({ ...poranne, uzgodnione: false })).toMatch(/domyśln/i);
  });
});
