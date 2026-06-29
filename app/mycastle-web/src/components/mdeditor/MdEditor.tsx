// Side-effect import: configures Monaco's TypeScript service (compiler options,
// mode configuration, web workers, completionItems on…) BEFORE any Monaco
// Editor instance mounts. The Plugin Script and Automate Script blocks inside
// MdEditor use Monaco for their fullscreen code dialogs, and without these
// patches IntelliSense never lights up (workers stay unconfigured, mode config
// defaults to "off" for completionItems). UserDataEditorPage et al. import this
// directly; for Markdown editing surfaces we keep it next to MdEditor so the
// monaco workers chunk only loads when an MdEditor instance is on screen.
import '../../modules/editor/monacoWorkers';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import { EditorState as PmEditorState } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import TypographyExtension from '@tiptap/extension-typography';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import TextAlign from '@tiptap/extension-text-align';
import { Table, TableRow } from '@tiptap/extension-table';
import { CustomTableCell } from './extensions/CustomTableCell';
import { CustomTableHeader } from './extensions/CustomTableHeader';
import { common, createLowlight } from 'lowlight';
import { Box, IconButton, Paper, Divider, Popper, Popover, TextField, Tooltip, Fab, Collapse, List, ListItemButton, ListItemText, ListItemIcon, Menu, MenuItem, Typography, useMediaQuery, useTheme } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS';
import CodeIcon from '@mui/icons-material/Code';
import LinkIcon from '@mui/icons-material/Link';
import HighlightIcon from '@mui/icons-material/Highlight';
import FormatClearIcon from '@mui/icons-material/FormatClear';
// Text alignment + extras for the bubble menu.
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import FormatAlignJustifyIcon from '@mui/icons-material/FormatAlignJustify';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import EmojiEmotionsIcon from '@mui/icons-material/EmojiEmotions';
import EmojiPicker from './components/EmojiPicker';
// Mobile bubble-menu extras: Save + a kebab "Extra" submenu with Insert
// component / Paste markdown / Dictate selection.
import SaveIcon from '@mui/icons-material/Save';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import ContentPasteGoIcon from '@mui/icons-material/ContentPasteGo';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import AddIcon from '@mui/icons-material/Add';
import PersonIcon from '@mui/icons-material/Person';
import TaskIcon from '@mui/icons-material/Task';
import FolderIcon from '@mui/icons-material/Folder';
import DictationDialog from './DictationDialog';

import MdEditorToolbar from './MdEditorToolbar';
// MobileMdToolbar itself is no longer rendered — but we still pull the
// height constant (used to size the editor's bottom padding so the bubble
// menu doesn't cover content) and all of its panel/helper exports so the
// new unified bubble menu is the single source of truth for the toolbar.
import {
  MOBILE_TOOLBAR_HEIGHT,
  FormatPanel, ColorPanel, TurnIntoPanel, InsertPanel,
  moveBlock, deleteBlock, getListItemType,
} from './MobileMdToolbar';
// Icons for the expanded bubble menu — mirror the toolbar hierarchy.
import FormatSizeIcon from '@mui/icons-material/FormatSize';
import PaletteIcon from '@mui/icons-material/Palette';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import FormatIndentIncreaseIcon from '@mui/icons-material/FormatIndentIncrease';
import FormatIndentDecreaseIcon from '@mui/icons-material/FormatIndentDecrease';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import TerminalIcon from '@mui/icons-material/Terminal';
import SlashCommands from './extensions/SlashCommands';
import EventDialog from './EventDialog';
import { EventBlock } from './extensions/EventBlockExtension';
import TodayNowMarker from './TodayNowMarker';
import { parseDateFromPath } from './eventTemplates';
import { editorOverlay } from './editorOverlayState';
import { InlineMath, MathBlock } from './extensions/MathExtension';
import { EditableImage } from './extensions/ImageExtension';
import { AudioEmbed } from './extensions/AudioExtension';
import { VideoEmbed } from './extensions/VideoExtension';
import { ComponentEmbed } from './extensions/ComponentEmbedExtension';
import { ColumnLayout, Column } from './extensions/ColumnExtension';
import { UIFormEmbed } from './extensions/UIFormExtension';
import { FormEngineEmbed } from './extensions/FormEngineExtension';
import { AutomateFlowEmbed } from './extensions/AutomateFlowExtension';
import { CadViewEmbed } from './extensions/CadViewExtension';
import { WebEmbed } from './extensions/WebEmbedExtension';
import { AutomateScriptBlock } from './extensions/AutomateScriptExtension';
import { InfoMark, INFO_MARK_EDIT_EVENT, type InfoMarkEditEventDetail } from './extensions/InfoMarkExtension';
import InfoMarkDialog from './extensions/InfoMarkDialog';
import { SpellCheckExtension, type SpellMatch } from './extensions/SpellCheckExtension';
import { AutomateDocumentProvider } from './extensions/AutomateDocumentContext';
import { PluginScriptBlock } from './extensions/PluginScriptExtension';
import { BlockActionMenu } from './BlockActionMenu';
import { BlockIdExtension } from './extensions/BlockIdExtension';
import { markdownToHtml, htmlToMarkdown } from './utils/markdownConverter';
import 'katex/dist/katex.min.css';
import './MdEditor.css';

const lowlight = createLowlight(common);

export interface MdEditorProps {
  initialContent?: string;
  onSave?: (markdown: string) => void;
  onLinkClick?: (href: string) => void;
  onCreatePage?: (path: string) => Promise<void>;
  placeholder?: string;
  editable?: boolean;
  autoFocus?: boolean;
  autoSaveDelay?: number; // ms, default 2000; 0 = disabled
  /** Current document path — used by the `/event` dialog to derive a base
   *  date from `{yyyy}/{mm}/{dd}.md` daily-journal files when inserting
   *  events from a template. Optional; absence falls back to today. */
  filePath?: string;
}

