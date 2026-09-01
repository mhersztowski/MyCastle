import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { obsluzPolecenie } from './polecenia';
import { KasiaService } from './KasiaService';
import { KasiaStore } from './KasiaStore';
import type { Model, ZapytanieDoModelu } from './llm';

class ModelAtrapa implements Model {
  zapytania: ZapytanieDoModelu[] = [];
  gotowy(): boolean { return true; }
  czegoBrakuje(): string | null { return null; }
  async odpowiedz(z: ZapytanieDoModelu): Promise<string> {
    this.zapytania.push(z);
    return 'Odpowiedź Kasi.';
  }
}

const T = Date.UTC(2026, 7, 29, 10, 0, 0);

describe('obsluzPolecenie', () => {
  let katalog: string;
  let kasia: KasiaService;
  let model: ModelAtrapa;

  beforeEach(async () => {
    katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'kasia-cmd-'));
    const store = new KasiaStore(katalog, T);
    await store.wczytaj();
    model = new ModelAtrapa();
    kasia = new KasiaService(store, model);
  });

  afterEach(() => fs.rmSync(katalog, { recursive: true, force: true }));

  describe('fragment.dodaj', () => {
    it('dokłada fragment do promptu', async () => {
      const w = await obsluzPolecenie(kasia, 'fragment.dodaj', {
        kind: 'init', tekst: 'Kot ma na imię Filemon.', zrodlo: 'test.ts',
      });
      expect(w.ok).toBe(true);
      expect(kasia.stan().fragmenty).toHaveLength(1);
    });

    it('odrzuca fragment bez treści', async () => {
      const w = await obsluzPolecenie(kasia, 'fragment.dodaj', { kind: 'init', tekst: '  ' });
      expect(w.ok).toBe(false);
      expect(w.error).toMatch(/treśc|pust/i);
    });

    it('nieznany rodzaj traktuje jako `update`, zamiast odmawiać', async () => {
      // Literówka w `kind` nie powinna wywracać skryptu — a `update` jest
      // bezpieczniejszym domyślnym, bo wygasa razem z namysłem.
      await obsluzPolecenie(kasia, 'fragment.dodaj', {
        kind: 'cokolwiek', tekst: 'x', zrodlo: 's',
      });
      expect(kasia.stan().fragmenty[0].kind).toBe('update');
    });

    it('przelicza wygasanie z minut na termin', async () => {
      await obsluzPolecenie(kasia, 'fragment.dodaj', {
        kind: 'update', tekst: 'x', zrodlo: 's', wygasaZa: 30,
      }, T);
      const f = kasia.stan().fragmenty[0];
      expect(f.wygasaO).toBe(T + 30 * 60_000);
    });

    it('bez `wygasaZa` fragment zostaje na stałe', async () => {
      await obsluzPolecenie(kasia, 'fragment.dodaj', { kind: 'init', tekst: 'x', zrodlo: 's' }, T);
      expect(kasia.stan().fragmenty[0].wygasaO).toBeUndefined();
    });
  });

  describe('fragment.usun', () => {
    it('usuwa fragment tego samego źródła', async () => {
      await obsluzPolecenie(kasia, 'fragment.dodaj', { id: 'a', kind: 'init', tekst: 'x', zrodlo: 's' });
      const w = await obsluzPolecenie(kasia, 'fragment.usun', { id: 'a', zrodlo: 's' });
      expect(w.ok).toBe(true);
      expect(kasia.stan().fragmenty).toHaveLength(0);
    });

    it('nie usuwa fragmentu cudzego źródła', async () => {
      // Inaczej jeden skrypt kasowałby wpisy innego przez zbieżność nazw.
      await obsluzPolecenie(kasia, 'fragment.dodaj', { id: 'a', kind: 'init', tekst: 'x', zrodlo: 'jeden' });
      await obsluzPolecenie(kasia, 'fragment.usun', { id: 'a', zrodlo: 'dwa' });
      expect(kasia.stan().fragmenty).toHaveLength(1);
    });
  });

  describe('powiedz', () => {
    it('dopisuje wypowiedź do rozmowy', async () => {
      const w = await obsluzPolecenie(kasia, 'powiedz', { tekst: 'Paczka czeka.' }, T);
      expect(w.ok).toBe(true);
      expect((w.data as { wyslano: boolean }).wyslano).toBe(true);

      const ostatnia = kasia.stan().rozmowa.at(-1)!;
      expect(ostatnia.tresc).toBe('Paczka czeka.');
      expect(ostatnia.zInicjatywy).toBe(true);
    });

    it('nie odzywa się, gdy użytkownik śpi — i mówi dlaczego', async () => {
      // Skrypt nie może obejść wyciszenia; inaczej przycisk „śpię" nic nie znaczy.
      await kasia.ustawDostepnosc('spie', T);
      const w = await obsluzPolecenie(kasia, 'powiedz', { tekst: 'Pobudka!' }, T);
      expect((w.data as { wyslano: boolean }).wyslano).toBe(false);
      expect((w.data as { powod?: string }).powod).toMatch(/śpi/i);
      expect(kasia.stan().rozmowa).toHaveLength(0);
    });

    it('odrzuca pustą wypowiedź', async () => {
      expect((await obsluzPolecenie(kasia, 'powiedz', { tekst: '' })).ok).toBe(false);
    });
  });

  describe('zapytaj', () => {
    it('zwraca odpowiedź modelu', async () => {
      const w = await obsluzPolecenie(kasia, 'zapytaj', { tekst: 'Co dziś mam?' }, T);
      expect((w.data as { odpowiedz: string }).odpowiedz).toBe('Odpowiedź Kasi.');
    });

    it('działa mimo wyciszenia — pytanie to nie zaczepianie', async () => {
      await kasia.ustawDostepnosc('nie-przeszkadzac', T);
      const w = await obsluzPolecenie(kasia, 'zapytaj', { tekst: 'Halo?' }, T);
      expect(w.ok).toBe(true);
    });
  });

  describe('stan', () => {
    it('zwraca dostępność, spotkania i liczbę wiadomości', async () => {
      const w = await obsluzPolecenie(kasia, 'stan', undefined, T);
      const d = w.data as { dostepnosc: { tryb: string }; spotkania: unknown[]; wiadomosci: number };
      expect(d.dostepnosc.tryb).toBe('dostepny');
      expect(d.spotkania).toHaveLength(3);
      expect(d.wiadomosci).toBe(0);
    });

    it('nie oddaje treści rozmowy ani promptów', async () => {
      // Skrypt ma wiedzieć, czy wolno zaczepiać — nie czytać cudzej korespondencji.
      await kasia.powiedz('sekret', T);
      const w = await obsluzPolecenie(kasia, 'stan', undefined, T);
      expect(JSON.stringify(w.data)).not.toContain('sekret');
      expect(JSON.stringify(w.data)).not.toContain('Jesteś Kasią');
    });
  });

  describe('nieznane polecenie', () => {
    it('odmawia, wymieniając to, co zna', async () => {
      const w = await obsluzPolecenie(kasia, 'zrob.wszystko', {});
      expect(w.ok).toBe(false);
      expect(w.error).toMatch(/fragment\.dodaj/);
    });
  });

  describe('błędy', () => {
    it('błąd wykonania wraca jako `ok: false`, nie jako wyjątek', async () => {
      // Wyjątek w obsłudze wiadomości MQTT nie ma komu wypłynąć — skrypt
      // czekałby do końca limitu, nie wiedząc, że coś poszło źle.
      const w = await obsluzPolecenie(kasia, 'waga.zapisz', { kg: 999 });
      expect(w.ok).toBe(false);
      expect(w.error).toBeTruthy();
    });
  });
});
