import { describe, it, expect, vi } from 'vitest';
import { NARZEDZIA, wykonajNarzedzie, schematyDlaModelu } from './narzedzia';
import type { WykonawcaNarzedzi } from './narzedzia';

const T = Date.UTC(2026, 8, 3, 10, 0, 0);   // czwartek, 3 września 2026

/** Atrapa gospodarza — zapamiętuje, o co narzędzie poprosiło. */
function wykonawca(nad: Partial<WykonawcaNarzedzi> = {}): WykonawcaNarzedzi & { wywolania: string[] } {
  const wywolania: string[] = [];
  return {
    wywolania,
    ustawSpotkanie: vi.fn(async (rodzaj, zmiany) => {
      wywolania.push(`spotkanie:${rodzaj}:${JSON.stringify(zmiany)}`);
    }),
    dopiszZadanie: vi.fn(async (z) => { wywolania.push(`zadanie:${z.name}`); return 'id-1'; }),
    dopiszWydarzenie: vi.fn(async (w) => { wywolania.push(`wydarzenie:${w.name}`); return 'id-2'; }),
    zapiszWage: vi.fn(async (kg) => { wywolania.push(`waga:${kg}`); }),
    projekty: async () => [{ id: 'p1', name: 'Dom' }, { id: 'p2', name: 'Praca' }],
    ...nad,
  };
}

describe('schematyDlaModelu', () => {
  it('każde narzędzie ma nazwę, opis i schemat parametrów', () => {
    for (const s of schematyDlaModelu()) {
      expect(s.name).toBeTruthy();
      expect(s.description.length).toBeGreaterThan(20);
      expect(s.input_schema.type).toBe('object');
    }
  });

  it('nazwy są niepowtarzalne', () => {
    const nazwy = schematyDlaModelu().map((s) => s.name);
    expect(new Set(nazwy).size).toBe(nazwy.length);
  });

  it('opisy mówią, kiedy narzędzia użyć, a nie tylko co robi', () => {
    // Model wybiera narzędzie na podstawie opisu; sam czasownik nie wystarcza.
    for (const s of schematyDlaModelu()) {
      expect(s.description).toMatch(/gdy|kiedy|używaj|użyj/i);
    }
  });
});

describe('wykonajNarzedzie — ustaw_godzine_spotkania', () => {
  it('zmienia godzinę', async () => {
    const w = wykonawca();
    const r = await wykonajNarzedzie('ustaw_godzine_spotkania',
      { rodzaj: 'HersztuMorning', godzina: '08:00' }, w, T);
    expect(r.ok).toBe(true);
    expect(w.wywolania[0]).toContain('HersztuMorning');
    expect(w.wywolania[0]).toContain('08:00');
  });

  it('odrzuca godzinę w złym zapisie, zamiast przekazać ją dalej', async () => {
    const w = wykonawca();
    const r = await wykonajNarzedzie('ustaw_godzine_spotkania',
      { rodzaj: 'HersztuMorning', godzina: 'rano' }, w, T);
    expect(r.ok).toBe(false);
    expect(r.tresc).toMatch(/godzin/i);
    expect(w.wywolania).toHaveLength(0);
  });

  it('odrzuca nieznane spotkanie', async () => {
    const r = await wykonajNarzedzie('ustaw_godzine_spotkania',
      { rodzaj: 'HersztuLunch', godzina: '13:00' }, wykonawca(), T);
    expect(r.ok).toBe(false);
    expect(r.tresc).toMatch(/HersztuMorning/);   // wymienia dozwolone
  });

  it('zwraca potwierdzenie, które model może przeczytać użytkownikowi', async () => {
    const r = await wykonajNarzedzie('ustaw_godzine_spotkania',
      { rodzaj: 'HersztuEvening', godzina: '21:30' }, wykonawca(), T);
    expect(r.tresc).toContain('21:30');
  });
});

describe('wykonajNarzedzie — dopisz_zadanie', () => {
  it('dopisuje zadanie z nazwą', async () => {
    const w = wykonawca();
    const r = await wykonajNarzedzie('dopisz_zadanie', { nazwa: 'Umyć okna' }, w, T);
    expect(r.ok).toBe(true);
    expect(w.wywolania[0]).toBe('zadanie:Umyć okna');
  });

  it('odrzuca zadanie bez nazwy', async () => {
    const r = await wykonajNarzedzie('dopisz_zadanie', { nazwa: '  ' }, wykonawca(), T);
    expect(r.ok).toBe(false);
  });

  it('rozumie termin „dzisiaj" i „jutro" zamiast wymagać daty', async () => {
    // Model dostaje datę w prompcie, ale w rozmowie pada „jutro" — przeliczenie
    // tutaj jest pewniejsze niż liczenie na to, że model doda dobę poprawnie.
    const w = wykonawca();
    await wykonajNarzedzie('dopisz_zadanie', { nazwa: 'A', termin: 'jutro' }, w, T);
    const arg = (w.dopiszZadanie as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.dueDate).toContain('2026-09-04');
  });

  it('przyjmuje datę wprost', async () => {
    const w = wykonawca();
    await wykonajNarzedzie('dopisz_zadanie', { nazwa: 'A', termin: '2026-09-10' }, w, T);
    const arg = (w.dopiszZadanie as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.dueDate).toContain('2026-09-10');
  });

  it('odrzuca termin, którego nie rozumie — zamiast wpisać dzisiejszą datę', async () => {
    const r = await wykonajNarzedzie('dopisz_zadanie',
      { nazwa: 'A', termin: 'kiedyś tam' }, wykonawca(), T);
    expect(r.ok).toBe(false);
    expect(r.tresc).toMatch(/termin/i);
  });

  it('dopasowuje projekt po nazwie, nie po identyfikatorze', async () => {
    const w = wykonawca();
    await wykonajNarzedzie('dopisz_zadanie', { nazwa: 'A', projekt: 'dom' }, w, T);
    const arg = (w.dopiszZadanie as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.projectId).toBe('p1');
  });

  it('nieznany projekt nie blokuje zapisu — zadanie trafia bez projektu', async () => {
    const w = wykonawca();
    const r = await wykonajNarzedzie('dopisz_zadanie', { nazwa: 'A', projekt: 'Kosmos' }, w, T);
    expect(r.ok).toBe(true);
    const arg = (w.dopiszZadanie as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.projectId).toBeUndefined();
    expect(r.tresc).toMatch(/Kosmos/);   // model ma o tym powiedzieć
  });
});

