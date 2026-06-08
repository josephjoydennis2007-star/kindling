import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, GitCompareArrows, Sparkles, Send, Loader2, Wand2, Check, Undo2, Redo2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { useIndexedDB } from '@/hooks/useIndexedDB';
import { aiOnce } from '@/lib/aiClient';
import { importText } from '@/lib/importers';

/**
 * Side-by-side story compare WITH an AI analyst. Opened with Cmd/Ctrl+Shift+C.
 * - Pick a story per pane (loaded read-only from IndexedDB).
 * - Ask the AI questions about BOTH drafts.
 * - "Improve" a pane: the AI rewrites it; you preview the changes (new/changed
 *   lines highlighted), then Accept or Reject. Accepted edits are applied to
 *   that story and can be stepped through with Previous / Next (undo/redo).
 */
type Doc = any;
type ChatMsg = { role: 'user' | 'ai'; text: string };

function stripTags(s: string): string { return (s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&'); }

/** Render a doc's screenplay as plain text for AI context (capped). */
function scriptText(doc: Doc, cap = 9000): string {
  const els = doc?.screenplay?.elements || [];
  const lines = els.map((e: any) => {
    const t = stripTags(e.content || '').trim();
    if (!t) return '';
    if (e.type === 'scene-heading') return t.toUpperCase();
    if (e.type === 'character') return `\t\t\t${t.toUpperCase()}`;
    if (e.type === 'parenthetical') return `\t\t(${t.replace(/^\(|\)$/g, '')})`;
    if (e.type === 'dialogue') return `\t\t${t}`;
    if (e.type === 'transition') return `\t\t\t\t\t${t.toUpperCase()}`;
    return t;
  });
  return lines.join('\n').slice(0, cap);
}

export default function CompareOverlay() {
  const [open, setOpen] = useState(false);
  const stories = useAppStore((s) => s.stories);
  const settings = useAppStore((s) => s.settings);
  const activeStoryId = useAppStore((s) => s.activeStoryId);
  const [left, setLeft] = useState<string>(activeStoryId || '');
  const [right, setRight] = useState<string>('');
  const { loadState, saveState } = useIndexedDB();
  const [leftDoc, setLeftDoc] = useState<Doc>(null);
  const [rightDoc, setRightDoc] = useState<Doc>(null);

  // AI state
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // Per-pane suggestion (improved elements awaiting accept/reject)
  const [suggestion, setSuggestion] = useState<{ side: 'left' | 'right'; storyId: string; elements: any[]; origText: Set<string> } | null>(null);
  // Per-story undo/redo stacks of element snapshots
  const histRef = useRef<Record<string, { undo: any[][]; redo: any[][] }>>({});
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOpen = () => setOpen((v) => !v);
    document.addEventListener('writer:openCompare', onOpen);
    return () => document.removeEventListener('writer:openCompare', onOpen);
  }, []);
  useEffect(() => { if (open && left) loadState(left).then(setLeftDoc); else if (!left) setLeftDoc(null); }, [open, left, loadState]);
  useEffect(() => { if (open && right) loadState(right).then(setRightDoc); else if (!right) setRightDoc(null); }, [open, right, loadState]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat, busy]);

  const docFor = (side: 'left' | 'right') => (side === 'left' ? leftDoc : rightDoc);
  const idFor = (side: 'left' | 'right') => (side === 'left' ? left : right);
  const setDocFor = (side: 'left' | 'right', d: Doc) => (side === 'left' ? setLeftDoc(d) : setRightDoc(d));

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    if (!leftDoc && !rightDoc) { toast.error('Pick at least one story to discuss.'); return; }
    setChat((c) => [...c, { role: 'user', text: q }]);
    setInput('');
    setBusy(true);
    try {
      const sys = 'You are a sharp, encouraging script analyst and development executive. You compare and critique screenplays with specific, actionable notes. Be concise and concrete; cite scene headings or lines when useful.';
      const ctx = `LEFT DRAFT (${stories.find((s) => s.id === left)?.title || 'none'}):\n${leftDoc ? scriptText(leftDoc) : '(none selected)'}\n\nRIGHT DRAFT (${stories.find((s) => s.id === right)?.title || 'none'}):\n${rightDoc ? scriptText(rightDoc) : '(none selected)'}`;
      const res = await aiOnce(settings, sys, `${ctx}\n\nQUESTION: ${q}`, { maxTokens: 1200, temperature: 0.5 });
      setChat((c) => [...c, { role: 'ai', text: res.ok ? res.text : `⚠ ${res.error}` }]);
    } finally { setBusy(false); }
  };

  const improve = async (side: 'left' | 'right') => {
    const doc = docFor(side); const storyId = idFor(side);
    if (!doc || !storyId) { toast.error('Pick a story in that pane first.'); return; }
    if (busy) return;
    setBusy(true);
    try {
      const sys = 'You are a professional screenwriter doing a punch-up pass. Improve the screenplay: tighten action, sharpen dialogue and subtext, fix flat beats — WITHOUT changing the core story. Return ONLY the rewritten screenplay in Fountain format (scene headings in caps, character cues in caps, dialogue under them). No commentary.';
      const res = await aiOnce(settings, sys, scriptText(doc, 11000), { maxTokens: 4000, temperature: 0.6 });
      if (!res.ok) { toast.error(res.error); return; }
      const parsed = importText(res.text, 'fountain');
      const els = parsed?.screenplay?.elements?.filter((e: any) => stripTags(e.content).trim()) || [];
      if (!els.length) { toast.error('The AI returned nothing usable. Try again.'); return; }
      const origText = new Set<string>((doc.screenplay?.elements || []).map((e: any) => stripTags(e.content).trim()).filter(Boolean));
      setSuggestion({ side, storyId, elements: els, origText });
      setChat((c) => [...c, { role: 'ai', text: `I rewrote the ${side} draft (${els.length} blocks). Review the highlighted changes in that pane and Accept or Reject.` }]);
    } finally { setBusy(false); }
  };

  // Persist a set of elements to a story (IndexedDB + cloud + live editor if active).
  const persist = async (side: 'left' | 'right', storyId: string, elements: any[]) => {
    const doc = docFor(side) || {};
    const newDoc = { ...doc, screenplay: { ...(doc.screenplay || {}), elements } };
    setDocFor(side, newDoc);
    await saveState(storyId, newDoc).catch(() => {});
    if (storyId === activeStoryId) {
      try {
        useAppStore.getState().importStory(JSON.stringify({ ...newDoc, scenes: newDoc.scenes || [], screenplay: newDoc.screenplay }));
        setTimeout(() => document.dispatchEvent(new CustomEvent('writer:rebuild')), 0);
      } catch { /* ignore */ }
    }
    try {
      // Best-effort cloud sync; throws (and is ignored) if not signed in.
      const { pushStory } = await import('@/lib/cloudStories');
      const title = stories.find((s) => s.id === storyId)?.title || 'Untitled';
      await pushStory({ storyId, title, data: JSON.stringify({ ...newDoc, exportedAt: Date.now() }) });
    } catch { /* offline / not signed in / oversize — local save already done */ }
  };

  const accept = async () => {
    if (!suggestion) return;
    const { side, storyId, elements } = suggestion;
    const h = (histRef.current[storyId] ||= { undo: [], redo: [] });
    h.undo.push((docFor(side)?.screenplay?.elements || []).slice()); // snapshot current for undo
    h.redo = [];
    await persist(side, storyId, elements);
    setSuggestion(null);
    toast.success('Applied the AI rewrite — use Previous to undo.');
  };

  const undo = async (side: 'left' | 'right') => {
    const storyId = idFor(side); const h = histRef.current[storyId];
    if (!h || !h.undo.length) { toast.info('Nothing to undo.'); return; }
    const current = (docFor(side)?.screenplay?.elements || []).slice();
    const prev = h.undo.pop()!; h.redo.push(current);
    await persist(side, storyId, prev);
    toast.success('Reverted to previous version.');
  };
  const redo = async (side: 'left' | 'right') => {
    const storyId = idFor(side); const h = histRef.current[storyId];
    if (!h || !h.redo.length) { toast.info('Nothing to redo.'); return; }
    const current = (docFor(side)?.screenplay?.elements || []).slice();
    const next = h.redo.pop()!; h.undo.push(current);
    await persist(side, storyId, next);
    toast.success('Re-applied next version.');
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          role="dialog" aria-modal="true" aria-label="Screenplay comparison"
          className="fixed inset-0 z-[290] bg-black/70 backdrop-blur-md flex flex-col"
        >
          <header className="px-4 py-3 border-b border-[var(--border)] bg-[var(--panel)] flex items-center gap-3">
            <GitCompareArrows className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-sm font-bold text-[var(--text)] flex-1">Compare screenplays <span className="text-[var(--text-muted)] font-normal">· with AI</span></h2>
            <button onClick={() => setOpen(false)} aria-label="Close" className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]"><X className="w-4 h-4" /></button>
          </header>

          <div className="flex-1 min-h-0 flex">
            {/* panes */}
            <div className="flex-1 grid md:grid-cols-2 gap-px bg-[var(--border)] overflow-hidden">
              <ComparePane side="left" label="Left" stories={stories} value={left} onChange={(v) => { setLeft(v); setSuggestion((s) => s?.side === 'left' ? null : s); }} doc={leftDoc}
                suggestion={suggestion?.side === 'left' ? suggestion : null} hist={histRef.current[left]}
                onImprove={() => improve('left')} onAccept={accept} onReject={() => setSuggestion(null)} onUndo={() => undo('left')} onRedo={() => redo('left')} busy={busy} />
              <ComparePane side="right" label="Right" stories={stories} value={right} onChange={(v) => { setRight(v); setSuggestion((s) => s?.side === 'right' ? null : s); }} doc={rightDoc}
                suggestion={suggestion?.side === 'right' ? suggestion : null} hist={histRef.current[right]}
                onImprove={() => improve('right')} onAccept={accept} onReject={() => setSuggestion(null)} onUndo={() => undo('right')} onRedo={() => redo('right')} busy={busy} />
            </div>

            {/* AI sidebar */}
            <aside className="w-[320px] flex-shrink-0 border-l border-[var(--border)] bg-[var(--panel)] flex flex-col">
              <div className="px-3 py-2.5 border-b border-[var(--border)] flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span className="text-xs font-bold text-[var(--text)]">AI analyst</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                {chat.length === 0 && (
                  <div className="text-[11px] text-[var(--text-muted)] space-y-2">
                    <p>Ask about both drafts, or improve one. Try:</p>
                    {['Which opening is stronger and why?', 'What\'s inconsistent between the two drafts?', 'How would you merge the best of both?'].map((q) => (
                      <button key={q} onClick={() => ask(q)} className="block w-full text-left px-2 py-1.5 rounded-md bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">{q}</button>
                    ))}
                  </div>
                )}
                {chat.map((m, i) => (
                  <div key={i} className={`text-[12px] leading-relaxed whitespace-pre-wrap rounded-lg px-2.5 py-2 ${m.role === 'user' ? 'bg-[var(--accent-soft)] text-[var(--text)] ml-4' : 'bg-[var(--card)] text-[var(--text-secondary)] mr-2'}`}>{m.text}</div>
                ))}
                {busy && <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…</div>}
                <div ref={chatEndRef} />
              </div>
              <div className="p-2.5 border-t border-[var(--border)]">
                <div className="flex gap-1 mb-2">
                  <button onClick={() => improve('left')} disabled={busy || !leftDoc} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-bold bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-40"><Wand2 className="w-3 h-3" /> Improve left</button>
                  <button onClick={() => improve('right')} disabled={busy || !rightDoc} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-bold bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-40"><Wand2 className="w-3 h-3" /> Improve right</button>
                </div>
                <div className="flex items-end gap-1.5">
                  <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); } }}
                    rows={2} placeholder="Ask about the two drafts…" className="flex-1 resize-none bg-[var(--card)] border border-[var(--border)] rounded-md px-2 py-1.5 text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)]" />
                  <button onClick={() => ask(input)} disabled={busy || !input.trim()} className="p-2 rounded-md bg-[var(--accent)] text-[var(--accent-ink)] disabled:opacity-40"><Send className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </aside>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ComparePane({ label, stories, value, onChange, doc, suggestion, hist, onImprove, onAccept, onReject, onUndo, onRedo, busy }: {
  side: 'left' | 'right'; label: string; stories: { id: string; title: string }[]; value: string; onChange: (v: string) => void; doc: Doc;
  suggestion: { elements: any[]; origText: Set<string> } | null; hist?: { undo: any[][]; redo: any[][] };
  onImprove: () => void; onAccept: () => void; onReject: () => void; onUndo: () => void; onRedo: () => void; busy: boolean;
}) {
  const elements = suggestion ? suggestion.elements : (doc?.screenplay?.elements || []);
  const isSug = !!suggestion;
  return (
    <section className="flex flex-col bg-[var(--bg)] min-h-0">
      <div className="p-2.5 border-b border-[var(--border)] flex items-center gap-2 bg-[var(--panel)]">
        <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">{label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 min-w-0 bg-[var(--card)] border border-[var(--border)] rounded-md px-2 py-1.5 text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]">
          <option value="">— Pick a story —</option>
          {stories.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
        {doc && !isSug && (
          <>
            <button onClick={onImprove} disabled={busy} title="AI punch-up pass" className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--hover)] disabled:opacity-40"><Wand2 className="w-3.5 h-3.5" /></button>
            <button onClick={onUndo} disabled={!hist?.undo?.length} title="Previous version" className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--hover)] disabled:opacity-30"><Undo2 className="w-3.5 h-3.5" /></button>
            <button onClick={onRedo} disabled={!hist?.redo?.length} title="Next version" className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--hover)] disabled:opacity-30"><Redo2 className="w-3.5 h-3.5" /></button>
          </>
        )}
      </div>

      {isSug && (
        <div className="px-3 py-2 bg-[var(--accent-soft)] border-b border-[var(--accent)]/30 flex items-center gap-2">
          <Wand2 className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span className="text-[11px] text-[var(--text)] flex-1">AI rewrite — changed lines highlighted.</span>
          <button onClick={onReject} className="px-2 py-1 rounded-md text-[10px] font-semibold bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--danger)]"><RotateCcw className="w-3 h-3 inline mr-1" />Reject</button>
          <button onClick={onAccept} className="px-2 py-1 rounded-md text-[10px] font-bold bg-[var(--accent)] text-[var(--accent-ink)]"><Check className="w-3 h-3 inline mr-1" />Accept</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-snug" style={{ fontFamily: 'Courier Prime, monospace' }}>
        {!doc && <p className="text-[var(--text-muted)] italic">Nothing loaded yet.</p>}
        {doc && elements.length === 0 && <p className="text-[var(--text-muted)] italic">This story has no content.</p>}
        {elements.slice(0, 200).map((el: any, i: number) => {
          const text = stripTags(el.content || '');
          const changed = isSug && text.trim() && !suggestion!.origText.has(text.trim());
          const cls = el.type;
          const base = 'py-0.5 px-1 -mx-1 rounded ';
          const fmt = cls === 'scene-heading' ? 'font-bold uppercase text-[var(--accent)] mt-3'
            : cls === 'character' ? 'text-center uppercase font-bold mt-2'
            : cls === 'parenthetical' ? 'text-center italic text-[var(--text-muted)]'
            : cls === 'dialogue' ? 'pl-12 text-[var(--text)]'
            : cls === 'transition' ? 'text-right uppercase font-bold text-[var(--accent)] mt-2'
            : 'text-[var(--text-secondary)]';
          return <div key={i} className={`${base}${fmt} ${changed ? 'bg-[var(--success)]/15 ring-1 ring-[var(--success)]/30' : ''}`}>{text || ' '}</div>;
        })}
        {elements.length > 200 && <p className="text-[10px] text-[var(--text-muted)] italic mt-3">… {elements.length - 200} more blocks not shown.</p>}
      </div>
    </section>
  );
}
