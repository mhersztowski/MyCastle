/**
 * Wspólny rdzeń bloku skryptu automatyzacji — części niezależne od TipTapa.
 *
 * Wydzielone stąd, bo z tego samego edytora korzystają dwa miejsca: blok
 * ```automate``` w edytorze markdown (NodeView) i logika akcji w Edytorze
 * Konwersacji (Aura). Jeden zestaw funkcji = jedno zachowanie skryptu
 * niezależnie od tego, skąd został otwarty.
 */

import React from 'react';
import {
  Box, List, ListItem, ListItemText, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from '@mui/material';
import type { Monaco } from '@monaco-editor/react';

import { setupAutomateMonaco, mergeExtraLibs } from '../../../modules/automate/designer/automateMonacoSetup';
import { LIBRARIES, parseLibrariesFromCode } from './automateLibraries';
import type { DisplayItem } from './AutomateDocumentContext';

const DISPLAY_API_TYPES = `
/**
 * API wyswietlania wynikow w panelu output bloku skryptowego.
 * Dostepne tylko w blokach skryptowych osadzonych w markdown.
 */
interface DisplayApi {
  /**
   * Wyswietl tekst w panelu output.
   * @param str - Tekst do wyswietlenia
   * @example display.text('Wynik: 42');
   */
  text(str: string): void;

  /**
   * Wyswietl tabele w panelu output.
   * @param data - Tablica obiektow lub tablica tablic
   * @example
   * display.table([
   *   { imie: 'Jan', wiek: 30 },
   *   { imie: 'Anna', wiek: 25 },
   * ]);
   */
  table(data: Record<string, any>[] | any[][]): void;

  /**
   * Wyswietl liste w panelu output.
   * @param items - Tablica elementow
   * @example display.list(['Element 1', 'Element 2', 'Element 3']);
   */
  list(items: any[]): void;

  /**
   * Wyswietl sformatowany JSON w panelu output.
   * @param obj - Obiekt do wyswietlenia
   * @example display.json({ klucz: 'wartosc', nested: { a: 1 } });
   */
  json(obj: any): void;

  /**
   * Wyswietl surowy fragment HTML. Renderowany przez dangerouslySetInnerHTML.
   * @param markup - String HTML do wyswietlenia
   * @example display.html('<div style="color:red">Alert!</div>');
   */
  html(markup: string): void;

  /**
   * Zamontuj zywy element DOM (z animacjami, event handlerami).
   * Idealny dla Three.js — przekaz \`renderer.domElement\` zeby zachowac
   * animacje w trybie HTML widoku.
   * @param element - HTMLElement do zamontowania
   * @example
   * const r = new THREE.WebGLRenderer();
   * r.setSize(400, 300);
   * r.setAnimationLoop(() => r.render(scene, camera));
   * display.dom(r.domElement);
   */
  dom(element: HTMLElement): void;
}

/**
 * API wyswietlania wynikow - renderuje dane bezposrednio pod blokiem skryptowym.
 *
 * Dostepne metody:
 * - \`display.text(str)\` - tekst
 * - \`display.table(data)\` - tabela
 * - \`display.list(items)\` - lista
 * - \`display.json(obj)\` - sformatowany JSON
 * - \`display.html(markup)\` - raw HTML
 * - \`display.dom(element)\` - zywy element DOM (np. canvas Three.js)
 */
declare const display: DisplayApi;
`;

/**
 * Register Automate API + `display` API types so Monaco offers completions
 * for `api.*`, `input`, `variables`, and `display.*` inside the script
 * dialog. Goes through the merge helper so we don't wipe out libs added by
 * other plugins (TypeScriptIntelliSensePlugin in particular). Safe to call
 * on every `beforeMount` — the merge is idempotent.
 */
export function setupAutomateMonacoWithDisplay(monaco: Monaco): void {
  setupAutomateMonaco(monaco);
  mergeExtraLibs(monaco, new Map([
    ['file:///automate-display-api.d.ts', DISPLAY_API_TYPES],
  ]));
}

/**
 * Pull in the .d.ts stubs for every library referenced by `// @library: foo`
 * in the current code. Re-uses the same model-based registration as the
 * Automate API types so re-registering is a no-op (no worker restart) when
 * the same set of libraries comes back. Called from the Monaco editor's
 * `onMount` and after each user edit that might add a new marker.
 */
export function registerLibraryTypes(monaco: Monaco, code: string): void {
  const libs = parseLibrariesFromCode(code);
  if (libs.length === 0) return;
  const map = new Map<string, string>();
  for (const libId of libs) {
    const entry = LIBRARIES[libId];
    if (entry) map.set(entry.typesDtsPath, entry.typesDtsContent);
  }
  if (map.size > 0) mergeExtraLibs(monaco, map);
}

// ── Embedded-file helpers ──────────────────────────────────────────────────
// Parses blocks delimited by the markers that AutomateIncludeFileDialog and
// handleIncludeImport insert, so the "Included" tab can list them and let the
// author remove specific blocks in one click.
//
// Inline include markers (inserted by AutomateIncludeFileDialog):
//   // ─── included: PATH ───
//   <file content>
//   // ----- PATH
//
// Module import markers (inserted by handleIncludeImport):
//   // ─── import: PATH ───
//   const xModule = await import('url');
//   const { … } = xModule;
//   // ----- import PATH

export interface EmbeddedFile {
  path: string;
  type: 'included' | 'import';
  startLine: number;   // index of the opening marker line
  endLine: number;     // index of the closing marker line
}

export function parseEmbeddedFiles(code: string): EmbeddedFile[] {
  if (!code) return [];
  const lines = code.split('\n');
  const result: EmbeddedFile[] = [];
  const BOX = '─'; // ─ (U+2500 BOX DRAWINGS LIGHT HORIZONTAL)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Inline include start: // ─── included: PATH ───
    const incMatch = line.match(new RegExp(`^// ${BOX}{3} included: (.+?) ${BOX}{3}\\s*$`));
    if (incMatch) {
      const path = incMatch[1];
      const endMarker = `// ----- ${path}`;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trimEnd() === endMarker) {
          result.push({ path, type: 'included', startLine: i, endLine: j });
          break;
        }
      }
      continue;
    }

    // Module import start: // ─── import: PATH ───
    const impMatch = line.match(new RegExp(`^// ${BOX}{3} import: (.+?) ${BOX}{3}\\s*$`));
    if (impMatch) {
      const path = impMatch[1];
      const endMarker = `// ----- import ${path}`;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trimEnd() === endMarker) {
          result.push({ path, type: 'import', startLine: i, endLine: j });
          break;
        }
      }
    }
  }

  return result;
}

