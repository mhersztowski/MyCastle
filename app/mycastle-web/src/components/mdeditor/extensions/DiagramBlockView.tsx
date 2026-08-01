/**
 * DiagramBlockView — trzy tryby bloku kodu z diagramem: Code / View / Edit.
 *
 *   • **Code** — zwykła edycja tekstu (to, co blok kodu robił dotąd);
 *   • **View** — render biblioteką docelową (dla Mermaida: `mermaid.render`);
 *   • **Edit** — edytor graficzny z `@mhersztowski/web-devtools/diagrams`.
 *
 * Tryb graficzny pracuje na neutralnym modelu diagramu, a tekst wchodzi i
 * wychodzi przez adapter formatu. Dzięki temu ten sam pasek obsłuży kolejne
 * języki (PlantUML, własny JSON) — wystarczy, że rejestr formatów je rozpozna.
 *
 * Zapis z trybu graficznego nadpisuje treść bloku, więc adapter musi zachowywać
 * nierozpoznane linie; o to dba warstwa formatów, nie ten komponent.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DiagramEditor, SequenceEditor, PacketEditor, KanbanEditor, GanttEditor, TimelineEditor,
  diagramFormats, mergeLayout, starterDiagram, DIAGRAM_STARTERS,
  type DiagramDocument, type DiagramFormat, type DiagramKind,
} from '@mhersztowski/web-devtools/diagrams';
import '@xyflow/react/dist/style.css';

export type DiagramBlockMode = 'code' | 'view' | 'edit';

interface Props {
  code: string;
  /** Zapis treści bloku (tryb graficzny); brak = blok tylko do odczytu. */
  onChange?: (next: string) => void;
  /** Język bloku kodu — do wyboru adaptera, gdy treść jest niejednoznaczna. */
  language?: string;
  initialMode?: DiagramBlockMode;
  children: (mode: DiagramBlockMode) => React.ReactNode;
}

const btn = (active: boolean): React.CSSProperties => ({
  fontSize: 12, padding: '2px 10px', borderRadius: 4, cursor: 'pointer',
  border: `1px solid ${active ? '#2563eb' : '#cbd5e1'}`,
  background: active ? '#dbeafe' : '#fff',
  color: active ? '#1e40af' : '#334155',
  fontWeight: active ? 600 : 400,
});

