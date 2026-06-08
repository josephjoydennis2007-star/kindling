import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ShieldCheck, Loader2, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { aiOnce, extractJSON } from '@/lib/aiClient';

/**
 * AI Continuity Guard — scans the screenplay for continuity ERRORS (not style):
 * character-name drift, props/wardrobe that appear then vanish, INT/EXT or
 * time-of-day mismatches, impossible timeline/geography, unresolved setups,
 * age/pronoun inconsistencies. Lists actionable flags with the offending text.
 * Opens on `app:openContinuity`.
 */
type Issue = { category: string; severity: 'high' | 'medium' | 'low'; summary: string; evidence: string; fix: string };

function strip(s: string): string { return (s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim(); }

function scriptText(els: any[], cap = 13000): string {
  return els.map((e) => {
    const t = strip(e.content || '');
    if (!t) return '';
    if (e.type === 'scene-heading') return t.toUpperCase();
    if (e.type === 'character') return `\t${t.toUpperCase()}`;
    if (e.type === 'parenthetical') return `\t(${t.replace(/^\(|\)$/g, '')})`;
    if (e.type === 'dialogue') return `\t${t}`;
    return t;
  }).filter(Boolean).join('\n').slice(0, cap);
}

const SEV: Record<string, { color: string; label: string }> = {
  high: { color: '#ef4444', label: 'High' },
  medium: { color: '#f59e0b', label: 'Medium' },
  low: { color: '#3b82f6', label: 'Low' },
};

export default function ContinuityGuard() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ran, setRan] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  const settings = useAppStore((s) => s.settings);

  useEffect(() => {
    const onOpen = () => { setOpen(true); };
    document.addEventListener('app:openContinuity', onOpen);
    return () => document.removeEventListener('app:openContinuity', onOpen);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const run = async () => {
    const els = useAppStore.getState().screenplay.elements || [];
    const text = scriptText(els);
    if (!text.trim()) { toast.error('Write some script first.'); return; }
    setBusy(true); setRan(true);
    try {
      const sys = 'You are a meticulous script supervisor / continuity checker. Find ONLY continuity ERRORS — not style or taste. Look for: character name drift (Ana vs Anna), props/wardrobe/vehicles that appear then vanish or change, INT/EXT or time-of-day (DAY/NIGHT) mismatches within continuous action, impossible timeline or geography, setups with no payoff, and age/pronoun inconsistencies. Respond with STRICT JSON only: {"issues":[{"category":"name|prop|time|place|timeline|setup|other","severity":"high|medium|low","summary":"one line","evidence":"the conflicting line(s) or scene headings, quoted","fix":"how to resolve"}]}. If there are no real continuity problems, return {"issues":[]}. Do not invent issues.';
      const res = await aiOnce(settings, sys, text, { maxTokens: 2000, temperature: 0.2 });
      if (!res.ok) { toast.error(res.error); setIssues([]); return; }
      const parsed = extractJSON<{ issues: Issue[] }>(res.text);
      const list = Array.isArray(parsed?.issues) ? parsed!.issues : [];
      setIssues(list);
      if (!list.length) toast.success('No continuity issues found ✓');
    } finally { setBusy(false); }
  };

  const sorted = [...issues].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 } as Record<string, number>;
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[250] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg h-[min(640px,88vh)] bg-[var(--panel)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            <header className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[var(--accent)]" />
              <span className="text-sm font-bold text-[var(--text)] flex-1">Continuity check</span>
              <button onClick={run} disabled={busy} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-110 disabled:opacity-50">
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                {ran ? 'Re-check' : 'Run check'}
              </button>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]"><X className="w-4 h-4" /></button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {!ran && !busy && (
                <div className="text-center py-16 text-[var(--text-muted)] text-sm">
                  <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  Scan the script for continuity errors — name drift, vanishing props, day/night mismatches, timeline gaps. Click <b>Run check</b>.
                </div>
              )}
              {busy && (
                <div className="flex items-center justify-center gap-2 py-16 text-[var(--text-muted)] text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Reading the whole script for continuity…
                </div>
              )}
              {ran && !busy && issues.length === 0 && (
                <div className="text-center py-16 text-[var(--success)] text-sm">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3" />
                  No continuity issues found.
                </div>
              )}
              {sorted.map((it, i) => {
                const sev = SEV[it.severity] || SEV.low;
                return (
                  <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--card)] overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: sev.color }} />
                      <span className="text-[12px] font-semibold text-[var(--text)] flex-1">{it.summary}</span>
                      <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded" style={{ background: `${sev.color}22`, color: sev.color }}>{sev.label}</span>
                      <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">{it.category}</span>
                    </div>
                    <div className="px-3 py-2 space-y-1.5">
                      {it.evidence && <div className="text-[11px] text-[var(--text-secondary)] font-mono bg-[var(--bg)] rounded px-2 py-1 whitespace-pre-wrap" style={{ fontFamily: 'Courier Prime, monospace' }}>{it.evidence}</div>}
                      {it.fix && <div className="text-[11px] text-[var(--text-secondary)]"><span className="text-[var(--accent)] font-semibold">Fix: </span>{it.fix}</div>}
                    </div>
                  </div>
                );
              })}
            </div>

            {ran && !busy && issues.length > 0 && (
              <footer className="px-4 py-2 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)]">
                {issues.length} potential issue{issues.length === 1 ? '' : 's'} — AI suggestions; verify before changing.
              </footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
