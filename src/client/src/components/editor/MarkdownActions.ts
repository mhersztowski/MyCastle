import {
  EditorActionsConfig,
  createWrapAction,
  createLinePrefixAction,
  createBlockAction,
  createInsertAction,
} from './EditorActionsTypes';

export const markdownActionsConfig: EditorActionsConfig = {
  language: 'markdown',
  groups: [
    {
      id: 'text-formatting',
      label: 'Text',
      actions: [
        {
          id: 'bold',
          label: 'Bold',
          icon: 'FormatBold',
          tooltip: 'Bold (Ctrl+B)',
          shortcut: 'Ctrl+B',
          executor: createWrapAction('**', '**'),
        },
        {
          id: 'italic',
          label: 'Italic',
          icon: 'FormatItalic',
          tooltip: 'Italic (Ctrl+I)',
          shortcut: 'Ctrl+I',
          executor: createWrapAction('*', '*'),
        },
        {
          id: 'strikethrough',
          label: 'Strikethrough',
          icon: 'FormatStrikethrough',
          tooltip: 'Strikethrough',
          executor: createWrapAction('~~', '~~'),
        },
        {
          id: 'code-inline',
          label: 'Inline Code',
          icon: 'Code',
          tooltip: 'Inline code',
          executor: createWrapAction('`', '`'),
        },
      ],
    },
    {
      id: 'headers',
      label: 'Headers',
      actions: [
        {
          id: 'h1',
          label: 'H1',
          icon: 'LooksOne',
          tooltip: 'Heading 1',
          executor: createLinePrefixAction('# '),
        },
        {
          id: 'h2',
          label: 'H2',
          icon: 'LooksTwo',
          tooltip: 'Heading 2',
          executor: createLinePrefixAction('## '),
        },
        {
          id: 'h3',
          label: 'H3',
          icon: 'Looks3',
          tooltip: 'Heading 3',
          executor: createLinePrefixAction('### '),
        },
      ],
    },
    {
      id: 'blocks',
      label: 'Blocks',
      actions: [
        {
          id: 'code-block',
          label: 'Code Block',
          icon: 'IntegrationInstructions',
          tooltip: 'Code block',
          executor: createBlockAction('```', '```'),
        },
        {
          id: 'quote',
          label: 'Quote',
          icon: 'FormatQuote',
          tooltip: 'Blockquote',
          executor: createLinePrefixAction('> '),
        },
      ],
    },
    {
      id: 'lists',
      label: 'Lists',
      actions: [
        {
          id: 'bullet-list',
          label: 'Bullet List',
          icon: 'FormatListBulleted',
          tooltip: 'Bullet list',
          executor: createLinePrefixAction('- '),
        },
        {
          id: 'numbered-list',
          label: 'Numbered List',
          icon: 'FormatListNumbered',
          tooltip: 'Numbered list',
          executor: createLinePrefixAction('1. '),
        },
        {
          id: 'task-list',
          label: 'Task List',
          icon: 'CheckBox',
          tooltip: 'Task list',
          executor: createLinePrefixAction('- [ ] '),
        },
      ],
    },
    {
      id: 'insert',
      label: 'Insert',
      actions: [
        {
          id: 'link',
          label: 'Link',
          icon: 'Link',
          tooltip: 'Insert link',
          executor: createWrapAction('[', '](url)'),
        },
        {
          id: 'image',
          label: 'Image',
          icon: 'Image',
          tooltip: 'Insert image',
          executor: createWrapAction('![', '](url)'),
        },
        {
          id: 'horizontal-rule',
          label: 'Horizontal Rule',
          icon: 'HorizontalRule',
          tooltip: 'Horizontal rule',
          executor: createInsertAction('\n---\n'),
        },
        {
          id: 'table',
          label: 'Table',
          icon: 'TableChart',
          tooltip: 'Insert table',
          executor: createInsertAction('\n| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |\n'),
        },
      ],
    },
  ],
};
