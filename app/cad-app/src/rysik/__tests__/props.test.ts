import { describe, expect, it } from 'vitest';
import { terrainManifest } from '../blocks/terrain.manifest';
import {
  blockDeps,
  coerceValue,
  defaultProps,
  expr,
  groupProps,
  isVisible,
  literal,
  ref,
  resolveProps,
  resolveStaticProps,
  validateProps,
  varsToScope,
} from '../props';
import type { DocVar } from '../types';

const vars: DocVar[] = [
  { name: 'azimuth', value: 210 },
  { name: 'dayOfYear', value: 172 },
];

describe('wartości domyślne i walidacja z manifestu', () => {
  it('tworzy komplet wartości domyślnych', () => {
    const props = defaultProps(terrainManifest.props);
    expect(Object.keys(props)).toEqual(Object.keys(terrainManifest.props));
    expect(props.exaggeration).toEqual(literal(1.5));
  });

  it('sprowadza wartości do dziedziny właściwości', () => {
    const { exaggeration, sunAzimuth, palette, showContours } = terrainManifest.props;
    expect(coerceValue(exaggeration, 99)).toBe(10);
    expect(coerceValue(exaggeration, 'abc')).toBe(1.5);
    expect(coerceValue(sunAzimuth, 375)).toBe(15);       // wrap
    expect(coerceValue(sunAzimuth, -10)).toBe(350);
    expect(coerceValue(palette, 'nieznana')).toBe('hypsometric');
    expect(coerceValue(showContours, 'true')).toBe(true);
  });

  it('zgłasza błędy walidacji', () => {
    const issues = validateProps(terrainManifest.props, {
      ...defaultProps(terrainManifest.props),
      exaggeration: literal(50),
      palette: literal('brak'),
      sunElevation: expr('sin('),
    });
    expect(issues.map(i => i.key).sort()).toEqual(['exaggeration', 'palette', 'sunElevation']);
  });

  it('grupuje pola w kolejności deklaracji', () => {
    expect(groupProps(terrainManifest.props).map(g => g.group))
      .toEqual(['Geometria', 'Oświetlenie', 'Wygląd', 'Dane']);
  });
});

describe('visibleIf', () => {
  it('ukrywa pole zależnie od innej właściwości', () => {
    const spec = terrainManifest.props.showContours;
    expect(isVisible(spec.visibleIf, { palette: 'grayscale' })).toBe(false);
    expect(isVisible(spec.visibleIf, { palette: 'viridis' })).toBe(true);
    expect(isVisible(terrainManifest.props.contourStep.visibleIf, { showContours: false })).toBe(false);
  });
});

describe('rozwiązywanie ref/expr', () => {
  const scope = varsToScope(vars);

  it('bierze wartość ze zmiennej dokumentu', () => {
    const props = { ...defaultProps(terrainManifest.props), sunAzimuth: ref('azimuth') };
    expect(resolveProps(terrainManifest.props, props, scope).sunAzimuth).toBe(210);
  });

  it('liczy wyrażenie i przycina do zakresu', () => {
    const props = { ...defaultProps(terrainManifest.props), exaggeration: expr('azimuth / 10') };
    expect(resolveProps(terrainManifest.props, props, scope).exaggeration).toBe(10); // 21 → clamp
  });

  it('wraca do domyślnej przy nieznanej zmiennej — scena musi się wyrenderować', () => {
    const props = { ...defaultProps(terrainManifest.props), sunAzimuth: ref('nieistnieje') };
    expect(resolveProps(terrainManifest.props, props, scope).sunAzimuth).toBe(180);
  });

  it('render statyczny używa pdfDefault dla wiązań', () => {
    const props = { ...defaultProps(terrainManifest.props), sunAzimuth: ref('azimuth') };
    expect(resolveStaticProps(terrainManifest.props, props, scope).sunAzimuth).toBe(180);
  });

  it('zbiera zależności bloku', () => {
    const props = {
      ...defaultProps(terrainManifest.props),
      sunAzimuth: ref('azimuth'),
      sunElevation: expr('solarElevation(dayOfYear, 12, 49.6)'),
    };
    expect(blockDeps(terrainManifest, props)).toEqual(['azimuth', 'dayOfYear']);
  });
});
