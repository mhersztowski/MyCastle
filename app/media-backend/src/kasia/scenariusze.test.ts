import { describe, it, expect } from 'vitest';
import { poleceniSpotkania, czegoPotrzebuje } from './scenariusze';

/** Niedziela, 30 sierpnia 2026, 18:00 czasu warszawskiego. */
const NIEDZIELA = Date.UTC(2026, 7, 30, 16, 0, 0);

describe('poleceniSpotkania', () => {
  describe('HersztuMorning', () => {
    const p = poleceniSpotkania('HersztuMorning', { proba: 0 });

    it('kieruje uwagę na dzisiaj', () => {
      expect(p).toMatch(/dziś|dzisiaj/i);
    });

    it('każe wymienić konkrety, a nie mówić ogólnie', () => {
      expect(p).toMatch(/wymień|konkret|nazw/i);
    });

    it('nie podsumowuje dnia, który się jeszcze nie wydarzył', () => {
      expect(p).not.toMatch(/co udało się zrobić|podsumuj dzień/i);
    });
  });

  describe('HersztuEvening', () => {
    const p = poleceniSpotkania('HersztuEvening', { proba: 0 });

    it('pyta o to, co się wydarzyło', () => {
      expect(p).toMatch(/udało|zrobion|wydarzy/i);
    });

    it('każe zaproponować dopisanie, gdy dzień jest pusty', () => {
      expect(p).toMatch(/dopisa|zaproponuj|dodani/i);
    });

    it('zastrzega, że pustka w danych to nie to samo co pusty dzień', () => {
      // Bez tego Kasia doradza dopisywanie wydarzeń przy awarii pobierania.
      expect(p).toMatch(/niedostępn|nie wiadomo|nie wyciągaj/i);
    });
  });

  describe('HersztuWeekly', () => {
    const p = poleceniSpotkania('HersztuWeekly', { proba: 0 });

    it('planuje kolejny tydzień', () => {
      expect(p).toMatch(/tydzień|tygodni/i);
    });

    it('przypomina o ważeniu', () => {
      expect(p).toMatch(/waż|waga|wagi/i);
    });

    it('każe doradzać rzeczowo, bez motywowania', () => {
      expect(p).toMatch(/bez ocenia|rzeczowo|nie gratuluj|bez zachęt/i);
    });
  });

  describe('ponowienia', () => {
    it('przy pierwszej próbie nie wspomina o ponawianiu', () => {
      expect(poleceniSpotkania('HersztuMorning', { proba: 0 })).not.toMatch(/próba|ponow/i);
    });

    it('przy kolejnej próbie każe być krótszą', () => {
      const p = poleceniSpotkania('HersztuMorning', { proba: 2 });
      expect(p).toMatch(/kró(t|c)/i);
      expect(p).toMatch(/3/);        // to już trzecia próba
    });
  });

  it('każde spotkanie ma inną treść — inaczej trzy nazwy znaczyłyby to samo', () => {
    const trzy = [
      poleceniSpotkania('HersztuMorning', { proba: 0 }),
      poleceniSpotkania('HersztuEvening', { proba: 0 }),
      poleceniSpotkania('HersztuWeekly', { proba: 0 }),
    ];
    expect(new Set(trzy).size).toBe(3);
  });
});

describe('czegoPotrzebuje', () => {
  it('poranne patrzy na dziś i najbliższe dni', () => {
    const z = czegoPotrzebuje('HersztuMorning');
    expect(z.wstecz).toBe(0);
    expect(z.naprzod).toBeGreaterThanOrEqual(1);
    expect(z.waga).toBe(false);
  });

  it('wieczorne patrzy wstecz, bo omawia dzień, który minął', () => {
    expect(czegoPotrzebuje('HersztuEvening').wstecz).toBeGreaterThanOrEqual(1);
  });

  it('tygodniowe obejmuje cały nadchodzący tydzień', () => {
    expect(czegoPotrzebuje('HersztuWeekly').naprzod).toBeGreaterThanOrEqual(7);
  });

  it('tylko tygodniowe potrzebuje wagi — codzienne pytanie o nią byłoby nękaniem', () => {
    expect(czegoPotrzebuje('HersztuWeekly').waga).toBe(true);
    expect(czegoPotrzebuje('HersztuMorning').waga).toBe(false);
    expect(czegoPotrzebuje('HersztuEvening').waga).toBe(false);
  });

  it('zwykła rozmowa nie ciągnie tygodnia danych ani wagi', () => {
    const z = czegoPotrzebuje(null);
    expect(z.naprzod).toBeLessThanOrEqual(3);
    expect(z.waga).toBe(false);
  });
});
