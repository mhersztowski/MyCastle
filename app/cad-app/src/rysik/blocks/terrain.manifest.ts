/**
 * Manifest bloku terenu — odpowiednik Q_PROPERTY: klasa opisuje swoje
 * właściwości, a panel, walidacja, serializacja i dokumentacja powstają z tego
 * jednego obiektu. Plik jest czystymi danymi (bez importu Three.js), więc
 * korzysta z niego zarówno edytor, jak i testy oraz render statyczny.
 */

import type { BlockManifest } from '../types';

export const terrainManifest: BlockManifest = {
  type: 'scene3d.terrain',
  version: 1,
  title: 'Teren',
  icon: 'terrain',
  doc: 'Model terenu z cieniowaniem, paletą hipsometryczną i markerami.',

  props: {
    seed: {
      kind: 'number',
      label: 'Ziarno terenu',
      default: 1337,
      range: [1, 9999],
      step: 1,
      precision: 0,
      widget: 'spin',
      group: 'Geometria',
      doc: 'Deterministyczne ziarno generatora wysokości.',
    },
    exaggeration: {
      kind: 'number',
      label: 'Przewyższenie',
      unit: '×',
      default: 1.5,
      range: [0.5, 10],
      step: 0.1,
      widget: 'slider',
      group: 'Geometria',
      pdfDefault: 1.5,
    },
    resolution: {
      kind: 'number',
      label: 'Rozdzielczość siatki',
      default: 96,
      range: [16, 256],
      step: 8,
      precision: 0,
      widget: 'slider',
      group: 'Geometria',
      doc: 'Zmiana przebudowuje siatkę — pozostałe właściwości jej nie ruszają.',
    },
    sunAzimuth: {
      kind: 'quantity',
      label: 'Azymut Słońca',
      unit: 'deg',
      default: 180,
      range: [0, 360],
      wrap: true,
      step: 1,
      precision: 1,
      widget: 'dial',
      group: 'Oświetlenie',
      pdfDefault: 180,
    },
    sunElevation: {
      kind: 'quantity',
      label: 'Wysokość Słońca',
      unit: 'deg',
      default: 35,
      range: [0, 90],
      step: 1,
      precision: 1,
      widget: 'slider',
      group: 'Oświetlenie',
      pdfDefault: 35,
    },
    ambient: {
      kind: 'number',
      label: 'Światło otoczenia',
      default: 0.35,
      range: [0, 1],
      step: 0.05,
      widget: 'slider',
      group: 'Oświetlenie',
    },
    palette: {
      kind: 'enum',
      label: 'Paleta',
      options: ['hypsometric', 'grayscale', 'viridis'],
      default: 'hypsometric',
      widget: 'select',
      group: 'Wygląd',
    },
    showContours: {
      kind: 'bool',
      label: 'Warstwice',
      default: false,
      group: 'Wygląd',
      visibleIf: { palette: { ne: 'grayscale' } },
    },
    contourStep: {
      kind: 'number',
      label: 'Cięcie warstwic',
      unit: 'm',
      default: 50,
      range: [10, 200],
      step: 10,
      precision: 0,
      widget: 'slider',
      group: 'Wygląd',
      visibleIf: { showContours: { eq: true } },
    },
    wireframe: {
      kind: 'bool',
      label: 'Siatka',
      default: false,
      group: 'Wygląd',
    },
    background: {
      kind: 'color',
      label: 'Tło',
      default: '#0f1216',
      widget: 'color',
      group: 'Wygląd',
      sources: ['literal'],
    },
    dataset: {
      kind: 'resource',
      label: 'Model terenu',
      accept: ['image/tiff', 'application/geo+json'],
      default: '',
      group: 'Dane',
      sources: ['literal'],
      doc: 'Ścieżka względna do pliku DEM. Puste — teren proceduralny z ziarna.',
    },
    // Zasięg geograficzny — wiąże współrzędne markerów i zdarzenie `pick`
    // z siatką terenu. Bez niego lat/lon nie miałyby do czego się odnieść.
    west: { kind: 'number', label: 'Zachód', unit: 'deg', default: 18.9, range: [-180, 180], step: 0.0001, precision: 4, group: 'Dane' },
    south: { kind: 'number', label: 'Południe', unit: 'deg', default: 49.55, range: [-90, 90], step: 0.0001, precision: 4, group: 'Dane' },
    east: { kind: 'number', label: 'Wschód', unit: 'deg', default: 19.1, range: [-180, 180], step: 0.0001, precision: 4, group: 'Dane' },
    north: { kind: 'number', label: 'Północ', unit: 'deg', default: 49.75, range: [-90, 90], step: 0.0001, precision: 4, group: 'Dane' },
    maxElevation: {
      kind: 'number',
      label: 'Wysokość maks.',
      unit: 'm',
      default: 1200,
      range: [100, 9000],
      step: 50,
      precision: 0,
      widget: 'spin',
      group: 'Dane',
    },
  },

  children: {
    markers: {
      kind: 'marker',
      label: 'Markery',
      props: {
        label: { kind: 'string', label: 'Podpis', default: 'Marker', widget: 'text' },
        lon: { kind: 'number', label: 'Długość geogr.', default: 0, range: [-180, 180], step: 0.0001, precision: 4 },
        lat: { kind: 'number', label: 'Szerokość geogr.', default: 0, range: [-90, 90], step: 0.0001, precision: 4 },
        color: { kind: 'color', label: 'Kolor', default: '#ff5252', widget: 'color', sources: ['literal'] },
        showLabel: { kind: 'bool', label: 'Pokaż podpis', default: true },
      },
    },
  },

  events: {
    pick: { payload: '{ lat: number, lon: number, elevation: number }' },
    cameraChanged: { payload: 'CameraState', throttle: 100 },
  },

  selectable: ['marker'],
};