// Remove the lines from startLine to endLine inclusive, plus any empty line
// immediately preceding the block (the snippet is inserted with a leading \n).
export function removeEmbeddedBlock(code: string, file: EmbeddedFile): string {
  const lines = code.split('\n');
  let from = file.startLine;
  if (from > 0 && lines[from - 1].trim() === '') from--;
  return [...lines.slice(0, from), ...lines.slice(file.endLine + 1)].join('\n');
}

// ── Blockly persistence + runtime combination ────────────────────────────────
// The Blockly side (block layout + the JS it generates) is stored OUT of the
// visible script, in a trailing `//@blockly <base64>` comment marker holding
// `{ s: workspaceState, c: generatedCode }`. The code editor only ever shows
// the user's *normal* hand-written body — Blockly never overwrites it. At run
// time the two are combined (`buildRuntimeCode`): the Blockly-generated code is
// concatenated with the normal body. External libraries (`// @library: …`) live
// only in the normal body and so appear once in the combined runtime code.
const BLOCKLY_MARKER_RE = /\n*\/\/@blockly\s+([A-Za-z0-9+/=]+)\s*$/;

export interface BlocklySplit { body: string; state: string | null; blocklyCode: string }

/** Splits script text into the normal body and the stored Blockly state + generated code. */
export function splitBlockly(full: string): BlocklySplit {
  const m = full.match(BLOCKLY_MARKER_RE);
  if (!m || m.index === undefined) return { body: full, state: null, blocklyCode: '' };
  let state: string | null = null;
  let blocklyCode = '';
  try {
    const json = decodeURIComponent(escape(atob(m[1])));
    const obj = JSON.parse(json) as { s?: string | null; c?: string; blocks?: unknown; languageVersion?: unknown };
    if (obj && (obj.s !== undefined || obj.c !== undefined)) {
      state = obj.s ?? null;
      blocklyCode = obj.c ?? '';
    } else if (obj && (obj.blocks !== undefined || obj.languageVersion !== undefined)) {
      // Legacy marker: the payload was the raw workspace state (generated code
      // lived inline in the body back then). Keep the layout editable.
      state = json;
    }
  } catch { /* malformed marker → ignore */ }
  return { body: full.slice(0, m.index).replace(/\n+$/, ''), state, blocklyCode };
}

/** Re-attaches the Blockly marker to a normal body (no-op when there's nothing to store). */
export function joinBlockly(body: string, state: string | null, blocklyCode: string): string {
  if (!state && !blocklyCode) return body;
  try {
    const payload = JSON.stringify({ s: state ?? null, c: blocklyCode ?? '' });
    return `${body}\n//@blockly ${btoa(unescape(encodeURIComponent(payload)))}`;
  } catch { return body; }
}

/** The actual script to execute: the normal body first (it usually declares the
 *  classes/functions/setup), then the Blockly-generated code which uses them.
 *  Body-first avoids `class`/`const` temporal-dead-zone errors when the blocks
 *  reference something defined in the normal code. */
