import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Replace, ArrowDown, ArrowUp, X, Regex, CaseSensitive } from 'lucide-react';

/**
 * Lightweight find-and-replace for the ProseMirror editor. We do the search
 * against the editor's plain-text content, then map matches to ProseMirror
 * positions and select / replace there.
 *
 * The component is mounted globally and listens for the `writer:findOpen`
 * custom event (fired from App's Ctrl/Cmd+F shortcut).
 */
export default function FindReplace() {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const findRef = useRef<HTMLInputElement>(null);

  // Listen for Ctrl/Cmd+F from App, plus Esc to close.
  useEffect(() => {
    const onOpen = () => { setOpen(true); setTimeout(() => findRef.current?.focus(), 30); };
    document.addEventListener('writer:findOpen', onOpen);
    return () => document.removeEventListener('writer:findOpen', onOpen);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const editor = useEditorView();

  // Build regex from inputs
  const re = useMemo<RegExp | null>(() => {
    if (!find) return null;
    try {
      const flags = caseSensitive ? 'g' : 'gi';
      const pattern = useRegex ? find : find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(pattern, flags);
    } catch { return null; }
  }, [find, caseSensitive, useRegex]);

  // Collect all match positions in the doc.
  const matches = useMemo(() => {
    if (!editor || !re) return [] as { from: number; to: number }[];
    const out: { from: number; to: number }[] = [];
    editor.state.doc.descendants((node: any, pos: number) => {
      if (!node.isText) return true;
      const text = node.text || '';
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        if (!m[0].length) { re.lastIndex++; continue; }
        out.push({ from: pos + m.index, to: pos + m.index + m[0].length });
      }
      return true;
    });
    return out;
  }, [editor, re, find, caseSensitive, useRegex]);

  const [matchIdx, setMatchIdx] = useState(0);
  useEffect(() => { setMatchIdx(0); }, [find]);

  const focusMatch = (i: number) => {
    if (!editor || matches.length === 0) return;
    const m = matches[i];
    if (!m) return;
    editor.dispatch(editor.state.tr.setSelection(
      (editor.state.selection.constructor as any).create(editor.state.doc, m.from, m.to)
    ));
    editor.focus();
  };

  useEffect(() => { if (matches.length) focusMatch(matchIdx); }, [matchIdx]);

  const next = () => { if (matches.length) setMatchIdx((matchIdx + 1) % matches.length); };
  const prev = () => { if (matches.length) setMatchIdx((matchIdx - 1 + matches.length) % matches.length); };

  const replaceOne = () => {
    if (!editor || matches.length === 0) return;
    const m = matches[matchIdx];
    if (!m) return;
    editor.dispatch(editor.state.tr.insertText(replace, m.from, m.to));
    // matches will rebuild on next render; clamp idx
    setMatchIdx(Math.max(0, matchIdx - 1));
  };

  const replaceAll = () => {
    if (!editor || matches.length === 0) return;
    // Apply right-to-left so earlier positions stay valid.
    const tr = editor.state.tr;
    for (let i = matches.length - 1; i >= 0; i--) {
      tr.insertText(replace, matches[i].from, matches[i].to);
    }
    editor.dispatch(tr);
    setMatchIdx(0);
  };

  return (
    <AnimatePresence>
      {/* Responsive: pinned to the top, max width never exceeds the
          viewport. On phones (<sm) the inputs stack vertically and the
          two rows of controls collapse into a single tidy column. */}
      {open && (
        <motion.div
          initial={{ y: -16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -16, opacity: 0 }}
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[280] bg-[var(--panel)] border border-[var(--rule)] rounded-md shadow-lg p-1.5 flex flex-col sm:flex-row sm:items-center gap-1.5 w-[min(96vw,720px)]"
        >
          {/* Inputs row — stacked on sm and below */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] ml-1 flex-shrink-0" />
              <input
                ref={findRef}
                value={find}
                onChange={(e) => setFind(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.shiftKey ? prev() : next()); }}
                placeholder="Find"
                className="bg-[var(--card)] border border-[var(--border)] rounded-md px-2 py-1.5 text-xs text-[var(--text)] outline-none focus:border-[var(--accent)] flex-1 min-w-0 sm:max-w-[180px]"
              />
            </div>
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <Replace className="w-3.5 h-3.5 text-[var(--text-muted)] ml-1 sm:ml-0 flex-shrink-0" />
              <input
                value={replace}
                onChange={(e) => setReplace(e.target.value)}
                placeholder="Replace"
                className="bg-[var(--card)] border border-[var(--border)] rounded-md px-2 py-1.5 text-xs text-[var(--text)] outline-none focus:border-[var(--accent)] flex-1 min-w-0 sm:max-w-[180px]"
              />
            </div>
          </div>

          {/* Controls row — stays inline on all sizes */}
          <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
            <button
              onClick={() => setCaseSensitive((v) => !v)}
              title="Case sensitive"
              aria-pressed={caseSensitive}
              className={`p-1.5 rounded-md transition-all ${caseSensitive ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-[var(--text-muted)] hover:bg-[var(--hover)]'}`}
            >
              <CaseSensitive className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setUseRegex((v) => !v)}
              title="Regex"
              aria-pressed={useRegex}
              className={`p-1.5 rounded-md transition-all ${useRegex ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-[var(--text-muted)] hover:bg-[var(--hover)]'}`}
            >
              <Regex className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] text-[var(--text-muted)] tabular-nums px-1 min-w-[44px] text-center">
              {matches.length === 0 ? '0/0' : `${matchIdx + 1}/${matches.length}`}
            </span>
            <button onClick={prev} title="Previous" className="p-1.5 rounded-md text-[var(--text-muted)] hover:bg-[var(--hover)]" aria-label="Previous match">
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button onClick={next} title="Next" className="p-1.5 rounded-md text-[var(--text-muted)] hover:bg-[var(--hover)]" aria-label="Next match">
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-5 bg-[var(--rule)]" />
            <button onClick={replaceOne} title="Replace" className="px-2 py-1 rounded-md text-[11px] bg-[var(--card)] border border-[var(--rule)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]">
              Replace
            </button>
            <button onClick={replaceAll} title="Replace all" className="px-2 py-1 rounded-md text-[11px] bg-[var(--accent)] text-[var(--accent-ink)] font-semibold hover:brightness-110">
              All
            </button>
            <button onClick={() => setOpen(false)} title="Close" className="p-1.5 rounded-md text-[var(--text-muted)] hover:bg-[var(--hover)]" aria-label="Close find and replace">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Pull the ProseMirror EditorView out of the live `.ProseMirror` element.
 * It's stashed by tiptap under `pmViewDesc` on the contenteditable; we walk
 * the React fiber to find the tiptap editor instance instead.
 */
function useEditorView() {
  const [view, setView] = useState<any>(null);
  useEffect(() => {
    const tick = () => {
      const el = document.querySelector('.ProseMirror') as HTMLElement | null;
      if (!el) { setView(null); return; }
      const wrap = el.parentElement;
      if (!wrap) return;
      const fiberKey = Object.keys(wrap).find((k) => k.startsWith('__reactFiber$'));
      if (!fiberKey) return;
      let fiber: any = (wrap as any)[fiberKey];
      const isEditor = (v: any) => v && typeof v === 'object' && v.commands && v.view && v.state;
      while (fiber) {
        const ps = fiber.memoizedProps;
        if (ps) for (const v of Object.values(ps)) {
          if (isEditor(v)) { setView((v as any).view); return; }
        }
        let ms = fiber.memoizedState;
        while (ms) {
          if (isEditor(ms.memoizedState)) { setView((ms.memoizedState as any).view); return; }
          ms = ms.next;
        }
        fiber = fiber.return;
      }
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => clearInterval(t);
  }, []);
  return view;
}
