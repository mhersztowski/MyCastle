/**
 * Manifest wykresu słupkowego. Drugi typ bloku istnieje po to, żeby wspólny
 * interfejs (`SceneBlock`, generator panelu, serializacja) był wyciągnięty
 * z dwóch działających przypadków, a nie wymyślony z jednego.
 */

import type { BlockManifest } from '../types';

export const chartManifest: BlockManifest = {
  type: 'chart.bars',
  version: 1,
  title: 'Wykres słupkowy',
  icon: 'chart',
  doc: 'Wykres słupkowy rysowany na canvasie 2D — serie liczbowe w ciele bloku.',

  props: {
    title: {
      kind: 'string',
      label: 'Tytuł',
      default: '',
      widget: 'text',
      group: 'Opis',
    },
    unit: {
      kind: 'string',
      label: 'Jednostka osi Y',
      default: '',
      widget: 'text',
      group: 'Opis',
    },
    orientation: {
      kind: 'enum',
      label: 'Układ',
      options: ['vertical', 'horizontal'],
      default: 'vertical',
      widget: 'radio',
      group: 'Układ',
    },
    scale: {
      kind: 'number',
      label: 'Skala wartości',
      default: 1,
      range: [0.1, 10],
      step: 0.1,
      widget: 'slider',
      group: 'Układ',
      pdfDefault: 1,
    },
    gap: {
      kind: 'number',
      label: 'Odstęp słupków',
      unit: 'px',
      default: 8,
      range: [0, 40],
      step: 1,
      precision: 0,
      widget: 'slider',
      group: 'Układ',
    },
    palette: {
      kind: 'enum',
      label: 'Paleta',
      options: ['steel', 'warm', 'mono'],
      default: 'steel',
      widget: 'select',
      group: 'Wygląd',
    },
    showGrid: {
      kind: 'bool',
      label: 'Siatka',
      default: true,
      group: 'Wygląd',
    },
    showValues: {
      kind: 'bool',
      label: 'Wartości nad słupkami',
      default: false,
      group: 'Wygląd',
      visibleIf: { orientation: { eq: 'vertical' } },
    },
    background: {
      kind: 'color',
      label: 'Tło',
      default: '#0f1216',
      widget: 'color',
      group: 'Wygląd',
      sources: ['literal'],
    },
  },

  children: {
    bars: {
      kind: 'bar',
      label: 'Słupki',
      props: {
        label: { kind: 'string', label: 'Etykieta', default: 'Seria', widget: 'text' },
        value: { kind: 'number', label: 'Wartość', default: 1, range: [-1e6, 1e6], step: 0.1, precision: 3 },
      },
    },
  },

  events: {
    pick: { payload: '{ id: string, label: string, value: number }' },
  },

  selectable: ['bar'],
};
