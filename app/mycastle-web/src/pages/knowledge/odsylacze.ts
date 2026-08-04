/**
 * odsylacze.ts — treść celu odsyłacza z dokumentu źródłowego.
 *
 * Dymek pod odsyłaczem pokazuje **to samo**, co stoi w treści: ten sam wzór,
 * rysunek albo hasło. Żeby to zrobić, trzeba wyjąć z pliku odpowiedni blok —
 * a bloki różnią się rodzajem.
 */
import type { ReferenceKind } from '@mhersztowski/sci-core';

/** Rodzaje, które mają w dokumencie własny blok. */
const FENCE_KIND: Partial<Record<ReferenceKind, string>> = {
  formula: 'formula',
  term: 'term',
  figure: 'figure',
  table: 'table',
};

/** Znaki, które w identyfikatorze znaczą siebie, a w wyrażeniu regularnym co innego. */
const escape = (tekst: string) => tekst.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Wyrażenie znajdujące blok danego rodzaju o zadanym identyfikatorze.
 *
 * Rodzaj wybiera **rodzaj bloku**: wcześniej wszystko poza hasłem szło przez
 * wyrażenie szukające ```formula, więc odsyłacz do rysunku nigdy nie trafiał
 * i dymek pokazywał pustkę. Nieznany rodzaj (np. `section`, który jest
 * nagłówkiem, a nie blokiem) nie ma czego szukać — dostaje wyrażenie, które
 * celowo nic nie dopasuje.
 */
export function blockFenceFor(kind: ReferenceKind | undefined, id: string): RegExp {
  const fence = FENCE_KIND[kind ?? 'formula'];
  if (!fence) return /(?!)/;

  // Koniec identyfikatora domykamy nową linią — inaczej „eq6" dopasowałoby się
  // do bloku „eq60" i podglądem byłby cudzy wzór.
  return new RegExp(`\`\`\`${fence}:${escape(id)}\\n([\\s\\S]*?)\`\`\``);
}
