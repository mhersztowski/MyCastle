/**
 * Podgląd pakietu — baza wiedzy bez aplikacji hosta.
 *
 * Trzy widoki, te same, które dostanie aplikacja: katalog (szukanie, graf,
 * kolejność nauki), tryb czytania i podgląd źródła. Pozwala oglądać całość bez
 * logowania i bez edytora, więc problemy widać w izolacji.
 */
import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
// Style KaTeX — w aplikacji ładuje je MdEditor, tu trzeba wprost.
import 'katex/dist/katex.min.css';
import { buildIndex } from '@mhersztowski/sci-core';
import { KnowledgeCatalog } from '../src/KnowledgeCatalog';
import { ReaderView } from '../src/ReaderView';
import { FormulaBlockView } from '../src/FormulaBlockView';

/**
 * Fabryka workera dla podglądu — ten sam zapis, co w aplikacji.
 *
 * Vite zamienia go na osobny bundel; bez niej podgląd liczy w wątku
 * interfejsu i przy gazie z sześciuset cząstkami widać, po co worker jest.
 */
const createModelWorker = () => new Worker(new URL('./modelWorker.ts', import.meta.url), { type: 'module' });

/**
 * Podgląd wizualnej edycji wzoru.
 *
 * Tryb czytania (`ReaderView`) celowo nie pozwala edytować, więc bez tego
 * ekranu MathLive dałoby się sprawdzić dopiero w aplikacji za logowaniem.
 */
function PodgladEdycji() {
  const [kod, setKod] = useState([
    'T = 2\\pi\\sqrt{\\frac{L}{g}}',
    '@vars T: s, L: m, g: m/s^2',
    '@derivedFrom wahadlo-ode',
  ].join('\n'));

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ fontSize: 18 }}>Wizualna edycja wzoru</h2>
      <p style={{ fontSize: 14, color: '#475569' }}>Kliknij wzór, żeby otworzyć edytor matematyki.</p>
      <FormulaBlockView id="okres" code={kod} onChange={setKod} />
      <pre style={{ fontSize: 12, background: '#f8fafc', padding: 10, borderRadius: 6, overflow: 'auto' }}>{kod}</pre>
    </div>
  );
}

const modules = import.meta.glob('../dokumenty/*.md', { query: '?raw', import: 'default', eager: true });
const DOKUMENTY: Record<string, string> = Object.fromEntries(
  Object.entries(modules).map(([path, content]) => [path.replace('../dokumenty/', ''), content as string]),
);

const btn: React.CSSProperties = {
  fontSize: 12, padding: '4px 12px', borderRadius: 4,
  border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', color: '#334155',
};
const aktywny: React.CSSProperties = { ...btn, background: '#dbeafe', borderColor: '#2563eb', color: '#1e40af' };

function App() {
  const index = useMemo(
    () => buildIndex(Object.entries(DOKUMENTY).map(([path, markdown]) => ({ path, markdown }))),
    [],
  );
  const [otwarty, setOtwarty] = useState<string | undefined>();
  const [zrodlo, setZrodlo] = useState(false);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>Baza wiedzy</strong>
        <span style={{ flex: 1 }} />
        {otwarty && (
          <>
            <button type="button" style={btn} onClick={() => { setOtwarty(undefined); setZrodlo(false); }}>
              ← katalog
            </button>
            <button type="button" style={zrodlo ? aktywny : btn} onClick={() => setZrodlo((v) => !v)}>
              źródło
            </button>
          </>
        )}
      </div>

      {!otwarty && (
        <KnowledgeCatalog index={index} bodies={DOKUMENTY} onOpen={setOtwarty} active={otwarty} />
      )}

      {!otwarty && (
        <button
          type="button"
          onClick={() => setOtwarty('__edytor')}
          style={{ fontSize: 12, padding: '4px 10px', borderRadius: 4, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', marginBottom: 12 }}
        >
          ✎ podgląd edycji wzoru
        </button>
      )}
      {otwarty === '__edytor' && <PodgladEdycji />}
      {otwarty && otwarty !== '__edytor' && !zrodlo
        && <ReaderView markdown={DOKUMENTY[otwarty]} workerFactory={createModelWorker} />}

      {otwarty && zrodlo && (
        <textarea
          readOnly
          value={DOKUMENTY[otwarty]}
          style={{
            width: '100%', height: '80vh', fontFamily: 'ui-monospace, monospace',
            fontSize: 11, padding: 10, borderRadius: 6, border: '1px solid #cbd5e1',
          }}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
