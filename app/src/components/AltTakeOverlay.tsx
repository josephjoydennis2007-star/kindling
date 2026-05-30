import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Loader2, AlertCircle, RefreshCw, ArrowRightLeft } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { aiOnce, providerNeedsKey } from '@/lib/aiClient';

/**
 * AI "What-if?" alternate take generator.
 *
 * Opens a small modal showing the original passage + an AI-generated
 * alternate take. The user picks the *angle* (less is more, raise stakes,
 * darker, lighter, formal, gritty, etc.) and the AI rewrites the entire
 * selection.
 *
 * Triggered by the `writer:openAltTake` custom event with detail:
 *   { text: string, label?: string }
 *
 * The selected angle ships as part of the system prompt; the original
 * passage is the user message. We display BOTH so the writer can compare
 * before committing to a replacement.
 *
 * Replace dispatches `writer:replaceText {find, replace}` — the same event
 * the Dialogue Coach uses — so the existing WriterView handler does the
 * actual ProseMirror edit. Undo is wired through that same path.
 */

interface Trigger {
  text: string;
  /** Optional human label (e.g. "Selection") for the panel heading. */
  label?: string;
}

const ANGLES = [
  { id: 'less-is-more',  label: 'Less is more',  hint: 'Cut everything that isn’t essential' },
  { id: 'raise-stakes',  label: 'Raise the stakes', hint: 'Make consequences more dangerous' },
  { id: 'darker',        label: 'Darker',        hint: 'Lean into dread + moral weight' },
  { id: 'lighter',       label: 'Lighter',       hint: 'Add wit, warmth, breathing room' },
  { id: 'subtextual',    label: 'Subtextual',    hint: 'Say less, mean more' },
  { id: 'visual',        label: 'More visual',   hint: 'Show, don’t tell — verbs + images' },
  { id: 'gritty',        label: 'Gritty',        hint: 'Hard edges, rough textures' },
  { id: 'formal',        label: 'Formal',        hint: 'Period-appropriate or elevated diction' },
];

export default function AltTakeOverlay() {
  const settings = useAppStore((s) => s.settings);

  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [angleId, setAngleId] = useState<string>('less-is-more');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alt, setAlt] = useState<string | null>(null);

  // Listen for the open event
  useEffect(() => {
    const onOpen = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as Trigger | undefined;
      if (!detail?.text?.trim()) return;
      setTrigger({ text: detail.text.trim(), label: detail.label });
      setAngleId('less-is-more');
      setAlt(null);
      setError(null);
    };
    document.addEventListener('writer:openAltTake', onOpen as EventListener);
    return () => document.removeEventListener('writer:openAltTake', onOpen as EventListener);
  }, []);

  const close = () => { setTrigger(null); setAlt(null); setError(null); };

  const run = async () => {
    if (!trigger) return;
    if (providerNeedsKey(settings.aiProvider) && !settings.aiApiKey) {
      setError('Add an AI API key first (✦ button in the toolbar).');
      return;
    }
    const angle = ANGLES.find((a) => a.id === angleId) || ANGLES[0];
    const system = [
      'You are a screenwriting rewrite engine.',
      `Apply this angle: "${angle.label}" — ${angle.hint}.`,
      'Rules:',
      '- Output ONLY the rewritten passage. No prose, no fences, no preamble.',
      '- Preserve the original line breaks and paragraph count where possible.',
      '- Do not invent new characters or scene headings.',
      '- Match the original\'s element type (dialogue stays dialogue, action stays action).',
    ].join('\n');

    setBusy(true); setError(null); setAlt(null);
    const result = await aiOnce(settings, system, trigger.text, {
      maxTokens: Math.max(400, Math.min(1500, trigger.text.length * 2)),
      temperature: 0.7,
    });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setAlt(result.text.trim());
  };

  const replace = () => {
    if (!trigger || !alt) return;
    document.dispatchEvent(new CustomEvent('writer:replaceText', {
      detail: { find: trigger.text, replace: alt },
    }));
    close();
  };

  return (
    <AnimatePresence>
      {trigger && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3"
          onClick={close}
        >
          <motion.div
            initial={{ scale: 0.96, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-[var(--panel)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
            role="dialog"
            aria-label="What-if alternate take"
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] bg-[var(--card)]">
              <div className="w-8 h-8 rounded-md bg-[var(--accent-soft)] border border-[var(--accent)]/40 flex items-center justify-center" style={{ color: 'var(--accent)' }}>
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-[var(--text)]">What if…?</div>
                <div className="text-[10px] text-[var(--text-muted)]">
                  AI alternate take · {trigger.label || 'Selection'} ({trigger.text.length} chars)
                </div>
              </div>
              <button onClick={close} className="p-1.5 rounded-md text-[var(--text-muted)] hover:bg-[var(--hover)]" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Angle picker */}
              <section>
                <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2">Angle</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {ANGLES.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => { setAngleId(a.id); setAlt(null); }}
                      title={a.hint}
                      className={`px-2 py-2 rounded-lg border text-[11px] font-semibold transition-all text-left ${
                        angleId === a.id
                          ? 'bg-[var(--accent)] border-transparent text-[var(--accent-ink)]'
                          : 'bg-[var(--card)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </section>

              {/* Original vs alt */}
              <section className="grid sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-[var(--card)] border border-[var(--border)] space-y-1">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Original</div>
                  <pre className="text-[11px] text-[var(--text)] whitespace-pre-wrap font-sans leading-relaxed">{trigger.text}</pre>
                </div>
                <div className="p-3 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/40 space-y-1 min-h-[80px] flex flex-col">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--accent)]">Alt take</div>
                  {busy ? (
                    <div className="flex flex-col items-center gap-1.5 py-6 text-[var(--text-muted)] text-[11px]">
                      <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
                      Drafting…
                    </div>
                  ) : alt ? (
                    <pre className="text-[11px] text-[var(--text)] whitespace-pre-wrap font-sans leading-relaxed">{alt}</pre>
                  ) : error ? (
                    <div className="flex items-start gap-1.5 text-[11px] text-red-400">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-[var(--text-muted)] italic">Click <strong>Generate</strong> to see this angle.</div>
                  )}
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--border)] bg-[var(--card)]">
              {alt ? (
                <>
                  <button
                    onClick={() => { setAlt(null); run(); }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:border-[var(--accent)]"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                  </button>
                  <div className="flex-1" />
                  <button onClick={close} className="px-3 py-2 rounded-md text-xs text-[var(--text-secondary)] hover:bg-[var(--hover)]">
                    Cancel
                  </button>
                  <button
                    onClick={replace}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-[var(--accent)] text-[var(--bg)] text-xs font-bold hover:brightness-110"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" /> Replace in script
                  </button>
                </>
              ) : (
                <>
                  <div className="flex-1" />
                  <button onClick={close} className="px-3 py-2 rounded-md text-xs text-[var(--text-secondary)] hover:bg-[var(--hover)]">
                    Cancel
                  </button>
                  <button
                    onClick={run}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-[var(--accent)] text-[var(--accent-ink)] text-xs font-semibold hover:brightness-110 disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Generate
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
