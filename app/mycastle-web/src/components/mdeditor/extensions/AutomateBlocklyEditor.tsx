/**
 * Visual Blockly editor for Automate scripts. Uses Blockly's *default* block
 * set (Logic / Loops / Math / Text / Lists / Colour / Variables / Functions)
 * and the JavaScript generator, so dragging blocks produces plain JS that runs
 * exactly like a hand-written Automate script.
 *
 * - `initialState` : serialized Blockly workspace JSON (string) to restore, or null.
 * - `onCodeChange` : called with freshly generated JavaScript on each user edit.
 * - `onStateChange`: called with the serialized workspace JSON on each user edit
 *                    (host persists it so the blocks survive a reload).
 *
 * The workspace is loaded with Blockly events disabled so restoring saved blocks
 * does NOT fire change callbacks — that way switching Code → Blockly never
 * clobbers existing hand-written code until the user actually edits a block.
 */
import { useEffect, useRef } from 'react';
import * as Blockly from 'blockly';
import { javascriptGenerator } from 'blockly/javascript';
import { defineUmlBlocks, type UmlClassDef } from './umlBlockly';
import { defineProceduralBlocks } from './proceduralBlocks';

export interface AutomateBlocklyEditorProps {
  initialState?: string | null;
  /** Called on each user edit with freshly generated JS and the serialized workspace JSON. */
  onChange: (js: string, state: string) => void;
  /** UML classes (from selected Programming/Uml projects) → extra block categories. */
  umlClasses?: UmlClassDef[];
}

// Classic Blockly default block palette (categories appended with UML ones at inject time).
const DEFAULT_CATEGORIES = [
    {
      kind: 'category', name: 'Logic', categorystyle: 'logic_category',
      contents: [
        { kind: 'block', type: 'controls_if' },
        { kind: 'block', type: 'logic_compare' },
        { kind: 'block', type: 'logic_operation' },
        { kind: 'block', type: 'logic_negate' },
        { kind: 'block', type: 'logic_boolean' },
        { kind: 'block', type: 'logic_null' },
        { kind: 'block', type: 'logic_ternary' },
      ],
    },
    {
      kind: 'category', name: 'Loops', categorystyle: 'loop_category',
      contents: [
        { kind: 'block', type: 'controls_repeat_ext', inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: 10 } } } } },
        { kind: 'block', type: 'controls_whileUntil' },
        { kind: 'block', type: 'controls_for', inputs: { FROM: { shadow: { type: 'math_number', fields: { NUM: 1 } } }, TO: { shadow: { type: 'math_number', fields: { NUM: 10 } } }, BY: { shadow: { type: 'math_number', fields: { NUM: 1 } } } } },
        { kind: 'block', type: 'controls_forEach' },
        { kind: 'block', type: 'controls_flow_statements' },
      ],
    },
    {
      kind: 'category', name: 'Math', categorystyle: 'math_category',
      contents: [
        { kind: 'block', type: 'math_number', fields: { NUM: 0 } },
        { kind: 'block', type: 'math_arithmetic' },
        { kind: 'block', type: 'math_single' },
        { kind: 'block', type: 'math_trig' },
        { kind: 'block', type: 'math_constant' },
        { kind: 'block', type: 'math_number_property' },
        { kind: 'block', type: 'math_round' },
        { kind: 'block', type: 'math_on_list' },
        { kind: 'block', type: 'math_modulo' },
        { kind: 'block', type: 'math_constrain', inputs: { LOW: { shadow: { type: 'math_number', fields: { NUM: 1 } } }, HIGH: { shadow: { type: 'math_number', fields: { NUM: 100 } } } } },
        { kind: 'block', type: 'math_random_int', inputs: { FROM: { shadow: { type: 'math_number', fields: { NUM: 1 } } }, TO: { shadow: { type: 'math_number', fields: { NUM: 100 } } } } },
        { kind: 'block', type: 'math_random_float' },
      ],
    },
    {
      kind: 'category', name: 'Text', categorystyle: 'text_category',
      contents: [
        { kind: 'block', type: 'text' },
        { kind: 'block', type: 'text_join' },
        { kind: 'block', type: 'text_append' },
        { kind: 'block', type: 'text_length' },
        { kind: 'block', type: 'text_isEmpty' },
        { kind: 'block', type: 'text_indexOf' },
        { kind: 'block', type: 'text_charAt' },
        { kind: 'block', type: 'text_getSubstring' },
        { kind: 'block', type: 'text_changeCase' },
        { kind: 'block', type: 'text_trim' },
        { kind: 'block', type: 'text_print' },
        { kind: 'block', type: 'text_prompt_ext', inputs: { TEXT: { shadow: { type: 'text' } } } },
      ],
    },
    {
      kind: 'category', name: 'Lists', categorystyle: 'list_category',
      contents: [
        { kind: 'block', type: 'lists_create_with' },
        { kind: 'block', type: 'lists_repeat', inputs: { NUM: { shadow: { type: 'math_number', fields: { NUM: 5 } } } } },
        { kind: 'block', type: 'lists_length' },
        { kind: 'block', type: 'lists_isEmpty' },
        { kind: 'block', type: 'lists_indexOf' },
        { kind: 'block', type: 'lists_getIndex' },
        { kind: 'block', type: 'lists_setIndex' },
        { kind: 'block', type: 'lists_getSublist' },
        { kind: 'block', type: 'lists_split' },
        { kind: 'block', type: 'lists_sort' },
      ],
    },
    // NOTE: the classic "Colour" category was dropped — colour blocks
    // (colour_picker/rgb/blend/random) + field_colour were extracted out of
    // Blockly core into the separate @blockly/field-colour package in v11+, so
    // they aren't registered here; referencing them broke the whole toolbox
    // flyout on category click.
];

