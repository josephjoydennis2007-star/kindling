import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, GitCompareArrows } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useIndexedDB } from '@/hooks/useIndexedDB';

/**
 * Side-by-side story compare. Opened with Cmd/Ctrl+Shift+C. Each pane lets
 * you pick a story; we load its saved screenplay from IndexedDB and render
 * the first 50 elements as read-only text. Great for adapting / diffing
 * drafts without losing your current editing context.
 */
export default function CompareOverlay() {
  const [open, setOpen] = useState(false);
  const stories = useAppStore((s) => s.stories);
  const activeStoryId = useAppStore((s) => s.activeStoryId);
  const [left, setLeft] = useState<string>(activeStoryId || '');
  const [right, setRight] = useState<string>('');
  const { loadState } = useIndexedDB();
  const [leftDoc, setLeftDoc] = useState<any>(null);
  const [rightDoc, setRightDoc] = useState<any>(null);

  useEffect(() => {
    const onOpen = () => setOpen((v) => !v);
    document.addEventListener('writer:openCompare', onOpen);
    return () => document.removeEventListener('writer:openCompare', onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (left) loadState(left).then(setLeftDoc); else setLeftDoc(null);
  }, [open, left, loadState]);
  useEffect(() => {
    if (!open) return;
    if (right) loadState(right).then(setRightDoc); else setRightDoc(null);
  }, [open, right, loadState]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="Screenplay comparison"
          className="fixed inset-0 z-[290] bg-black/70 backdrop-blur-md flex flex-col"
        >
          <header className="px-4 py-3 border-b border-[var(--border)] bg-[var(--panel)] flex items-center gap-3">
            <GitCompareArrows className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-sm font-bold text-[var(--text)] flex-1">Compare screenplays</h2>
            <button onClick={() => setOpen(false)} aria-label="Close" className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]">
              <X className="w-4 h-4" />
            </button>
          </header>
          <div className="grid md:grid-cols-2 gap-px bg-[var(--border)] flex-1 overflow-hidden">
            <ComparePane label="Left" stories={stories} value={left} onChange={setLeft} doc={leftDoc} />
            <ComparePane label="Right" stories={stories} value={right} onChange={setRight} doc={rightDoc} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ComparePane({ label, stories, value, onChange, doc }: {
  label: string;
  stories: { id: string; title: string }[];
  value: string;
  onChange: (v: string) => void;
  doc: any;
}) {
  const elements = doc?.screenplay?.elements || [];
  const sectionsCount = doc?.screenplay?.sections?.length || 0;
  return (
    <section className="flex flex-col bg-[var(--bg)] min-h-0">
      <div className="p-3 border-b border-[var(--border)] flex items-center gap-2 bg-[var(--panel)]">
        <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">{label}</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-[var(--card)] border border-[var(--border)] rounded-md px-2 py-1.5 text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
        >
          <option value="">— Pick a story —</option>
          {stories.map((s) => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
        {doc && (
          <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
            {elements.length} blocks · {sectionsCount} section{sectionsCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-snug" style={{ fontFamily: 'Courier Prime, monospace' }}>
        {!doc && <p className="text-[var(--text-muted)] italic">Nothing loaded yet.</p>}
        {doc && elements.length === 0 && <p className="text-[var(--text-muted)] italic">This story has no content.</p>}
        {elements.slice(0, 50).map((el: any, i: number) => {
          const text = (el.content || '').replace(/<[^>]+>/g, '');
          const cls = el.type;
          const base = 'py-0.5 ';
          const formatted = cls === 'scene-heading' ? base + 'font-bold uppercase text-[var(--accent)] mt-3'
                          : cls === 'character'    ? base + 'text-center uppercase font-bold mt-2'
                          : cls === 'parenthetical'? base + 'text-center italic text-[var(--text-muted)]'
                          : cls === 'dialogue'     ? base + 'pl-12 text-[var(--text)]'
                          : cls === 'transition'   ? base + 'text-right uppercase font-bold text-[var(--accent)] mt-2'
                          : base + 'text-[var(--text-secondary)]';
          return <div key={i} className={formatted}>{text || ' '}</div>;
        })}
        {elements.length > 50 && (
          <p className="text-[10px] text-[var(--text-muted)] italic mt-3">… {elements.length - 50} more blocks not shown.</p>
        )}
      </div>
    </section>
  );
}
