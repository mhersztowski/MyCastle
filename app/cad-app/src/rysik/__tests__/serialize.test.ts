/**
 * Test round-tripu pisany przed panelem — jeśli `serialize(parse(x)) !== x`,
 * użytkownik po każdym otwarciu i zamknięciu pliku dostaje diff i przestaje
 * ufać narzędziu w tydzień.
 */

import { describe, expect, it } from 'vitest';
import {
  allBlocks,
  createBlock,
  createChild,
  parseDocument,
  serializeBlock,
  serializeDocument,
} from '../serialize';
import { terrainManifest } from '../blocks/terrain.manifest';
import { chartManifest } from '../blocks/chart.manifest';
import { allManifests } from '../blocks/registry';
import { expr, literal, quantizeProp, ref } from '../props';
import type { BlockManifest, BlockNode, RysikDoc } from '../types';

const DOC = `---
title: Beskid Śląski
---

Tekst wprowadzenia z odsyłaczem do @fig-wisla.

\`\`\`{.rysik-vars}
- {name: azimuth, label: Azymut, value: 210, min: 0, max: 360, step: 1}
- {name: dayOfYear, value: 172}
\`\`\`

Przy przewyższeniu sterowanym suwakiem teren wygląda tak:

\`\`\`{.scene3d-terrain}
#| label: fig-wisla
#| fig-cap: "Model terenu Beskidu Śląskiego z cieniowaniem."

exaggeration: 2.4
palette: viridis
showContours: true
sunAzimuth: {ref: azimuth}
sunElevation: {expr: solarElevation(dayOfYear, 14, 49.6)}
dataset: ./data/wisla-dem.tif
markers:
  - id: barania
    label: Barania Góra
    lon: 19.0025
    lat: 49.6089
  - id: skrzyczne
    label: Skrzyczne
    lon: 19.0361
    lat: 49.6828
    color: "#42a5f5"
camera:
  position: [1240.5, 890, 2100.3]
  target: [0, 0, 0]
  fov: 45
\`\`\`

Tekst zamykający.
`;

describe('parseDocument / serializeDocument', () => {
  it('czyta nagłówek, markdown, zmienne i blok', () => {
    const doc = parseDocument(DOC);
    expect(doc.frontmatter).toBe('title: Beskid Śląski');
    expect(doc.vars.map(v => v.name)).toEqual(['azimuth', 'dayOfYear']);
    expect(doc.vars[0]).toMatchObject({ label: 'Azymut', value: 210, min: 0, max: 360, step: 1 });

    const blocks = allBlocks(doc);
    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    expect(block.type).toBe('scene3d.terrain');
    expect(block.label).toBe('fig-wisla');
    expect(block.caption).toBe('Model terenu Beskidu Śląskiego z cieniowaniem.');
    expect(block.props.exaggeration).toEqual(literal(2.4));
    expect(block.props.palette).toEqual(literal('viridis'));
    expect(block.props.sunAzimuth).toEqual({ src: 'ref', name: 'azimuth' });
    expect(block.props.sunElevation).toEqual({
      src: 'expr',
      code: 'solarElevation(dayOfYear, 14, 49.6)',
      deps: ['dayOfYear'],
    });
  });

  it('zachowuje markery jako dzieci wraz z identyfikatorami', () => {
    const block = allBlocks(parseDocument(DOC))[0];
    const markers = block.children.markers;
    expect(markers.map(m => m.id)).toEqual(['barania', 'skrzyczne']);
    expect(markers[0].props.lon).toEqual(literal(19.0025));
    expect(markers[1].props.color).toEqual(literal('#42a5f5'));
    // Domyślne wartości uzupełniane z manifestu, choć w pliku ich nie było.
    expect(markers[0].props.showLabel).toEqual(literal(true));
  });

  it('przepuszcza nieznane klucze (kamera) bez zmian', () => {
    const block = allBlocks(parseDocument(DOC))[0];
    expect(block.extras).toEqual([
      ['camera', { position: [1240.5, 890, 2100.3], target: [0, 0, 0], fov: 45 }],
    ]);
  });

  it('round-trip jest stabilny dla pliku zapisanego przez narzędzie', () => {
    const canonical = serializeDocument(parseDocument(DOC));
    expect(serializeDocument(parseDocument(canonical))).toBe(canonical);
    // Drugi przebieg nie może niczego dokładać ani przestawiać.
    expect(serializeDocument(parseDocument(serializeDocument(parseDocument(canonical))))).toBe(canonical);
  });

  it('nie zapisuje wartości domyślnych', () => {
    const block = createBlock(terrainManifest);
    block.props.exaggeration = literal(3);
    const text = serializeBlock(block);
    expect(text).toContain('exaggeration: 3');
    expect(text).not.toContain('palette:');
    expect(text).not.toContain('ambient:');
  });

  it('kwantyzuje liczby wg precyzji z manifestu', () => {
    const block = createBlock(terrainManifest);
    block.props.sunAzimuth = literal(180.123456);   // precision: 1
    block.props.resolution = literal(97.6);          // precision: 0
    const parsed = allBlocks(parseDocument(serializeBlock(block)))[0];
    expect(parsed.props.sunAzimuth).toEqual(literal(180.1));
    expect(parsed.props.resolution).toEqual(literal(98));
  });

  it('zawija azymut i przycina zakresy przy wczytywaniu', () => {
    const doc = parseDocument([
      '```{.scene3d-terrain}',
      'sunAzimuth: 400',
      'exaggeration: 99',
      'palette: nieznana',
      '```',
    ].join('\n'));
    const block = allBlocks(doc)[0];
    expect(block.props.sunAzimuth).toEqual(literal(40));      // wrap 0–360
    expect(block.props.exaggeration).toEqual(literal(10));    // clamp 0.5–10
    expect(block.props.palette).toEqual(literal('hypsometric'));
  });

  it('zostawia nieznane bloki kodu w markdownie', () => {
    const src = ['```{python}', 'print(1)', '```', '', 'tekst'].join('\n');
    const doc = parseDocument(src);
    expect(allBlocks(doc)).toHaveLength(0);
    expect(serializeDocument(doc)).toBe(src);
  });
});

