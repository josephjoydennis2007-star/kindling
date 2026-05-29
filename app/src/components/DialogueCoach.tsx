import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, MessageSquareQuote, Loader2, Sparkles, AlertCircle, ChevronDown, ChevronRight, Quote } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { aiOnce, extractJSON, providerNeedsKey } from '@/lib/aiClient';
import type { ScreenplayElement } from '@/types';

/**
 * AI Dialogue Coach.
 *
 * Reads the active screenplay's character + dialogue elements, groups them
 * per character, asks the AI to:
 *   1. Build a one-line "voice profile" for each character
 *   2. Flag specific lines that are on-the-nose, expository, generic, or
 *      indistinguishable from other characters
 *   3. Suggest a sharper rewrite for each flagged line
 *
 * Local-first: only the dialogue elements are sent — no logline, no settings,
 * no character names beyond what already appears in the script.
 *
 * Open with Ctrl/Cmd+Shift+D or via the menu button in the Writer toolbar.
 */

interface CoachLine {
  /** Speaker name as it appears in the script (e.g. "JANE"). */
  speaker: string;
  /** The verbatim original dialogue. */
  original: string;
  /** Why this line is weak. One sentence. */
  issue: string;
  /** Concrete suggested rewrite. */
  rewrite: string;
  /** Issue category — drives the badge color. */
  kind: 'on-nose' | 'expository' | 'generic' | 'voice-clash';
}

interface CoachReport {
  voices: { speaker: string; profile: string }[];
  lines: CoachLine[];
}

interface Props { onClose: () => void; }

export default function DialogueCoach({ onClose }: Props) {
  // The store holds the *active* screenplay directly on `screenplay` — the
  // `stories` array is for the workspace switcher. We read the live one.
  const screenplay = useAppStore((s) => s.screenplay);
  const settings = useAppStore((s) => s.settings);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CoachReport | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Extract just the dialogue blocks from the active screenplay. We pair
  // each character cue with the dialogue line that follows so the AI sees
  // "WHO said WHAT" pairs — much cleaner input than the raw element list.
  const dialogue = useMemo(() => {
    if (!screenplay?.elements) return [] as { speaker: string; line: string }[];
    const out: { speaker: string; line: string }[] = [];
    let current: string | null = null;
    for (const el of screenplay.elements as ScreenplayElement[]) {
      const text = stripHtml(el.content).trim();
      if (!text) continue;
      if (el.type === 'character') {
        // Character cues are typed in uppercase; collapse "(V.O.)" etc.
        current = text.replace(/\(.+?\)/g, '').trim().toUpperCase();
      } else if (el.type === 'dialogue' && current) {
        out.push({ speaker: current, line: text });
      } else if (el.type === 'scene-heading' || el.type === 'action' || el.type === 'transition') {
        current = null;
      }
    }
    return out;
  }, [screenplay?.elements]);

  const characterCount = useMemo(() => {
    const s = new Set(dialogue.map((d) => d.speaker));
    return s.size;
  }, [dialogue]);

  const run = async () => {
    if (!dialogue.length) {
      toast.error('No dialogue found in this screenplay yet. Write a few lines and try again.');
      return;
    }
    if (providerNeedsKey(settings.aiProvider) && !settings.aiApiKey) {
      toast.error('Add an AI API key first (✦ button in the toolbar)');
      return;
    }

    setBusy(true);
    setError(null);
    setReport(null);

    // Cap the input so we don't blow up token limits on huge scripts. Take
    // the most recent 80 lines — that's typically the act in progress, which
    // is what the writer cares about right now.
    const sample = dialogue.slice(-80);
    const prompt = sample
      .map((d, i) => `${i + 1}. ${d.speaker}: ${d.line}`)
      .join('\n');

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

    if (!result.ok) {
      setError(result.error);
      return;
    }
    const parsed = extractJSON<CoachReport>(result.text);
    if (!parsed || !Array.isArray(parsed.lines)) {
      setError(`AI returned something we couldn't parse as JSON. First 200 chars: ${result.text.slice(0, 200)}`);
      return;
    }
    setReport(parsed);
    toast.success(`Coached ${parsed.lines.length} line${parsed.lines.length === 1 ? '' : 's'} across ${parsed.voices?.length || 0} character${parsed.voices?.length === 1 ? '' : 's'}`);
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
            {dialogue.length} line{dialogue.length === 1 ? '' : 's'} across {characterCount} character{characterCount === 1 ? '' : 's'}
          </div>
        </div>
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
        {!report && !busy && !error && (
          <button
            onClick={run}
            disabled={dialogue.length === 0}
            className="w-full py-3 rounded-lg bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold shadow hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            {dialogue.length === 0 ? 'Write some dialogue first' : `Coach the last ${Math.min(80, dialogue.length)} lines`}
          </button>
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
            {/* Voice profiles */}
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
                          <p className="px-3 pb-2 text-[11px] text-[var(--text-secondary)] leading-relaxed">
                            {v.profile}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Flagged lines */}
            {report.lines.length > 0 && (
              <section>
                <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2">
                  Lines to sharpen ({report.lines.length})
                </h3>
                <div className="space-y-2">
                  {report.lines.map((l, i) => (
                    <FlaggedLine key={i} line={l} />
                  ))}
                </div>
              </section>
            )}

            {report.lines.length === 0 && (
              <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] text-center">
                ✨ No weak lines flagged — the dialogue is sharp.
              </div>
            )}

            <button
              onClick={run}
              className="w-full mt-2 py-2 rounded-lg border border-[var(--border)] text-[11px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              Re-run with latest dialogue
            </button>
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
      <button
        onClick={() => copy(line.rewrite)}
        title="Click to copy rewrite"
        className="w-full text-left p-2 rounded-md bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[11px] text-[var(--text)] hover:bg-[var(--accent)]/20 transition-colors"
      >
        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--accent)] block mb-1">Suggested rewrite — click to copy</span>
        "{line.rewrite}"
      </button>
    </div>
  );
}

/**
 * Strip HTML tags out of a TipTap content string so we feed the AI plain text.
 * Uses the platform DOM parser when available, falls back to a regex.
 */
function stripHtml(html: string): string {
  if (typeof document !== 'undefined') {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return d.textContent || '';
  }
  return (html || '').replace(/<[^>]+>/g, '');
}