export function buildRuntimeCode(full: string): string {
  const { body, blocklyCode } = splitBlockly(full);
  if (!blocklyCode) return body;
  return body ? `${body}\n${blocklyCode}` : blocklyCode;
}

// Komponent renderujacy wyniki display
export const DisplayOutput: React.FC<{ items: DisplayItem[] }> = ({ items }) => {
  if (items.length === 0) return null;

  return (
    <Box sx={{ p: 1 }}>
      {items.map((item) => {
        switch (item.type) {
          case 'text':
            return (
              <Typography key={item.id} variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                {String(item.data)}
              </Typography>
            );

          case 'table': {
            const data = item.data as Record<string, unknown>[] | unknown[][];
            if (!Array.isArray(data) || data.length === 0) return null;

            // Detect if array of objects or array of arrays
            const isObjectArray = typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0]);
            const headers = isObjectArray
              ? Object.keys(data[0] as Record<string, unknown>)
              : (data[0] as unknown[]).map((_, idx) => `${idx}`);

            return (
              <Table key={item.id} size="small" sx={{ my: 0.5 }}>
                <TableHead>
                  <TableRow>
                    {headers.map((h, hi) => (
                      <TableCell key={hi} sx={{ fontWeight: 600, fontSize: '0.75rem', py: 0.5 }}>
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.map((row, ri) => (
                    <TableRow key={ri}>
                      {isObjectArray
                        ? headers.map((h, hi) => (
                            <TableCell key={hi} sx={{ fontSize: '0.75rem', py: 0.25 }}>
                              {String((row as Record<string, unknown>)[h] ?? '')}
                            </TableCell>
                          ))
                        : (row as unknown[]).map((cell, ci) => (
                            <TableCell key={ci} sx={{ fontSize: '0.75rem', py: 0.25 }}>
                              {String(cell ?? '')}
                            </TableCell>
                          ))
                      }
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            );
          }

          case 'list': {
            const listItems = item.data as unknown[];
            if (!Array.isArray(listItems)) return null;

            return (
              <List key={item.id} dense disablePadding sx={{ my: 0.5 }}>
                {listItems.map((li, idx) => (
                  <ListItem key={idx} disablePadding sx={{ pl: 1 }}>
                    <ListItemText
                      primary={String(li)}
                      primaryTypographyProps={{ variant: 'body2', fontFamily: 'monospace' }}
                    />
                  </ListItem>
                ))}
              </List>
            );
          }

          case 'json':
            return (
              <Box
                key={item.id}
                sx={{
                  bgcolor: '#f5f5f5',
                  borderRadius: 0.5,
                  p: 1,
                  my: 0.5,
                  overflow: 'auto',
                  maxHeight: 200,
                }}
              >
                <Typography
                  variant="body2"
                  component="pre"
                  sx={{ fontFamily: 'monospace', fontSize: '0.75rem', m: 0, whiteSpace: 'pre-wrap' }}
                >
                  {JSON.stringify(item.data, null, 2)}
                </Typography>
              </Box>
            );

          case 'html':
            // `display.html(str)` — raw HTML rendered as-is. Trusted input (the
            // author wrote it themselves), so dangerouslySetInnerHTML is OK.
            return (
              <Box
                key={item.id}
                sx={{ my: 0.5, p: 0.5 }}
                dangerouslySetInnerHTML={{ __html: String(item.data ?? '') }}
              />
            );

          case 'dom':
            // `display.dom(element)` — mount a live HTMLElement. We use a ref
            // callback + appendChild so the element keeps its event listeners
            // and animation loops (essential for Three.js: the WebGLRenderer's
            // canvas needs to remain in the DOM to keep painting).
            return (
              <Box
                key={item.id}
                // `min-width: 0` na dziecku flexa jest kluczowe dla komponentów
                // rysujących na <canvas> (qt-canvas, Three.js): bez tego
                // min-content flex-itema = intrinsic szerokość backing-bufora
                // canvasu (w*devicePixelRatio = 2× na Retinie), więc element
                // rośnie do 2× szerokości panelu → współrzędne myszy w osi X
                // rozjeżdżają się o połowę. `min-width: 0` pozwala uszanować
                // width:100% zamiast min-content.
                sx={{ my: 0.5, display: 'flex', justifyContent: 'center', '& > *': { minWidth: 0, maxWidth: '100%' } }}
                ref={(host: HTMLDivElement | null) => {
                  if (!host) return;
                  const el = item.data as HTMLElement | null;
                  if (el && host.firstChild !== el) {
                    host.innerHTML = '';
                    host.appendChild(el);
                  }
                }}
              />
            );

          default:
            return null;
        }
      })}
    </Box>
  );
};
