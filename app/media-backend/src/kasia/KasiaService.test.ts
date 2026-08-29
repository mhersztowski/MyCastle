import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { KasiaService } from './KasiaService';
import { KasiaStore } from './KasiaStore';
import type { Model, ZapytanieDoModelu } from './llm';
import { MILCZENIE } from './model';

/** Atrapa modelu — zapamiętuje, o co pytano, i oddaje z góry ustaloną odpowiedź. */
class ModelAtrapa implements Model {
  zapytania: ZapytanieDoModelu[] = [];
  odpowiedzi: string[] = [];

  constructor(private domyslna = 'Dobrze.') {}

  gotowy(): boolean { return true; }

  async odpowiedz(z: ZapytanieDoModelu): Promise<string> {
    this.zapytania.push(z);
    return this.odpowiedzi.shift() ?? this.domyslna;
  }

  ostatniSystem(): string { return this.zapytania.at(-1)?.system ?? ''; }
}

const MIN = 60_000;
/** Czwartek, 27 sierpnia 2026, 06:00 czasu warszawskiego. */
const T = Date.UTC(2026, 7, 27, 4, 0, 0);

describe('KasiaService', () => {
  let katalog: string;
  let store: KasiaStore;
  let model: ModelAtrapa;
  let kasia: KasiaService;

  beforeEach(async () => {
    katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'kasia-'));
    store = new KasiaStore(katalog, T);
    await store.wczytaj();
    model = new ModelAtrapa();
    kasia = new KasiaService(store, model);
  });

  afterEach(() => fs.rmSync(katalog, { recursive: true, force: true }));

  describe('rozmowa', () => {
    it('odpowiada na wiadomość i zapisuje obie strony', async () => {
      const odp = await kasia.powiedz('Cześć', T);
      expect(odp).toBe('Dobrze.');

      const rozmowa = store.pobierz().rozmowa;
      expect(rozmowa.map((w) => w.rola)).toEqual(['user', 'assistant']);
      expect(rozmowa[0].tresc).toBe('Cześć');
    });

    it('przekazuje modelowi prompt bazowy', async () => {
      await kasia.powiedz('Cześć', T);
      expect(model.ostatniSystem()).toContain('Kasią');
    });

    it('przekazuje datę i godzinę, bo model sam ich nie zna', async () => {
      await kasia.powiedz('Który dzisiaj?', T);
      expect(model.ostatniSystem()).toMatch(/2026/);
      expect(model.ostatniSystem()).toMatch(/czwart/i);
    });

    it('odpowiada nawet wtedy, gdy włączone jest „nie przeszkadzać"', async () => {
      // Tryb blokuje zaczepianie z inicjatywy Kasi, a nie odpowiadanie na pytanie.
      await kasia.ustawDostepnosc('nie-przeszkadzac', T);
      expect(await kasia.powiedz('Jesteś tam?', T)).toBe('Dobrze.');
    });
  });

  describe('inicjatywa', () => {
    it('nie odzywa się, gdy model odpowie MILCZ', async () => {
      model.odpowiedzi = [MILCZENIE];
      const wynik = await kasia.tick(T);
      expect(wynik.wypowiedzi).toHaveLength(0);
      expect(store.pobierz().rozmowa).toHaveLength(0);
    });

    it('odzywa się, gdy model ma coś do powiedzenia', async () => {
      model.odpowiedzi = ['Masz dziś dwa zadania bez terminu.'];
      const wynik = await kasia.tick(T);
      expect(wynik.wypowiedzi).toEqual(['Masz dziś dwa zadania bez terminu.']);

      const ostatnia = store.pobierz().rozmowa.at(-1)!;
      expect(ostatnia.rola).toBe('assistant');
      expect(ostatnia.zInicjatywy).toBe(true);
    });

    it('używa promptu inicjatywy, nie bazowego', async () => {
      model.odpowiedzi = [MILCZENIE];
      await kasia.tick(T);
      expect(model.ostatniSystem()).toContain('Myślisz teraz sama');
    });

    it('milczy, gdy użytkownik śpi — i nie pyta wtedy modelu', async () => {
      await kasia.ustawDostepnosc('spie', T);
      const przed = model.zapytania.length;
      const wynik = await kasia.tick(T);
      expect(wynik.wypowiedzi).toHaveLength(0);
      expect(model.zapytania.length).toBe(przed);   // brak kosztu zapytania
    });

    it('nie myśli częściej niż co ustawione minut', async () => {
      model.odpowiedzi = [MILCZENIE, MILCZENIE];
      await kasia.tick(T);
      const po = model.zapytania.length;
      await kasia.tick(T + MIN);                    // ustawienie domyślne: co 5 min
      expect(model.zapytania.length).toBe(po);
      await kasia.tick(T + 6 * MIN);
      expect(model.zapytania.length).toBeGreaterThan(po);
    });

    it('wyłączona inicjatywa (0 minut) nie pyta modelu w ogóle', async () => {
      await kasia.zapiszUstawienia({ inicjatywaCoMin: 0 });
      await kasia.tick(T + 60 * MIN);
      expect(model.zapytania).toHaveLength(0);
    });
  });

  describe('spotkania', () => {
    it('zaczepia, gdy nadejdzie ustalona godzina', async () => {
      model.odpowiedzi = ['Dzień dobry. Na dziś masz trzy rzeczy.'];
      // Poranne domyślnie o 07:30 lokalnie = 05:30 UTC.
      const wynik = await kasia.tick(Date.UTC(2026, 7, 27, 5, 30, 0));
      expect(wynik.wypowiedzi).toHaveLength(1);
      expect(wynik.spotkania).toEqual(['HersztuMorning']);
    });

    it('mówi modelowi, o które spotkanie chodzi', async () => {
      model.odpowiedzi = ['Dzień dobry.'];
      await kasia.tick(Date.UTC(2026, 7, 27, 5, 30, 0));
      expect(model.ostatniSystem()).toContain('HersztuMorning');
    });

    it('nie zaczepia dwa razy o tym samym w tej samej minucie', async () => {
      model.odpowiedzi = ['Dzień dobry.', 'Znowu dzień dobry.'];
      const chwila = Date.UTC(2026, 7, 27, 5, 30, 0);
      await kasia.tick(chwila);
      const wynik = await kasia.tick(chwila);
      expect(wynik.spotkania).toHaveLength(0);
    });

    it('ponawia, gdy nikt nie odpowiedział', async () => {
      const chwila = Date.UTC(2026, 7, 27, 5, 30, 0);
      model.odpowiedzi = ['Dzień dobry.', 'Halo?'];
      await kasia.tick(chwila);
      const wynik = await kasia.tick(chwila + 11 * MIN);   // drugi odstęp to 10 min
      expect(wynik.spotkania).toEqual(['HersztuMorning']);
    });

    it('odpowiedź użytkownika kończy ponawianie', async () => {
      const chwila = Date.UTC(2026, 7, 27, 5, 30, 0);
      model.odpowiedzi = ['Dzień dobry.'];
      await kasia.tick(chwila);
      await kasia.powiedz('Jestem, dzięki', chwila + MIN);
      const wynik = await kasia.tick(chwila + 11 * MIN);
      expect(wynik.spotkania).toHaveLength(0);
    });

    it('sen wstrzymuje spotkanie, ale go nie kasuje', async () => {
      const rano = Date.UTC(2026, 7, 27, 5, 30, 0);
      await kasia.ustawDostepnosc('spie', T, 120);   // do 08:00 UTC
      model.odpowiedzi = ['Dzień dobry.'];

      expect((await kasia.tick(rano)).spotkania).toHaveLength(0);
      expect((await kasia.tick(Date.UTC(2026, 7, 27, 6, 30, 0))).spotkania)
        .toEqual(['HersztuMorning']);
    });
  });

  describe('godziny spotkań', () => {
    it('zmiana godziny oznacza spotkanie jako uzgodnione', async () => {
      await kasia.ustawSpotkanie('HersztuMorning', { godzina: '08:15' });
      const s = store.pobierz().spotkania.find((x) => x.rodzaj === 'HersztuMorning')!;
      expect(s.godzina).toBe('08:15');
      expect(s.uzgodnione).toBe(true);
    });

    it('odrzuca godzinę w niepoprawnym zapisie', async () => {
      await expect(kasia.ustawSpotkanie('HersztuMorning', { godzina: '25:99' }))
        .rejects.toThrow(/godzin/i);
    });

    it('pozwala wyłączyć spotkanie', async () => {
      await kasia.ustawSpotkanie('HersztuEvening', { wlaczone: false });
      model.odpowiedzi = [MILCZENIE];
      const wynik = await kasia.tick(Date.UTC(2026, 7, 27, 19, 0, 0));   // 21:00 lokalnie
      expect(wynik.spotkania).toHaveLength(0);
    });
  });

  describe('fragmenty promptu ze skryptów', () => {
    it('dołożony fragment trafia do promptu', async () => {
      await kasia.dodajFragment({
        id: 'kot', kind: 'init', zrodlo: 'test.ts', tekst: 'Kot ma na imię Filemon.',
      }, T);
      await kasia.powiedz('Jak ma na imię kot?', T);
      expect(model.ostatniSystem()).toContain('Filemon');
    });

    it('fragment inicjatywy nie trafia do zwykłej rozmowy', async () => {
      await kasia.dodajFragment({
        id: 'x', kind: 'update', zrodlo: 'test.ts', tekst: 'SEKRET',
      }, T);
      await kasia.powiedz('Cześć', T);
      expect(model.ostatniSystem()).not.toContain('SEKRET');
    });

    it('wygasły fragment znika sam', async () => {
      await kasia.dodajFragment({
        id: 'x', kind: 'init', zrodlo: 'test.ts', tekst: 'CHWILOWE', wygasaO: T + MIN,
      }, T);
      await kasia.powiedz('Cześć', T + 2 * MIN);
      expect(model.ostatniSystem()).not.toContain('CHWILOWE');
      expect(store.pobierz().fragmenty).toHaveLength(0);
    });

    it('daje się usunąć po identyfikatorze', async () => {
      await kasia.dodajFragment({ id: 'x', kind: 'init', zrodlo: 's.ts', tekst: 'A' }, T);
      await kasia.usunFragment('x', 's.ts');
      expect(store.pobierz().fragmenty).toHaveLength(0);
    });
  });

  describe('gdy model nie działa', () => {
    it('błąd modelu nie wywraca pętli i zostaje odnotowany', async () => {
      const zepsuty: Model = {
        gotowy: () => true,
        odpowiedz: async () => { throw new Error('API padło'); },
      };
      const k = new KasiaService(store, zepsuty);
      const wynik = await k.tick(T);
      expect(wynik.bledy).toHaveLength(1);
      expect(wynik.bledy[0]).toContain('API padło');
    });

    it('bez klucza API pętla nie pyta modelu', async () => {
      const brak: Model = {
        gotowy: () => false,
        odpowiedz: async () => { throw new Error('nie powinno się zdarzyć'); },
      };
      const k = new KasiaService(store, brak);
      const wynik = await k.tick(T);
      expect(wynik.wypowiedzi).toHaveLength(0);
      expect(wynik.bledy).toHaveLength(0);
    });
  });
});
