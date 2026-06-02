import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import {
  ArrowRight,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Highlighter,
  Subscript as SubIcon,
  Superscript as SuperIcon,
  Undo,
  Redo,
  Type,
  FilePlus2,
  PanelLeftOpen,
  PanelLeftClose,
  BookOpen,
  Eye,
} from 'lucide-react';
import Mention from '@/components/tiptap/Mention';
import MentionList from '@/components/tiptap/MentionList';
import ScreenplayParagraph from '@/components/tiptap/ScreenplayParagraph';
import SectionsBar from '@/components/SectionsBar';
import CharacterWorkspacePanel from '@/components/CharacterWorkspacePanel';
import SceneHeatMap from '@/components/SceneHeatMap';
import DialogueGutter from '@/components/DialogueGutter';
import CoachInlinePill from '@/components/CoachInlinePill';
import { useAppStore } from '@/store/useAppStore';
import type { Character, Screenplay } from '@/types';

interface WriterViewProps {
  screenplay: Screenplay;
  onUpdateField: (field: keyof Screenplay, value: any) => void;
  onStartWriting: () => void;
  characters: Character[];
}

const TEXT_COLORS = ['#222222', '#1a73e8', '#e76f51', '#2a9d8f', '#9b5de5', '#f15bb5', '#ff9f1c', '#264653', '#ffffff'];
const HIGHLIGHT_COLORS = ['#fff59d', '#a5d6a7', '#ffab91', '#bbdefb', '#ce93d8', '#f8bbd0', '#ffe082', '#b0bec5'];

