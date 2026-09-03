import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { KasiaService } from './KasiaService';
import { KasiaStore } from './KasiaStore';
import type { Model, OdpowiedzModelu, ZapytanieDoModelu } from './llm';
import type { WykonawcaNarzedzi } from './narzedzia';

const T = Date.UTC(2026, 8, 3, 8, 0, 0);   // czwartek, 3 września 2026, 10:00 lokalnie

/**
 * Model, który odgrywa zaplanowaną sekwencję odpowiedzi.
 *
 * Pozwala sprawdzić pętlę: najpierw prośba o narzędzie, potem — po otrzymaniu
 * wyniku — zdanie dla użytkownika.
 */
class ModelZNarzedziami implements Model {
  zapytania: ZapytanieDoModelu[] = [];
  private kolejka: OdpowiedzModelu[] = [];

  ustaw(...odpowiedzi: OdpowiedzModelu[]): void {
    this.kolejka = odpowiedzi;
  }

  gotowy(): boolean { return true; }
  czegoBrakuje(): string | null { return null; }

  async odpowiedz(z: ZapytanieDoModelu): Promise<string> {
    return (await this.odpowiedzZNarzedziami(z)).tekst;
  }

  async odpowiedzZNarzedziami(z: ZapytanieDoModelu): Promise<OdpowiedzModelu> {
    this.zapytania.push(z);
    return this.kolejka.shift() ?? { tekst: 'Gotowe.', narzedzia: [] };
  }
}

function wykonawca(): WykonawcaNarzedzi & { historia: string[] } {
  const historia: string[] = [];
  return {
    historia,
    ustawSpotkanie: vi.fn(async (r, z) => { historia.push(`spotkanie ${r} ${JSON.stringify(z)}`); }),
    dopiszZadanie: vi.fn(async (z) => { historia.push(`zadanie ${z.name}`); return 'id'; }),
    dopiszWydarzenie: vi.fn(async (w) => { historia.push(`wydarzenie ${w.name}`); return 'id'; }),
    zapiszWage: vi.fn(async (kg) => { historia.push(`waga ${kg}`); }),
    projekty: async () => [],
  };
}

