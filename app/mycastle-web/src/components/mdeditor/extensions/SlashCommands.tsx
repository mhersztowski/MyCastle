import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { SuggestionOptions } from '@tiptap/suggestion';
import tippy, { Instance as TippyInstance } from 'tippy.js';
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import TitleIcon from '@mui/icons-material/Title';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import ChecklistIcon from '@mui/icons-material/Checklist';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import CodeIcon from '@mui/icons-material/Code';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import TableChartIcon from '@mui/icons-material/TableChart';
import ImageIcon from '@mui/icons-material/Image';
import AudiotrackIcon from '@mui/icons-material/Audiotrack';
import VideocamIcon from '@mui/icons-material/Videocam';
import FunctionsIcon from '@mui/icons-material/Functions';
import PersonIcon from '@mui/icons-material/Person';
import TaskIcon from '@mui/icons-material/Task';
import FolderIcon from '@mui/icons-material/Folder';
import DashboardIcon from '@mui/icons-material/Dashboard';
import DynamicFormIcon from '@mui/icons-material/DynamicForm';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import TerminalIcon from '@mui/icons-material/Terminal';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import LinkIcon from '@mui/icons-material/Link';
import ExtensionIcon from '@mui/icons-material/Extension';
import { pluginRegistry } from '../../../modules/web-plugins';

interface CommandItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  command: (props: { editor: any; range: any }) => void;
}

export interface SlashCommandsOptions {
  suggestion: Omit<SuggestionOptions, 'editor'>;
  createPageRef?: { current: ((path: string) => Promise<void>) | undefined };
}

const commands: CommandItem[] = [
  {
    title: 'Text',
    description: 'Plain text paragraph',
    icon: <TextFieldsIcon />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    },
  },
  {
    title: 'Heading 1',
    description: 'Large heading',
    icon: <TitleIcon />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    },
  },
  {
    title: 'Heading 2',
    description: 'Medium heading',
    icon: <TitleIcon sx={{ fontSize: 20 }} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    },
  },
  {
    title: 'Heading 3',
    description: 'Small heading',
    icon: <TitleIcon sx={{ fontSize: 18 }} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    },
  },
  {
    title: 'Bullet List',
    description: 'Unordered list',
    icon: <FormatListBulletedIcon />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: 'Numbered List',
    description: 'Ordered list',
    icon: <FormatListNumberedIcon />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: 'Task List',
    description: 'List with checkboxes',
    icon: <ChecklistIcon />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: 'Quote',
    description: 'Block quote',
    icon: <FormatQuoteIcon />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: 'Code Block',
    description: 'Code with syntax highlighting',
    icon: <CodeIcon />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: 'Divider',
    description: 'Horizontal line',
    icon: <HorizontalRuleIcon />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    title: 'Link',
    description: 'Insert a hyperlink',
    icon: <LinkIcon />,
    command: ({ editor, range }) => {
      const url = window.prompt('URL');
      if (!url) return;
      const text = window.prompt('Link text', url) ?? url;
      const from = range.from;
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContentAt(from, text)
        .setTextSelection({ from, to: from + text.length })
        .setLink({ href: url })
        .setTextSelection(from + text.length)
        .run();
    },
  },
  {
    title: 'Table 2x2',
    description: 'Small table (2 rows, 2 columns)',
    icon: <TableChartIcon />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 2, cols: 2, withHeaderRow: true })
        .run();
    },
  },
  {
    title: 'Table 3x3',
    description: 'Medium table (3 rows, 3 columns)',
    icon: <TableChartIcon />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    },
  },
  {
    title: 'Table 4x4',
    description: 'Large table (4 rows, 4 columns)',
    icon: <TableChartIcon />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 4, cols: 4, withHeaderRow: true })
        .run();
    },
  },
  {
    title: 'Table 5x5',
    description: 'Extra large table (5 rows, 5 columns)',
    icon: <TableChartIcon />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 5, cols: 5, withHeaderRow: true })
        .run();
    },
  },
  {
    title: 'Image',
    description: 'Insert an image (editable)',
    icon: <ImageIcon />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setImage({
          src: '',
          alt: '',
        })
        .run();
    },
  },
  {
    title: 'Audio',
    description: 'Insert audio file',
    icon: <AudiotrackIcon color="secondary" />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setAudio({
          src: '',
        })
        .run();
    },
  },
  {
    title: 'Video',
    description: 'Insert video file',
    icon: <VideocamIcon color="error" />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setVideo({
          src: '',
        })
        .run();
    },
  },
  {
    title: 'Math Block',
    description: 'Display math equation (LaTeX)',
    icon: <FunctionsIcon />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertMathBlock('E = mc^2')
        .run();
    },
  },
  {
    title: 'Inline Math',
    description: 'Inline math expression',
    icon: <FunctionsIcon sx={{ fontSize: 18 }} />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertInlineMath('x^2')
        .run();
    },
  },
  {
    title: 'Person',
    description: 'Embed a person reference',
    icon: <PersonIcon />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertComponentEmbed('person', '')
        .run();
    },
  },
  {
    title: 'Task',
    description: 'Embed a task reference',
    icon: <TaskIcon />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertComponentEmbed('task', '')
        .run();
    },
  },
  {
    title: 'Project',
    description: 'Embed a project reference',
    icon: <FolderIcon />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertComponentEmbed('project', '')
        .run();
    },
  },
  {
    title: 'UI Form',
    description: 'Embed a UI form',
    icon: <DashboardIcon color="info" />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertUIForm('')
        .run();
    },
  },
  {
    title: 'Form',
    description: 'Embed a FormEngine form',
    icon: <DynamicFormIcon color="primary" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertFormEngine('').run();
    },
  },
  {
    title: 'Automate Flow',
    description: 'Osadz automatyzacje',
    icon: <SmartToyIcon color="warning" />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertAutomateFlow('')
        .run();
    },
  },
  {
    title: 'CAD View',
    description: 'Embed a CAD / Scene3D / Electronics project',
    icon: <ViewInArIcon color="info" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertCadView('scene3d', '').run();
    },
  },
  {
    title: 'Script',
    description: 'Blok skryptu wykonywalnego',
    icon: <TerminalIcon color="success" />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertAutomateScript('// Wpisz kod tutaj\napi.log.info("Witaj!");\ndisplay.text("Wynik: OK");')
        .run();
    },
  },
  {
    title: 'Plugin Script',
    description: 'Pusty blok skryptu (auth, http, md, table, reactive)',
    icon: <ExtensionIcon sx={{ color: '#7c4dff' }} />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertPluginScript(
          '// Available: auth, http, md, table, reactive, display\n// Return a value to show it, or use display.text() for imperative output\n\nreturn `Hello, ${auth.currentUser}!`;',
          { mode: 'manual', label: 'Script' },
        )
        .run();
    },
  },
];

