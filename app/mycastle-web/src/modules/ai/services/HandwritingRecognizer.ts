/**
 * HandwritingRecognizer — pismo odręczne na LaTeX albo zwykły tekst.
 *
 * Rysik daje **pociągnięcia**, a dokument trzyma **matematykę** — między jednym
 * a drugim brakowało kroku i to on jest tutaj. Rozpoznaje model wizyjny Claude'a:
 * renderujemy pociągnięcia do PNG i pytamy wprost, co jest napisane.
 *
 * Dwie decyzje warte uzasadnienia:
 *
 *  • **Wektory zostają źródłem prawdy, obraz jest tylko zapytaniem.** Zapisujemy
 *    pociągnięcia, nie bitmapę — rozwiązanie da się odtworzyć w historii, a przy
 *    lepszym modelu rozpoznać jeszcze raz bez utraty rozdzielczości.
 *  • **Model domyślnie najmocniejszy.** Rozpoznanie wzoru zależy od odczytania
 *    indeksów, kresek ułamkowych i drobnych znaków — to warstwa, na której tańsze
 *    modele się mylą, a pomyłka w indeksie zmienia sens wzoru, nie tylko wygląd.
 *
 * Odpowiedź czyścimy po stronie klienta. Model bywa posłuszny i zwraca sam
 * LaTeX, ale bywa też uczynny i dokłada ogrodzenie albo dolary — wynik trafia
 * wprost do bloku `formula`, więc nie ma tu miejsca na „zwykle działa".
 */
import type { AiChatRequest, AiChatResponse } from '../models/AiModels';
import { blobToBase64DataUrl } from '../utils/imageUtils';

/** Co ma powstać z pisma: wzór czy proza. */
export type InkMode = 'latex' | 'text';

export interface InkRecognitionResult {
  /** Rozpoznany zapis — LaTeX bez ogrodzeń albo zwykły tekst. */
  value: string;
  /** Model, który odpowiedział — do pokazania przy wyniku. */
  model: string;
}

/** Domyślny model: patrz nagłówek pliku. */
export const DEFAULT_INK_MODEL = 'claude-opus-5';

const POLECENIE: Record<InkMode, string> = {
  latex: [
    'Przepisz odręczny zapis matematyczny ze zdjęcia jako LaTeX.',
    'Zwróć WYŁĄCZNIE kod LaTeX wzoru — bez ogrodzeń, bez znaków dolara,',
    'bez komentarza i bez wyjaśnień.',
    'Zachowaj indeksy dolne i górne dokładnie tak, jak są napisane.',
    'Wektory zapisuj jako \\mathbf{...}, różniczki jako \\mathrm{d}.',
    'Jeżeli zapis jest nieczytelny, zwróć pusty tekst.',
  ].join(' '),
  text: [
    'Przepisz odręczny tekst ze zdjęcia.',
    'Zwróć WYŁĄCZNIE przepisaną treść — bez komentarza i bez wyjaśnień.',
    'Zachowaj podział na wiersze.',
    'Jeżeli zapis jest nieczytelny, zwróć pusty tekst.',
  ].join(' '),
};

/**
 * Zdejmuje opakowanie, którym model lubi otoczyć odpowiedź.
 *
 * Dolary zdejmujemy **tylko w trybie wzoru** — w prozie `$5` jest ceną, a nie
 * ogrodzeniem matematyki.
 */
export function stripWrapping(surowa: string, mode: InkMode): string {
  let tekst = surowa.trim();

  const ogrodzenie = /^```[a-zA-Z]*\n?([\s\S]*?)\n?```$/.exec(tekst);
  if (ogrodzenie) tekst = ogrodzenie[1].trim();

  if (mode === 'latex') {
    const podwojny = /^\$\$([\s\S]*?)\$\$$/.exec(tekst);
    if (podwojny) tekst = podwojny[1].trim();
    else {
      const pojedynczy = /^\$([^$]*)\$$/.exec(tekst);
      if (pojedynczy) tekst = pojedynczy[1].trim();
    }
  }

  return tekst.trim();
}

export type ChatFn = (request: AiChatRequest) => Promise<AiChatResponse>;

export class HandwritingRecognizer {
  constructor(
    private readonly chat: ChatFn,
    private readonly model: string = DEFAULT_INK_MODEL,
  ) {}

  /**
   * Rozpoznaje zawartość obrazu z pismem.
   *
   * Rzuca, gdy model nic nie odczytał — pusty wynik wstawiony do bloku
   * skasowałby autorowi to, co już tam miał.
   */
  async recognize(image: Blob, mode: InkMode): Promise<InkRecognitionResult> {
    const dataUrl = await blobToBase64DataUrl(image);

    const odpowiedz = await this.chat({
      provider: 'anthropic',
      model: this.model,
      maxTokens: 1024,
      messages: [
        { role: 'system', content: POLECENIE[mode] },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
            { type: 'text', text: mode === 'latex' ? 'Co tu jest napisane?' : 'Przepisz to.' },
          ],
        },
      ],
    });

    const value = stripWrapping(odpowiedz.content ?? '', mode);
    if (!value) throw new Error('Model nie rozpoznał pisma — spróbuj napisać wyraźniej.');

    return { value, model: odpowiedz.model };
  }
}