// ─────────────────────────────────────────── test własnościowy

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBlock(manifest: BlockManifest, rnd: () => number, idx: number): BlockNode {
  const block = createBlock(manifest);
  block.uid = `uid-${idx}`;
  if (rnd() < 0.6) block.label = `fig-${idx}`;
  if (rnd() < 0.5) block.caption = `Podpis ${idx}: liczby, znaki "cudzysłów" i: dwukropek`;

  for (const [key, spec] of Object.entries(manifest.props)) {
    const roll = rnd();
    if (roll < 0.25) continue;                       // zostaje domyślna
    if (roll < 0.35 && spec.sources === undefined) {
      block.props[key] = ref(`v${Math.floor(rnd() * 3)}`);
      continue;
    }
    if (roll < 0.45 && spec.sources === undefined) {
      block.props[key] = expr(`v0 * ${Math.floor(rnd() * 5) + 1} + 2`);
      continue;
    }
    switch (spec.kind) {
      case 'number':
      case 'quantity': {
        const [lo, hi] = spec.range ?? [0, 100];
        block.props[key] = literal(quantizeProp(spec, lo + rnd() * (hi - lo)));
        break;
      }
      case 'enum':
        block.props[key] = literal(spec.options[Math.floor(rnd() * spec.options.length)]);
        break;
      case 'bool':
        block.props[key] = literal(rnd() < 0.5);
        break;
      case 'color':
        block.props[key] = literal(`#${Math.floor(rnd() * 0xffffff).toString(16).padStart(6, '0')}`);
        break;
      default:
        block.props[key] = literal(rnd() < 0.5 ? `tekst ${idx}` : './dane/plik.tif');
        break;
    }
  }

  for (const [collection, spec] of Object.entries(manifest.children ?? {})) {
    const count = Math.floor(rnd() * 3);
    block.children[collection] = Array.from({ length: count }, (_, i) => {
      const child = createChild(spec, `${spec.kind}-${idx}-${i}`);
      for (const [key, propSpec] of Object.entries(spec.props)) {
        if (rnd() < 0.3) continue;
        if (propSpec.kind === 'number' || propSpec.kind === 'quantity') {
          const [lo, hi] = propSpec.range ?? [0, 1];
          child.props[key] = literal(quantizeProp(propSpec, lo + rnd() * (hi - lo)));
        } else if (propSpec.kind === 'bool') {
          child.props[key] = literal(rnd() < 0.5);
        } else {
          child.props[key] = literal(`etykieta ${i}`);
        }
      }
      return child;
    });
  }

  if (rnd() < 0.4) {
    block.extras.push(['camera', { position: [1.5, 2, 3.25], target: [0, 0, 0], fov: 45 }]);
  }
  return block;
}

describe('round-trip własnościowy', () => {
  it('losowe dokumenty przechodzą parse→serialize bez zmian', () => {
    const manifests = allManifests();
    for (let seed = 1; seed <= 60; seed++) {
      const rnd = mulberry32(seed);
      const blocks = Array.from({ length: 1 + Math.floor(rnd() * 3) }, (_, i) =>
        randomBlock(manifests[Math.floor(rnd() * manifests.length)], rnd, i));

      const doc: RysikDoc = {
        frontmatter: seed % 3 === 0 ? 'title: Test' : '',
        segments: [
          { kind: 'vars' },
          ...blocks.flatMap(block => [
            { kind: 'markdown' as const, text: `\nAkapit przed blokiem ${block.uid}.\n` },
            { kind: 'block' as const, block },
          ]),
        ],
        vars: [
          { name: 'v0', value: 1.5, min: 0, max: 10, step: 0.1 },
          { name: 'v1', value: 2, label: 'Druga' },
          { name: 'v2', value: 3 },
        ],
      };

      const canonical = serializeDocument(doc);
      const again = serializeDocument(parseDocument(canonical));
      expect(again, `seed ${seed}`).toBe(canonical);
    }
  });

  it('wartości bloku przeżywają round-trip', () => {
    const rnd = mulberry32(7);
    const block = randomBlock(chartManifest, rnd, 0);
    const parsed = allBlocks(parseDocument(serializeBlock(block)))[0];
    for (const key of Object.keys(chartManifest.props)) {
      expect(parsed.props[key], key).toEqual(block.props[key]);
    }
    expect(parsed.children.bars.map(b => b.id)).toEqual(block.children.bars.map(b => b.id));
  });
});
