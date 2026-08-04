/**
 * przyklady.ts — po jednym dokumencie na każdy tryb.
 *
 * Piaskownica bez przykładów uczy tylko obsługi suwaków. Każdy z tych czterech
 * dokumentów jest dobrany tak, żeby pokazywał, **czego inne tryby nie potrafią**:
 * kotwice trzymają róg przy zmianie okna, przepływ dzieli nadwyżkę, więzy
 * pozwalają ciągnąć myszą to, co i tak zostaje wyrównane. Statyczny jest po to,
 * żeby było widać, ile z tego bierze się z samych wyrażeń.
 */
import { lit, expr, type LayoutDoc } from '@mhersztowski/layout';

export interface Przyklad {
  nazwa: string;
  /** Co konkretnie zrobić, żeby zobaczyć różnicę. */
  wskazowka: string;
  doc: LayoutDoc;
}

export const PRZYKLADY: Przyklad[] = [
  {
    nazwa: 'Statyczny — wyrażenia i parametry',
    wskazowka: 'Przesuń suwak „margines". Trzy kafle są opisane jeden przez drugi, '
      + 'więc zmiana jednej liczby przestawia wszystkie.',
    doc: {
      mode: 'static',
      viewport: { width: 640, height: 400 },
      vars: { margines: 20, kafel: 140 },
      shapes: [
        { id: 'a', label: 'a', x: expr('margines'), y: expr('margines'), w: expr('kafel'), h: lit(90) },
        { id: 'b', label: 'b', x: expr('a.x + a.w + margines'), y: expr('a.y'), w: expr('kafel'), h: lit(90) },
        { id: 'c', label: 'c', x: expr('b.x + b.w + margines'), y: expr('a.y'), w: expr('kafel'), h: lit(90) },
        { id: 'stopka', label: 'stopka', x: expr('margines'), y: expr('a.y + a.h + margines'),
          w: expr('c.x + c.w - margines'), h: lit(60) },
      ],
    },
  },
  {
    nazwa: 'Kotwice — jak w Godocie',
    wskazowka: 'Zmieniaj szerokość i wysokość obszaru. Pasek rozciąga się, przycisk trzyma '
      + 'się prawego dolnego rogu, a panel boczny zostaje przy lewej krawędzi.',
    doc: {
      mode: 'anchor',
      viewport: { width: 640, height: 400 },
      vars: {},
      shapes: [
        {
          id: 'pasek', label: 'pasek tytułu', x: lit(0), y: lit(0), w: lit(0), h: lit(0),
          anchor: { minX: 0, maxX: 1, minY: 0, maxY: 0, offsetLeft: 8, offsetTop: 8, offsetRight: -8, offsetBottom: 48 },
        },
        {
          id: 'bok', label: 'panel boczny', x: lit(0), y: lit(0), w: lit(0), h: lit(0),
          anchor: { minX: 0, maxX: 0, minY: 0, maxY: 1, offsetLeft: 8, offsetTop: 56, offsetRight: 168, offsetBottom: -8 },
        },
        {
          id: 'tresc', label: 'treść', x: lit(0), y: lit(0), w: lit(0), h: lit(0),
          anchor: { minX: 0, maxX: 1, minY: 0, maxY: 1, offsetLeft: 176, offsetTop: 56, offsetRight: -8, offsetBottom: -56 },
        },
        {
          id: 'ok', label: 'OK', x: lit(0), y: lit(0), w: lit(0), h: lit(0),
          anchor: { minX: 1, maxX: 1, minY: 1, maxY: 1, offsetLeft: -96, offsetTop: -40, offsetRight: -8, offsetBottom: -8 },
        },
      ],
    },
  },
  {
    nazwa: 'Przepływ — jak flex',
    wskazowka: 'Zwężaj obszar. Pola z „grow" oddają i biorą miejsce, pole o stałej '
      + 'szerokości zostaje takie samo. Spróbuj przeciągnąć kafel — nie da się, i to jest sedno.',
    doc: {
      mode: 'flow',
      viewport: { width: 640, height: 400 },
      vars: {},
      shapes: [
        {
          id: 'okno', label: 'okno', x: lit(20), y: lit(20), w: expr('viewport.w - 40'), h: expr('viewport.h - 40'),
          container: { direction: 'column', gap: 12, padding: 12, align: 'stretch' },
        },
        { id: 'naglowek', label: 'nagłówek', parent: 'okno', x: lit(0), y: lit(0), w: lit(0), h: lit(48) },
        {
          id: 'srodek', label: 'środek', parent: 'okno', x: lit(0), y: lit(0), w: lit(0), h: lit(0),
          flow: { grow: 1 }, container: { direction: 'row', gap: 12, padding: 0, align: 'stretch' },
        },
        { id: 'lewa', label: 'lewa (stała 160)', parent: 'srodek', x: lit(0), y: lit(0), w: lit(160), h: lit(0) },
        { id: 'prawa', label: 'prawa (grow 1)', parent: 'srodek', x: lit(0), y: lit(0), w: lit(80), h: lit(0), flow: { grow: 1 } },
        { id: 'stopka', label: 'stopka', parent: 'okno', x: lit(0), y: lit(0), w: lit(0), h: lit(40) },
      ],
    },
  },
  {
    nazwa: 'Więzy — jak w szkicu CAD',
    wskazowka: 'Chwyć „b" i pociągnij. Zostanie wyrównane do lewej z „a" i w odległości '
      + '„odstep" w pionie — ruszy się tylko to, co może. Potem przesuń suwak „odstep".',
    doc: {
      mode: 'constraint',
      viewport: { width: 640, height: 400 },
      vars: { odstep: 120 },
      shapes: [
        { id: 'a', label: 'a (przypięty)', x: lit(60), y: lit(60), w: lit(160), h: lit(60) },
        { id: 'b', label: 'b', x: lit(260), y: lit(220), w: lit(100), h: lit(60) },
        { id: 'c', label: 'c', x: lit(400), y: lit(300), w: lit(120), h: lit(60) },
      ],
      constraints: [
        { id: 'w1', type: 'fixed', refs: ['a'] },
        { id: 'w2', type: 'alignLeft', refs: ['a', 'b'] },
        { id: 'w3', type: 'distanceY', refs: ['a', 'b'], value: expr('odstep') },
        { id: 'w4', type: 'sameWidth', refs: ['b', 'c'] },
      ],
    },
  },
];

/** Kopia głęboka — piaskownica ma pozwalać psuć przykłady bez konsekwencji. */
export const kopia = (doc: LayoutDoc): LayoutDoc => JSON.parse(JSON.stringify(doc)) as LayoutDoc;
