import { Mention as TiptapMention } from '@tiptap/extension-mention';
import { mergeAttributes } from '@tiptap/core';

const CustomMention = TiptapMention.extend({
  name: 'mention',

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-id'),
        renderHTML: (attributes) => {
          if (!attributes.id) return {};
          return { 'data-id': attributes.id };
        },
      },
      label: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-label'),
        renderHTML: (attributes) => {
          if (!attributes.label) return {};
          return { 'data-label': attributes.label };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-mention]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const label = (node.attrs.label as string) ?? (node.attrs.id as string) ?? '';
    return [
      'span',
      mergeAttributes(
        { 'data-mention': '', class: 'mention', contenteditable: 'false' },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      `@${label}`,
    ];
  },

  renderText({ node }) {
    return `@${node.attrs.label}`;
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () =>
        this.editor.commands.command(({ tr, state }) => {
          let isMention = false;
          const { selection } = state;
          const { empty, anchor } = selection;

          if (!empty) return false;

          state.doc.nodesBetween(anchor - 1, anchor, (node, pos) => {
            if (node.type.name === this.name) {
              isMention = true;
              tr.insertText('', pos, pos + node.nodeSize);
              return false;
            }
          });

          return isMention;
        }),
    };
  },
});

export default CustomMention;
