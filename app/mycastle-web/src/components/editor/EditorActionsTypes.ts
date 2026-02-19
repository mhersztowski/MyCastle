import type { editor, Selection } from 'monaco-editor';
import * as MuiIcons from '@mui/icons-material';

type IconName = keyof typeof MuiIcons;

export type EditorActionExecutor = (
  editor: editor.IStandaloneCodeEditor,
  selection: Selection | null
) => void;

export interface EditorActionConfig {
  id: string;
  label: string;
  icon: IconName;
  tooltip?: string;
  shortcut?: string;
  executor: EditorActionExecutor;
}

export interface EditorActionGroup {
  id: string;
  label?: string;
  actions: EditorActionConfig[];
}

export interface EditorActionsConfig {
  language: string;
  groups: EditorActionGroup[];
}

// Helper do tworzenia akcji wrap (opakowujących zaznaczony tekst)
export const createWrapAction = (before: string, after: string): EditorActionExecutor => {
  return (editor, selection) => {
    if (!selection) return;

    const model = editor.getModel();
    if (!model) return;

    const selectedText = model.getValueInRange(selection);
    const newText = `${before}${selectedText}${after}`;

    editor.executeEdits('format', [{
      range: selection,
      text: newText,
      forceMoveMarkers: true,
    }]);

    // Ustaw kursor po wstawionym tekście
    const newPosition = {
      lineNumber: selection.startLineNumber,
      column: selection.startColumn + before.length + selectedText.length + after.length,
    };
    editor.setPosition(newPosition);
    editor.focus();
  };
};

// Helper do tworzenia akcji prefix (dodających prefix do linii)
export const createLinePrefixAction = (prefix: string): EditorActionExecutor => {
  return (editor, selection) => {
    if (!selection) return;

    const model = editor.getModel();
    if (!model) return;

    const startLine = selection.startLineNumber;
    const endLine = selection.endLineNumber;
    const edits: editor.IIdentifiedSingleEditOperation[] = [];

    for (let line = startLine; line <= endLine; line++) {
      edits.push({
        range: {
          startLineNumber: line,
          startColumn: 1,
          endLineNumber: line,
          endColumn: 1,
        },
        text: prefix,
        forceMoveMarkers: true,
      });
    }

    editor.executeEdits('format', edits);
    editor.focus();
  };
};

// Helper do tworzenia akcji block (wstawiających blok przed i po zaznaczeniu)
export const createBlockAction = (before: string, after: string, newLineBefore = true, newLineAfter = true): EditorActionExecutor => {
  return (editor, selection) => {
    if (!selection) return;

    const model = editor.getModel();
    if (!model) return;

    const selectedText = model.getValueInRange(selection);
    const beforeText = newLineBefore ? `${before}\n` : before;
    const afterText = newLineAfter ? `\n${after}` : after;
    const newText = `${beforeText}${selectedText}${afterText}`;

    editor.executeEdits('format', [{
      range: selection,
      text: newText,
      forceMoveMarkers: true,
    }]);

    editor.focus();
  };
};

// Helper do wstawiania tekstu w miejscu kursora
export const createInsertAction = (text: string): EditorActionExecutor => {
  return (editor, selection) => {
    const position = selection?.getStartPosition() || editor.getPosition();
    if (!position) return;

    editor.executeEdits('insert', [{
      range: {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      },
      text,
      forceMoveMarkers: true,
    }]);

    editor.focus();
  };
};
