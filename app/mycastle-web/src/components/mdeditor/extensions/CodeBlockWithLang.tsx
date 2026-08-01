import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, NodeViewProps } from '@tiptap/react';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import hljs from 'highlight.js';
import Editor from 'react-simple-code-editor';
import { useMqtt } from '../../../modules/mqttclient';
import CodeFilePickerDialog, { langFromPath } from './CodeFilePickerDialog';
import { blockBeforeCursor } from './selectBlockBefore';
import type { Editor as TiptapEditor } from '@tiptap/core';
import { DiagramBlockView } from './DiagramBlockView';

/** Zdarzenie wysyłane przez MdEditor przy autosave — bloki z pliku zapisują wtedy swój plik. */
export const MD_AUTOSAVE_EVENT = 'md:autosave';

const LANGS: { label: string; value: string }[] = [
  { label: 'plain', value: '' },
  { label: 'C++ / Arduino', value: 'cpp' },
  { label: 'C', value: 'c' },
  { label: 'Python', value: 'python' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'Bash / Shell', value: 'bash' },
  { label: 'JSON', value: 'json' },
  { label: 'YAML', value: 'yaml' },
  { label: 'HTML', value: 'xml' },
  { label: 'CSS', value: 'css' },
  { label: 'Markdown', value: 'markdown' },
  { label: 'INI / TOML', value: 'ini' },
  { label: 'Rust', value: 'rust' },
  { label: 'Go', value: 'go' },
  { label: 'Java', value: 'java' },
  { label: 'SQL', value: 'sql' },
  { label: 'Makefile', value: 'makefile' },
  { label: 'Mermaid (diagram)', value: 'mermaid' },
];

/** Języki, dla których blok dostaje przełącznik Code / View / Edit. */
const DIAGRAM_LANGS = new Set(['mermaid']);

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
}

/** Podświetlanie składni przez highlight.js (własne — działa natychmiast po zmianie języka). */
function highlightCode(code: string, lang: string): string {
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    }
  } catch { /* fall through */ }
  return escapeHtml(code);
}

const bar: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
  padding: '4px 8px', fontSize: 12, borderBottom: '1px solid rgba(0,0,0,0.1)',
  background: 'rgba(0,0,0,0.03)', userSelect: 'none',
};
const sel: React.CSSProperties = { fontSize: 12, padding: '2px 4px', borderRadius: 4, cursor: 'pointer' };
const MONO = "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace";
// `white-space: pre` + `tab-size` → zachowuje wcięcia; `overflow: auto` → poziomy scroll.
const preStyle: React.CSSProperties = {
  margin: 0, padding: '10px 12px', overflow: 'auto', fontSize: 13, lineHeight: 1.5,
  whiteSpace: 'pre', tabSize: 2, MozTabSize: 2, fontFamily: MONO,
} as React.CSSProperties;