describe('wykonajNarzedzie — dopisz_wydarzenie', () => {
  it('dopisuje wydarzenie z godzinami', async () => {
    const w = wykonawca();
    const r = await wykonajNarzedzie('dopisz_wydarzenie',
      { nazwa: 'Dentysta', dzien: 'dzisiaj', od: '14:00', do: '15:00' }, w, T);
    expect(r.ok).toBe(true);
    const arg = (w.dopiszWydarzenie as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.startTime).toContain('2026-09-03');
  });

  it('odmawia dopisania stałej rozmowy jako wydarzenia', async () => {
    /*
     * HersztuMorning i spółka to nazwy rozmów z Kasią, nie wpisy w kalendarzu.
     * Prompt to mówi, ale przy jawnym „dodaj do kalendarza" model i tak próbuje —
     * sprawdzone na żywym modelu. Prośba zmniejsza częstość, kod wyklucza.
     */
    const w = wykonawca();
    const r = await wykonajNarzedzie('dopisz_wydarzenie',
      { nazwa: 'HersztuWeekly', dzien: 'dzisiaj', od: '18:00' }, w, T);
    expect(r.ok).toBe(false);
    expect(r.tresc).toMatch(/rozmow/i);
    expect(w.wywolania).toHaveLength(0);
  });

  it('rozpoznaje nazwę rozmowy także w dłuższym tytule', async () => {
    const r = await wykonajNarzedzie('dopisz_wydarzenie',
      { nazwa: 'Spotkanie HersztuMorning z Kasią', dzien: 'jutro', od: '07:30' }, wykonawca(), T);
    expect(r.ok).toBe(false);
  });

  it('nie blokuje zwykłego wydarzenia o podobnej nazwie', async () => {
    const w = wykonawca();
    const r = await wykonajNarzedzie('dopisz_wydarzenie',
      { nazwa: 'Poranne bieganie', dzien: 'jutro', od: '07:00' }, w, T);
    expect(r.ok).toBe(true);
  });

  it('koniec przed początkiem to błąd, nie wydarzenie ujemnej długości', async () => {
    const r = await wykonajNarzedzie('dopisz_wydarzenie',
      { nazwa: 'X', dzien: 'dzisiaj', od: '15:00', do: '14:00' }, wykonawca(), T);
    expect(r.ok).toBe(false);
    expect(r.tresc).toMatch(/koniec|wcześniej|później/i);
  });

  it('bez godziny końca przyjmuje godzinę trwania', async () => {
    const w = wykonawca();
    await wykonajNarzedzie('dopisz_wydarzenie',
      { nazwa: 'X', dzien: 'dzisiaj', od: '09:00' }, w, T);
    const arg = (w.dopiszWydarzenie as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const trwanie = new Date(arg.endTime).getTime() - new Date(arg.startTime).getTime();
    expect(trwanie).toBe(3600_000);
  });
});

describe('wykonajNarzedzie — zapisz_wage', () => {
  it('zapisuje pomiar', async () => {
    const w = wykonawca();
    const r = await wykonajNarzedzie('zapisz_wage', { kg: 84.2 }, w, T);
    expect(r.ok).toBe(true);
    expect(w.wywolania[0]).toBe('waga:84.2');
  });

  it('odrzuca wartość niemożliwą, zanim dojdzie do zapisu', async () => {
    const w = wykonawca();
    const r = await wykonajNarzedzie('zapisz_wage', { kg: 600 }, w, T);
    expect(r.ok).toBe(false);
    expect(w.wywolania).toHaveLength(0);
  });
});

describe('wykonajNarzedzie — zachowanie ogólne', () => {
  it('nieznane narzędzie zwraca błąd zamiast rzucać', async () => {
    const r = await wykonajNarzedzie('zrob_wszystko', {}, wykonawca(), T);
    expect(r.ok).toBe(false);
    expect(r.tresc).toMatch(/nieznane/i);
  });

  it('awaria zapisu wraca jako treść dla modelu, nie jako wyjątek', async () => {
    // Model musi móc powiedzieć „nie udało się", zamiast dostać milczenie.
    const w = wykonawca({
      zapiszWage: async () => { throw new Error('broker padł'); },
    });
    const r = await wykonajNarzedzie('zapisz_wage', { kg: 84 }, w, T);
    expect(r.ok).toBe(false);
    expect(r.tresc).toContain('broker padł');
  });

  it('lista narzędzi i obsługa są zgodne — każde zadeklarowane da się wykonać', async () => {
    for (const nazwa of NARZEDZIA.map((n) => n.name)) {
      const r = await wykonajNarzedzie(nazwa, {}, wykonawca(), T);
      // Puste parametry mają dać błąd walidacji, a nie „nieznane narzędzie".
      expect(r.tresc).not.toMatch(/nieznane narzędzie/i);
    }
  });
});