export default function WriterView({ screenplay, onUpdateField, onStartWriting, characters }: WriterViewProps) {
  const [currentFormat, setCurrentFormat] = useState('Action');
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionCommand, setMentionCommand] = useState<any>(null);
  const [mentionRect, setMentionRect] = useState<{ left: number; bottom: number; top: number } | null>(null);
  const [showColor, setShowColor] = useState(false);
  const [showHighlight, setShowHighlight] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [readingMode, setReadingMode] = useState(false);
  const [focusTyping, setFocusTyping] = useState(false);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Get focusCharacterId and methods from store
  const focusCharacterId = useAppStore((s) => s.focusCharacterId);
  const updateCharacter = useAppStore((s) => s.updateCharacter);
  // Settings for the user-toggleable writer adornments (heat strip + gutter).
  const settings = useAppStore((s) => s.settings);

  // Hooks lifted to top so they run unconditionally
  const addSection = useAppStore((s) => s.addSection);
  const updateSection = useAppStore((s) => s.updateSection);
  const deleteSection = useAppStore((s) => s.deleteSection);
  const setActiveSection = useAppStore((s) => s.setActiveSection);

  const applyFormatToCurrentLine = useCallback((ed: any, format: string) => {
    if (!ed) return;
    const { from } = ed.state.selection;
    const pos = ed.state.doc.resolve(from);
    // walk up to the paragraph parent
    let depth = pos.depth;
    while (depth > 0 && pos.node(depth).type.name !== 'paragraph') depth--;
    if (depth < 1) return;
    const paragraphPos = pos.before(depth);
    const node = ed.state.doc.nodeAt(paragraphPos);
    if (!node || node.type.name !== 'paragraph') return;
    const tr = ed.state.tr.setNodeMarkup(paragraphPos, undefined, {
      ...node.attrs,
      class: format,
    });
    ed.view.dispatch(tr);
    ed.commands.focus();
  }, []);

  const editor = useEditor({
    autofocus: 'end',
    extensions: [
      StarterKit.configure({
        paragraph: false, // use our screenplay-aware paragraph
      }),
      ScreenplayParagraph,
      Underline,
      TextStyle,
      Color,
      TextAlign.configure({ types: ['paragraph', 'heading'] }),
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      Image.configure({ inline: true, allowBase64: true }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Start writing your screenplay…' }),
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: {
          items: ({ query }: { query: string }) =>
            characters.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5),
          render: () => {
            const updateRect = (props: any) => {
              const r = props.clientRect?.();
              if (r) setMentionRect({ left: r.left, bottom: r.bottom, top: r.top });
            };
            return {
              onStart: (props: any) => {
                setShowMention(true);
                setMentionQuery(props.query || '');
                setMentionCommand(() => props.command);
                updateRect(props);
              },
              onUpdate: (props: any) => {
                setMentionQuery(props.query || '');
                setMentionCommand(() => props.command);
                updateRect(props);
              },
              onKeyDown: (props: any) => {
                if (props.event.key === 'Escape') {
                  setShowMention(false);
                  return true;
                }
                return false;
              },
              onExit: () => {
                setShowMention(false);
                setMentionQuery('');
                setMentionCommand(null);
                setMentionRect(null);
              },
            };
          },
        },
      }),
    ],
    content:
      screenplay.elements.length > 0
        ? screenplay.elements
            .map((el) => `<p class="${el.type}">${el.content}</p>`)
            .join('')
        : '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onUpdateField('elements', parseElements(html));
      const { from } = editor.state.selection;
      const node = editor.state.doc.resolve(from).parent;
      const formatClass = node.attrs.class || 'action';
      setCurrentFormat(formatClass.replace('-', ' '));
      document.dispatchEvent(new CustomEvent('writer:formatchanged', { detail: { format: formatClass } }));
    },
    onSelectionUpdate: ({ editor }) => {
      const { from } = editor.state.selection;
      const node = editor.state.doc.resolve(from).parent;
      const formatClass = node.attrs.class || 'action';
      setCurrentFormat(formatClass.replace('-', ' '));
      document.dispatchEvent(new CustomEvent('writer:formatchanged', { detail: { format: formatClass } }));
    },
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (!editor) return false;
        if (event.key === 'Tab') {
          event.preventDefault();
          const formats = ['scene-heading', 'action', 'character', 'parenthetical', 'dialogue', 'transition'];
          const current = formats.findIndex((f) => f === currentFormat.replace(' ', '-'));
          const next = formats[(current + 1) % formats.length];
          applyFormatToCurrentLine(editor!, next);
          setCurrentFormat(next.replace('-', ' '));
          document.dispatchEvent(new CustomEvent('writer:formatchanged', { detail: { format: next } }));
          return true;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          const format = currentFormat.replace(' ', '-');
          const flow: Record<string, string> = {
            'scene-heading': 'action',
            action: 'action',
            character: 'parenthetical',
            parenthetical: 'dialogue',
            dialogue: 'action',
            transition: 'scene-heading',
          };
          const next = flow[format] || 'action';
          // Let the default Enter happen; then re-format the new paragraph
          setTimeout(() => {
            applyFormatToCurrentLine(editor!, next);
            setCurrentFormat(next.replace('-', ' '));
            document.dispatchEvent(new CustomEvent('writer:formatchanged', { detail: { format: next } }));
          }, 0);
        }
        return false;
      },
    },
  });

  // Toolbar custom event bridge (also for the top Format buttons)
  useEffect(() => {
    if (!editor) return;
    const handler = (e: Event) => {
      const custom = e as CustomEvent;
      const format = custom.detail.format;
      applyFormatToCurrentLine(editor, format);
      setCurrentFormat(format.replace('-', ' '));
      document.dispatchEvent(new CustomEvent('writer:formatchanged', { detail: { format } }));
    };
    const editorEl = document.querySelector('.ProseMirror');
    editorEl?.addEventListener('applyformat', handler);
    document.addEventListener('writer:applyformat', handler as EventListener);

    // AI Insert: drop a chunk of text into the editor as a series of action paragraphs.
    const onInsertText = (ev: Event) => {
      const text = ((ev as CustomEvent).detail?.text || '').toString();
      if (!editor || !text) return;
      const blocks = text.split(/\n{2,}/).map((b: string) => b.trim()).filter(Boolean);
      const html = blocks.map((b: string) => `<p class="action">${b.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</p>`).join('');
      editor.chain().focus('end').insertContent(html).run();
    };
    document.addEventListener('writer:insertText', onInsertText as EventListener);

    // Inline streaming: AI fills the current selection with streamed text.
    // streamStart captures the selection bounds; streamChunk re-replaces from
    // the start anchor with the accumulating text; streamEnd clears state.
    let streamStart = -1;
    let streamEnd = -1;
    const onStreamStart = () => {
      if (!editor) return;
      const { from, to } = editor.state.selection;
      streamStart = from;
      streamEnd = to;
      editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, '⌛').run();
      streamEnd = streamStart + 1;
    };
    const onStreamChunk = (ev: Event) => {
      const text = ((ev as CustomEvent).detail?.text || '').toString();
      if (!editor || streamStart < 0) return;
      const safe = text.replace(/</g, '&lt;');
      editor.chain().focus().deleteRange({ from: streamStart, to: streamEnd }).insertContentAt(streamStart, safe).run();
      streamEnd = streamStart + safe.length;
    };
    const onStreamEnd = () => {
      streamStart = -1; streamEnd = -1;
    };
    document.addEventListener('writer:streamStart', onStreamStart);
    document.addEventListener('writer:streamChunk', onStreamChunk as EventListener);
    document.addEventListener('writer:streamEnd', onStreamEnd);

    // Coach "Replace in script": find the paragraph whose text matches
    // `find` and swap its content for `replace`, preserving the paragraph's
    // screenplay-format class attribute (dialogue stays dialogue, etc).
    const onReplaceText = (ev: Event) => {
      if (!editor) return;
      const { find, replace } = ((ev as CustomEvent).detail || {}) as {
        find?: string; replace?: string;
      };
      const needle = (find || '').trim().replace(/\s+/g, ' ');
      const replacement = (replace || '').trim();
      if (!needle || !replacement) return;

      // Walk the document looking for a paragraph whose collapsed text
      // matches the needle exactly. ProseMirror gives us (node, pos) pairs.
      // We wrap the result in an array so TS doesn't narrow `found` to
      // `never` across the closure assignment.
      type Range = { from: number; to: number; cls: string | null };
      const hits: Range[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (hits.length) return false;
        if (node.type.name !== 'paragraph') return true;
        const text = (node.textContent || '').trim().replace(/\s+/g, ' ');
        if (text === needle) {
          hits.push({
            from: pos + 1, // skip opening tag
            to: pos + 1 + node.content.size,
            cls: (node.attrs && (node.attrs as any).class) || null,
          });
          return false;
        }
        return true;
      });

      const range = hits[0];
      if (!range) {
        import('sonner').then(({ toast }) => toast.error('Could not find that exact line in the script.'));
        return;
      }
      // Capture the verbatim original BEFORE replacing — we need the exact
      // visible text the user saw, not our normalized needle, so undo
      // restores fidelity.
      const originalText = editor.state.doc.textBetween(range.from, range.to, '\n');
      // Replace the matched range with the new text, keep the paragraph class.
      editor
        .chain()
        .focus()
        .insertContentAt(range, replacement)
        .run();
      import('sonner').then(({ toast }) => {
        toast.success('Rewrite applied', {
          // Sonner toast actions render as a button on the toast itself.
          // Dispatching the same event in reverse triggers this same handler
          // and swaps the rewrite back to the original text.
          action: {
            label: 'Undo',
            onClick: () => {
              document.dispatchEvent(new CustomEvent('writer:replaceText', {
                detail: { find: replacement, replace: originalText },
              }));
            },
          },
        });
      });
    };
    document.addEventListener('writer:replaceText', onReplaceText as EventListener);

    return () => {
      editorEl?.removeEventListener('applyformat', handler);
      document.removeEventListener('writer:applyformat', handler as EventListener);
      document.removeEventListener('writer:insertText', onInsertText as EventListener);
      document.removeEventListener('writer:streamStart', onStreamStart);
      document.removeEventListener('writer:streamChunk', onStreamChunk as EventListener);
      document.removeEventListener('writer:streamEnd', onStreamEnd);
      document.removeEventListener('writer:replaceText', onReplaceText as EventListener);
    };
  }, [editor, applyFormatToCurrentLine]);

  // Click @mention chip jumps to character profile
  useEffect(() => {
    const editorEl = document.querySelector('.ProseMirror');
    if (!editorEl) return;
    const onClick = (e: Event) => {
      const target = (e.target as HTMLElement).closest('[data-mention]') as HTMLElement | null;
      if (target) {
        const id = target.getAttribute('data-id');
        if (id) {
          e.preventDefault();
          useAppStore.getState().focusCharacter(id);
        }
      }
    };
    editorEl.addEventListener('click', onClick);
    return () => editorEl.removeEventListener('click', onClick);
  }, [editor, screenplay.started]);

  // Refocus editor when entering the writing surface
  useEffect(() => {
    if (editor && screenplay.started) {
      const t = setTimeout(() => editor.commands.focus('end'), 50);
      return () => clearTimeout(t);
    }
  }, [editor, screenplay.started]);

  // Suggest adding new characters: when the writer types a CHARACTER cue that
  // doesn't match anyone in the cast, surface a toast with one-tap add.
  const suggestedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const knownNames = new Set(characters.map((c) => c.name.toUpperCase()));
    const stripTags = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
    const cueNames = new Set<string>();
    for (const el of screenplay.elements || []) {
      if (el.type !== 'character') continue;
      const name = stripTags(el.content || '').trim().replace(/\s*\(.*$/, '').toUpperCase();
      if (name && /^[A-Z][A-Z0-9 .'-]{0,40}$/.test(name) && name.length <= 30) cueNames.add(name);
    }
    cueNames.forEach((name) => {
      if (knownNames.has(name)) return;
      if (suggestedRef.current.has(name)) return;
      suggestedRef.current.add(name);
      // Lazy-import sonner so we don't ship the dep into a tight require chain.
      import('sonner').then(({ toast }) => {
        toast(
          `Add "${name}" to your cast?`,
          {
            action: {
              label: 'Add',
              onClick: () => {
                useAppStore.getState().addCharacter({
                  name,
                  displayName: name,
                  description: '',
                  color: '#3b82f6',
                  image: null,
                  backstory: '', goals: '', personality: '', age: '', occupation: '',
                  motivation: '', conflict: '', relationships: '', notes: '',
                  voiceAudio: null, tags: [], createdAt: Date.now(),
                });
              },
            },
            duration: 6000,
          },
        );
      });
    });
  }, [screenplay.elements, characters]);

  // Apply reading-mode (read-only)
  useEffect(() => {
    editor?.setEditable(!readingMode);
  }, [editor, readingMode]);

  // External rebuild: when the agentic co-worker writes new screenplay
  // elements via the store, dispatch `writer:rebuild` so the live TipTap
  // editor re-syncs with the store. Without this the agent's changes
  // would be invisible until the user navigated away + back.
  useEffect(() => {
    if (!editor) return;
    const onRebuild = () => {
      const els = useAppStore.getState().screenplay.elements || [];
      const html = els.map((el) => `<p class="${el.type}">${el.content}</p>`).join('');
      // setContent rebuilds the doc. The second arg is the emitUpdate flag;
      // false keeps onUpdate from firing twice as the agent's writes already
      // ran updateScreenplayField for us.
      try { (editor.commands as any).setContent(html, false); } catch { /* editor torn down */ }
    };
    document.addEventListener('writer:rebuild', onRebuild);
    return () => document.removeEventListener('writer:rebuild', onRebuild);
  }, [editor]);

  // Focus-typing: keep .is-active-paragraph on the paragraph the cursor is in,
  // strip it from siblings. We run this whenever the cursor moves.
  useEffect(() => {
    if (!editor || !focusTyping) return;
    const pm = document.querySelector('.ProseMirror');
    if (!pm) return;
    const updateActive = () => {
      const sel = window.getSelection?.();
      if (!sel || sel.rangeCount === 0) return;
      let node: Node | null = sel.getRangeAt(0).startContainer;
      while (node && node.nodeType === 3) node = (node as any).parentNode;
      let active: Element | null = null;
      while (node && node !== pm) {
        if ((node as Element).parentElement === pm) { active = node as Element; break; }
        node = (node as any).parentNode;
      }
      pm.querySelectorAll('.is-active-paragraph').forEach((el) => el.classList.remove('is-active-paragraph'));
      if (active) active.classList.add('is-active-paragraph');
    };
    updateActive();
    document.addEventListener('selectionchange', updateActive);
    return () => document.removeEventListener('selectionchange', updateActive);
  }, [editor, focusTyping]);

  const handleSelectCharacter = useCallback((_char: Character) => {
    setShowMention(false);
  }, []);

  // Build a "Pages" list. If the writer has named sections, those become the
  // pages (one section = one page in the user's mental model). Otherwise we
  // fall back to chunking elements 30 at a time.
  const pages = useMemo(() => {
    const els = screenplay.elements || [];
    const namedSections = (screenplay.sections || []).slice().sort((a, b) => a.order - b.order);
    if (namedSections.length > 0) {
      return namedSections.map((s, i) => {
        const inSection = els.filter((e) => (e as any).sectionId === s.id);
        return {
          index: i + 1,
          title: s.name,
          color: s.color,
          sectionId: s.id,
          preview: inSection.map((e) => stripTags(e.content)).filter(Boolean).slice(0, 3).join(' · ') || '(empty)',
        };
      });
    }
    const PER_PAGE = 30;
    const pageCount = Math.max(1, Math.ceil(els.length / PER_PAGE));
    return new Array(pageCount).fill(0).map((_, i) => ({
      index: i + 1,
      title: `Page ${i + 1}`,
      color: undefined as string | undefined,
      sectionId: null as string | null,
      preview: els
        .slice(i * PER_PAGE, (i + 1) * PER_PAGE)
        .map((e) => stripTags(e.content))
        .filter(Boolean)
        .slice(0, 3)
        .join(' · ') || '(empty)',
    }));
  }, [screenplay.elements, screenplay.sections]);

  const jumpToPage = useCallback((pageIndex: number) => {
    const el = pageRefs.current[pageIndex];
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  if (!screenplay.started) {
    return (
      <TitlePage
        title={screenplay.title}
        author={screenplay.author}
        contact={screenplay.contact}
        logline={screenplay.logline}
        onUpdateField={onUpdateField}
        onStart={onStartWriting}
      />
    );
  }

  const filteredChars = mentionQuery
    ? characters.filter((c) => c.name.toLowerCase().includes(mentionQuery.toLowerCase()))
    : characters;

  const sections = screenplay.sections || [];
  const activeSectionId = screenplay.activeSectionId ?? null;

  return (
    <div className="h-full flex flex-col">
      <SectionsBar
        sections={sections}
        activeSectionId={activeSectionId}
        onSelectSection={setActiveSection}
        onAddSection={addSection}
        onUpdateSection={updateSection}
        onDeleteSection={deleteSection}
      />

      {/* Rich Text Toolbar — single row, horizontal-scroll on overflow so
          buttons never wrap onto a second line and lose their order. */}
      <div className="h-9 bg-[var(--panel)] border-b border-[var(--rule)] flex items-center px-2 gap-0.5 flex-shrink-0 overflow-x-auto no-scrollbar">
        <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-bold mr-2 px-1.5 py-0.5 rounded bg-[var(--card)] border border-[var(--rule)] flex-shrink-0">
          {currentFormat}
        </span>
        <div className="w-px h-4 bg-[var(--rule)] mr-1 flex-shrink-0" />
        <RichButton icon={Bold} onClick={() => editor?.chain().focus().toggleBold().run()} active={!!editor?.isActive('bold')} title="Bold" />
        <RichButton icon={Italic} onClick={() => editor?.chain().focus().toggleItalic().run()} active={!!editor?.isActive('italic')} title="Italic" />
        <RichButton icon={UnderlineIcon} onClick={() => editor?.chain().focus().toggleUnderline().run()} active={!!editor?.isActive('underline')} title="Underline" />
        <div className="w-px h-5 bg-[var(--border)] mx-1" />
        <RichButton icon={AlignLeft} onClick={() => editor?.chain().focus().setTextAlign('left').run()} title="Align left" />
        <RichButton icon={AlignCenter} onClick={() => editor?.chain().focus().setTextAlign('center').run()} title="Align center" />
        <RichButton icon={AlignRight} onClick={() => editor?.chain().focus().setTextAlign('right').run()} title="Align right" />
        <div className="w-px h-5 bg-[var(--border)] mx-1" />

        {/* Text color picker */}
        <div className="relative">
          <RichButton icon={Type} onClick={() => { setShowColor((v) => !v); setShowHighlight(false); }} title="Text color" />
          <AnimatePresence>
            {showColor && (
              <motion.div
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="absolute top-full left-0 z-50 mt-1 p-2 bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-2xl grid grid-cols-5 gap-1"
                onMouseLeave={() => setShowColor(false)}
              >
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => { editor?.chain().focus().setColor(c).run(); setShowColor(false); }}
                    className="w-5 h-5 rounded-full border border-[var(--border)] hover:scale-110 transition-transform"
                    style={{ background: c }}
                    title={c}
                  />
                ))}
                <button
                  onClick={() => { editor?.chain().focus().unsetColor().run(); setShowColor(false); }}
                  className="col-span-5 mt-1 text-[10px] py-1 text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  Reset
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Highlight color picker */}
        <div className="relative">
          <RichButton icon={Highlighter} onClick={() => { setShowHighlight((v) => !v); setShowColor(false); }} active={!!editor?.isActive('highlight')} title="Highlight" />
          <AnimatePresence>
            {showHighlight && (
              <motion.div
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="absolute top-full left-0 z-50 mt-1 p-2 bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-2xl grid grid-cols-4 gap-1"
                onMouseLeave={() => setShowHighlight(false)}
              >
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => { editor?.chain().focus().toggleHighlight({ color: c }).run(); setShowHighlight(false); }}
                    className="w-5 h-5 rounded-full border border-[var(--border)] hover:scale-110 transition-transform"
                    style={{ background: c }}
                    title={c}
                  />
                ))}
                <button
                  onClick={() => { editor?.chain().focus().unsetHighlight().run(); setShowHighlight(false); }}
                  className="col-span-4 mt-1 text-[10px] py-1 text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  Remove highlight
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <RichButton icon={SubIcon} onClick={() => editor?.chain().focus().toggleSubscript().run()} active={!!editor?.isActive('subscript')} title="Subscript" />
        <RichButton icon={SuperIcon} onClick={() => editor?.chain().focus().toggleSuperscript().run()} active={!!editor?.isActive('superscript')} title="Superscript" />
        <div className="w-px h-5 bg-[var(--border)] mx-1" />
        <RichButton icon={Undo} onClick={() => editor?.chain().focus().undo().run()} title="Undo" />
        <RichButton icon={Redo} onClick={() => editor?.chain().focus().redo().run()} title="Redo" />

        <div className="w-px h-5 bg-[var(--border)] mx-1" />
        <button
          onClick={() => {
            // Add a real, named section. Each section acts like a page —
            // selecting it scrolls / filters the editor to its content.
            const id = addSection();
            setActiveSection(id);
            // Auto-open pages pane so user can see the new page
            setPagesOpen(true);
            // Drop an empty action paragraph at the end so the cursor lands
            // in a fresh block right away.
            editor
              ?.chain()
              .focus('end')
              .insertContent('<p class="action"></p>')
              .run();
            // Announce the new page creation
            import('sonner').then(({ toast }) => toast.success('New page created!'));
          }}
          title="Add a new page / named section"
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)] transition-colors flex-shrink-0"
        >
          <FilePlus2 className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="hidden lg:inline">Add Page</span>
        </button>
        <button
          onClick={() => setPagesOpen((v) => !v)}
          title={pagesOpen ? 'Hide page previews' : 'Show page previews'}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors flex-shrink-0 ${
            pagesOpen
              ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
          }`}
        >
          {pagesOpen ? <PanelLeftClose className="w-3.5 h-3.5 flex-shrink-0" /> : <PanelLeftOpen className="w-3.5 h-3.5 flex-shrink-0" />}
          <span className="hidden lg:inline">Pages</span>
        </button>

        <div className="w-px h-4 bg-[var(--rule)] mx-1 flex-shrink-0" />

        <button
          onClick={() => setReadingMode((v) => !v)}
          title={readingMode ? 'Exit reading mode' : 'Reading mode (read-only)'}
          aria-pressed={readingMode}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors flex-shrink-0 ${
            readingMode
              ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="hidden lg:inline">Read</span>
        </button>

        <button
          onClick={() => setFocusTyping((v) => !v)}
          title={focusTyping ? 'Exit focus typing' : 'Focus typing (dim other paragraphs)'}
          aria-pressed={focusTyping}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors flex-shrink-0 ${
            focusTyping
              ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
          }`}
        >
          <Eye className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="hidden lg:inline">Focus</span>
        </button>

        <div className="flex-1 min-w-2" />
        <span className="hidden xl:inline text-[10px] text-[var(--text-muted)] whitespace-nowrap flex-shrink-0">Tab cycles formats</span>
      </div>

      <div className="flex-1 overflow-hidden flex relative">
        {/* Page previews bar */}
        <AnimatePresence>
          {pagesOpen && (
            <motion.aside
              initial={{ x: -200, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -200, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 24 }}
              className="w-52 bg-[var(--sidebar)] border-r border-[var(--border)] overflow-y-auto p-3 flex-shrink-0"
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">
                  Outline
                </div>
                <span className="text-[10px] text-[var(--text-muted)]">{pages.length}</span>
              </div>
              {pages.map((p) => {
                const isActive = (p as any).sectionId && (p as any).sectionId === activeSectionId;
                return (
                  <button
                    key={p.index}
                    onClick={() => {
                      if ((p as any).sectionId) setActiveSection((p as any).sectionId);
                      jumpToPage(p.index);
                    }}
                    className={`w-full mb-2 p-2 rounded-lg border text-left transition-all group ${
                      isActive
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                        : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span
                        className="w-1.5 h-3 rounded-sm flex-shrink-0"
                        style={{ background: (p as any).color || 'var(--text-muted)' }}
                      />
                      <span className={`text-[11px] font-semibold truncate ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
                        {(p as any).title}
                      </span>
                    </div>
                    <div className="aspect-[8.5/11] bg-white text-[5px] text-zinc-700 p-1.5 rounded overflow-hidden font-mono leading-snug border border-zinc-200">
                      {p.preview}
                    </div>
                  </button>
                );
              })}
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Editor surface + Character workspace */}
        <div className="flex-1 overflow-hidden flex relative">
          <div className={`flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center gap-2 relative ${focusTyping ? 'focus-typing' : ''} ${readingMode ? 'reading-mode' : ''}`}>
            {/* Dialogue density gutter — minimap-style strip on the left.
                Hidden on small screens where it would crowd the paper, and
                user-toggleable in Settings (defaults to on). */}
            {!readingMode && !focusTyping && settings.showGutter !== false && (
              <div className="hidden sm:flex flex-col pt-12 sticky top-0 self-start max-h-[calc(100vh-9rem)] pb-2">
                <DialogueGutter />
              </div>
            )}
            <div className="relative w-full max-w-[8.5in]">
              {/* Compact scene heat map — pacing glance above the paper.
                  Hidden in reading/focus modes so it doesn't distract,
                  and user-toggleable in Settings (defaults to on). */}
              {!readingMode && !focusTyping && settings.showHeatStrip !== false && (
                <div className="mb-3">
                  <SceneHeatMap compact stayHere />
                </div>
              )}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget && editor) editor.commands.focus('end');
                }}
                className={`w-full min-h-[11in] bg-white text-black p-[0.6in] sm:p-[1in] shadow-2xl rounded-sm relative ${readingMode ? 'cursor-default' : 'cursor-text'}`}
              >
                <EditorContent editor={editor} className="min-h-[9in] outline-none" />
              </motion.div>

              {/* Floating "Coach ✨" pill — appears beside the dialogue line
                  the cursor is in, click to coach just that line. Disabled
                  in reading + focus typing modes. */}
              <CoachInlinePill enabled={!readingMode && !focusTyping} />

              {showMention && filteredChars.length > 0 && (
                <MentionList
                  characters={filteredChars}
                  onSelect={handleSelectCharacter}
                  command={mentionCommand}
                  rect={mentionRect}
                />
              )}
            </div>
          </div>

          {/* Character workspace panel on the right */}
          <AnimatePresence>
            {focusCharacterId && characters.find(c => c.id === focusCharacterId) && (
              <CharacterWorkspacePanel
                character={characters.find(c => c.id === focusCharacterId) || null}
                onClose={() => useAppStore.setState({ focusCharacterId: null })}
                onUpdate={updateCharacter}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function TitlePage({
  title, author, contact, logline, onUpdateField, onStart,
}: {
  title: string; author: string; contact: string; logline: string;
  onUpdateField: (field: keyof Screenplay, value: any) => void;
  onStart: () => void;
}) {
  return (
    <div className="h-full overflow-y-auto flex justify-center p-4 sm:p-8">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-[8.5in] min-h-[11in] bg-white text-black p-[0.6in] sm:p-[1in] shadow-2xl rounded-sm flex flex-col items-center justify-center"
      >
        <div className="w-full max-w-md space-y-6">
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} transition={{ delay: 0.2 }}>
            <input
              type="text" autoFocus value={title}
              onChange={(e) => onUpdateField('title', e.target.value)}
              placeholder="TITLE"
              className="w-full text-center text-2xl font-bold border-b-2 border-gray-300 bg-transparent py-3 focus:border-[var(--accent)] outline-none transition-colors placeholder:text-gray-400"
              style={{ fontFamily: 'Courier Prime, monospace' }}
            />
          </motion.div>
          <input type="text" value={author} onChange={(e) => onUpdateField('author', e.target.value)} placeholder="Written by"
            className="w-full text-center text-base border-b border-gray-300 bg-transparent py-2 focus:border-[var(--accent)] outline-none transition-colors placeholder:text-gray-400"
            style={{ fontFamily: 'Courier Prime, monospace' }}
          />
          <input type="text" value={contact} onChange={(e) => onUpdateField('contact', e.target.value)} placeholder="Your Name / Contact"
            className="w-full text-center text-sm border-b border-gray-300 bg-transparent py-2 focus:border-[var(--accent)] outline-none transition-colors placeholder:text-gray-400"
            style={{ fontFamily: 'Courier Prime, monospace' }}
          />
          <textarea value={logline} onChange={(e) => onUpdateField('logline', e.target.value)} placeholder="Logline (one-sentence summary, optional)" rows={2}
            className="w-full text-center text-xs border border-gray-200 rounded-md bg-transparent p-2 focus:border-[var(--accent)] outline-none transition-colors placeholder:text-gray-400 resize-none text-gray-700"
            style={{ fontFamily: 'Courier Prime, monospace' }}
          />
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onStart}
            className="mt-8 mx-auto block px-8 py-3 bg-[var(--accent)] text-[var(--accent-ink)] text-white rounded-lg font-semibold shadow-lg hover:shadow-xl transition-shadow flex items-center gap-2"
          >
            Start Writing
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

function RichButton({ icon: Icon, onClick, active, title }: { icon: any; onClick: () => void; active?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md transition-all ${
        active
          ? 'bg-[var(--accent)] text-[var(--bg)] shadow'
          : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

function parseElements(html: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const elements: any[] = [];
  doc.querySelectorAll('p').forEach((p, i) => {
    const className = p.className || 'action';
    elements.push({
      id: `el-${i}-${Date.now()}`,
      type: className,
      content: p.innerHTML,
      sceneId: null,
    });
  });
  return elements;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}