describe('pętla narzędziowa', () => {
  let katalog: string;
  let kasia: KasiaService;
  let model: ModelZNarzedziami;
  let narz: ReturnType<typeof wykonawca>;

  beforeEach(async () => {
    katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'kasia-narz-'));
    const store = new KasiaStore(katalog, T);
    await store.wczytaj();
    model = new ModelZNarzedziami();
    narz = wykonawca();
    kasia = new KasiaService(store, model, undefined, narz);
  });

  afterEach(() => fs.rmSync(katalog, { recursive: true, force: true }));

  it('wykonuje narzędzie, o które prosi model, i oddaje mu wynik', async () => {
    model.ustaw(
      { tekst: '', narzedzia: [{ id: 'n1', nazwa: 'zapisz_wage', parametry: { kg: 84.2 } }] },
      { tekst: 'Zapisałam 84,2 kg.', narzedzia: [] },
    );

    const odp = await kasia.powiedz('Ważyłem 84,2', T);

    expect(narz.historia).toEqual(['waga 84.2']);
    expect(odp).toBe('Zapisałam 84,2 kg.');
  });

  it('wynik narzędzia wraca do modelu jako krok rozmowy', async () => {
    model.ustaw(
      { tekst: '', narzedzia: [{ id: 'n1', nazwa: 'zapisz_wage', parametry: { kg: 84 } }] },
      { tekst: 'ok', narzedzia: [] },
    );
    await kasia.powiedz('waga', T);

    const drugie = model.zapytania[1];
    expect(drugie.kroki).toBeDefined();
    const wynik = drugie.kroki!.find((k) => k.rola === 'narzedzie');
    expect(wynik).toBeDefined();
    expect(JSON.stringify(wynik)).toContain('84');
  });

  it('do trwałej rozmowy trafia tylko zdanie dla człowieka, nie protokół', async () => {
    // Panel ma pokazywać rozmowę, a nie zapis wykonania narzędzi.
    model.ustaw(
      { tekst: '', narzedzia: [{ id: 'n1', nazwa: 'zapisz_wage', parametry: { kg: 84 } }] },
      { tekst: 'Zapisane.', narzedzia: [] },
    );
    await kasia.powiedz('waga', T);

    const rozmowa = kasia.stan().rozmowa;
    expect(rozmowa).toHaveLength(2);              // pytanie + odpowiedź
    expect(rozmowa[1].tresc).toBe('Zapisane.');
    expect(JSON.stringify(rozmowa)).not.toContain('zapisz_wage');
  });

  it('obsługuje kilka narzędzi w jednym kroku', async () => {
    model.ustaw(
      {
        tekst: '',
        narzedzia: [
          { id: 'a', nazwa: 'zapisz_wage', parametry: { kg: 84 } },
          { id: 'b', nazwa: 'dopisz_zadanie', parametry: { nazwa: 'Kupić mleko' } },
        ],
      },
      { tekst: 'Zrobione.', narzedzia: [] },
    );
    await kasia.powiedz('dwie rzeczy', T);
    expect(narz.historia).toEqual(['waga 84', 'zadanie Kupić mleko']);
  });

  it('błąd narzędzia wraca do modelu, zamiast przerywać rozmowę', async () => {
    model.ustaw(
      { tekst: '', narzedzia: [{ id: 'n1', nazwa: 'zapisz_wage', parametry: { kg: 600 } }] },
      { tekst: 'To niemożliwa waga — sprawdź.', narzedzia: [] },
    );

    const odp = await kasia.powiedz('ważę 600', T);
    expect(odp).toContain('niemożliwa');
    expect(narz.historia).toHaveLength(0);

    const wynik = model.zapytania[1].kroki!.find((k) => k.rola === 'narzedzie');
    expect(JSON.stringify(wynik)).toMatch(/niemożliw/i);
  });

  it('kończy pętlę po limicie kroków, zamiast kręcić się w kółko', async () => {
    // Model uparcie prosi o narzędzie i nigdy nie odpowiada.
    const uparty: OdpowiedzModelu = {
      tekst: '', narzedzia: [{ id: 'x', nazwa: 'zapisz_wage', parametry: { kg: 84 } }],
    };
    model.ustaw(...Array.from({ length: 20 }, () => uparty));

    const odp = await kasia.powiedz('zapętl się', T);
    expect(model.zapytania.length).toBeLessThanOrEqual(6);
    expect(odp).toBeTruthy();          // mimo braku odpowiedzi coś wraca
  });

  it('bez narzędzi w odpowiedzi nie robi dodatkowego zapytania', async () => {
    model.ustaw({ tekst: 'Zwykła odpowiedź.', narzedzia: [] });
    await kasia.powiedz('cześć', T);
    expect(model.zapytania).toHaveLength(1);
  });

  it('przekazuje modelowi schematy narzędzi', async () => {
    model.ustaw({ tekst: 'ok', narzedzia: [] });
    await kasia.powiedz('cześć', T);
    const nazwy = model.zapytania[0].narzedzia?.map((n) => n.name) ?? [];
    expect(nazwy).toContain('ustaw_godzine_spotkania');
    expect(nazwy).toContain('zapisz_wage');
  });

  it('bez wykonawcy narzędzia nie są w ogóle oferowane', async () => {
    // Gdy nie ma dostępu do MyCastle, obiecywanie działania byłoby kłamstwem.
    const store = new KasiaStore(katalog, T);
    await store.wczytaj();
    const bezNarzedzi = new KasiaService(store, model);
    model.ustaw({ tekst: 'ok', narzedzia: [] });
    await bezNarzedzi.powiedz('cześć', T);
    expect(model.zapytania.at(-1)!.narzedzia).toBeUndefined();
  });

  it('zmiana godziny przez narzędzie jest widoczna w stanie', async () => {
    const store = new KasiaStore(katalog, T);
    await store.wczytaj();
    const zPrawdziwym = new KasiaService(store, model, undefined, {
      ...wykonawca(),
      // Prawdziwe ustawienie spotkania, nie atrapa.
      ustawSpotkanie: async (r, z) => { await zPrawdziwym.ustawSpotkanie(r, z); },
    });

    model.ustaw(
      {
        tekst: '',
        narzedzia: [{
          id: 'n1', nazwa: 'ustaw_godzine_spotkania',
          parametry: { rodzaj: 'HersztuMorning', godzina: '08:15' },
        }],
      },
      { tekst: 'Ustawione na 8:15.', narzedzia: [] },
    );

    await zPrawdziwym.powiedz('przesuńmy poranne na 8:15', T);
    const s = zPrawdziwym.stan().spotkania.find((x) => x.rodzaj === 'HersztuMorning')!;
    expect(s.godzina).toBe('08:15');
    expect(s.uzgodnione).toBe(true);
  });
});
