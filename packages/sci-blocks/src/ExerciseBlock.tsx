/**
 * ExerciseBlock — zadanie liczone tym samym grafem, co wykład.
 *
 * Trzy rzeczy wynikają wprost z rdzenia i nie mają tu własnej logiki:
 * dane losuje ziarno, klucz liczy model, podpowiedzi buduje graf. Blok
 * zajmuje się wyłącznie tym, czego rdzeń nie umie: pokazaniem tego czytelnikowi.
 *
 * Jedna decyzja jest tutejsza: **podpowiedzi odsłaniają się pojedynczo**, a nie
 * wszystkie naraz. Gradacja pomocy przestaje działać, gdy ostatni stopień jest
 * widoczny od początku.
 */
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  buildGraph, buildHints, checkNumeric, compileGraph, exerciseVariant,
  parseExerciseBlock, qualityOf, type CheckResult, type FormulaBlock, type Quality,
} from '@mhersztowski/sci-core';

export interface ExerciseBlockProps {
  /**
   * Bez własnej ramki i nagłówka — daje je `BlockShell` po stronie hosta.
   *
   * Poza edytorem (podgląd, eksport statyczny) komponent bywa używany wprost i
   * wtedy ramka jest potrzebna, stąd przełącznik zamiast twardego usunięcia.
   */
  bare?: boolean;
  /** Identyfikator z infostringu: ```exercise:okres-zadanie */
  id: string;
  code: string;
  /** Wzory z dokumentu — z nich powstaje klucz odpowiedzi. */
  formulas: FormulaBlock[];
  /** Ziarno wariantu; brak = wariant pierwszy. */
  seed?: number;
  /**
   * Zgłoszenie próby — host zapisuje ją w postępach nauki.
   *
   * Blok wie o dwóch rzeczach, których nie wie nikt inny: czy odpowiedź była
   * poprawna i ile podpowiedzi zużyto po drodze. Z nich powstaje ocena jakości,
   * a z niej odstęp do powtórki.
   */
  onAttempt?: (attempt: { id: string; quality: Quality; hintsUsed: number }) => void;
}

const box: CSSProperties = {
  border: '1px solid #e2e8f0', borderLeft: '4px solid #7c3aed',
  borderRadius: 6, background: '#fff', padding: 10,
};
const label: CSSProperties = { fontSize: 11, color: '#64748b' };
const btn: CSSProperties = {
  fontSize: 12, padding: '3px 10px', borderRadius: 4,
  border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', color: '#334155',
};

const VERDICT_LOOK: Record<CheckResult['verdict'], { background: string; color: string }> = {
  correct: { background: '#dcfce7', color: '#166534' },
  wrong: { background: '#fef2f2', color: '#b91c1c' },
  'wrong-unit': { background: '#fef3c7', color: '#92400e' },
  unreadable: { background: '#f1f5f9', color: '#475569' },
};

export function ExerciseBlock({ id, code, formulas, seed = 1, bare, onAttempt }: ExerciseBlockProps) {
  const [variantSeed, setVariantSeed] = useState(seed);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<CheckResult | undefined>();
  const [hintsShown, setHintsShown] = useState(0);

  const block = useMemo(() => parseExerciseBlock(id, code), [id, code]);
  const graph = useMemo(() => buildGraph(formulas), [formulas]);
  const model = useMemo(() => compileGraph(graph), [graph]);
  const variant = useMemo(() => exerciseVariant(block, model, variantSeed), [block, model, variantSeed]);

  const hints = useMemo(() => {
    if (!block.answer) return [];
    const computed = model.run(variant.values, [0, 1], 0.01);
    return buildHints(graph, block.answer, computed, block.hints);
  }, [graph, model, block, variant]);

  const issues = [...block.issues, ...variant.issues];

  /**
   * Sprawdzenie odpowiedzi w jednym miejscu.
   *
   * Wcześniej ta sama linia stała przy przycisku i przy klawiszu Enter — po
   * dołożeniu zgłaszania próby rozjechałyby się przy pierwszej zmianie.
   */
  const sprawdz = () => {
    const wynik = checkNumeric(answer, variant, block.tolerance);
    setResult(wynik);
    // Nieczytelna odpowiedź (pusta, sama jednostka) nie jest próbą — to pomyłka
    // w pisaniu, a nie sygnał o tym, czy czytelnik umie zadanie.
    if (wynik.verdict !== 'unreadable') {
      onAttempt?.({ id, quality: qualityOf(wynik.verdict === 'correct', hintsShown), hintsUsed: hintsShown });
    }
  };

  const nowyWariant = () => {
    // Ziarno rośnie o jeden — wariant jest inny, ale wciąż odtwarzalny.
    setVariantSeed((previous) => previous + 1);
    setAnswer('');
    setResult(undefined);
    setHintsShown(0);
  };

  return (
    <div style={bare
      ? { display: 'flex', flexDirection: 'column', gap: 8 }
      : { ...box, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        {!bare && (
          <>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#7c3aed' }}>zadanie</span>
            <code style={{ fontSize: 11, color: '#94a3b8' }}>{id}</code>
          </>
        )}
        {block.level !== undefined && <span style={label}>poziom {block.level}</span>}
        <span style={{ flex: 1 }} />
        <span style={label}>wariant #{variantSeed}</span>
      </div>

      {!bare && issues.length > 0 && (
        <div style={{ fontSize: 11, color: '#b91c1c', background: '#fef2f2', borderRadius: 4, padding: '6px 8px' }}>
          {issues.map((issue, index) => <div key={index}>{issue}</div>)}
        </div>
      )}

      <div style={{ fontSize: 13, color: '#0f172a', whiteSpace: 'pre-wrap' }}>{block.prompt}</div>

      {Object.keys(variant.shown).length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {Object.entries(variant.shown).map(([name, value]) => (
            <span key={name} style={{ fontSize: 12 }}>
              <span style={label}>{name} = </span>
              <strong style={{ color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{value}</strong>
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={answer}
          onChange={(e) => { setAnswer(e.target.value); setResult(undefined); }}
          onKeyDown={(e) => { if (e.key === 'Enter') sprawdz(); }}
          placeholder={variant.expectedUnit ? `odpowiedź, np. 1.5 ${variant.expectedUnit}` : 'odpowiedź'}
          style={{
            fontSize: 13, padding: '4px 8px', borderRadius: 4,
            border: '1px solid #cbd5e1', minWidth: 200,
          }}
        />
        <button type="button" style={btn} onClick={sprawdz}>
          sprawdź
        </button>
        <button type="button" style={btn} onClick={nowyWariant} title="Te same wzory, inne dane">
          ⟳ inne dane
        </button>
        {hints.length > 0 && hintsShown < hints.length && (
          <button type="button" style={btn} onClick={() => setHintsShown((n) => n + 1)}>
            💡 podpowiedź {hintsShown + 1}/{hints.length}
          </button>
        )}
      </div>

      {result && (
        <div style={{
          ...VERDICT_LOOK[result.verdict],
          fontSize: 12, borderRadius: 4, padding: '6px 8px',
        }}>
          {result.message}
          {result.relativeError !== undefined && result.verdict === 'wrong' && (
            <span style={{ opacity: 0.75 }}> (różnica: {(result.relativeError * 100).toFixed(1)}%)</span>
          )}
        </div>
      )}

      {hintsShown > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {hints.slice(0, hintsShown).map((hint) => (
            <div key={hint.level} style={{ fontSize: 12, color: '#475569', background: '#f8fafc', borderRadius: 4, padding: '5px 8px' }}>
              <strong style={{ color: '#7c3aed' }}>{hint.level}.</strong> {hint.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
