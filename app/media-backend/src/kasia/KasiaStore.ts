/**
 * KasiaStore.ts — trwały stan asystentki.
 *
 * Jeden plik JSON w katalogu danych, zapisywany tak samo jak lista odtwarzania
 * (plik tymczasowy + `rename`, czyli operacja niepodzielna). Powód ten sam:
 * zbiór jest mały i mieści się w pamięci, a baza dołożyłaby zależność
 * i migracje bez żadnego zysku.
 *
 * Rozmowa jest **przycinana** przy zapisie. Bez tego plik rósłby bez końca,
 * a każde zapytanie do modelu niosłoby coraz dłuższą historię — aż do momentu,
 * w którym przestałaby się mieścić w oknie kontekstu. Przycinanie jest
 * zachowaniem magazynu, nie usługi, bo dotyczy tego, co leży na dysku.
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import {
  type SekretyKasi, type StanKasi, type WiadomoscKasi,
  stanPoczatkowy, USTAWIENIA_DOMYSLNE,
} from './model';

/**
 * Ile ostatnich wiadomości trzymamy.
 *
 * 200 to około tygodnia zwykłej wymiany zdań — dość, żeby Kasia pamiętała
 * ustalenia z poprzednich spotkań, i na tyle mało, żeby plik został czytelny.
 * Do modelu i tak trafia mniej (patrz `KasiaService`).
 */
const LIMIT_ROZMOWY = 200;

export class KasiaStore {
  private readonly plik: string;
  private readonly plikSekretow: string;
  private stan: StanKasi;
  private sekrety: SekretyKasi = { kluczModelu: '' };

  constructor(dataDir: string, teraz: number = Date.now()) {
    this.plik = path.join(dataDir, 'kasia.json');
    /*
     * Sekrety w osobnym pliku, nie w `kasia.json`.
     *
     * Stan Kasi warto podejrzeć, skopiować na inną maszynę albo wkleić do
     * zgłoszenia błędu — a każda z tych czynności z kluczem API w środku kończy
     * się jego ujawnieniem. Osobny plik da się pominąć jednym `.gitignore`
     * i jednym `scp`.
     */
    this.plikSekretow = path.join(dataDir, 'kasia.sekrety.json');
    this.stan = stanPoczatkowy(teraz);
  }

  async wczytaj(): Promise<void> {
    if (!fs.existsSync(this.plik)) return;
    try {
      const zapisane = JSON.parse(await fsp.readFile(this.plik, 'utf8')) as Partial<StanKasi>;
      /*
       * Scalamy z wartościami domyślnymi zamiast podstawiać wczytany obiekt.
       * Plik zapisany starszą wersją nie zna pól dodanych później, a brak
       * `ustawienia.model` objawiłby się dopiero przy pierwszym zapytaniu do
       * API — komunikatem, z którego nie wynika, że chodzi o stary plik.
       */
      this.stan = {
        ustawienia: { ...USTAWIENIA_DOMYSLNE, ...(zapisane.ustawienia ?? {}) },
        glos: zapisane.glos,
        dostepnosc: zapisane.dostepnosc ?? this.stan.dostepnosc,
        spotkania: zapisane.spotkania ?? this.stan.spotkania,
        przypomnienia: zapisane.przypomnienia ?? [],
        fragmenty: zapisane.fragmenty ?? [],
        rozmowa: zapisane.rozmowa ?? [],
      };
    } catch (err) {
      // Uszkodzony plik nie może blokować startu — ale musi zostawić ślad.
      console.error(`[kasia] nie udało się wczytać ${this.plik}:`, (err as Error).message);
    }

    if (fs.existsSync(this.plikSekretow)) {
      try {
        this.sekrety = {
          ...this.sekrety,
          ...JSON.parse(await fsp.readFile(this.plikSekretow, 'utf8')) as Partial<SekretyKasi>,
        };
      } catch (err) {
        console.error('[kasia] nie udało się wczytać sekretów:', (err as Error).message);
      }
    }
  }

  /** Sekrety — tylko dla kodu serwera; nigdy nie trafiają do odpowiedzi HTTP. */
  pobierzSekrety(): SekretyKasi {
    return { ...this.sekrety };
  }

  async zapiszSekrety(zmiany: Partial<SekretyKasi>): Promise<void> {
    this.sekrety = { ...this.sekrety, ...zmiany };
    const tmp = `${this.plikSekretow}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(this.sekrety, null, 2), 'utf8');
    await fsp.rename(tmp, this.plikSekretow);
    // Klucz API nie powinien być czytelny dla innych kont na tej samej maszynie.
    await fsp.chmod(this.plikSekretow, 0o600).catch(() => { /* np. Windows */ });
  }

  private async zapisz(): Promise<void> {
    if (this.stan.rozmowa.length > LIMIT_ROZMOWY) {
      this.stan.rozmowa = this.stan.rozmowa.slice(-LIMIT_ROZMOWY);
    }
    const tmp = `${this.plik}.tmp`;
    await fsp.mkdir(path.dirname(this.plik), { recursive: true });
    await fsp.writeFile(tmp, JSON.stringify(this.stan, null, 2), 'utf8');
    await fsp.rename(tmp, this.plik);
  }

  /** Kopia stanu — do odczytu. Mutacje idą przez `zmien`. */
  pobierz(): StanKasi {
    return structuredClone(this.stan);
  }

  /**
   * Zmienia stan i zapisuje.
   *
   * Mutacja przez funkcję, a nie przez podstawienie całego obiektu: dwa żądania
   * HTTP obsługiwane naprzemiennie nadpisywałyby sobie nawzajem zmiany, gdyby
   * każde czytało stan, modyfikowało kopię i odsyłało całość.
   */
  async zmien(fn: (stan: StanKasi) => void): Promise<StanKasi> {
    fn(this.stan);
    await this.zapisz();
    return this.pobierz();
  }

  async dopiszWiadomosc(w: WiadomoscKasi): Promise<void> {
    await this.zmien((s) => { s.rozmowa.push(w); });
  }
}
