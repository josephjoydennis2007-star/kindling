import Paragraph from '@tiptap/extension-paragraph';

/**
 * Screenplay-aware paragraph: adds a `class` attribute (one of
 * scene-heading / action / character / parenthetical / dialogue /
 * transition) that is preserved across save/load and that the CSS
 * uses to indent and style the line.
 *
 * Without this extension, Tiptap drops attribute changes silently
 * because the default paragraph schema has no `class` attr.
 */
export const ScreenplayParagraph = Paragraph.extend({
  addAttributes() {
    return {
      class: {
        default: 'action',
        parseHTML: (el) => el.getAttribute('class') || 'action',
        renderHTML: (attrs) => {
          const c = (attrs.class as string) || 'action';
          return { class: c };
        },
      },
      pageId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-page') || null,
        renderHTML: (attrs) => (attrs.pageId ? { 'data-page': attrs.pageId } : {}),
      },
    };
  },
});

export default ScreenplayParagraph;
