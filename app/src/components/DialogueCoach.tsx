import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  X, MessageSquareQuote, Loader2, Sparkles, AlertCircle,
  ChevronDown, ChevronRight, Quote, History, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { aiOnce, extractJSON, providerNeedsKey } from '@/lib/aiClient';
import type { ScreenplayElement } from '@/types';

/**
 * AI Dialogue Coach.
 *
 * Two modes:
 *   - 'full'   — analyse the last 80 dialogue lines of the screenplay,
 *                return per-character voice profiles + flagged lines.
 *                Opened by Ctrl/Cmd+Shift+D.
 *   - 'single' — analyse exactly one dialogue line, returning a focused
 *                rewrite. Triggered by the `writer:coachLine` custom event
 *                (dispatched by App.tsx on Ctrl/Cmd+Shift+L when cursor is
 *                inside a dialogue paragraph).
 *
 * Reports are persisted per-screenplay to localStorage so a writer can
 * scroll back through yesterday's analysis without re-running the AI.
 * Nothing leaves the device unless the user triggers a new AI call.
 */

interface CoachLine {
  speaker: string;
  original: string;
  issue: string;
  rewrite: string;
  kind: 'on-nose' | 'expository' | 'generic' | 'voice-clash';
}

interface CoachReport {
  voices: { speaker: string; profile: string }[];
  lines: CoachLine[];
}

interface StoredReport {
  ts: number;
  mode: 'full' | 'single' | 'character';
  /** Speaker name for 'character' mode reports. */
  speaker?: string;
  /** Number of dialogue lines analysed (for the history label). */
  size: number;
  report: CoachReport;
}

interface Props { onClose: () => void; }

const HISTORY_KEY = 'kindling-coach-history';
const HISTORY_MAX = 20; // cap per story so localStorage stays small

// ─── localStorage helpers ────────────────────────────────────────────────────

function loadHistory(storyId: string): StoredReport[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const blob = JSON.parse(raw) as Record<string, StoredReport[]>;
    return Array.isArray(blob[storyId]) ? blob[storyId] : [];
  } catch {
    return [];
  }
}

function saveHistory(storyId: string, reports: StoredReport[]) {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const blob = raw ? (JSON.parse(raw) as Record<string, StoredReport[]>) : {};
    blob[storyId] = reports.slice(0, HISTORY_MAX);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(blob));
  } catch {
    // Quota errors are fine — history is best-effort.
  }
}