/**
 * Slash-command items for every Plugin Script template contributed by a loaded
 * web plugin (via `api.scripts.registerTemplate()`). Rebuilt on each `/` query so
 * the list reflects whichever plugins are currently loaded.
 */
function buildPluginTemplateCommands(): CommandItem[] {
  return pluginRegistry.getTemplates().map(({ pluginName, template }) => ({
    title: `Plugin Script: ${template.label}`,
    // Always lead the description with the source plugin so it's clear where the template comes from.
    description: template.description
      ? `${pluginName} — ${template.description}`
      : `Szablon z pluginu ${pluginName}`,
    icon: <ExtensionIcon sx={{ color: '#7c4dff' }} />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertPluginScript(template.code, {
          mode: template.mode ?? 'manual',
          label: template.label,
        })
        .run();
    },
  }));
}

interface CommandListProps {
  items: CommandItem[];
  command: (item: CommandItem) => void;
}

interface CommandListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const CommandList = forwardRef<CommandListRef, CommandListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) {
        command(item);
      }
    };

    const upHandler = () => {
      setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
    };

    const downHandler = () => {
      setSelectedIndex((prev) => (prev + 1) % items.length);
    };

    const enterHandler = () => {
      selectItem(selectedIndex);
    };

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useEffect(() => {
      const container = containerRef.current;
      const item = itemRefs.current[selectedIndex];
      if (!container || !item) return;
      const itemTop = item.offsetTop;
      const itemBottom = itemTop + item.offsetHeight;
      const containerTop = container.scrollTop;
      const containerBottom = containerTop + container.clientHeight;
      if (itemTop < containerTop) {
        container.scrollTop = itemTop;
      } else if (itemBottom > containerBottom) {
        container.scrollTop = itemBottom - container.clientHeight;
      }
    }, [selectedIndex]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === 'ArrowUp') {
          upHandler();
          return true;
        }
        if (event.key === 'ArrowDown') {
          downHandler();
          return true;
        }
        if (event.key === 'Enter') {
          enterHandler();
          return true;
        }
        return false;
      },
    }));

    return (
      <Paper
        ref={containerRef}
        elevation={4}
        sx={{
          width: 280,
          maxHeight: 400,
          overflow: 'auto',
        }}
      >
        <Typography
          variant="caption"
          sx={{ px: 2, py: 1, display: 'block', color: 'text.secondary' }}
        >
          Basic blocks
        </Typography>
        <List dense disablePadding>
          {items.length > 0 ? (
            items.map((item, index) => (
              // Index key: plugin templates from different plugins can share a
              // title (e.g. two galleries both contribute "Status polaczenia"),
              // and duplicate keys leave stale ghost rows on filter changes.
              <ListItem key={index} disablePadding ref={(el) => { itemRefs.current[index] = el as HTMLDivElement | null; }}>
                <ListItemButton
                  selected={index === selectedIndex}
                  onClick={() => selectItem(index)}
                  sx={{
                    '&.Mui-selected': {
                      bgcolor: 'action.selected',
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
                  <ListItemText
                    primary={item.title}
                    secondary={item.description}
                    primaryTypographyProps={{ variant: 'body2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                </ListItemButton>
              </ListItem>
            ))
          ) : (
            <ListItem>
              <ListItemText
                primary="No results"
                primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
              />
            </ListItem>
          )}
        </List>
      </Paper>
    );
  }
);

CommandList.displayName = 'CommandList';

function buildSuggestionConfig(
  createPageRef?: { current: ((path: string) => Promise<void>) | undefined }
): Omit<SuggestionOptions, 'editor'> {
  const pageCommand: CommandItem = {
    title: 'Page',
    description: 'Create and link a new page',
    icon: <InsertDriveFileIcon color="primary" />,
    command: ({ editor, range }) => {
      const input = window.prompt('Page path (e.g. notes/my-page or my-page)');
      if (!input) return;
      const path = input.endsWith('.md') ? input : `${input}.md`;
      const label = path.replace(/\.md$/, '').split('/').pop() ?? path;
      const from = range.from;
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContentAt(from, label)
        .setTextSelection({ from, to: from + label.length })
        .setLink({ href: path })
        .setTextSelection(from + label.length)
        .run();
      createPageRef?.current?.(path);
    },
  };

  return {
    char: '/',
    command: ({ editor, range, props }) => {
      props.command({ editor, range });
    },
    items: ({ query }) => {
      const all = [pageCommand, ...commands, ...buildPluginTemplateCommands()];
      return all.filter((item) =>
        item.title.toLowerCase().startsWith(query.toLowerCase())
      );
    },
    render: () => {
    let component: ReactRenderer | null = null;
    let popup: TippyInstance[] | null = null;

    return {
      onStart: (props) => {
        component = new ReactRenderer(CommandList, {
          props,
          editor: props.editor,
        });

        if (!props.clientRect) {
          return;
        }

        // Touch devices = virtual keyboard at the bottom. Default `bottom-start`
        // would put the palette directly under the cursor, smack in the path
        // of the keyboard. Prefer `top-start` there so the palette opens
        // ABOVE the cursor, in the visible area.
        const isTouch = typeof window !== 'undefined'
          && window.matchMedia('(pointer: coarse)').matches;
        const initialPlacement: 'bottom-start' | 'top-start' = isTouch ? 'top-start' : 'bottom-start';

        popup = tippy('body', {
          getReferenceClientRect: props.clientRect as () => DOMRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: initialPlacement,
          // iOS Safari fixes
          touch: true,
          hideOnClick: false,
          onShow(instance) {
            const vv = window.visualViewport;
            if (!vv) return;
            const update = () => instance.popperInstance?.update();
            // Both `resize` (height change when keyboard opens/closes) AND
            // `scroll` (Android often fires scroll before resize) matter — the
            // popper position needs to track both for a smooth experience.
            vv.addEventListener('resize', update);
            vv.addEventListener('scroll', update);
            (instance as any)._vvCleanup = () => {
              vv.removeEventListener('resize', update);
              vv.removeEventListener('scroll', update);
            };
          },
          onHide(instance) {
            (instance as any)._vvCleanup?.();
          },
          popperOptions: {
            strategy: 'fixed',
            modifiers: [
              {
                name: 'flip',
                options: {
                  fallbackPlacements: ['bottom-start', 'top-end', 'bottom-end'],
                },
              },
              {
                name: 'preventOverflow',
                options: {
                  boundary: 'viewport',
                  padding: 8,
                },
              },
              // Cap the popper height to whatever the visual viewport can
              // actually show above OR below the cursor. Without this, even
              // a perfect top/bottom flip leaves the bottom half of a tall
              // palette hidden under the keyboard.
              {
                name: 'capHeight',
                enabled: true,
                phase: 'beforeWrite' as const,
                requires: ['computeStyles'],
                fn({ state }: { state: any }) {
                  const vv = window.visualViewport;
                  if (!vv) return;
                  const refTop = state.rects?.reference?.top ?? 0;
                  const refBottom = state.rects?.reference?.bottom ?? refTop;
                  const visibleTop = vv.offsetTop;
                  const visibleBottom = vv.offsetTop + vv.height;
                  const spaceAbove = Math.max(0, refTop - visibleTop - 12);
                  const spaceBelow = Math.max(0, visibleBottom - refBottom - 12);
                  const maxH = Math.max(spaceAbove, spaceBelow);
                  const popperEl: HTMLElement | undefined = state.elements?.popper;
                  if (!popperEl) return;
                  // Only constrain if it actually helps — avoid setting maxH on
                  // tall desktops where the palette fits naturally.
                  if (maxH > 100) {
                    popperEl.style.maxHeight = `${Math.min(maxH, 480)}px`;
                    popperEl.style.overflowY = 'auto';
                  }
                },
              },
              // Keep popup inside the visual viewport. Runs after capHeight
              // so we already know the popper is shrinkable to fit.
              {
                name: 'visualViewportFix',
                enabled: true,
                phase: 'beforeWrite' as const,
                requires: ['computeStyles'],
                fn({ state }: { state: any }) {
                  const vv = window.visualViewport;
                  if (!vv) return;
                  const visibleTop = vv.offsetTop + 8;
                  const visibleBottom = vv.offsetTop + vv.height - 8;
                  const styles = state.styles?.popper;
                  if (!styles) return;
                  const top = parseFloat(styles.top ?? '0');
                  const popperEl: HTMLElement | undefined = state.elements?.popper;
                  // After capHeight clamps the element, prefer measured height
                  // over the popper's pre-clamp computed height.
                  const popperHeight = popperEl?.getBoundingClientRect().height
                    ?? state.rects?.popper?.height
                    ?? 0;
                  const refTop = state.rects?.reference?.top ?? top;
                  const refBottom = state.rects?.reference?.bottom ?? refTop;

                  if (top + popperHeight > visibleBottom) {
                    // Try flipping above the caret.
                    const aboveTop = refTop - popperHeight - 8;
                    if (aboveTop >= visibleTop) {
                      styles.top = `${aboveTop}px`;
                    } else {
                      // Doesn't fit either way — pin to top of visible area.
                      styles.top = `${visibleTop}px`;
                    }
                  } else if (top < visibleTop) {
                    // The popper went off the top — pin below the caret instead.
                    if (refBottom + popperHeight + 8 <= visibleBottom) {
                      styles.top = `${refBottom + 8}px`;
                    } else {
                      styles.top = `${visibleTop}px`;
                    }
                  }
                },
              },
            ],
          },
        });
      },

      onUpdate: (props) => {
        component?.updateProps(props);

        if (!props.clientRect) {
          return;
        }

        popup?.[0]?.setProps({
          getReferenceClientRect: props.clientRect as () => DOMRect,
        });
      },

      onKeyDown: (props) => {
        if (props.event.key === 'Escape') {
          popup?.[0]?.hide();
          return true;
        }

        return (component?.ref as CommandListRef)?.onKeyDown(props) ?? false;
      },

      onExit: () => {
        popup?.[0]?.destroy();
        component?.destroy();
      },
    };
  },
  };
}

const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: 'slashCommands',

  addOptions() {
    return {
      suggestion: buildSuggestionConfig(),
      createPageRef: undefined,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...buildSuggestionConfig(this.options.createPageRef),
      }),
    ];
  },
});

export default SlashCommands;