// Variables / Functions go last (after the procedural + UML categories).
const VARIABLE_FUNCTION_CATEGORIES = [
  { kind: 'sep' },
  { kind: 'category', name: 'Variables', categorystyle: 'variable_category', custom: 'VARIABLE' },
  { kind: 'category', name: 'Functions', categorystyle: 'procedure_category', custom: 'PROCEDURE' },
];

// Dark theme matching the app's editor surfaces.
const darkTheme = Blockly.Theme.defineTheme('automate-dark', {
  name: 'automate-dark',
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: '#1e1e1e',
    toolboxBackgroundColour: '#252526',
    toolboxForegroundColour: '#cccccc',
    flyoutBackgroundColour: '#2d2d30',
    flyoutForegroundColour: '#cccccc',
    flyoutOpacity: 1,
    scrollbarColour: '#5a5a5a',
    insertionMarkerColour: '#ffffff',
    insertionMarkerOpacity: 0.3,
    cursorColour: '#ffffff',
  },
});

export default function AutomateBlocklyEditor({ initialState, onChange, umlClasses }: AutomateBlocklyEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<Blockly.WorkspaceSvg | null>(null);
  // Keep callback current without re-injecting Blockly.
  const cbRef = useRef(onChange);
  cbRef.current = onChange;
  // Read these only at mount (avoid re-load loops). Selection changes re-mount
  // the component via a `key` set by the host.
  const initialRef = useRef(initialState);
  const umlRef = useRef(umlClasses);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Blockly's field editors (text input, variable/dropdown menus, tooltips)
    // render in WidgetDiv/DropDownDiv appended to <body>. Their default
    // z-index (DropDownDiv = 1000) sits BELOW the MUI fullscreen Dialog (1300),
    // so dropdowns would open hidden behind it. Raise them once, globally.
    if (!document.getElementById('automate-blockly-zfix')) {
      const style = document.createElement('style');
      style.id = 'automate-blockly-zfix';
      style.textContent =
        '.blocklyWidgetDiv,.blocklyDropDownDiv,.blocklyTooltipDiv{z-index:21000 !important;}';
      document.head.appendChild(style);
    }

    // Register the procedural List/Map/Tuple blocks + the UML class blocks, then
    // compose the toolbox: core palette → procedural collections → Variables/
    // Functions → UML categories.
    const procCategories = defineProceduralBlocks();
    const umlCategories = defineUmlBlocks(umlRef.current ?? []);
    const toolbox = {
      kind: 'categoryToolbox',
      contents: [
        ...DEFAULT_CATEGORIES,
        ...procCategories,
        ...VARIABLE_FUNCTION_CATEGORIES,
        ...(umlCategories.length ? [{ kind: 'sep' }, ...umlCategories] : []),
      ],
    };

    const ws = Blockly.inject(container, {
      toolbox,
      theme: darkTheme,
      grid: { spacing: 22, length: 3, colour: '#2a2a2a', snap: true },
      zoom: { controls: true, wheel: true, startScale: 0.9, maxScale: 3, minScale: 0.3 },
      trashcan: true,
      move: { scrollbars: true, drag: true, wheel: true },
    }) as Blockly.WorkspaceSvg;
    wsRef.current = ws;

    // Blockly's field editors (text input, dropdowns, tooltips) live in singleton
    // overlay divs appended to <body>. When the workspace is inside a MUI <Dialog>,
    // those divs sit OUTSIDE the modal's focus trap, so the modal swallows their
    // clicks/keys and the inputs can't be edited. Move them inside the modal root
    // (which is position:fixed inset:0, so absolute positioning is unchanged) while
    // this editor is mounted, then restore them to <body> on unmount — they're
    // shared with every other Blockly instance in the app.
    const modalRoot =
      (container.closest('.MuiModal-root') as HTMLElement | null) ??
      (container.closest('.MuiDialog-root') as HTMLElement | null);
    const reparented: Array<{ el: HTMLElement; origin: HTMLElement }> = [];
    const captureOverlays = () => {
      if (!modalRoot) return;
      for (const sel of ['.blocklyWidgetDiv', '.blocklyDropDownDiv', '.blocklyTooltipDiv']) {
        const el = document.querySelector<HTMLElement>(sel);
        if (el && el.parentElement && el.parentElement !== modalRoot && !reparented.some((r) => r.el === el)) {
          reparented.push({ el, origin: el.parentElement });
          modalRoot.appendChild(el);
        }
      }
    };
    captureOverlays();

    // Restore saved blocks WITHOUT firing change events (so we don't overwrite
    // existing code on a Code → Blockly switch when nothing was edited yet).
    if (initialRef.current) {
      try {
        Blockly.Events.disable();
        Blockly.serialization.workspaces.load(JSON.parse(initialRef.current), ws);
      } catch { /* ignore malformed saved state */ }
      finally { Blockly.Events.enable(); }
    }

    const handleChange = (e: Blockly.Events.Abstract) => {
      if (e.isUiEvent) return;
      if (ws.isDragging()) return;
      try {
        const js = javascriptGenerator.workspaceToCode(ws);
        const state = JSON.stringify(Blockly.serialization.workspaces.save(ws));
        cbRef.current(js, state);
      } catch { /* generator/serialization hiccup — ignore this tick */ }
    };
    ws.addChangeListener(handleChange);

    const ro = new ResizeObserver(() => Blockly.svgResize(ws));
    ro.observe(container);
    // Initial layout after the dialog finishes opening; also re-capture any
    // overlay divs that Blockly created lazily (after the first inject).
    const t = window.setTimeout(() => { Blockly.svgResize(ws); captureOverlays(); }, 0);

    return () => {
      window.clearTimeout(t);
      ro.disconnect();
      ws.removeChangeListener(handleChange);
      ws.dispose();
      wsRef.current = null;
      // Return the shared overlay divs to their original <body> parent so other
      // Blockly instances keep working after this dialog closes.
      for (const { el, origin } of reparented) {
        try { origin.appendChild(el); } catch { /* node already gone — ignore */ }
      }
    };
    // Mount-once: callbacks via cbRef, initial via initialRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
