/**
 * ReaderView — dokument w trybie czytania.
 *
 * To samo, co widzi autor w edytorze, tylko bez edytora: tekst, wzory,
 * symulacje i zadania, ułożone w kolejności z pliku. Raport (Etap 3) opisuje
 * to jako „dokument bez chrome edytora, ładny na Foldzie".
 *
 * Wzory składa KaTeX (patrz `Math.tsx`); jego arkusz stylów ładuje host —
 * pakiet nie wstrzykuje CSS-a, żeby nie walczyć z motywem aplikacji.
 *
 * Renderowanie markdownu jest tu **celowo minimalne** — nagłówki, akapity, kod
 * w linii i wyliczenia. Pełny renderer należy do hosta (MdEditor ma go od
 * dawna); tutaj chodzi o to, żeby dokument dało się przeczytać bez aplikacji, w
 * podglądzie i w przyszłym eksporcie statycznym. Dokładanie drugiego pełnego
 * renderera markdownu obok istniejącego byłoby budowaniem frameworka zamiast
 * treści — a przed tym raport ostrzega wprost.
 */
import { useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { parseFormulaBlock, type FormulaBlock } from '@mhersztowski/sci-core';
import { FormulaBlockView } from './FormulaBlockView';
import { SimBlock } from './SimBlock';
import { ScriptBlock } from './ScriptBlock';
import { ExerciseBlock } from './ExerciseBlock';
import { FieldBlock } from './FieldBlock';
import { LinAlgBlock } from './LinAlgBlock';
import { ProcedureBlock } from './ProcedureBlock';
import type { WorkerFactory } from './useModelRunner';
import type { Quality } from '@mhersztowski/sci-core';

export interface ReaderViewProps {
  markdown: string;
  /** Szerokość kolumny tekstu; węższa czyta się lepiej. */
  maxWidth?: number;
  /** Fabryka workera obliczeń — symulacje liczą poza wątkiem interfejsu. */
  workerFactory?: WorkerFactory;
  /**
   * Zgłoszenie próby rozwiązania zadania — host zapisuje je w postępach.
   *
   * Identyfikator zadania jest unikalny tylko w obrębie dokumentu, więc
   * doklejamy do niego ścieżkę; inaczej „zadanie-1" z dwóch lekcji dzieliłoby
   * jeden harmonogram powtórek.
   */
  onAttempt?: (attempt: { id: string; quality: Quality; hintsUsed: number }) => void;
  /** Ścieżka dokumentu — przedrostek identyfikatora zadania. */
  path?: string;
}

type Segment =
  | { kind: 'text'; content: string }
  | { kind: 'formula'; id: string; body: string }
  | { kind: 'sim'; body: string }
  | { kind: 'simscript'; body: string }
  | { kind: 'exercise'; id: string; body: string }
  | { kind: 'field'; id: string; body: string }
  | { kind: 'linalg'; id: string; body: string }
  | { kind: 'procedure'; id: string; body: string }
  | { kind: 'code'; language: string; body: string };

const FENCE = /```([^\n]*)\n([\s\S]*?)```/g;

/** Dzieli dokument na tekst i bloki — kolejność z pliku zostaje zachowana. */
export function splitDocument(markdown: string): Segment[] {
  const body = markdown
    // Nagłówek YAML należy do metadanych, nie do treści.
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    // Znaczniki bloków, które dokłada edytor (`<!-- bid:… -->`). Są techniczne
    // i w trybie czytania nie mają czego szukać — bez tego artykuł zaczyna
    // wyglądać jak zrzut z bazy danych.
    .replace(/^[ \t]*<!--[\s\S]*?-->[ \t]*\r?\n?/gm, '');
  const segments: Segment[] = [];
  let last = 0;

  for (const match of body.matchAll(FENCE)) {
    const before = body.slice(last, match.index);
    if (before.trim()) segments.push({ kind: 'text', content: before });
    last = match.index! + match[0].length;

    const info = match[1].trim();
    const content = match[2];

    const formula = /^formula:([A-Za-z0-9_-]+)$/.exec(info);
    const exercise = /^exercise:([A-Za-z0-9_-]+)$/.exec(info);
    const field = /^field:([A-Za-z0-9_-]+)$/.exec(info);
    const linalg = /^linalg:([A-Za-z0-9_-]+)$/.exec(info);
    const procedura = /^procedure:([A-Za-z0-9_-]+)$/.exec(info);

    if (procedura) segments.push({ kind: 'procedure', id: procedura[1], body: content });
    else if (linalg) segments.push({ kind: 'linalg', id: linalg[1], body: content });
    else if (field) segments.push({ kind: 'field', id: field[1], body: content });
    else if (formula) segments.push({ kind: 'formula', id: formula[1], body: content });
    else if (exercise) segments.push({ kind: 'exercise', id: exercise[1], body: content });
    else if (/^simscript(:|$)/.test(info)) segments.push({ kind: 'simscript', body: content });
    else if (/^sim(:|$)/.test(info)) segments.push({ kind: 'sim', body: content });
    else segments.push({ kind: 'code', language: info, body: content });
  }

  const rest = body.slice(last);
  if (rest.trim()) segments.push({ kind: 'text', content: rest });
  return segments;
}

/**
 * Nastawy bloku `field` — JSON, jak w `sim`.
 *
 * `duration` i `frames` sterują przebiegiem, cała reszta to wartości
 * parametrów. Rozdzielamy je tutaj, żeby autor mógł pisać płaski obiekt
 * (`{"alpha": 0.01, "duration": 3}`) zamiast zagnieżdżać parametry w osobnym polu.
 */
function parseSetup(body: string) {
  try {
    const { duration, frames, ...values } = JSON.parse(body || '{}') as Record<string, number>;
    return { duration, frames, values };
  } catch {
    return undefined;
  }
}

/** Nastawy sceny algebry — co pokazać obok przekształcenia. */
function parseStageSetup(body: string) {
  try {
    return JSON.parse(body || '{}') as { eigen?: boolean; extent?: number; unitSquare?: boolean };
  } catch {
    return undefined;
  }
}

const text: CSSProperties = { fontSize: 15, lineHeight: 1.65, color: '#1e293b' };

export function ReaderView({ markdown, maxWidth = 720, workerFactory, onAttempt, path }: ReaderViewProps) {
  const segments = useMemo(() => splitDocument(markdown), [markdown]);
  // Bloki `formula` z dyrektywą `@pde` opisują pola; blok `field` tylko je
  // uruchamia, tak jak `sim` uruchamia graf wzorów.
  const pola = useMemo(
    () => segments
      .filter((s): s is Extract<Segment, { kind: 'formula' }> => s.kind === 'formula')
      .filter((s) => /^\s*@pde\b/m.test(s.body)),
    [segments],
  );

  // Bloki `formula` z `@linalg` opisują sceny przekształceń; blok `linalg`
  // tylko je uruchamia, tak jak `field` uruchamia pola.
  const sceny = useMemo(
    () => segments
      .filter((s): s is Extract<Segment, { kind: 'formula' }> => s.kind === 'formula')
      .filter((s) => /^\s*@linalg\b/m.test(s.body)),
    [segments],
  );

  const formulas = useMemo<FormulaBlock[]>(
    () => segments
      .filter((s): s is Extract<Segment, { kind: 'formula' }> => s.kind === 'formula')
      .filter((s) => !/^\s*@pde\b/m.test(s.body) && !/^\s*@linalg\b/m.test(s.body))
      .map((s) => parseFormulaBlock(s.id, s.body)),
    [segments],
  );

  return (
    <article style={{ maxWidth, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14, ...text }}>
      {segments.map((segment, index) => {
        switch (segment.kind) {
          case 'text':
            return <Markdown key={index} source={segment.content} />;
          case 'formula':
            return <FormulaBlockView key={index} id={segment.id} code={segment.body} />;
          case 'sim':
            return <SimBlock key={index} code={segment.body} formulas={formulas} workerFactory={workerFactory} />;
          case 'procedure':
            return <ProcedureBlock key={index} id={segment.id} code={segment.body} />;
          case 'linalg': {
            const scena = sceny.find((p) => p.id === segment.id);
            if (!scena) {
              return (
                <div key={index} style={{ fontSize: 12, color: '#b91c1c' }}>
                  Nie ma sceny algebry „{segment.id}" w tym dokumencie.
                  {sceny.length > 0 && <> Dostępne: {sceny.map((p) => p.id).join(', ')}.</>}
                </div>
              );
            }
            return <LinAlgBlock key={index} id={scena.id} code={scena.body} setup={parseStageSetup(segment.body)} />;
          }
          case 'field': {
            // Blok `field` wskazuje wzór pola po identyfikatorze; nastawy
            // (parametry, długość, liczba klatek) są w jego własnej treści.
            const pole = pola.find((p) => p.id === segment.id);
            if (!pole) {
              return (
                <div key={index} style={{ fontSize: 12, color: '#b91c1c' }}>
                  Nie ma wzoru pola „{segment.id}" w tym dokumencie.
                  {/* Lista dostępnych, bo najczęstszą przyczyną jest literówka
                      albo zmiana identyfikatora tylko w jednym z dwóch bloków. */}
                  {pola.length > 0 && <> Dostępne: {pola.map((p) => p.id).join(', ')}.</>}
                </div>
              );
            }
            // Bez `onFormulaChange`: w trybie czytania rysunek żyje do
            // przeładowania. Zapis należy do edytora, nie do czytelnika.
            return <FieldBlock key={index} id={pole.id} code={pole.body} setup={parseSetup(segment.body)} />;
          }
          case 'simscript':
            return <ScriptBlock key={index} code={segment.body} workerFactory={workerFactory} />;
          case 'exercise':
            return (
              <ExerciseBlock
                key={index}
                id={segment.id}
                code={segment.body}
                formulas={formulas}
                onAttempt={onAttempt && ((attempt) => onAttempt({
                  ...attempt,
                  id: path ? `${path}:${attempt.id}` : attempt.id,
                }))}
              />
            );
          default:
            return (
              <pre key={index} style={{ background: '#f8fafc', borderRadius: 6, padding: 10, overflowX: 'auto', fontSize: 12 }}>
                <code>{segment.body}</code>
              </pre>
            );
        }
      })}
    </article>
  );
}

/**
 * Minimalny render markdownu: nagłówki, akapity, listy, kod w linii, wyróżnienia.
 *
 * Świadomie bez biblioteki i bez `dangerouslySetInnerHTML` — dokument bazy
 * wiedzy bywa cudzy, a wstrzykiwanie HTML-a z treści to jedyne miejsce, gdzie
 * ten komponent mógłby zrobić krzywdę.
 */
function Markdown({ source }: { source: string }) {
  const blocks = source.split(/\n{2,}/).filter((block) => block.trim());

  return (
    <>
      {blocks.map((block, index) => {
        const heading = /^(#{1,4})\s+(.*)$/.exec(block.trim());
        if (heading) {
          const level = heading[1].length;
          const sizes = [26, 20, 16, 14];
          return (
            <div
              key={index}
              style={{
                fontSize: sizes[level - 1], fontWeight: 600, color: '#0f172a',
                marginTop: level <= 2 ? 10 : 4, lineHeight: 1.25,
              }}
            >
              {inline(heading[2])}
            </div>
          );
        }

        if (/^\s*[-*]\s+/m.test(block)) {
          const items = block.split('\n').filter((line) => /^\s*[-*]\s+/.test(line));
          return (
            <ul key={index} style={{ margin: 0, paddingLeft: 22 }}>
              {items.map((item, i) => <li key={i}>{inline(item.replace(/^\s*[-*]\s+/, ''))}</li>)}
            </ul>
          );
        }

        return <p key={index} style={{ margin: 0 }}>{inline(block)}</p>;
      })}
    </>
  );
}

/** Kod w linii, pogrubienie i kursywa — reszta zostaje tekstem. */
function inline(source: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let key = 0;

  for (const match of source.matchAll(pattern)) {
    if (match.index! > last) out.push(source.slice(last, match.index));
    const token = match[0];
    last = match.index! + token.length;

    if (token.startsWith('`')) {
      out.push(
        <code key={key += 1} style={{ background: '#f1f5f9', borderRadius: 3, padding: '1px 4px', fontSize: '0.9em' }}>
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      out.push(<strong key={key += 1}>{token.slice(2, -2)}</strong>);
    } else {
      out.push(<em key={key += 1}>{token.slice(1, -1)}</em>);
    }
  }

  if (last < source.length) out.push(source.slice(last));
  return out;
}
