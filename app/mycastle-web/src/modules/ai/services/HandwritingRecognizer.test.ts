import { describe, it, expect, vi } from 'vitest';
import { HandwritingRecognizer } from './HandwritingRecognizer';
import type { AiChatRequest, AiChatResponse } from '../models/AiModels';

/** Najmniejszy prawdziwy PNG — jeden przezroczysty piksel. */
const PNG_1PX = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
), (c) => c.charCodeAt(0));

const obrazek = () => new Blob([PNG_1PX], { type: 'image/png' });

function atrapa(odpowiedz: string) {
  const chat = vi.fn(async (_r: AiChatRequest): Promise<AiChatResponse> => ({
    content: odpowiedz,
    model: 'claude-opus-5',
  }));
  return { chat, rozpoznawacz: new HandwritingRecognizer(chat) };
}

describe('rozpoznawanie pisma odręcznego', () => {
  it('wysyła obraz jako blok obrazu i prosi model wizyjny', async () => {
    const { chat, rozpoznawacz } = atrapa('x^2');
    await rozpoznawacz.recognize(obrazek(), 'latex');

    const zadanie = chat.mock.calls[0][0];
    const uzytkownik = zadanie.messages.find((m) => m.role === 'user')!;
    expect(Array.isArray(uzytkownik.content)).toBe(true);
    const bloki = uzytkownik.content as Array<{ type: string; image_url?: { url: string } }>;
    const obraz = bloki.find((b) => b.type === 'image_url');
    expect(obraz?.image_url?.url).toMatch(/^data:image\/png;base64,/);
  });

  /**
   * Domyślnie najmocniejszy model wizyjny — rozpoznawanie wzoru zależy od
   * odczytania indeksów, kresek ułamkowych i drobnych znaków, a to jest
   * dokładnie ta warstwa, na której tańsze modele się mylą.
   */
  it('domyślnie pyta Claude Opus 5', async () => {
    const { chat, rozpoznawacz } = atrapa('x');
    await rozpoznawacz.recognize(obrazek(), 'latex');
    expect(chat.mock.calls[0][0].model).toBe('claude-opus-5');
    expect(chat.mock.calls[0][0].provider).toBe('anthropic');
  });

  it('model da się nadpisać', async () => {
    const chat = vi.fn(async (): Promise<AiChatResponse> => ({ content: 'x', model: 'm' }));
    await new HandwritingRecognizer(chat, 'claude-sonnet-5').recognize(obrazek(), 'latex');
    expect(chat.mock.calls[0][0].model).toBe('claude-sonnet-5');
  });

  /**
   * Model lubi opakować odpowiedź w ogrodzenie albo w znaki dolara, mimo
   * wyraźnej prośby. Wynik ma trafić wprost do bloku `formula`, więc czyścimy
   * to po stronie klienta zamiast liczyć na posłuszeństwo.
   */
  it.each([
    ['```latex\n\\frac{a}{b}\n```', '\\frac{a}{b}'],
    ['```\nx^2\n```', 'x^2'],
    ['$$T = 2\\pi\\sqrt{l/g}$$', 'T = 2\\pi\\sqrt{l/g}'],
    ['$x_1$', 'x_1'],
    ['  \\alpha  ', '\\alpha'],
  ])('zdejmuje opakowanie z %j', async (odpowiedz, oczekiwane) => {
    const { rozpoznawacz } = atrapa(odpowiedz);
    expect((await rozpoznawacz.recognize(obrazek(), 'latex')).value).toBe(oczekiwane);
  });

  it('w trybie tekstowym nie zdejmuje dolarów z treści', async () => {
    const { rozpoznawacz } = atrapa('Cena wynosi $5 za sztukę');
    expect((await rozpoznawacz.recognize(obrazek(), 'text')).value)
      .toBe('Cena wynosi $5 za sztukę');
  });

  it('tryb decyduje o poleceniu dla modelu', async () => {
    const { chat, rozpoznawacz } = atrapa('x');
    await rozpoznawacz.recognize(obrazek(), 'latex');
    await rozpoznawacz.recognize(obrazek(), 'text');

    const polecenie = (i: number) => JSON.stringify(chat.mock.calls[i][0].messages);
    expect(polecenie(0)).toMatch(/LaTeX/);
    expect(polecenie(1)).not.toMatch(/LaTeX/);
  });

  /**
   * Pusta odpowiedź znaczy „nic nie rozpoznałem", a nie „wzór jest pusty".
   * Wstawienie pustego napisu do bloku skasowałoby autorowi to, co napisał.
   */
  it('pusta odpowiedź jest błędem, a nie pustym wynikiem', async () => {
    const { rozpoznawacz } = atrapa('   ');
    await expect(rozpoznawacz.recognize(obrazek(), 'latex')).rejects.toThrow(/nie rozpozna/i);
  });

  it('odmowa modelu wychodzi jako czytelny błąd', async () => {
    const chat = vi.fn(async () => { throw new Error('HTTP 400'); });
    await expect(new HandwritingRecognizer(chat).recognize(obrazek(), 'latex'))
      .rejects.toThrow(/HTTP 400/);
  });
});