const CodeBlockView: React.FC<NodeViewProps> = ({ node, updateAttributes, editor, getPos }) => {
  const language: string = node.attrs.language || '';
  const externalSrc: string = node.attrs.externalSrc || '';
  const { readFile, writeFile } = useMqtt();

  const [pickerOpen, setPickerOpen] = useState(false);
  // Zewnętrzny plik: treść trzymana lokalnie (nie w dokumencie md).
  const [extCode, setExtCode] = useState('');
  const [extState, setExtState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [extErr, setExtErr] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const dirtyRef = useRef(false);
  const extCodeRef = useRef('');
  extCodeRef.current = extCode;

  // Wczytanie pliku przy loadzie / zmianie ścieżki.
  useEffect(() => {
    if (!externalSrc) { setExtCode(''); setExtState('idle'); return; }
    let alive = true;
    setExtState('loading'); setExtErr('');
    Promise.resolve(readFile(externalSrc))
      .then((res: unknown) => {
        if (!alive) return;
        const c = typeof res === 'string' ? res : ((res as { content?: string })?.content ?? '');
        setExtCode(c); setExtState('idle');
      })
      .catch((e: unknown) => { if (alive) { setExtErr(e instanceof Error ? e.message : String(e)); setExtState('error'); } });
    return () => { alive = false; };
  }, [externalSrc, readFile]);

  // Zapis pliku zewnętrznego przy autosave dokumentu md (jeśli były zmiany).
  useEffect(() => {
    if (!externalSrc) return;
    const onSave = () => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      Promise.resolve(writeFile(externalSrc, extCodeRef.current)).catch(() => { /* best effort */ });
    };
    window.addEventListener(MD_AUTOSAVE_EVENT, onSave);
    return () => window.removeEventListener(MD_AUTOSAVE_EVENT, onSave);
  }, [externalSrc, writeFile]);

  const beginEdit = useCallback(() => { setDraft(extCode); setEditing(true); }, [extCode]);
  const commitEdit = useCallback(() => {
    setEditing(false);
    if (draft !== extCode) {
      setExtCode(draft);
      dirtyRef.current = true;
      // Zapis natychmiastowy + i tak zapisze się ponownie przy autosave md.
      Promise.resolve(writeFile(externalSrc, draft)).then(() => { dirtyRef.current = false; }).catch(() => { /* zapisze przy autosave */ });
    }
  }, [draft, extCode, externalSrc, writeFile]);

  /**
   * Podmiana całej treści bloku (zapis z edytora graficznego).
   *
   * Idzie transakcją ProseMirror, a nie `insertContent`: treść bloku kodu jest
   * czystym tekstem i musi nim zostać — `insertContent` rozbiłby wielolinijkowy
   * diagram na osobne akapity.
   */
  const replaceBlockText = useCallback((next: string) => {
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (pos == null) return;
    const from = pos + 1;
    const to = pos + node.nodeSize - 1;
    const tr = editor.state.tr;
    tr.replaceWith(from, to, next ? editor.schema.text(next) : []);
    editor.view.dispatch(tr);
  }, [editor, getPos, node]);

  const isExternal = !!externalSrc;
  const displayCode = isExternal ? extCode : node.textContent;

  return (
    <NodeViewWrapper
      className="md-editor-code-block-wrap"
      style={{ position: 'relative', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 6, overflow: 'hidden', margin: '0.5rem 0' }}
    >
      <div style={bar} contentEditable={false}>
        <span style={{ fontFamily: 'monospace', opacity: 0.6 }}>{'</>'}</span>
        <select
          value={language}
          onChange={(e) => updateAttributes({ language: e.target.value || null })}
          style={sel}
          title="Język bloku kodu (podświetlanie składni)"
        >
          {LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>

        <span style={{ flex: 1 }} />

        {isExternal && (
          <>
            <span title={externalSrc} style={{ fontFamily: 'monospace', opacity: 0.75, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              📄 {externalSrc}
            </span>
            <button type="button" style={sel} onClick={editing ? commitEdit : beginEdit} title="Edytuj zawartość (zapis pod autosave md)">
              {editing ? '💾 Zapisz' : '✏️ Edytuj'}
            </button>
          </>
        )}
        <button type="button" style={sel} onClick={() => setPickerOpen(true)} title="Wybierz zewnętrzny plik (osadzenie jego treści)">
          🔗 plik
        </button>
        {isExternal && (
          <button type="button" style={sel} onClick={() => { updateAttributes({ externalSrc: null }); }} title="Odłącz plik (blok wraca do trybu edytowalnego)">
            ✖
          </button>
        )}
      </div>

      {DIAGRAM_LANGS.has(language) ? (
        // Blok diagramu: pasek Code / View / Edit. Treść w trybie „Code" zostaje
        // dokładnie taka jak dla zwykłego bloku, więc edycja tekstu działa jak dotąd.
        <DiagramBlockView
          code={displayCode}
          language={language}
          onChange={isExternal
            ? (next) => { setExtCode(next); dirtyRef.current = true; }
            : (next) => replaceBlockText(next)}
        >
          {() => (
            isExternal ? (
              <pre className={`hljs language-${language}`} style={preStyle} contentEditable={false} onDoubleClick={beginEdit}>
                <code className={`hljs language-${language}`} dangerouslySetInnerHTML={{ __html: highlightCode(displayCode, language) }} />
              </pre>
            ) : (
              <pre className="md-editor-code-block" style={preStyle}>
                <NodeViewContent as={'code' as unknown as 'div'} className={`hljs language-${language}`} />
              </pre>
            )
          )}
        </DiagramBlockView>
      ) : isExternal ? (
        editing ? (
          <div contentEditable={false} style={{ maxHeight: 460, overflow: 'auto' }}>
            <Editor
              value={draft}
              onValueChange={setDraft}
              onBlur={commitEdit}
              highlight={(c) => highlightCode(c, language)}
              padding={12}
              tabSize={2}
              insertSpaces
              textareaId="cb-editor"
              autoFocus
              className="hljs"
              preClassName={`hljs language-${language}`}
              style={{ fontFamily: MONO, fontSize: 13, lineHeight: 1.5, minHeight: 160 }}
            />
          </div>
        ) : (
          <pre className={`hljs language-${language}`} style={preStyle} contentEditable={false} onDoubleClick={beginEdit} title="Kliknij dwukrotnie, aby edytować">
            <code
              className={`hljs language-${language}`}
              dangerouslySetInnerHTML={{
                __html: extState === 'loading' ? '⏳ Ładowanie pliku…'
                  : extState === 'error' ? `⚠️ Błąd: ${escapeHtml(extErr)}`
                  : highlightCode(displayCode, language),
              }}
            />
          </pre>
        )
      ) : (
        // Tryb inline — edycja w dokumencie; podświetlanie hljs (własne) na read-only warstwie
        // nie jest możliwe nad edytowalną treścią, więc treść jest edytowalna, a klasy hljs/language
        // pozwalają motywowi z MdEditor.css kolorować dekoracje lowlight.
        <pre className="md-editor-code-block" style={preStyle}>
          <NodeViewContent as={'code' as unknown as 'div'} className={`hljs language-${language}`} />
        </pre>
      )}

      <CodeFilePickerDialog
        open={pickerOpen}
        selectedPath={externalSrc}
        onClose={() => setPickerOpen(false)}
        onSelect={(p: string) => {
          // Auto-wykrycie typu (np. .ino/.cpp → C++/Arduino) — jeśli rozpoznane.
          const lang = langFromPath(p);
          updateAttributes({ externalSrc: p || null, ...(lang ? { language: lang } : {}) });
          setPickerOpen(false);
        }}
      />
    </NodeViewWrapper>
  );
};

/**
 * Blok kodu z: (1) selektorem JĘZYKA (kolorowanie hljs), (2) opcjonalnym
 * ZEWNĘTRZNYM PLIKIEM wybieranym z dialogu — jego treść jest wczytywana przy
 * loadzie i osadzana; można ją edytować, a zapis idzie pod autosave dokumentu md.
 */
export function makeCodeBlockWithLang(lowlight: unknown) {
  return CodeBlockLowlight.extend({
    addAttributes() {
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(this.parent?.() as any),
        externalSrc: {
          default: null,
          parseHTML: (el: HTMLElement) => el.getAttribute('data-external-src'),
          renderHTML: (attrs: Record<string, unknown>) =>
            attrs.externalSrc ? { 'data-external-src': String(attrs.externalSrc) } : {},
        },
      };
    },
    addNodeView() {
      return ReactNodeViewRenderer(CodeBlockView);
    },
    addKeyboardShortcuts() {
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...((this.parent?.() ?? {}) as any),
        /**
         * Backspace tuż pod blokiem: pierwszy raz zaznacza blok, drugi go
         * usuwa. Domyślnie ProseMirror wciągał kursor do środka bloku i
         * wyglądało to, jakby klawisz nie działał — bloku z własnym widokiem
         * nie dało się wtedy skasować klawiaturą.
         */
        Backspace: ({ editor }: { editor: TiptapEditor }) => {
          const target = blockBeforeCursor(editor.state, [this.name]);
          if (!target) return false;
          return editor.commands.setNodeSelection(target.pos);
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }).configure({ lowlight, HTMLAttributes: { class: 'md-editor-code-block' } } as any);
}
