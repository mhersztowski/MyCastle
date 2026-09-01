/**
 * trasy.ts — HTTP dla Kasi.
 *
 * Osobny plik, a nie kolejna metoda w `MediaHttpServer`: serwer ma już pięć
 * grup tras i dokładanie szóstej w tym samym pliku zamieniłoby go w spis
 * wszystkiego, co aplikacja robi. Tutaj jest wyłącznie tłumaczenie żądań na
 * wywołania `KasiaService` — żadnej logiki asystentki.
 *
 * Trasy:
 *   GET  /api/kasia/stan              → cały stan (rozmowa, ustawienia, spotkania)
 *   POST /api/kasia/powiedz           { tekst }
 *   POST /api/kasia/dostepnosc        { tryb, minut? }
 *   POST /api/kasia/spotkanie         { rodzaj, godzina?, dzienTygodnia?, wlaczone? }
 *   POST /api/kasia/ustawienia        { promptInit?, promptUpdate?, inicjatywaCoMin?, model? }
 *   POST /api/kasia/fragment          { id, kind, zrodlo, tekst, wygasaZa? }
 *   DELETE /api/kasia/fragment/:id?zrodlo=…
 *   GET  /api/kasia/glos              konfiguracja TTS/STT (dla przeglądarki)
 *   POST /api/kasia/glos              zapis konfiguracji TTS/STT
 *   POST /api/kasia/model             { dostawca, model, adres?, klucz? }
 *   GET  /api/kasia/dane              podgląd danych z MyCastle (co widzi model)
 *   POST /api/kasia/waga              { kg, data?, uwaga? } — pomiar do VFS MyCastle
 *   POST /api/kasia/tick              wymusza przebieg pętli (do prób)
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { KasiaService } from './KasiaService';
import { BladZadania, RODZAJE_SPOTKAN, type RodzajSpotkania, type TrybDostepnosci } from './model';

type Odpowiedz = (res: ServerResponse, status: number, dane: unknown) => void;

const TRYBY: readonly TrybDostepnosci[] = ['dostepny', 'nie-przeszkadzac', 'spie'];

async function ciało(req: IncomingMessage): Promise<Record<string, unknown>> {
  const kawalki: Buffer[] = [];
  for await (const k of req) kawalki.push(Buffer.from(k));
  const tekst = Buffer.concat(kawalki).toString('utf8').trim();
  if (!tekst) return {};
  try {
    const dane = JSON.parse(tekst) as unknown;
    return typeof dane === 'object' && dane !== null ? dane as Record<string, unknown> : {};
  } catch {
    throw new Error('Ciało żądania nie jest poprawnym JSON-em.');
  }
}

/**
 * Obsługuje żądanie do Kasi.
 *
 * Zwraca `false`, gdy ścieżka nie należy do Kasi — wtedy serwer szuka dalej.
 * Wyjątki wypuszcza na zewnątrz; łapie je wspólna obsługa w `MediaHttpServer`,
 * żeby format błędu był jeden dla całego API.
 */
export async function obsluzKasie(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  kasia: KasiaService,
  odpowiedz: Odpowiedz,
): Promise<boolean> {
  if (!pathname.startsWith('/api/kasia')) return false;

  try {
    return await trasy(req, res, pathname, kasia, odpowiedz);
  } catch (err) {
    // Błąd wywołującego (zła godzina, nieznane spotkanie) to 400, nie 500.
    if (err instanceof BladZadania) {
      odpowiedz(res, err.status, { error: err.message });
      return true;
    }
    throw err;
  }
}