/** Render Mermaida — ładowany leniwie, bo waży kilkaset kilobajtów. */
function MermaidPreview({ code }: { code: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' });
        // Identyfikator musi być unikalny — mermaid tworzy pod nim element w DOM.
        const id = `mmd-${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(id, code);
        if (!cancelled && hostRef.current) hostRef.current.innerHTML = svg;
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return (
      <pre style={{ margin: 0, padding: 12, color: '#b91c1c', fontSize: 12, whiteSpace: 'pre-wrap' }}>
        Nie udało się wyrenderować diagramu:{'\n'}{error}
      </pre>
    );
  }
  return <div ref={hostRef} style={{ padding: 12, overflow: 'auto' }} />;
}

export function DiagramBlockView({ code, onChange, language, initialMode = 'code', children }: Props) {
  const [mode, setMode] = useState<DiagramBlockMode>(initialMode);

  const format: DiagramFormat | undefined = useMemo(
    () => diagramFormats.detect(code) ?? diagramFormats.get(language ?? 'mermaid'),
    [code, language],
  );

  // Model trzymamy lokalnie tylko w trybie graficznym: źródłem prawdy pozostaje
  // tekst bloku, więc każde wejście w „Edit" parsuje go od nowa.
  const [doc, setDoc] = useState<DiagramDocument | null>(null);
  const [parseError, setParseError] = useState('');
  /** Tekst, który sami zapisaliśmy — pozwala odróżnić własną zmianę od cudzej. */
  const selfWrittenRef = useRef<string | null>(null);
  /** Ostatni model, żeby przenieść na nowy układ po ponownym sparsowaniu. */
  const lastDocRef = useRef<DiagramDocument | null>(null);
  lastDocRef.current = doc;

  useEffect(() => {
    if (mode !== 'edit' || !format) return;
    // Zmiana pochodząca z edytora graficznego wraca tu pętlą (model → tekst →
    // blok → `code`). Ponowne parsowanie dawałoby nowy model bez współrzędnych,
    // więc diagram układałby się od zera po KAŻDEJ operacji — stąd skakanie.
    if (code === selfWrittenRef.current) return;
    try {
      const parsed = format.parse(code).document;
      // Tekst Mermaida nie niesie układu, więc przenosimy go z poprzedniego
      // modelu — dotyczy też ręcznej edycji w zakładce „Code".
      setDoc(lastDocRef.current ? mergeLayout(parsed, lastDocRef.current) : parsed);
      setParseError('');
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    }
  }, [mode, code, format]);

  const handleDocChange = useCallback((next: DiagramDocument) => {
    setDoc(next);
    if (!format || !onChange) return;
    const text = format.serialize(next);
    selfWrittenRef.current = text;
    onChange(text);
  }, [format, onChange]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 8px', borderBottom: '1px solid rgba(0,0,0,0.08)' }} contentEditable={false}>
        <button type="button" style={btn(mode === 'code')} onClick={() => setMode('code')} title="Edycja tekstu diagramu">Code</button>
        <button type="button" style={btn(mode === 'view')} onClick={() => setMode('view')} title="Podgląd wyrenderowany przez Mermaid">View</button>
        <button type="button" style={btn(mode === 'edit')} onClick={() => setMode('edit')} title="Edytor graficzny">Edit</button>
        {format && <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 4 }}>{format.label}</span>}
      </div>

      {mode === 'code' && children('code')}
      {mode === 'view' && <MermaidPreview code={code} />}
      {/* Pusty blok: zanim pokażemy płótno, trzeba wiedzieć, co rysujemy.
          Wybór rodzaju od razu wstawia poprawny szkielet, bo pusty diagram
          Mermaida kończy się komunikatem o błędzie składni. */}
      {mode === 'edit' && !code.trim() && onChange && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: '#334155' }}>Wybierz rodzaj diagramu:</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {DIAGRAM_STARTERS.map((starter) => (
              <button
                key={starter.kind}
                type="button"
                onClick={() => {
                  const target = format ?? diagramFormats.get('mermaid');
                  if (!target) return;
                  onChange(target.serialize(starterDiagram(starter.kind as DiagramKind)));
                }}
                style={{
                  textAlign: 'left', padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                  border: '1px solid #cbd5e1', background: '#fff', minWidth: 200,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600 }}>{starter.label}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{starter.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'edit' && (code.trim() || !onChange) && (
        !format ? (
          <div style={{ padding: 12, fontSize: 12, color: '#b91c1c' }}>
            Nie rozpoznano formatu diagramu — edycja graficzna niedostępna.
          </div>
        ) : parseError ? (
          <div style={{ padding: 12, fontSize: 12, color: '#b91c1c' }}>Błąd odczytu diagramu: {parseError}</div>
        ) : doc?.kind === 'timeline' ? (
          // Oś wydarzeń to układ kolumn, nie graf — własny edytor.
          <TimelineEditor document={doc} onChange={handleDocChange} readOnly={!onChange} height={520} />
        ) : doc?.kind === 'gantt' ? (
          // Harmonogram to oś czasu, nie graf — własny edytor.
          <GanttEditor document={doc} onChange={handleDocChange} readOnly={!onChange} height={520} />
        ) : doc?.kind === 'kanban' ? (
          // Tablica kanban to układ pudełek, nie graf — własny edytor.
          <KanbanEditor document={doc} onChange={handleDocChange} readOnly={!onChange} height={520} />
        ) : doc?.kind === 'packet' ? (
          // Mapa bitów ma własny edytor: pole opisuje zakres bitów, a nie
          // położenie w grafie.
          <PacketEditor document={doc} onChange={handleDocChange} readOnly={!onChange} height={520} />
        ) : doc?.kind === 'sequence' ? (
          // Sekwencja ma własny edytor: jej układ wynika z kolejności w czasie,
          // a nie z pozycji elementów, więc płótno grafowe tu nie pasuje.
          <SequenceEditor document={doc} onChange={handleDocChange} readOnly={!onChange} height={560} />
        ) : doc ? (
          <DiagramEditor
            document={doc}
            onChange={handleDocChange}
            readOnly={!onChange}
            // Wysokość rośnie z diagramem: przy stałych 460 px diagram z
            // kilkunastoma węzłami był ściskany do nieczytelności albo ucinany.
            // Klasa liczy się podwójnie — ma ciało (pola i metody), więc zajmuje
            // wielokrotnie więcej miejsca w pionie niż zwykły węzeł.
            height={Math.min(760, Math.max(420, 160 + doc.nodes.reduce(
              (sum, node) => sum + 26 + (node.members?.length ?? 0) * 8, 0,
            )))}
          />
        ) : null
      )}
    </div>
  );
}
