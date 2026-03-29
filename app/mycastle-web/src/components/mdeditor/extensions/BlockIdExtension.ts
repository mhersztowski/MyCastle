import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';

// Types that get blockId via addGlobalAttributes (standard Tiptap nodes without own blockId attr)
const STANDARD_BLOCK_TYPES = ['heading', 'paragraph', 'blockquote', 'bulletList', 'orderedList', 'codeBlock', 'table'];

// Additional custom node types that manage their own blockId attr but still need auto-UUID assignment
const CUSTOM_BLOCK_TYPES = ['automateScriptBlock'];

const ALL_BLOCK_TYPES = [...STANDARD_BLOCK_TYPES, ...CUSTOM_BLOCK_TYPES];

/**
 * Assigns a persistent UUID to every block-level node.
 * IDs are serialized as data-block-id HTML attributes and round-trip through
 * markdown as <!-- bid:uuid --> comments (see markdownConverter.ts).
 */
export const BlockIdExtension = Extension.create({
  name: 'blockId',

  addGlobalAttributes() {
    return [
      {
        types: STANDARD_BLOCK_TYPES,
        attributes: {
          blockId: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-block-id') || null,
            renderHTML: (attrs) => attrs.blockId ? { 'data-block-id': attrs.blockId } : {},
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const tr = newState.tr;
          let modified = false;
          newState.doc.descendants((node, pos) => {
            if (ALL_BLOCK_TYPES.includes(node.type.name) && node.isBlock && !node.attrs.blockId) {
              tr.setNodeMarkup(pos, null, { ...node.attrs, blockId: crypto.randomUUID() });
              modified = true;
            }
          });
          return modified ? tr : null;
        },
      }),
    ];
  },
});