const MdEditor: React.FC<MdEditorProps> = ({
  initialContent = '',
  onSave,
  onLinkClick,
  onCreatePage,
  placeholder = 'Type \'/\' for commands...',
  editable = true,
  autoFocus = false,
  autoSaveDelay = 30000,
  filePath,
}) => {
  const theme = useTheme();
  // 'md' (< 900px) covers phones in all orientations and small tablets —
  // wider than 'sm' (600px) because the mobile toolbar is useful on any
  // touch screen, not just narrow portrait phones.
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const initialContentRef = useRef(initialContent);
  const isInitializedRef = useRef(false);
  const autoFocusRef = useRef(autoFocus);
  const onCreatePageRef = useRef(onCreatePage);
  // `/event` slash command opens this dialog; the editor + range captured
  // here let us drop the resulting markdown exactly where the slash was.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [eventDialog, setEventDialog] = useState<{ editor: any; range: any } | null>(null);
  // InfoMark dialog — open=null when closed. When `editPos` is null we're
  // inserting at the current selection; when a number, updating the node at
  // that ProseMirror position (target of a double-click on an existing mark).
  const [infoMarkDialog, setInfoMarkDialog] = useState<
    | { mode: 'insert'; initial: { text: string; title: string; body: string; bodyPath: string }; editPos: null }
    | { mode: 'edit';   initial: { text: string; title: string; body: string; bodyPath: string }; editPos: number }
    | null
  >(null);
  // Open the dialog in edit-mode whenever an InfoMark NodeView dispatches
  // the edit event (double-click). Window-level subscription because the
  // NodeView lives inside ProseMirror's render tree and a React ref chain
  // would be brittle.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<InfoMarkEditEventDetail>).detail;
      if (!detail) return;
      setInfoMarkDialog({
        mode: 'edit',
        initial: {
          text: detail.text,
          title: detail.title,
          body: detail.body,
          bodyPath: detail.bodyPath,
        },
        editPos: detail.pos,
      });
    };
    window.addEventListener(INFO_MARK_EDIT_EVENT, handler as EventListener);
    return () => window.removeEventListener(INFO_MARK_EDIT_EVENT, handler as EventListener);
  }, []);
  // Emoji picker — anchored to whichever bubble menu the user clicks from.
  // Stored as an element ref so both Popper and Portal bubble menus can
  // share the same picker without duplicating state.
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);

  // Mobile-bubble "Extra" submenu (kebab) + nested "Insert component"
  // sub-submenu. Both anchored to the kebab IconButton.
  const [extraMenuAnchor, setExtraMenuAnchor] = useState<HTMLElement | null>(null);
  const [componentSubMenuAnchor, setComponentSubMenuAnchor] = useState<HTMLElement | null>(null);
  // Four toolbar-mirror submenu Popover anchors. Same hierarchy as
  // MobileMdToolbar (Format / Color / Turn into / Insert), but stacked
  // into the bubble menu so all formatting lives in ONE bar instead of
  // two competing strips.
  const [formatPanelAnchor, setFormatPanelAnchor] = useState<HTMLElement | null>(null);
  const [colorPanelAnchor, setColorPanelAnchor] = useState<HTMLElement | null>(null);
  const [turnIntoPanelAnchor, setTurnIntoPanelAnchor] = useState<HTMLElement | null>(null);
  const [insertPanelAnchor, setInsertPanelAnchor] = useState<HTMLElement | null>(null);
  // Dictate-selected-text dialog — same pattern as MdEditorToolbar's
  // RecordVoiceOver button. text is captured from the current selection
  // (or whole doc when nothing's selected).
  const [dictateDialog, setDictateDialog] = useState<{ text: string } | null>(null);

  const openInsertInfoMarkDialog = useCallback(() => {
    setInfoMarkDialog({
      mode: 'insert',
      initial: { text: '', title: '', body: '', bodyPath: '' },
      editPos: null,
    });
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertEventRef = useRef<((editor: any, range: any) => void) | undefined>(
    (editor, range) => setEventDialog({ editor, range }),
  );

  // Block action menu — one button per block
  const [blockPositions, setBlockPositions] = useState<Array<{ el: HTMLElement; top: number; left: number }>>([]);
  const blockMenuOpenRef = useRef(false);
  useEffect(() => { onCreatePageRef.current = onCreatePage; }, [onCreatePage]);
  const contentWrapperRef = useRef<HTMLDivElement>(null);

  // ── "Today" detection — drives the "now" marker overlay ──────────────
  // Only rendered when filePath points at today's daily journal in any
  // `…/{yyyy}/{mm}/{dd}.md` layout (Calendar/yyyy/… is the canonical one
  // but the parser is forgiving). Compared against the user's local midnight
  // since `parseDateFromPath` returns a Date at local 00:00.
  const isTodayJournal = useMemo(() => {
    const fileDate = parseDateFromPath(filePath);
    if (!fileDate) return false;
    const today = new Date();
    return fileDate.getFullYear() === today.getFullYear()
      && fileDate.getMonth() === today.getMonth()
      && fileDate.getDate() === today.getDate();
  }, [filePath]);
  // Ticker bumped on every editor 'update' — the NowMarker re-measures event
  // block positions when this changes (typing inserts/removes nodes which
  // shift everything below).
  const [contentTick, setContentTick] = useState(0);
  // Anchor coords retained so legacy Popper-anchored components (link
  // popup) keep the same data, even though the bubble menu itself is now
  // bottom-pinned and doesn't read from it. setBubbleMenuAnchor is kept
  // because onSelectionUpdate populates it for potential future overlays.
  const [, setBubbleMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [showBubbleMenu, setShowBubbleMenu] = useState(false);
  // True while a block's fullscreen script editor (Automate / Plugin Script)
  // is open — we suppress the bubble menu so it doesn't float over the dialog.
  const [overlayActive, setOverlayActive] = useState(editorOverlay.active);
  useEffect(() => editorOverlay.subscribe(setOverlayActive), []);
  // Spellcheck — relies on the browser's native dictionary (the same one
  // OS-level system uses), driven by the contenteditable's `spellcheck`
  // + `lang` attributes. We persist the choice in localStorage so the
  // user's selection survives reloads. Default = Polish.
  const [spellLanguage, setSpellLanguage] = useState<string>(() => {
    try { return localStorage.getItem('mdeditor_spell_lang') || 'pl'; }
    catch { return 'pl'; }
  });
  const [spellEnabled, setSpellEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('mdeditor_spell_enabled') !== '0'; }
    catch { return true; }
  });
  // Ref mirror of the React state — read by SpellCheckExtension's getter
  // callbacks (which are captured in closures at editor-mount time and
  // need a live channel to current state).
  const spellOptionsRef = useRef({ language: spellLanguage, enabled: spellEnabled });
  useEffect(() => {
    spellOptionsRef.current = { language: spellLanguage, enabled: spellEnabled };
  }, [spellLanguage, spellEnabled]);
  // Popover state for click-on-underlined-word UX. anchor + match are
  // captured when the user clicks a `.md-spell-error` span (see global
  // click handler below). null = closed.
  const [spellPopover, setSpellPopover] = useState<
    | { anchor: HTMLElement; match: SpellMatch; from: number; to: number }
    | null
  >(null);
  useEffect(() => {
    try { localStorage.setItem('mdeditor_spell_lang', spellLanguage); } catch { /* full storage */ }
  }, [spellLanguage]);
  useEffect(() => {
    try { localStorage.setItem('mdeditor_spell_enabled', spellEnabled ? '1' : '0'); } catch { /* full storage */ }
  }, [spellEnabled]);
  // Tracks the visual viewport offset so we can park the bubble menu
  // directly above the on-screen keyboard on mobile. Without this the
  // menu floats above the selection — which the keyboard then covers,
  // leaving the user blind to their formatting controls. Tracks both
  // resize (keyboard open/close) and scroll (keyboard panning).
  const [keyboardOffset, setKeyboardOffset] = useState<number>(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      // Pixels between visual viewport bottom and layout viewport bottom.
      // > 0 when an on-screen keyboard is taking up space.
      const dy = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardOffset(Math.max(0, dy));
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  // Toolbar visibility — hidden while scrolling down (gains content space),
  // shown again on scroll up or when the user reaches the top. Applies on
  // every breakpoint, not just mobile. Starts visible on desktop, hidden on
  // mobile (where screen height is the scarce resource).
  const [toolbarVisible, setToolbarVisible] = useState(!isMobile);
  const lastScrollTop = useRef(0);

  // Link editing state
  const [linkPopupAnchor, setLinkPopupAnchor] = useState<{ x: number; y: number } | null>(null);
  const [showLinkPopup, setShowLinkPopup] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [hoveredLinkElement, setHoveredLinkElement] = useState<HTMLElement | null>(null);
  const linkHoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const linkHideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Store link position for editing
  const linkPositionRef = useRef<{ from: number; to: number } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: false,
      }),
      Placeholder.configure({
        placeholder,
        showOnlyWhenEditable: true,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: 'md-editor-link',
          target: null,
          rel: null,
        },
      }),
      EditableImage,
      TaskList.configure({
        HTMLAttributes: {
          class: 'md-editor-task-list',
        },
      }),
      TaskItem.configure({
        nested: true,
      }),
      Highlight.configure({
        multicolor: true,
      }),
      TypographyExtension,
      CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: {
          class: 'md-editor-code-block',
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'md-editor-table',
        },
      }),
      TableRow,
      CustomTableCell,
      CustomTableHeader,
      TextAlign.configure({
        types: ['heading', 'paragraph', 'tableCell', 'tableHeader'],
      }),
      SlashCommands.configure({ createPageRef: onCreatePageRef, insertEventRef }),
      EventBlock,
      InlineMath,
      MathBlock,
      ComponentEmbed,
      AudioEmbed,
      VideoEmbed,
      ColumnLayout,
      Column,
      UIFormEmbed,
      FormEngineEmbed,
      AutomateFlowEmbed,
      CadViewEmbed,
      WebEmbed,
      AutomateScriptBlock,
      PluginScriptBlock,
      InfoMark,
      // LanguageTool-driven spellcheck. Decorations only — the popover
      // with suggestions lives below in the JSX (mounted on click via
      // a window-level listener on .md-spell-error spans).
      // Getter callbacks read from refs (synced from React state in the
      // useEffect below) so a language switch / on-off toggle takes
      // effect on the next debounce cycle without remounting the editor.
      SpellCheckExtension.configure({
        getLanguage: () => spellOptionsRef.current.language,
        getEnabled: () => false,
        debounceMs: 1500,
      }),
      BlockIdExtension,
    ],
    content: '',
    editable,
    autofocus: autoFocus ? 'start' : false,
    editorProps: {
      // Initial spellcheck attributes — TipTap merges these onto the
      // contenteditable div on mount. The useEffect below keeps them in
      // sync if the user changes language afterwards. We seed both here
      // and there because some Chrome versions ignore late-setter on the
      // IDL property if the attribute wasn't present at first paint.
      attributes: {
        spellcheck: 'true',
        lang: 'pl',
      },
      // Clean up garbage HTML that copy-from-browser (Office, web pages,
      // Notion, Confluence, …) pastes in. Without this, the editor adopts
      // foreign fonts, colours, inline backgrounds, classnames — and the
      // user sees their carefully-styled doc suddenly turn rainbow.
      //
      // Strategy: parse the pasted HTML into a DOM tree, walk it, strip
      // style/class/font/color/bgcolor attrs + <style>/<meta>/<script>
      // tags + Office's `<o:p>` / `<w:*>` namespaced tags, then serialise
      // back. We keep the structural tags (h1-6, p, ul/ol/li, table/tr/td,
      // a, img, code, pre, strong, em, …) so legitimate markdown-relevant
      // formatting survives.
      //
      // We deliberately do NOT block <span> outright — Tiptap's mark
      // extensions (Highlight, Code, etc.) sometimes serialise to span+class
      // and we don't want to lose those. We just strip the noisy attrs.
      transformPastedHTML(html) {
        try {
          const doc = new DOMParser().parseFromString(html, 'text/html');

          // Drop tags whose only purpose is styling / metadata.
          const banned = ['style', 'meta', 'script', 'link', 'colgroup', 'col'];
          banned.forEach(t => doc.querySelectorAll(t).forEach(n => n.remove()));

          // MS Office tag namespaces — `<o:p>`, `<w:WordDocument>`, …
          // Walk via NodeIterator because tagName for namespaced tags
          // shows as the full `o:p` string and querySelector chokes on `:`.
          const all = doc.body.querySelectorAll('*');
          all.forEach((el) => {
            const tag = el.tagName.toLowerCase();
            if (tag.includes(':') || tag.startsWith('o:') || tag.startsWith('w:') || tag.startsWith('v:')) {
              // Replace with its children rather than dropping content.
              while (el.firstChild) el.parentNode?.insertBefore(el.firstChild, el);
              el.remove();
              return;
            }

            // Strip style / class / colour-y attrs that travel from
            // Google Docs / Word / web pages. data-* and aria-* are
            // kept because some Tiptap extensions round-trip through them.
            const stripAttrs = [
              'style', 'class', 'color', 'bgcolor', 'background',
              'face', 'size', 'align', 'valign',
              'lang', 'xml:lang',
            ];
            stripAttrs.forEach(a => el.removeAttribute(a));
          });

          // Unwrap <font> — purely presentational, never useful in
          // markdown. Inner content stays in place.
          doc.querySelectorAll('font').forEach(font => {
            while (font.firstChild) font.parentNode?.insertBefore(font.firstChild, font);
            font.remove();
          });

          return doc.body.innerHTML;
        } catch {
          // Parser failure — fall back to original HTML. Tiptap will at
          // worst paste it as-is (which is the same as without this hook).
          return html;
        }
      },

      // Mod+Shift+V paste-as-plain-text. Tiptap's StarterKit doesn't ship
      // this by default; without it the only escape hatch for messy
      // formatting is opening Notepad and round-tripping through it.
      handleKeyDown(view, event) {
        const isMod = event.ctrlKey || event.metaKey;
        if (isMod && event.shiftKey && (event.key === 'v' || event.key === 'V')) {
          // Read text via the async clipboard API. We don't preventDefault
          // synchronously because returning true takes care of that.
          navigator.clipboard.readText().then((text) => {
            if (!text) return;
            const { state, dispatch } = view;
            dispatch(state.tr.insertText(text));
          }).catch(() => {
            // Permission denied / not in secure context — let the default
            // paste handler run. The user just got rich-paste in that case
            // which is still fine because transformPastedHTML above cleans it.
          });
          return true;
        }
        return false;
      },
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      if (editable && from !== to) {
        const vv = window.visualViewport;
        const liveKbOffset = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
        if (liveKbOffset > 100 && vv) {
          setBubbleMenuAnchor({ x: vv.offsetLeft + vv.width / 2, y: vv.offsetTop + vv.height - 8 });
        } else {
          const start = editor.view.coordsAtPos(from);
          const end   = editor.view.coordsAtPos(to);
          setBubbleMenuAnchor({ x: (start.left + end.left) / 2, y: start.top - 10 });
        }
        setShowBubbleMenu(true);
        setShowLinkPopup(false);
      } else {
        setShowBubbleMenu(false);
      }
    },
    onBlur: () => {
      setTimeout(() => {
        if (!document.activeElement?.closest('.md-editor-bubble-menu') &&
            !document.activeElement?.closest('.md-editor-link-popup')) {
          setShowBubbleMenu(false);
          setShowLinkPopup(false);
        }
      }, 150);
    },
  });

  // ── Bubble-menu Extra actions (Save handled separately) ───────────────
  /** Read the OS clipboard and insert it as markdown — parses the text
   *  through markdownToHtml first so headings / lists / links materialise.
   *  Mobile keyboards have no separate "paste markdown" gesture so this
   *  is the only path on touch devices. Silent failure (clipboard blocked /
   *  permission denied) intentionally — the user just sees no insert. */
  const handlePasteMarkdownFromClipboard = useCallback(async () => {
    if (!editor) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      editor.chain().focus().insertContent(markdownToHtml(text)).run();
    } catch {
      /* swallow — most likely permission denied */
    }
  }, [editor]);

  /** Open the Dictation dialog with whatever the user has selected — or
   *  the whole document when nothing's selected. Same heuristic as the
   *  toolbar version. The dialog handles TTS + writing canvas internally. */
  const openDictateForSelection = useCallback(() => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    const text = empty
      ? editor.getText({ blockSeparator: '\n\n' })
      : editor.state.doc.textBetween(from, to, '\n\n', ' ');
    if (!text.trim()) return;
    setDictateDialog({ text });
  }, [editor]);

  /** Wrap insertComponentEmbed so the Extra menu can call it without
   *  reaching into editor.chain() inline (and so we can close the menus
   *  in one place). */
  const insertComponent = useCallback((type: 'person' | 'task' | 'project') => {
    if (!editor) return;
    // The chain command is added by ComponentEmbedExtension; cast inline
    // because the type-augmented Commands signature isn't visible from
    // here without pulling the extension's module declaration.
    (editor.chain().focus() as unknown as { insertComponentEmbed: (t: string, id: string) => { run: () => void } })
      .insertComponentEmbed(type, '').run();
    setComponentSubMenuAnchor(null);
    setExtraMenuAnchor(null);
  }, [editor]);

  // Load initial content only once when editor is ready
  useEffect(() => {
    if (editor && !isInitializedRef.current && initialContentRef.current) {
      const html = markdownToHtml(initialContentRef.current);
      editor.commands.setContent(html);
      // Clear history so the loaded content is the baseline — prevents undo
      // from going back past the loaded state to the empty initial document.
      // EditorState.create re-inits all plugin states (including history) to
      // their initial values, giving us an empty undo stack with the current doc.
      {
        const { view } = editor;
        const s = view.state;
        view.updateState(PmEditorState.create({
          doc: s.doc,
          schema: s.doc.type.schema,
          plugins: s.plugins,
          selection: s.selection,
        }));
      }
      // Set cursor to the beginning and scroll to top after DOM update.
      // Only focus if autoFocus is set — focusing on mobile triggers the virtual keyboard
      // and causes iOS Safari to reflow the viewport (looks like a "page reset").
      setTimeout(() => {
        if (autoFocusRef.current) {
          editor.commands.focus('start');
        }
        requestAnimationFrame(() => {
          if (contentWrapperRef.current) {
            contentWrapperRef.current.scrollTop = 0;
          }
        });
      }, 100);
      isInitializedRef.current = true;
    }
  }, [editor]);

  // Click handler for spellcheck error spans. We bind on the editor's
  // contenteditable so taps on a `.md-spell-error` decoration open the
  // suggestions popover. ProseMirror doesn't route DOM clicks to React
  // handlers on decorations, hence the native listener.
  //
  // Key insight: by the time `click` fires, ProseMirror has already moved
  // the cursor and collapsed the selection. We must sample the selection
  // state at `mousedown` — before ProseMirror processes it — and carry that
  // flag into the `click` handler. If there was a selection when the user
  // pressed down, they were navigating/selecting, not trying to fix a typo.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;

    let hadSelectionOnDown = false;
    const onMouseDown = () => {
      const { from, to } = editor.state.selection;
      hadSelectionOnDown = from !== to;
    };

    const handler = (e: MouseEvent) => {
      // User had text selected when they pressed down → they were clicking to
      // reposition the cursor or extend the selection; let the bubble menu handle it.
      if (hadSelectionOnDown) return;

      const target = e.target as HTMLElement | null;
      if (!target?.closest) return;
      const span = target.closest('.md-spell-error') as HTMLElement | null;
      if (!span) return;
      // Hydrate the SpellMatch back from the data-* attrs.
      const offset = Number(span.dataset.matchOffset);
      const length = Number(span.dataset.matchLength);
      if (!Number.isFinite(offset) || !Number.isFinite(length)) return;
      let replacements: string[] = [];
      try { replacements = JSON.parse(span.dataset.matchReplacements || '[]'); }
      catch { replacements = []; }
      const match: SpellMatch = {
        offset,
        length,
        message: span.dataset.matchMessage || '',
        category: span.dataset.matchCategory || 'TYPOS',
        ruleId: span.dataset.matchRule || '',
        replacements,
      };
      setSpellPopover({
        anchor: span,
        match,
        from: offset + 1,
        to: offset + length + 1,
      });
    };

    dom.addEventListener('mousedown', onMouseDown);
    dom.addEventListener('click', handler);
    return () => {
      dom.removeEventListener('mousedown', onMouseDown);
      dom.removeEventListener('click', handler);
    };
  }, [editor]);

  // Sync spellcheck settings to the contenteditable. We mutate BOTH the
  // IDL property and the content attribute — Chrome reads the attribute
  // when deciding whether to enable spellcheck on initial render, but
  // only re-checks via the property afterwards. Setting just one is
  // enough on most engines; setting both is harmless and Chrome-safe.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    dom.spellcheck = spellEnabled;
    dom.setAttribute('spellcheck', spellEnabled ? 'true' : 'false');
    if (spellEnabled) {
      dom.lang = spellLanguage;
      dom.setAttribute('lang', spellLanguage);
    } else {
      dom.removeAttribute('lang');
    }
    // Diagnostic log — spread fields as individual args so they're all
    // visible without expanding an Object pill in DevTools. If this shows
    // spellcheck=true lang='pl' and there's STILL no underline, the
    // dictionary either isn't installed (Chrome basic mode is selective
    // about which languages it ships) or Chrome silently treats this
    // editor as a "non-input" surface. The next debug below tries both.
    // eslint-disable-next-line no-console
    console.log(
      '[MdEditor.spellcheck] applied:',
      'spellcheck=', dom.spellcheck,
      'lang=', JSON.stringify(dom.lang),
      'attrSpellcheck=', JSON.stringify(dom.getAttribute('spellcheck')),
      'attrLang=', JSON.stringify(dom.getAttribute('lang')),
      'contenteditable=', JSON.stringify(dom.getAttribute('contenteditable')),
      'tagName=', dom.tagName,
    );
  }, [editor, spellLanguage, spellEnabled]);


  // Update initial content ref when prop changes (for external reloads)
  useEffect(() => {
    if (initialContent !== initialContentRef.current) {
      initialContentRef.current = initialContent;
      if (editor && initialContent) {
        const html = markdownToHtml(initialContent);
        editor.commands.setContent(html);
        // Clear history after external reload too — the new file's content
        // becomes the new baseline; prior undo stack from a different file
        // should not be accessible.
        {
          const { view } = editor;
          const s = view.state;
          view.updateState(PmEditorState.create({
            doc: s.doc,
            schema: s.doc.type.schema,
            plugins: s.plugins,
            selection: s.selection,
          }));
        }
        setTimeout(() => {
          if (autoFocusRef.current) {
            editor.commands.focus('start');
          }
          requestAnimationFrame(() => {
            if (contentWrapperRef.current) {
              contentWrapperRef.current.scrollTop = 0;
            }
          });
        }, 100);
      }
    }
  }, [initialContent, editor]);

  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving'>('saved');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  const onLinkClickRef = useRef(onLinkClick);
  useEffect(() => { onLinkClickRef.current = onLinkClick; }, [onLinkClick]);

  // Intercept internal link clicks — document-level capture to run before any browser navigation
  useEffect(() => {
    if (!editor) return;
    const editorDom = editor.view.dom;
    const handler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a') as HTMLAnchorElement | null;
      if (!anchor || !editorDom.contains(anchor)) return;
      const resolved = anchor.href;
      if (!resolved || resolved.startsWith('mailto:')) return;
      // Prevent default immediately for all non-mailto links inside editor
      e.preventDefault();
      e.stopPropagation();
      try {
        const url = new URL(resolved);
        if (url.origin !== window.location.origin) {
          window.open(resolved, '_blank', 'noopener,noreferrer');
          return;
        }
        if (onLinkClickRef.current) onLinkClickRef.current(url.pathname);
      } catch {
        if (onLinkClickRef.current) onLinkClickRef.current(resolved);
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [editor]);

  const updateBlockPositions = useCallback(() => {
    if (!editable || !editor) return;
    const container = contentWrapperRef.current;
    if (!container) return;
    const prosemirror = container.querySelector('.ProseMirror') as HTMLElement | null;
    if (!prosemirror) return;
    const containerBr = container.getBoundingClientRect();
    const children = Array.from(prosemirror.children) as HTMLElement[];

    // Sync blockId from ProseMirror node attrs to DOM so getBlockId() can find it
    // (needed for NodeView-based blocks like automateScriptBlock where renderHTML ≠ actual DOM)
    let idx = 0;
    editor.state.doc.forEach((node) => {
      const el = children[idx++];
      if (el && node.attrs.blockId && !el.getAttribute('data-block-id')) {
        el.setAttribute('data-block-id', node.attrs.blockId);
      }
    });

    setBlockPositions(children.map(el => ({
      el,
      top: el.getBoundingClientRect().top,
      left: containerBr.left + 4,
    })));
  }, [editable, editor]);

  const handleSave = useCallback(() => {
    if (editor && onSave) {
      const html = editor.getHTML();
      const markdown = htmlToMarkdown(html);
      setSaveStatus('saving');
      Promise.resolve(onSave(markdown)).finally(() => setSaveStatus('saved'));
    }
  }, [editor, onSave]);

  // Autosave on content change
  useEffect(() => {
    if (!editor || !autoSaveDelay) return;
    const onUpdate = () => {
      setSaveStatus('unsaved');
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => {
        if (!onSaveRef.current) return;
        const markdown = htmlToMarkdown(editor.getHTML());
        setSaveStatus('saving');
        Promise.resolve(onSaveRef.current(markdown)).finally(() => setSaveStatus('saved'));
      }, autoSaveDelay);
    };
    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [editor, autoSaveDelay]);

  // Update block positions on editor changes, scroll, resize, and ancestor
  // layout shifts. Without all of these the floating ⋯ menu icons would
  // sit at stale coords whenever:
  //   - the global window holding the editor was resized (ResizeObserver)
  //   - the page scrolled in a parent (capture-phase scroll)
  //   - the window resized (window resize)
  //   - the toolbar collapsed/expanded (handled separately below — sampled
  //     during animation since CSS transition shifts the content gradually)
  useEffect(() => {
    if (!editor || !editable) return;
    updateBlockPositions();
    const bumpTick = () => setContentTick(t => t + 1);
    editor.on('update', updateBlockPositions);
    editor.on('update', bumpTick);
    editor.on('transaction', updateBlockPositions);

    const onWinResize = () => updateBlockPositions();
    // capture:true so scrolls in ANY ancestor (split view, global window
    // chrome, document body) re-measure too — getBoundingClientRect is
    // viewport-relative, so any scroll movement changes our top.
    const onAnyScroll = () => updateBlockPositions();
    window.addEventListener('resize', onWinResize);
    window.addEventListener('scroll', onAnyScroll, true);

    let ro: ResizeObserver | null = null;
    if (contentWrapperRef.current) {
      ro = new ResizeObserver(updateBlockPositions);
      ro.observe(contentWrapperRef.current);
    }

    return () => {
      editor.off('update', updateBlockPositions);
      editor.off('update', bumpTick);
      editor.off('transaction', updateBlockPositions);
      window.removeEventListener('resize', onWinResize);
      window.removeEventListener('scroll', onAnyScroll, true);
      ro?.disconnect();
    };
  }, [editor, editable, updateBlockPositions]);

  // Toolbar Collapse animates with a 200ms transition — content slides
  // gradually. Sample the block positions several times along the way
  // so the ⋯ icons follow the moving content instead of jumping at the
  // end (or, worse, sitting at their pre-animation coords).
  useEffect(() => {
    if (!editor || !editable) return;
    updateBlockPositions();
    const ticks = [40, 100, 160, 220].map(d => setTimeout(updateBlockPositions, d));
    return () => ticks.forEach(clearTimeout);
  }, [toolbarVisible, editor, editable, updateBlockPositions]);

  // Re-anchor bubble menu when keyboard opens/closes (selection may already exist).
  useEffect(() => {
    if (!editor || !showBubbleMenu) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const vv = window.visualViewport;
    const liveKbOffset = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    if (liveKbOffset > 100 && vv) {
      setBubbleMenuAnchor({ x: vv.offsetLeft + vv.width / 2, y: vv.offsetTop + vv.height - 8 });
    } else {
      const start = editor.view.coordsAtPos(from);
      const end   = editor.view.coordsAtPos(to);
      setBubbleMenuAnchor({ x: (start.left + end.left) / 2, y: start.top - 10 });
    }
  }, [keyboardOffset, editor, showBubbleMenu]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);
    if (url === null) return;
    if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const handleLinkUrlChange = useCallback((newUrl: string) => {
    setLinkUrl(newUrl);
  }, []);

  const handleLinkUrlSubmit = useCallback(() => {
    if (!editor) return;

    // Use stored position to select the link
    if (linkPositionRef.current) {
      const { from, to } = linkPositionRef.current;
      editor.chain().focus().setTextSelection({ from, to }).run();
    }

    if (linkUrl === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
    }
    setShowLinkPopup(false);
    linkPositionRef.current = null;
  }, [editor, linkUrl]);

  const handleRemoveLink = useCallback(() => {
    if (!editor) return;

    // Use stored position to select the link
    if (linkPositionRef.current) {
      const { from, to } = linkPositionRef.current;
      editor.chain().focus().setTextSelection({ from, to }).run();
    }

    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setShowLinkPopup(false);
    linkPositionRef.current = null;
  }, [editor]);

  const handleOpenLink = useCallback(() => {
    if (!linkUrl) return;

    try {
      const url = new URL(linkUrl, window.location.href);
      if (url.protocol === 'mailto:') {
        window.open(linkUrl, '_blank', 'noopener,noreferrer');
      } else if (url.origin === window.location.origin) {
        // Same-origin: route internally
        if (onLinkClick) {
          onLinkClick(url.pathname);
        } else {
          window.open(url.pathname, '_self');
        }
      } else {
        window.open(linkUrl, '_blank', 'noopener,noreferrer');
      }
    } catch {
      if (onLinkClick) {
        onLinkClick(linkUrl);
      }
    }
  }, [linkUrl, onLinkClick]);

  // Handle mouse over links - show popup after delay
  const handleEditorMouseOver = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Match any <a> element inside ProseMirror editor
    const linkElement = target.closest('.ProseMirror a') as HTMLAnchorElement | null;

    if (linkElement && linkElement.hasAttribute('href') && editor) {
      // Cancel any pending hide timeout when returning to a link
      if (linkHideTimeoutRef.current) {
        clearTimeout(linkHideTimeoutRef.current);
        linkHideTimeoutRef.current = null;
      }

      if (linkElement !== hoveredLinkElement) {
        // Clear any existing show timeout
        if (linkHoverTimeoutRef.current) {
          clearTimeout(linkHoverTimeoutRef.current);
        }

        setHoveredLinkElement(linkElement);

        // Show popup after delay (500ms)
        linkHoverTimeoutRef.current = setTimeout(() => {
          const rect = linkElement.getBoundingClientRect();
          const href = linkElement.getAttribute('href') || '';

          // Store the link's position in the document for later editing
          try {
            const view = editor.view;
            const pos = view.posAtDOM(linkElement, 0);
            // Find the full extent of the link mark
            const $pos = view.state.doc.resolve(pos);
            const linkMark = $pos.marks().find(m => m.type.name === 'link');
            if (linkMark) {
              // Find start and end of the link
              let from = pos;
              let to = pos;

              // Search backwards for link start
              while (from > 0) {
                const $from = view.state.doc.resolve(from - 1);
                if (!$from.marks().some(m => m.type.name === 'link' && m.attrs.href === linkMark.attrs.href)) {
                  break;
                }
                from--;
              }

              // Search forwards for link end
              while (to < view.state.doc.content.size) {
                const $to = view.state.doc.resolve(to);
                if (!$to.marks().some(m => m.type.name === 'link' && m.attrs.href === linkMark.attrs.href)) {
                  break;
                }
                to++;
              }

              linkPositionRef.current = { from, to };
            }
          } catch (err) {
            console.warn('Could not determine link position:', err);
            linkPositionRef.current = null;
          }

          setLinkPopupAnchor({
            x: rect.left,
            y: rect.bottom + 5,
          });
          setLinkUrl(href);
          setShowLinkPopup(true);
        }, 500);
      }
    }
  }, [hoveredLinkElement, editor]);

  const handleEditorMouseOut = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const relatedTarget = e.relatedTarget as HTMLElement | null;

    // Check if we're leaving a link element
    const linkElement = target.closest('.ProseMirror a');
    if (linkElement) {
      // Check if we're moving to the popup or another part of the same link
      const isMovingToPopup = relatedTarget?.closest('.md-editor-link-popup');
      const isMovingToSameLink = relatedTarget?.closest('.ProseMirror a') === linkElement;

      if (!isMovingToPopup && !isMovingToSameLink) {
        // Clear show timeout if we leave before delay
        if (linkHoverTimeoutRef.current) {
          clearTimeout(linkHoverTimeoutRef.current);
          linkHoverTimeoutRef.current = null;
        }

        // Add delay before hiding to allow moving to popup
        if (linkHideTimeoutRef.current) {
          clearTimeout(linkHideTimeoutRef.current);
        }
        linkHideTimeoutRef.current = setTimeout(() => {
          setHoveredLinkElement(null);
          setShowLinkPopup(false);
        }, 150);
      }
    }
  }, []);

  const handleLinkPopupMouseEnter = useCallback(() => {
    // Cancel any pending hide timeout
    if (linkHideTimeoutRef.current) {
      clearTimeout(linkHideTimeoutRef.current);
      linkHideTimeoutRef.current = null;
    }
    // Also cancel show timeout
    if (linkHoverTimeoutRef.current) {
      clearTimeout(linkHoverTimeoutRef.current);
      linkHoverTimeoutRef.current = null;
    }
  }, []);

  const handleLinkPopupMouseLeave = useCallback(() => {
    // Add small delay before hiding when leaving popup
    if (linkHideTimeoutRef.current) {
      clearTimeout(linkHideTimeoutRef.current);
    }
    linkHideTimeoutRef.current = setTimeout(() => {
      setShowLinkPopup(false);
      setHoveredLinkElement(null);
    }, 150);
  }, []);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (linkHoverTimeoutRef.current) {
        clearTimeout(linkHoverTimeoutRef.current);
      }
      if (linkHideTimeoutRef.current) {
        clearTimeout(linkHideTimeoutRef.current);
      }
    };
  }, []);


  // Smart auto-hide on scroll — covers every breakpoint, not just mobile.
  // Going down past ~10px reclaims toolbar space for content; reverting
  // direction or hitting the top brings it back. Threshold of 10px filters
  // out the jitter you get from inertial scroll / trackpad flicks.
  const handleScroll = useCallback(() => {
    if (!contentWrapperRef.current) return;

    const scrollTop = contentWrapperRef.current.scrollTop;
    const scrollDelta = scrollTop - lastScrollTop.current;

    if (scrollTop <= 4) {
      // Always show the toolbar near the top — feels weird to have it
      // missing when the doc isn't actually scrolled.
      if (!toolbarVisible) setToolbarVisible(true);
    } else if (scrollDelta > 10 && toolbarVisible) {
      setToolbarVisible(false);
    } else if (scrollDelta < -10 && !toolbarVisible) {
      setToolbarVisible(true);
    }

    lastScrollTop.current = scrollTop;
    updateBlockPositions();
  }, [toolbarVisible, updateBlockPositions]);

  // Update toolbar visibility when switching between mobile/desktop
  useEffect(() => {
    setToolbarVisible(!isMobile);
  }, [isMobile]);

  // Handle formatting commands emitted from the MonacoMultiEditor plugin toolbar
  useEffect(() => {
    if (!editor) return;
    // Dynamic import to avoid circular deps — globalEventBus lives in web-client
    let unsub: (() => void) | null = null;
    import('@mhersztowski/web-client').then(({ globalEventBus }) => {
      unsub = globalEventBus.on<{ type: string }>('mde:command', ({ type }) => {
        switch (type) {
          case 'bold': editor.chain().focus().toggleBold().run(); break;
          case 'italic': editor.chain().focus().toggleItalic().run(); break;
          case 'strike': editor.chain().focus().toggleStrike().run(); break;
          case 'code': editor.chain().focus().toggleCode().run(); break;
          case 'h1': editor.chain().focus().toggleHeading({ level: 1 }).run(); break;
          case 'h2': editor.chain().focus().toggleHeading({ level: 2 }).run(); break;
          case 'h3': editor.chain().focus().toggleHeading({ level: 3 }).run(); break;
          case 'bulletList': editor.chain().focus().toggleBulletList().run(); break;
          case 'orderedList': editor.chain().focus().toggleOrderedList().run(); break;
          case 'blockquote': editor.chain().focus().toggleBlockquote().run(); break;
        }
      });
    });
    return () => { unsub?.(); };
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <>
    <AutomateDocumentProvider documentPath={filePath}>
    <Box className="md-editor-container" sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Editing toolbar — hidden in read-only (viewer) mode */}
      {editable && (
        <Collapse in={toolbarVisible} timeout={200}>
          <MdEditorToolbar
            editor={editor}
            onSave={handleSave}
            saveDisabled={saveStatus === 'saved'}
            onInsertInfoMark={openInsertInfoMarkDialog}
            spellLanguage={spellLanguage}
            spellEnabled={spellEnabled}
            onSpellLanguageChange={setSpellLanguage}
            onSpellEnabledChange={setSpellEnabled}
          />
        </Collapse>
      )}

      {/* FAB to show toolbar when hidden on mobile */}
      {isMobile && !toolbarVisible && (
        <Fab
          size="small"
          color="primary"
          onClick={() => setToolbarVisible(true)}
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 20,
          }}
        >
          <EditIcon />
        </Fab>
      )}

      {/* Close button when toolbar is visible on mobile */}
      {isMobile && toolbarVisible && (
        <IconButton
          size="small"
          onClick={() => setToolbarVisible(false)}
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            zIndex: 20,
            bgcolor: 'background.paper',
            boxShadow: 1,
            '&:hover': { bgcolor: 'grey.100' },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      )}

      {/* MobileMdToolbar removed — its entire hierarchy (Format / Color /
          Turn into / Insert submenus + Move/Indent/Delete/Undo/Redo
          direct buttons) is now lifted into the bottom bubble menu below.
          One bar, identical hierarchy, single source of truth via the
          exported FormatPanel / ColorPanel / TurnIntoPanel / InsertPanel. */}

      {/* Single bubble menu — fixed to the bottom of the viewport on EVERY
          screen size, carries the COMPLETE formatting toolbar hierarchy.
          With the on-screen keyboard up it climbs above the keyboard via
          keyboardOffset; otherwise it sits flush with the safe-area inset. */}
      {showBubbleMenu && !overlayActive && ReactDOM.createPortal(
        <Paper elevation={6} className="md-editor-bubble-menu"
          sx={{
            position: 'fixed',
            // Pin flush to the bottom of the viewport (the old MobileMd-
            // Toolbar is gone — everything lives in this bubble now). On
            // mobile with the keyboard up we float just above it; on
            // desktop / closed keyboard we respect the safe-area inset
            // (iPhone home indicator, Android gesture handle).
            bottom: keyboardOffset > 0
              ? `${keyboardOffset + 4}px`
              : `calc(env(safe-area-inset-bottom, 0px) + 4px)`,
            left: '50%',
            transform: 'translateX(-50%)', zIndex: 1350,
            display: 'flex', alignItems: 'center', p: 0.5, borderRadius: 2, gap: 0.25, flexWrap: 'wrap',
            maxWidth: 'calc(100vw - 16px)',
          }}
        >
          {/* Quick marks — always one tap away. */}
          <IconButton size="small" onClick={() => editor.chain().focus().toggleBold().run()} color={editor.isActive('bold') ? 'primary' : 'default'} title="Pogrubienie"><FormatBoldIcon fontSize="small" /></IconButton>
          <IconButton size="small" onClick={() => editor.chain().focus().toggleItalic().run()} color={editor.isActive('italic') ? 'primary' : 'default'} title="Kursywa"><FormatItalicIcon fontSize="small" /></IconButton>
          <IconButton size="small" onClick={() => editor.chain().focus().toggleStrike().run()} color={editor.isActive('strike') ? 'primary' : 'default'} title="Przekreślenie"><StrikethroughSIcon fontSize="small" /></IconButton>
          <IconButton size="small" onClick={() => editor.chain().focus().toggleCode().run()} color={editor.isActive('code') ? 'primary' : 'default'} title="Kod inline"><CodeIcon fontSize="small" /></IconButton>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
          {/* Alignment — also accessible from FormatPanel but exposed at
              top level because it's per-character / per-block frequent. */}
          <IconButton size="small" onClick={() => editor.chain().focus().setTextAlign('left').run()} color={editor.isActive({ textAlign: 'left' }) ? 'primary' : 'default'} title="Wyrównaj do lewej"><FormatAlignLeftIcon fontSize="small" /></IconButton>
          <IconButton size="small" onClick={() => editor.chain().focus().setTextAlign('center').run()} color={editor.isActive({ textAlign: 'center' }) ? 'primary' : 'default'} title="Wyśrodkuj"><FormatAlignCenterIcon fontSize="small" /></IconButton>
          <IconButton size="small" onClick={() => editor.chain().focus().setTextAlign('right').run()} color={editor.isActive({ textAlign: 'right' }) ? 'primary' : 'default'} title="Wyrównaj do prawej"><FormatAlignRightIcon fontSize="small" /></IconButton>
          <IconButton size="small" onClick={() => editor.chain().focus().setTextAlign('justify').run()} color={editor.isActive({ textAlign: 'justify' }) ? 'primary' : 'default'} title="Wyjustuj"><FormatAlignJustifyIcon fontSize="small" /></IconButton>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
          {/* Inline annotations. */}
          <IconButton size="small" onClick={setLink} color={editor.isActive('link') ? 'primary' : 'default'} title="Link (Ctrl+K)"><LinkIcon fontSize="small" /></IconButton>
          <IconButton size="small" onClick={() => editor.chain().focus().toggleHighlight().run()} color={editor.isActive('highlight') ? 'primary' : 'default'} title="Zaznaczenie"><HighlightIcon fontSize="small" /></IconButton>
          <IconButton size="small" onClick={openInsertInfoMarkDialog} title="Wyróżnienie z opisem"><InfoOutlinedIcon fontSize="small" /></IconButton>
          <IconButton size="small" onClick={(e) => setEmojiAnchor(e.currentTarget)} title="Wstaw emoji / znak specjalny"><EmojiEmotionsIcon fontSize="small" /></IconButton>
          <IconButton size="small" onClick={() => editor.chain().focus().unsetAllMarks().run()} title="Wyczyść formatowanie"><FormatClearIcon fontSize="small" /></IconButton>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
          {/* Submenu buttons — identical hierarchy as the (removed)
              MobileMdToolbar. Each opens a Popover with the corresponding
              exported panel from MobileMdToolbar.tsx. */}
          <Tooltip title="Format (nagłówki, listy, cytat…)">
            <IconButton size="small" onClick={(e) => setFormatPanelAnchor(e.currentTarget)}>
              <FormatSizeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Kolor i podświetlenie">
            <IconButton size="small" onClick={(e) => setColorPanelAnchor(e.currentTarget)}>
              <PaletteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zamień blok na…">
            <IconButton size="small" onClick={(e) => setTurnIntoPanelAnchor(e.currentTarget)}>
              <SwapHorizIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Wstaw blok (tabela, obraz, pozioma linia…)">
            <IconButton size="small" onClick={(e) => setInsertPanelAnchor(e.currentTarget)}>
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
          {/* Block-level direct actions — promoted out of MobileMdToolbar's
              row 2. The user wanted everything within reach without the
              second bar so we surface these at the top level. */}
          <Tooltip title="Przesuń blok w górę">
            <IconButton size="small" onClick={() => moveBlock(editor, 'up')}>
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Przesuń blok w dół">
            <IconButton size="small" onClick={() => moveBlock(editor, 'down')}>
              <ArrowDownwardIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zmniejsz wcięcie">
            <IconButton size="small" onClick={() => {
              const li = getListItemType(editor);
              editor.chain().focus().liftListItem(li).run();
            }}>
              <FormatIndentDecreaseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zwiększ wcięcie">
            <IconButton size="small" onClick={() => {
              const li = getListItemType(editor);
              editor.chain().focus().sinkListItem(li).run();
            }}>
              <FormatIndentIncreaseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Usuń blok">
            <IconButton size="small" onClick={() => deleteBlock(editor)}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
          {/* History + command palette. */}
          <Tooltip title="Cofnij (Ctrl+Z)">
            <IconButton size="small" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
              <UndoIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Ponów (Ctrl+Y)">
            <IconButton size="small" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
              <RedoIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Paleta komend (/)">
            <IconButton size="small" onClick={() => {
              editor.chain().focus().insertContent('/').run();
            }}>
              <TerminalIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
          {/* Save + Extra (content injection) — kept at the right edge as
              the persistent home for cross-cutting actions. */}
          <Tooltip title="Zapisz (Ctrl+S)">
            <span>
              <IconButton size="small" onClick={handleSave} color="primary">
                <SaveIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Więcej (Insert component / Wklej Markdown / Dyktuj)">
            <IconButton size="small" onClick={(e) => setExtraMenuAnchor(e.currentTarget)}>
              <MoreHorizIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Paper>,
        document.body,
      )}

      {/* ── Submenu Popovers (mirror MobileMdToolbar panels) ─────────────
          Each Popover hosts the exact same panel component the old
          MobileMdToolbar used, so any change to a panel's items
          propagates here automatically. */}
      <Popover
        open={formatPanelAnchor !== null}
        anchorEl={formatPanelAnchor}
        onClose={() => setFormatPanelAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {editor && (
          <FormatPanel editor={editor} onClose={() => setFormatPanelAnchor(null)} />
        )}
      </Popover>
      <Popover
        open={colorPanelAnchor !== null}
        anchorEl={colorPanelAnchor}
        onClose={() => setColorPanelAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {editor && (
          <ColorPanel editor={editor} onClose={() => setColorPanelAnchor(null)} />
        )}
      </Popover>
      <Popover
        open={turnIntoPanelAnchor !== null}
        anchorEl={turnIntoPanelAnchor}
        onClose={() => setTurnIntoPanelAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {editor && (
          <TurnIntoPanel editor={editor} onClose={() => setTurnIntoPanelAnchor(null)} />
        )}
      </Popover>
      <Popover
        open={insertPanelAnchor !== null}
        anchorEl={insertPanelAnchor}
        onClose={() => setInsertPanelAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {editor && (
          <InsertPanel editor={editor} onClose={() => setInsertPanelAnchor(null)} />
        )}
      </Popover>

      {/* Extra submenu — anchored to the kebab in the mobile bubble menu.
          Three actions, each leaving the bubble menu visible so the user
          can keep typing afterwards. */}
      <Menu
        anchorEl={extraMenuAnchor}
        open={extraMenuAnchor !== null}
        onClose={() => { setExtraMenuAnchor(null); setComponentSubMenuAnchor(null); }}
        sx={{ zIndex: 1400 }}
      >
        <MenuItem onClick={(e) => setComponentSubMenuAnchor(e.currentTarget)}>
          <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Wstaw component…" secondary="Person · Task · Project" />
        </MenuItem>
        <MenuItem onClick={() => { setExtraMenuAnchor(null); void handlePasteMarkdownFromClipboard(); }}>
          <ListItemIcon><ContentPasteGoIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Wklej Markdown ze schowka" />
        </MenuItem>
        <MenuItem onClick={() => { setExtraMenuAnchor(null); openDictateForSelection(); }}>
          <ListItemIcon><RecordVoiceOverIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Dyktuj zaznaczony tekst" secondary="Lub cały dokument gdy nic nie zaznaczone" />
        </MenuItem>
      </Menu>

      {/* Component-type picker submenu — three component-embed types, same
          shape as MdEditorToolbar's Insert menu. Choosing one fires
          insertComponent which closes both menus. */}
      <Menu
        anchorEl={componentSubMenuAnchor}
        open={componentSubMenuAnchor !== null}
        onClose={() => setComponentSubMenuAnchor(null)}
        sx={{ zIndex: 1500 }}
      >
        <MenuItem onClick={() => insertComponent('person')}>
          <ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Person" />
        </MenuItem>
        <MenuItem onClick={() => insertComponent('task')}>
          <ListItemIcon><TaskIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Task" />
        </MenuItem>
        <MenuItem onClick={() => insertComponent('project')}>
          <ListItemIcon><FolderIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Project" />
        </MenuItem>
      </Menu>

      {/* Dictation dialog — speaks the captured text, highlights words
          as they're spoken, and provides a writing canvas. State driven by
          openDictateForSelection (from the Extra menu). */}
      {dictateDialog && (
        <DictationDialog
          open
          onClose={() => setDictateDialog(null)}
          text={dictateDialog.text}
        />
      )}

      {/* Emoji / special-char picker popover. Triggered from either bubble
          menu via setEmojiAnchor. EmojiPicker handles category tabs +
          search internally; we just need to inject the picked char. */}
      <Popover
        open={emojiAnchor !== null}
        anchorEl={emojiAnchor}
        onClose={() => setEmojiAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ zIndex: 1400 }}
      >
        <EmojiPicker onSelect={(char) => {
          editor.chain().focus().insertContent(char).run();
          // Leave the popover open so the user can pick multiple emojis
          // in a row without re-opening. Close on Esc (Popover default).
        }} />
      </Popover>

      {/* Link Edit Popup - appears when cursor is on a link */}
      <Popper
        open={showLinkPopup && linkPopupAnchor !== null}
        anchorEl={
          linkPopupAnchor
            ? {
                getBoundingClientRect: () => ({
                  top: linkPopupAnchor.y,
                  left: linkPopupAnchor.x,
                  bottom: linkPopupAnchor.y,
                  right: linkPopupAnchor.x,
                  width: 0,
                  height: 0,
                  x: linkPopupAnchor.x,
                  y: linkPopupAnchor.y,
                  toJSON: () => ({}),
                }),
              }
            : null
        }
        placement="bottom-start"
        sx={{ zIndex: 1300 }}
      >
        <Paper
          elevation={4}
          className="md-editor-link-popup"
          onMouseEnter={handleLinkPopupMouseEnter}
          onMouseLeave={handleLinkPopupMouseLeave}
          sx={{
            display: 'flex',
            alignItems: 'center',
            p: 1,
            borderRadius: 1,
            gap: 0.5,
          }}
        >
          <TextField
            size="small"
            value={linkUrl}
            onChange={(e) => handleLinkUrlChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleLinkUrlSubmit();
              }
              if (e.key === 'Escape') {
                setShowLinkPopup(false);
                setHoveredLinkElement(null);
              }
            }}
            placeholder="https://"
            sx={{
              minWidth: 250,
              '& .MuiInputBase-input': {
                fontSize: '0.875rem',
              }
            }}
          />
          <Tooltip title={
            linkUrl && !linkUrl.startsWith('http://') && !linkUrl.startsWith('https://') && !linkUrl.startsWith('mailto:')
              ? "Open in editor"
              : "Open link"
          }>
            <IconButton
              size="small"
              onClick={handleOpenLink}
              disabled={!linkUrl}
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Remove link">
            <IconButton
              size="small"
              onClick={handleRemoveLink}
              color="error"
            >
              <LinkOffIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Paper>
      </Popper>

      <Box
        ref={contentWrapperRef}
        className="md-editor-content-wrapper"
        onMouseOver={handleEditorMouseOver}
        onMouseOut={handleEditorMouseOut}
        onScroll={handleScroll}
        sx={{
          flexGrow: 1,
          overflow: 'auto',
          position: 'relative',
          pt: 2,
          pb: editable
            ? `calc(${MOBILE_TOOLBAR_HEIGHT + 8}px + env(safe-area-inset-bottom, 0px))`
            : 2,
          pr: 2,
          pl: editable ? 4 : 2,
          '& .ProseMirror': {
            outline: 'none',
            minHeight: '100%',
          },
        }}
      >
        <EditorContent editor={editor} className="md-editor-content" />
        {/* "Now" timeline marker — only when this is today's daily journal.
            Pulls event positions from data-start/data-end attrs in the DOM
            and floats a horizontal bar at the current time slot. */}
        {isTodayJournal && (
          <TodayNowMarker
            containerRef={contentWrapperRef}
            layoutTick={contentTick}
          />
        )}
      </Box>
    </Box>
    </AutomateDocumentProvider>

    {/* ── Spellcheck suggestions popover ─────────────────────────────────
        Mounted at the top level so it can render outside the
        AutomateDocumentProvider tree (nothing inside the editor scope
        needs it). Anchor is the .md-spell-error span the user clicked. */}
    {spellPopover && editor && (
      <Popover
        open
        anchorEl={spellPopover.anchor}
        onClose={() => setSpellPopover(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ sx: { maxWidth: 360, minWidth: 220 } }}
        sx={{ zIndex: 1400 }}
      >
        <Box sx={{ p: 1.5, pb: 0.5 }}>
          <Typography variant="caption" sx={{
            color: 'error.main', fontWeight: 600, letterSpacing: 0.5,
            display: 'block', mb: 0.5,
          }}>
            {spellPopover.match.category === 'TYPOS' ? 'BŁĄD PISOWNI' :
             spellPopover.match.category === 'GRAMMAR' ? 'GRAMATYKA' :
             spellPopover.match.category === 'PUNCTUATION' ? 'INTERPUNKCJA' :
             spellPopover.match.category}
          </Typography>
          <Typography variant="body2">{spellPopover.match.message}</Typography>
        </Box>
        {spellPopover.match.replacements.length > 0 && (
          <List dense sx={{ borderTop: 1, borderColor: 'divider', maxHeight: 200, overflow: 'auto' }}>
            {spellPopover.match.replacements.slice(0, 8).map((replacement) => (
              <ListItemButton
                key={replacement}
                onClick={() => {
                  // Replace the offending range with the chosen suggestion.
                  editor.chain().focus().insertContentAt(
                    { from: spellPopover.from, to: spellPopover.to },
                    replacement,
                  ).run();
                  setSpellPopover(null);
                }}
              >
                <ListItemText
                  primary={replacement}
                  primaryTypographyProps={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                />
              </ListItemButton>
            ))}
          </List>
        )}
        {spellPopover.match.replacements.length === 0 && (
          <Box sx={{ px: 1.5, pb: 1.5 }}>
            <Typography variant="caption" color="text.secondary" fontStyle="italic">
              Brak sugestii.
            </Typography>
          </Box>
        )}
      </Popover>
    )}

    {editable && blockPositions.length > 0 && ReactDOM.createPortal(
      <>
        {blockPositions.map(({ el, top, left }, i) => (
          <BlockActionMenu
            key={i}
            viewportTop={top}
            viewportLeft={left}
            blockEl={el}
            onMenuOpenChange={(open) => { blockMenuOpenRef.current = open; }}
          />
        ))}
      </>,
      document.body,
    )}

    {/* InfoMark dialog — opened from the toolbar (Insert) or from a
        double-click on an existing mark (Edit). On submit we either
        insertInfoMark at the current selection or updateInfoMark at the
        captured pos. */}
    {infoMarkDialog && editor && (
      <InfoMarkDialog
        open
        mode={infoMarkDialog.mode}
        initial={infoMarkDialog.initial}
        onClose={() => setInfoMarkDialog(null)}
        onSubmit={(values) => {
          if (infoMarkDialog.mode === 'edit') {
            editor.chain().focus().updateInfoMark(infoMarkDialog.editPos, values).run();
          } else {
            editor.chain().focus().insertInfoMark(values).run();
          }
        }}
      />
    )}

    {/* Event-from-task dialog — opened by the `/event` slash command.
        Inserts the resulting markdown blockquote at the captured range,
        replacing the slash trigger. */}
    {eventDialog && (
      <EventDialog
        open
        onClose={() => setEventDialog(null)}
        filePath={filePath}
        onInsert={({ attrs }) => {
          // Single-event path. Inserts the structured EventBlock node —
          // renders as a card via ReactNodeViewRenderer, persists to markdown
          // through the converter's escapeEvents/restoreEvents pair so the
          // JSON attrs round-trip on save/load without lossy text serialisation.
          eventDialog.editor
            .chain()
            .focus()
            .insertContent({
              type: 'eventBlock',
              attrs,
            })
            .run();
        }}
        onInsertMany={(results) => {
          // Bulk template path. We pass *all* nodes to one `insertContent`
          // call so they're inserted as a single transaction — sequential
          // `insertContent`s leave the cursor on the just-inserted atom
          // (EventBlock is `selectable: true, atom: true`), which causes the
          // next call to overwrite the selection instead of appending. The
          // array form sidesteps that entirely.
          eventDialog.editor
            .chain()
            .focus()
            .insertContent(results.map(r => ({ type: 'eventBlock', attrs: r.attrs })))
            .run();
        }}
      />
    )}
    </>
  );
};

export default MdEditor;