async function trasy(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  kasia: KasiaService,
  odpowiedz: Odpowiedz,
): Promise<boolean> {
  const metoda = req.method ?? 'GET';

  if (metoda === 'GET' && pathname === '/api/kasia/stan') {
    odpowiedz(res, 200, kasia.stan());
    return true;
  }

  if (metoda === 'POST' && pathname === '/api/kasia/powiedz') {
    const b = await ciało(req);
    const tekst = String(b.tekst ?? '').trim();
    if (!tekst) {
      odpowiedz(res, 400, { error: 'Pusta wiadomość.' });
      return true;
    }
    /*
     * Brak klucza API to 503, nie 500: serwer działa poprawnie, brakuje mu
     * konfiguracji. Piątka sugerowałaby awarię i wysłałaby szukającego
     * w stronę logów zamiast w stronę pliku `.env`.
     */
    if (!kasia.modelGotowy()) {
      odpowiedz(res, 503, {
        error: 'Kasia nie ma skonfigurowanego modelu — ustaw ANTHROPIC_API_KEY w .env backendu.',
      });
      return true;
    }
    odpowiedz(res, 200, { odpowiedz: await kasia.powiedz(tekst) });
    return true;
  }

  if (metoda === 'POST' && pathname === '/api/kasia/dostepnosc') {
    const b = await ciało(req);
    const tryb = String(b.tryb ?? '') as TrybDostepnosci;
    if (!TRYBY.includes(tryb)) {
      odpowiedz(res, 400, { error: `Nieznany tryb „${tryb}". Dozwolone: ${TRYBY.join(', ')}.` });
      return true;
    }
    const minut = b.minut != null ? Number(b.minut) : undefined;
    odpowiedz(res, 200, await kasia.ustawDostepnosc(tryb, Date.now(), minut));
    return true;
  }

  if (metoda === 'POST' && pathname === '/api/kasia/spotkanie') {
    const b = await ciało(req);
    const rodzaj = String(b.rodzaj ?? '') as RodzajSpotkania;
    if (!RODZAJE_SPOTKAN.includes(rodzaj)) {
      odpowiedz(res, 400, { error: `Nieznane spotkanie „${rodzaj}".` });
      return true;
    }
    // Pola nieobecne w żądaniu zostają bez zmian — `undefined` nie nadpisuje.
    const zmiany: Record<string, unknown> = {};
    if (b.godzina != null) zmiany.godzina = String(b.godzina);
    if (b.dzienTygodnia != null) zmiany.dzienTygodnia = Number(b.dzienTygodnia);
    if (b.wlaczone != null) zmiany.wlaczone = Boolean(b.wlaczone);
    odpowiedz(res, 200, await kasia.ustawSpotkanie(rodzaj, zmiany));
    return true;
  }

  if (metoda === 'POST' && pathname === '/api/kasia/ustawienia') {
    const b = await ciało(req);
    const zmiany: Record<string, unknown> = {};
    if (b.promptInit != null) zmiany.promptInit = String(b.promptInit);
    if (b.promptUpdate != null) zmiany.promptUpdate = String(b.promptUpdate);
    if (b.inicjatywaCoMin != null) zmiany.inicjatywaCoMin = Math.max(0, Number(b.inicjatywaCoMin));
    if (b.model != null) zmiany.model = String(b.model);
    if (b.strefaCzasowa != null) zmiany.strefaCzasowa = String(b.strefaCzasowa);
    odpowiedz(res, 200, await kasia.zapiszUstawienia(zmiany));
    return true;
  }

  if (metoda === 'POST' && pathname === '/api/kasia/fragment') {
    const b = await ciało(req);
    const kind = b.kind === 'update' ? 'update' as const : 'init' as const;
    const tekst = String(b.tekst ?? '').trim();
    if (!tekst) {
      odpowiedz(res, 400, { error: 'Fragment bez treści.' });
      return true;
    }
    /*
     * `wygasaZa` przyjmujemy w minutach, a nie jako znacznik czasu.
     * Wywołujący (skrypt w przeglądarce) ma inny zegar niż serwer, a różnica
     * kilku minut przy krótkim terminie znaczy tyle, co cały termin.
     */
    const wygasaZa = b.wygasaZa != null ? Number(b.wygasaZa) : undefined;
    odpowiedz(res, 200, await kasia.dodajFragment({
      id: String(b.id ?? Math.random().toString(36).slice(2, 10)),
      kind,
      zrodlo: String(b.zrodlo ?? 'nieznane'),
      tekst,
      wygasaO: wygasaZa != null && wygasaZa > 0 ? Date.now() + wygasaZa * 60_000 : undefined,
    }));
    return true;
  }

  const fragmentMatch = /^\/api\/kasia\/fragment\/([^/]+)$/.exec(pathname);
  if (metoda === 'DELETE' && fragmentMatch) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const zrodlo = url.searchParams.get('zrodlo') ?? 'nieznane';
    odpowiedz(res, 200, await kasia.usunFragment(decodeURIComponent(fragmentMatch[1]), zrodlo));
    return true;
  }

  /*
   * Konfiguracja głosu — czytana i zapisywana przez przeglądarkę.
   *
   * TTS i STT działają po stronie klienta, bo tam są mikrofon i głośnik.
   * Backend jest tu wyłącznie miejscem przechowywania, wspólnym dla
   * przeglądarki i telefonu — dzięki temu głos ustawia się raz, a nie osobno
   * na każdym urządzeniu.
   */
  if (metoda === 'GET' && pathname === '/api/kasia/glos') {
    odpowiedz(res, 200, kasia.stan().glos ?? null);
    return true;
  }

  if (metoda === 'POST' && pathname === '/api/kasia/glos') {
    odpowiedz(res, 200, await kasia.zapiszGlos(await ciało(req)));
    return true;
  }

  if (metoda === 'POST' && pathname === '/api/kasia/model') {
    const b = await ciało(req);
    const wynik = await kasia.ustawModel({
      dostawca: b.dostawca != null ? String(b.dostawca) : undefined,
      model: b.model != null ? String(b.model) : undefined,
      adres: b.adres != null ? String(b.adres) : undefined,
      // Pusty ciąg znaczy „nie zmieniaj", a nie „skasuj": panel nie zna
      // obecnego klucza (nigdy go nie dostał), więc wysyła puste pole,
      // dopóki użytkownik nie wpisze nowego.
      klucz: typeof b.klucz === 'string' && b.klucz.trim() ? b.klucz.trim() : undefined,
    });
    odpowiedz(res, 200, wynik);
    return true;
  }

  if (metoda === 'GET' && pathname === '/api/kasia/dane') {
    // `?spotkanie=HersztuWeekly` pokazuje to, co Kasia zobaczy w niedzielę —
    // z tygodniem kalendarza i wagą, a nie widok zwykłej rozmowy.
    const url = new URL(req.url ?? '/', 'http://localhost');
    const zadany = url.searchParams.get('spotkanie') as RodzajSpotkania | null;
    const rodzaj = zadany && RODZAJE_SPOTKAN.includes(zadany) ? zadany : null;
    odpowiedz(res, 200, { opis: await kasia.podgladDanych(rodzaj) });
    return true;
  }

  if (metoda === 'POST' && pathname === '/api/kasia/waga') {
    const b = await ciało(req);
    const kg = Number(b.kg);
    if (!Number.isFinite(kg)) {
      odpowiedz(res, 400, { error: 'Brak liczby w polu „kg".' });
      return true;
    }
    /*
     * Data domyślnie dzisiejsza, liczona **po stronie serwera**.
     * Przeglądarka bywa w innej strefie niż dane użytkownika, a pomiar
     * przypisany do złego dnia psuje średnią tygodniową po cichu.
     */
    const data = typeof b.data === 'string' && b.data
      ? b.data
      : new Date().toISOString().slice(0, 10);

    odpowiedz(res, 200, await kasia.zapiszWage({
      data, kg, uwaga: typeof b.uwaga === 'string' ? b.uwaga : undefined,
    }));
    return true;
  }

  if (metoda === 'POST' && pathname === '/api/kasia/tick') {
    odpowiedz(res, 200, await kasia.tick());
    return true;
  }

  odpowiedz(res, 404, { error: `Nieznana trasa Kasi: ${pathname}` });
  return true;
}