export default function DialogueCoach({ onClose }: Props) {
  const screenplay = useAppStore((s) => s.screenplay);
  const settings = useAppStore((s) => s.settings);
  const activeStoryId = useAppStore((s) => s.activeStoryId) || 'no-story';

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CoachReport | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<StoredReport[]>(() => loadHistory(activeStoryId));

  // Re-load history if the user switches stories while the panel is open.
  useEffect(() => {
    setHistory(loadHistory(activeStoryId));
    setReport(null);
  }, [activeStoryId]);

  // Extract dialogue lines from the active screenplay. Pair each character
  // cue with the dialogue that follows so the AI sees clean "WHO: WHAT" pairs.
  const dialogue = useMemo(() => {
    if (!screenplay?.elements) return [] as { speaker: string; line: string }[];
    const out: { speaker: string; line: string }[] = [];
    let current: string | null = null;
    for (const el of screenplay.elements as ScreenplayElement[]) {
      const text = stripHtml(el.content).trim();
      if (!text) continue;
      if (el.type === 'character') {
        current = text.replace(/\(.+?\)/g, '').trim().toUpperCase();
      } else if (el.type === 'dialogue' && current) {
        out.push({ speaker: current, line: text });
      } else if (el.type === 'scene-heading' || el.type === 'action' || el.type === 'transition') {
        current = null;
      }
    }
    return out;
  }, [screenplay?.elements]);

  const characterCount = useMemo(() => new Set(dialogue.map((d) => d.speaker)).size, [dialogue]);

  // Sorted list of speakers + their line counts — drives the per-character
  // pill row in the empty state.
  const speakers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of dialogue) counts.set(d.speaker, (counts.get(d.speaker) || 0) + 1);
    return [...counts.entries()]
      .map(([speaker, count]) => ({ speaker, count }))
      .sort((a, b) => b.count - a.count);
  }, [dialogue]);

  // ── Persist a new report
  const persist = useCallback(
    (mode: 'full' | 'single' | 'character', size: number, r: CoachReport, speaker?: string) => {
      const stored: StoredReport = { ts: Date.now(), mode, size, report: r, speaker };
      const next = [stored, ...history].slice(0, HISTORY_MAX);
      setHistory(next);
      saveHistory(activeStoryId, next);
    },
    [history, activeStoryId]
  );

  // ── Full-screenplay coach
  const runFull = useCallback(async () => {
    if (!dialogue.length) {
      toast.error('No dialogue found in this screenplay yet. Write a few lines and try again.');
      return;
    }
    if (providerNeedsKey(settings.aiProvider) && !settings.aiApiKey) {
      toast.error('Add an AI API key first (✦ button in the toolbar)');
      return;
    }

    setBusy(true); setError(null); setReport(null);

    const sample = dialogue.slice(-80);
    const prompt = sample.map((d, i) => `${i + 1}. ${d.speaker}: ${d.line}`).join('\n');
    const system = [
      'You are a sharp dialogue coach for screenwriters.',
      'You will receive numbered "SPEAKER: line" pairs.',
      'Return STRICT JSON only — no prose, no markdown fences — matching this shape:',
      '{ "voices": [{"speaker":"NAME","profile":"one-line voice profile"}],',
      '  "lines":  [{"speaker":"NAME","original":"…","issue":"…","rewrite":"…","kind":"on-nose|expository|generic|voice-clash"}] }',
      'Flag at most 8 lines, prioritizing the worst offenders. Be specific and concrete; never write "make it better".',
      'kind meaning: on-nose = says the subtext literally; expository = info-dump for the audience; generic = could be any character; voice-clash = doesn\'t match the speaker\'s established voice.',
    ].join('\n');

    const result = await aiOnce(settings, system, prompt, { maxTokens: 1500, temperature: 0.4 });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    const parsed = extractJSON<CoachReport>(result.text);
    if (!parsed || !Array.isArray(parsed.lines)) {
      setError(`AI returned something we couldn't parse as JSON. First 200 chars: ${result.text.slice(0, 200)}`);
      return;
    }
    setReport(parsed);
    persist('full', sample.length, parsed);
    toast.success(`Coached ${parsed.lines.length} line${parsed.lines.length === 1 ? '' : 's'} across ${parsed.voices?.length || 0} character${parsed.voices?.length === 1 ? '' : 's'}`);
  }, [dialogue, settings, persist]);

  // ── Single-line coach (triggered by Ctrl+Shift+L)
  const runSingle = useCallback(
    async (speaker: string, line: string) => {
      if (providerNeedsKey(settings.aiProvider) && !settings.aiApiKey) {
        toast.error('Add an AI API key first (✦ button in the toolbar)');
        return;
      }
      setBusy(true); setError(null); setReport(null);

      // Build minimal context: the target line plus the 3 dialogue lines on
      // either side (so the AI can judge voice consistency without seeing
      // the whole script).
      const idx = dialogue.findIndex((d) => d.speaker === speaker && d.line === line);
      const window = idx >= 0
        ? dialogue.slice(Math.max(0, idx - 3), idx + 4).map((d, i) =>
            `${idx - 3 + i === idx ? '>>' : '  '} ${d.speaker}: ${d.line}`).join('\n')
        : `>> ${speaker}: ${line}`;

      const system = [
        'You are a sharp dialogue coach. The user wants ONE line coached.',
        'The target line is marked with ">>" in the input.',
        'Return STRICT JSON only — same shape as the multi-line coach:',
        '{ "voices": [{"speaker":"NAME","profile":"one-line voice read"}],',
        '  "lines":  [{"speaker":"NAME","original":"…","issue":"…","rewrite":"…","kind":"on-nose|expository|generic|voice-clash"}] }',
        'Include exactly ONE entry in lines (the >> line). Voices may be empty or include just this speaker.',
      ].join('\n');

      const result = await aiOnce(settings, system, window, { maxTokens: 500, temperature: 0.5 });
      setBusy(false);
      if (!result.ok) { setError(result.error); return; }
      const parsed = extractJSON<CoachReport>(result.text);
      if (!parsed || !Array.isArray(parsed.lines)) {
        setError(`AI returned something we couldn't parse as JSON. First 200 chars: ${result.text.slice(0, 200)}`);
        return;
      }
      setReport(parsed);
      persist('single', 1, parsed);
      toast.success('Line coached');
    },
    [dialogue, settings, persist]
  );

  // ── Per-character coach: all of one speaker's lines, with consistency lens
  const runCharacter = useCallback(
    async (speaker: string) => {
      if (providerNeedsKey(settings.aiProvider) && !settings.aiApiKey) {
        toast.error('Add an AI API key first (✦ button in the toolbar)');
        return;
      }
      const lines = dialogue.filter((d) => d.speaker === speaker);
      if (lines.length === 0) {
        toast.error(`${speaker} has no dialogue yet`);
        return;
      }

      setBusy(true); setError(null); setReport(null);

      // Cap input — even chatty leads rarely cross 120 lines in one act.
      // We sample evenly across the script when the count goes higher so
      // late-act voice drift still gets seen.
      const sampled = lines.length <= 120
        ? lines
        : sampleEvenly(lines, 120);
      const prompt = sampled.map((d, i) => `${i + 1}. ${d.line}`).join('\n');

      const system = [
        `You are a sharp dialogue coach. Every line below was spoken by ${speaker}.`,
        'Judge their voice as one character across the whole script:',
        '  - Does the voice stay consistent or drift?',
        '  - Are there lines that any character could say (generic)?',
        '  - Are there lines that *contradict* the established voice (voice-clash)?',
        '  - Any on-the-nose or expository lines that bypass subtext?',
        'Return STRICT JSON only — no prose, no markdown fences — matching:',
        '{ "voices": [{"speaker":"NAME","profile":"one-line voice profile"}],',
        '  "lines":  [{"speaker":"NAME","original":"…","issue":"…","rewrite":"…","kind":"on-nose|expository|generic|voice-clash"}] }',
        `voices MUST contain exactly one entry — for ${speaker}.`,
        'Flag at most 6 lines, the worst offenders. Be concrete, never write "make it better".',
      ].join('\n');

      const result = await aiOnce(settings, system, prompt, { maxTokens: 1500, temperature: 0.4 });
      setBusy(false);
      if (!result.ok) { setError(result.error); return; }
      const parsed = extractJSON<CoachReport>(result.text);
      if (!parsed || !Array.isArray(parsed.lines)) {
        setError(`AI returned something we couldn't parse as JSON. First 200 chars: ${result.text.slice(0, 200)}`);
        return;
      }
      setReport(parsed);
      persist('character', sampled.length, parsed, speaker);
      toast.success(`Coached ${speaker} (${parsed.lines.length} flag${parsed.lines.length === 1 ? '' : 's'})`);
    },
    [dialogue, settings, persist]
  );

  // ── Listen for the inline "coach this line" trigger
  useEffect(() => {
    const onCoach = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { speaker: string; line: string } | undefined;
      if (!detail?.line) return;
      runSingle(detail.speaker || 'UNKNOWN', detail.line);
    };
    document.addEventListener('writer:coachLine', onCoach as EventListener);
    return () => document.removeEventListener('writer:coachLine', onCoach as EventListener);
  }, [runSingle]);

  const clearHistory = () => {
    if (!confirm('Clear all saved coach reports for this story?')) return;
    setHistory([]);
    saveHistory(activeStoryId, []);
    toast.success('History cleared');
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.18 }}
      className="fixed top-12 right-0 bottom-6 w-[min(440px,100vw)] bg-[var(--panel)] border-l border-[var(--border)] shadow-2xl z-40 flex flex-col"
      role="dialog"
      aria-label="AI Dialogue Coach"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shadow-lg">
          <MessageSquareQuote className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-[var(--text)]">Dialogue Coach</div>
          <div className="text-[10px] text-[var(--text-muted)]">
            {dialogue.length} line{dialogue.length === 1 ? '' : 's'} · {characterCount} character{characterCount === 1 ? '' : 's'}
          </div>
        </div>
        <button
          onClick={() => setShowHistory((v) => !v)}
          title={`History (${history.length})`}
          aria-label="Toggle coach history"
          className={`p-1.5 rounded-md ${showHistory ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'hover:bg-[var(--hover)] text-[var(--text-muted)]'}`}
        >
          <History className="w-4 h-4" />
        </button>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-[var(--hover)] text-[var(--text-muted)]"
          aria-label="Close Dialogue Coach"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {showHistory ? (
          <HistoryList
            history={history}
            onPick={(r) => { setReport(r.report); setShowHistory(false); }}
            onClear={clearHistory}
          />
        ) : (
          <>
            {!report && !busy && !error && (
              <div className="space-y-3">
                <button
                  onClick={runFull}
                  disabled={dialogue.length === 0}
                  className="w-full py-3 rounded-lg bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold shadow hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {dialogue.length === 0 ? 'Write some dialogue first' : `Coach the last ${Math.min(80, dialogue.length)} lines`}
                </button>

                {/* Per-character pills — coach one speaker's entire arc */}
                {speakers.length > 0 && (
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-1.5">
                      Or coach one character
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {speakers.map((s) => (
                        <button
                          key={s.speaker}
                          onClick={() => runCharacter(s.speaker)}
                          title={`Coach all ${s.count} line${s.count === 1 ? '' : 's'} from ${s.speaker}`}
                          className="px-2.5 py-1 rounded-full bg-[var(--card)] border border-[var(--border)] text-[11px] text-[var(--text)] hover:border-fuchsia-400/60 hover:text-fuchsia-300 transition-colors flex items-center gap-1.5"
                        >
                          <span className="font-bold">{s.speaker}</span>
                          <span className="text-[9px] text-[var(--text-muted)]">{s.count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-[var(--text-muted)] text-center px-2">
                  Tip: put your cursor on any dialogue line and press <kbd className="px-1 py-0.5 rounded bg-[var(--hover)] text-[10px]">Ctrl/⌘+Shift+L</kbd> to coach just that line.
                </p>
              </div>
            )}

            {busy && (
              <div className="flex flex-col items-center gap-2 py-12 text-[var(--text-muted)] text-xs">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" />
                Analysing voice and subtext…
              </div>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-[11px] flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <div>{error}</div>
                  <button onClick={() => setError(null)} className="text-[10px] underline opacity-80 hover:opacity-100">Try again</button>
                </div>
              </div>
            )}

            {report && (
              <>
                {report.voices && report.voices.length > 0 && (
                  <section>
                    <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2">
                      Voice profiles
                    </h3>
                    <div className="space-y-1.5">
                      {report.voices.map((v) => {
                        const key = `voice-${v.speaker}`;
                        const isOpen = expanded[key] ?? true;
                        return (
                          <div key={key} className="border border-[var(--border)] rounded-lg bg-[var(--card)]">
                            <button
                              onClick={() => setExpanded((m) => ({ ...m, [key]: !isOpen }))}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left"
                              aria-expanded={isOpen}
                            >
                              {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              <span className="text-xs font-bold text-[var(--text)]">{v.speaker}</span>
                            </button>
                            {isOpen && (
                              <p className="px-3 pb-2 text-[11px] text-[var(--text-secondary)] leading-relaxed">{v.profile}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {report.lines.length > 0 && (
                  <section>
                    <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2">
                      Lines to sharpen ({report.lines.length})
                    </h3>
                    <div className="space-y-2">
                      {report.lines.map((l, i) => (<FlaggedLine key={i} line={l} />))}
                    </div>
                  </section>
                )}

                {report.lines.length === 0 && (
                  <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] text-center">
                    ✨ No weak lines flagged — the dialogue is sharp.
                  </div>
                )}

                <button
                  onClick={runFull}
                  className="w-full mt-2 py-2 rounded-lg border border-[var(--border)] text-[11px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                >
                  Re-run with latest dialogue
                </button>
              </>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)] flex items-center gap-1.5">
        <Sparkles className="w-3 h-3" />
        Using {settings.aiProvider}{settings.aiModel ? ` · ${settings.aiModel}` : ''}
      </div>
    </motion.div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function HistoryList({
  history, onPick, onClear,
}: {
  history: StoredReport[];
  onPick: (r: StoredReport) => void;
  onClear: () => void;
}) {
  if (history.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-[var(--text-muted)]">
        No saved reports yet. Run a coach and it'll appear here.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">
          History ({history.length})
        </h3>
        <button
          onClick={onClear}
          className="text-[10px] text-[var(--text-muted)] hover:text-red-400 flex items-center gap-1"
        >
          <Trash2 className="w-3 h-3" /> Clear
        </button>
      </div>
      <div className="space-y-1.5">
        {history.map((r) => (
          <button
            key={r.ts}
            onClick={() => onPick(r)}
            className="w-full text-left p-3 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--accent)]">
                {r.mode === 'full' ? 'Full pass'
                  : r.mode === 'character' ? `Character · ${r.speaker || ''}`
                  : 'Single line'}
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">{formatAgo(r.ts)}</span>
            </div>
            <div className="text-[11px] text-[var(--text-secondary)]">
              {r.report.lines.length} flagged · {r.report.voices?.length || 0} voice profile{(r.report.voices?.length || 0) === 1 ? '' : 's'} · {r.size} line{r.size === 1 ? '' : 's'} analysed
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function FlaggedLine({ line }: { line: CoachLine }) {
  const palette: Record<CoachLine['kind'], { bg: string; text: string; label: string }> = {
    'on-nose':     { bg: 'bg-amber-500/15',   text: 'text-amber-400',   label: 'On-the-nose' },
    'expository':  { bg: 'bg-blue-500/15',    text: 'text-blue-400',    label: 'Expository' },
    'generic':     { bg: 'bg-zinc-500/15',    text: 'text-zinc-400',    label: 'Generic' },
    'voice-clash': { bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-400', label: 'Voice clash' },
  };
  const p = palette[line.kind] || palette.generic;

  const copy = (text: string) => {
    try {
      navigator.clipboard.writeText(text);
      toast.success('Copied rewrite');
    } catch {
      toast.error('Could not copy — your browser may block clipboard access');
    }
  };

  /** Dispatch a writer:replaceText event so WriterView swaps the line
   *  in the actual editor (preserving its dialogue/action paragraph class). */
  const replaceInScript = () => {
    document.dispatchEvent(new CustomEvent('writer:replaceText', {
      detail: { find: line.original, replace: line.rewrite },
    }));
  };

  return (
    <div className="p-3 rounded-lg bg-[var(--card)] border border-[var(--border)] space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text)]">{line.speaker}</span>
        <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${p.bg} ${p.text}`}>{p.label}</span>
      </div>
      <div className="flex items-start gap-1.5 text-[11px] text-[var(--text-secondary)] italic">
        <Quote className="w-3 h-3 flex-shrink-0 mt-0.5 opacity-50" />
        <span>"{line.original}"</span>
      </div>
      <div className="text-[10px] text-[var(--text-muted)]">{line.issue}</div>
      <div className="p-2 rounded-md bg-[var(--accent)]/10 border border-[var(--accent)]/30">
        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--accent)] block mb-1">Suggested rewrite</span>
        <span className="text-[11px] text-[var(--text)] block mb-2">"{line.rewrite}"</span>
        <div className="flex gap-1.5">
          <button
            onClick={replaceInScript}
            title="Find this line in the script and replace it with the rewrite"
            className="flex-1 px-2 py-1 rounded bg-[var(--accent)] text-[var(--bg)] text-[10px] font-bold hover:brightness-110 transition-all"
          >
            Replace in script
          </button>
          <button
            onClick={() => copy(line.rewrite)}
            title="Copy rewrite to clipboard"
            className="px-2 py-1 rounded border border-[var(--border)] text-[10px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/**
 * Pick `target` items from `arr` at evenly spaced indices. Used so a 400-line
 * character coach still sees voice samples from across the whole script, not
 * just the start.
 */
function sampleEvenly<T>(arr: T[], target: number): T[] {
  if (arr.length <= target) return arr;
  const out: T[] = [];
  const step = arr.length / target;
  for (let i = 0; i < target; i++) {
    out.push(arr[Math.min(arr.length - 1, Math.floor(i * step))]);
  }
  return out;
}

function stripHtml(html: string): string {
  if (typeof document !== 'undefined') {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return d.textContent || '';
  }
  return (html || '').replace(/<[^>]+>/g, '');
}

function formatAgo(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
