/**
 * sciCodeEditor.tsx — Monaco dla bloku `simscript`.
 *
 * Pakiet `sci-blocks` deklaruje port edytora kodu i nie wie, co po drugiej
 * stronie stoi — tak samo jak przy rozpoznawaniu pisma rysikiem i fabryce
 * workera. Że stoi tam Monaco, wie wyłącznie ta aplikacja, bo to ona już go ma
 * i utrzymuje jego konfigurację.
 *
 * Dzięki temu bloki dalej działają w eksporcie statycznym i w podglądzie, gdzie
 * Monaco nie ma — tam zostaje pole tekstowe.
 *
 * Deklaracje API rdzenia wchodzą przez `createModel`, a nie `addExtraLib`:
 * każdy cykl `addExtraLib`/`setExtraLibs` restartuje worker TypeScriptu, przez
 * co podpowiedzi znikają na sekundę przy każdym przemontowaniu bloku. Ten sam
 * powód i ten sam pomocnik, co w blokach Automate i Plugin Script.
 */
import { useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { setCodeEditor, type CodeEditorProps } from '@mhersztowski/sci-blocks';
import { applyScriptDefaults, mergeExtraLibs } from '../../../modules/automate/designer/automateMonacoSetup';

/** Plik z deklaracjami API skryptu — jedna nazwa, żeby model się nie dublował. */
const API_DTS = 'file:///sci-script-api.d.ts';

function SciCodeEditor({ value, onChange, language, extraTypes, height }: CodeEditorProps) {
  const beforeMount = useCallback((monaco: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = monaco as any;
    applyScriptDefaults(m);
    if (extraTypes) mergeExtraLibs(m, new Map([[API_DTS, extraTypes]]));
  }, [extraTypes]);

  return (
    <div style={{ border: '1px solid #cbd5e1', borderRadius: 4, overflow: 'hidden' }}>
      <Editor
        height={height ?? 320}
        language={language}
        value={value}
        onChange={(next) => onChange(next ?? '')}
        beforeMount={beforeMount}
        options={{
          fontSize: 12,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          // Blok siedzi w dokumencie, który sam się przewija — własne przewijanie
          // w poziomie wystarczy, pionowe oddajemy stronie.
          scrollbar: { alwaysConsumeMouseWheel: false },
          tabSize: 2,
        }}
      />
    </div>
  );
}

setCodeEditor((props) => <SciCodeEditor {...props} />);
