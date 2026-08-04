/**
 * BlockShell — ramka bloku z przełącznikiem Widok / Kod.
 *
 * Każdy blok bazy wiedzy ma dwie postacie: to, co widzi czytelnik, i tekst,
 * który pisze autor. Bez przełącznika autor nie ma jak poprawić wzoru inaczej
 * niż przez plik — a to jest dokładnie ta pętla „edytuję i widzę", dla której
 * cały projekt powstał w MdEditorze, a nie w Quarto.
 *
 * Domyślny tryb to **widok**: dokument otwiera się jako artykuł, nie jako
 * listing. Wyjątkiem jest blok z błędem — wtedy od razu pokazujemy kod, bo
 * poprawka i tak musi się wydarzyć w tekście.
 *
 * Surowy widok przychodzi od hosta jako `children()`. To on wie, jak wyrenderować
 * edytowalną treść bloku w swoim edytorze; pakiet nie ma o tym pojęcia i mieć
 * nie powinien.
 */
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

export interface BlockShellProps {
  /** Krótka nazwa rodzaju bloku, np. „wzór". */
  kind: string;
  /** Kolor akcentu — odróżnia rodzaje bloków na pierwszy rzut oka. */
  accent: string;
  /** Identyfikator bloku, jeśli go ma. */
  id?: string;
  /** Dodatkowe elementy w pasku (np. licznik wariantu zadania). */
  toolbar?: ReactNode;
  /** Uwagi — ich obecność przełącza blok w tryb kodu na starcie. */
  issues?: string[];
  /** Surowy, edytowalny widok bloku; brak = blok tylko do odczytu. */
  children?: () => ReactNode;
  /** Zawartość trybu „widok". */
  view: ReactNode;
}

const btn = (active: boolean): CSSProperties => ({
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 4,
  cursor: 'pointer',
  border: `1px solid ${active ? '#2563eb' : '#cbd5e1'}`,
  background: active ? '#dbeafe' : '#fff',
  color: active ? '#1e40af' : '#475569',
});

export function BlockShell({ kind, accent, id, toolbar, issues = [], children, view }: BlockShellProps) {
  // Blok z uwagami otwiera się w kodzie: pokazywanie pustego widoku obok
  // komunikatu o błędzie zmuszałoby autora do zgadnięcia, gdzie szukać.
  const [mode, setMode] = useState<'view' | 'code'>(issues.length ? 'code' : 'view');

  return (
    <div style={{
      border: '1px solid #e2e8f0',
      borderLeft: `4px solid ${accent}`,
      borderRadius: 6,
      background: '#fff',
      padding: 10,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: accent }}>{kind}</span>
        {id && <code style={{ fontSize: 11, color: '#94a3b8' }}>{id}</code>}
        {toolbar}
        <span style={{ flex: 1 }} />
        {children && (
          <>
            <button type="button" style={btn(mode === 'view')} onClick={() => setMode('view')} title="Podgląd">
              Widok
            </button>
            <button type="button" style={btn(mode === 'code')} onClick={() => setMode('code')} title="Tekst źródłowy bloku">
              Kod
            </button>
          </>
        )}
      </div>

      {issues.length > 0 && (
        <div style={{ fontSize: 11, color: '#b91c1c', background: '#fef2f2', borderRadius: 4, padding: '6px 8px' }}>
          {issues.map((issue, index) => <div key={index}>{issue}</div>)}
        </div>
      )}

      {/*
        * Widok jest **nieedytowalny**.
        *
        * Blok mieszka w drzewie edytora tekstu, więc bez tego kliknięcie
        * w wykres albo we wzór wstawia kursor i pozwala pisać po środku
        * symulacji — a wpisany znak trafia do treści bloku i psuje jego
        * składnię. Edycja należy do trybu „Kod", gdzie jest widoczna.
        *
        * `user-select: text` zostaje: zaznaczanie i kopiowanie działa dalej,
        * bo to nie jest edycja.
        */}
      {(mode === 'view' || !children) && (
        <div contentEditable={false} suppressContentEditableWarning style={{ userSelect: 'text' }}>
          {view}
        </div>
      )}

      {/*
        * Treść edytowalna zostaje w drzewie **zawsze**, tylko schowana.
        *
        * Host renderuje w niej węzeł tekstowy edytora; usunięcie go przy
        * przełączeniu na widok zabrałoby edytorowi miejsce, w którym trzyma
        * treść bloku — kursor trafiałby wtedy w przypadkowe miejsca dokumentu.
        */}
      {children && (
        <div style={mode === 'code' ? undefined : { display: 'none' }}>
          {children()}
        </div>
      )}
    </div>
  );
}
