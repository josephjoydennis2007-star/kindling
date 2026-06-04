import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, X, Square, Send, Sparkles, CheckCircle2, AlertCircle, Loader2, ChevronRight, Minimize2, Maximize2, Trash2 } from 'lucide-react';
import { runAgent, cancelAgent, type AgentTurnEvent, type AgentProgressEvent } from '@/lib/agentRunner';
import { isAgentRunning, type AgentEvent } from '@/lib/agentTools';
import { loadMemory, clearMemory, type MemoryTurn } from '@/lib/agentMemory';
import { useAppStore } from '@/store/useAppStore';
import { toast } from 'sonner';

/**
 * AgentPanel — the live "watch the AI work" UI.
 *
 * Right-side drawer. CRUCIALLY non-modal: no backdrop, no pointer-events
 * blocker on the rest of the app. The user can keep clicking around the
 * Writer / Director / Plot views while the agent runs and still watch
 * the live log on the side. Click the minimize button to shrink the
 * drawer to a thin strip so it doesn't cover the workspace.
 *
 * Memory: prior turns for the active story are loaded on open and
 * rendered as a chat-style history above the live log. The agent uses
 * the same memory in its prompt, so follow-ups like "now do X with what
 * you just did" work correctly.
 */

interface Props {
  open: boolean;
  onClose: () => void;
}

type LogEntry =
  | { kind: 'step'; ts: number; tool: string; args: any; ok: boolean; message?: string }
  | { kind: 'turn'; ts: number; turnKind: AgentTurnEvent['kind']; text: string }
  | { kind: 'memory'; ts: number; role: MemoryTurn['role']; content: string };

const SUGGESTIONS = [
  'Write a complete 3-page opening scene for a heist thriller in Lisbon',
  'Build a 3-act outline + 6 main characters for a coming-of-age short film about a 13-year-old chess prodigy',
  'Add 8 storyboard shots across the warehouse confrontation scene with shot types and lens notes',
  'Create a worldbuilding wiki for a near-future dystopia with 4 factions, 3 locations, 5 lore entries',
  'Plan a documentary: 5 act beats, 6 locations with permits/cost, 4 interview scenes, and a 1-page logline+synopsis',
];

export default function AgentPanel({ open, onClose }: Props) {
  const activeStoryId = useAppStore((s) => s.activeStoryId);
  const [goal, setGoal] = useState('');
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [minimized, setMinimized] = useState(false);
  // Milestone plan + current step from the AI itself. Drives the
  // "Step 2 of 5 — Creating characters" indicator at the top of the log
  // instead of a technical "turn N/30" counter.
  const [progress, setProgress] = useState<AgentProgressEvent | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load prior memory when opening (or when active story changes).
  useEffect(() => {
    if (!open) return;
    const mem = loadMemory(activeStoryId);
    const entries: LogEntry[] = mem.map((m) => ({ kind: 'memory', ts: m.ts, role: m.role, content: m.content }));
    setLog(entries);
  }, [open, activeStoryId]);

  // Live events from the runner.
  useEffect(() => {
    const onStep = (e: Event) => {
      const ev = (e as CustomEvent<AgentEvent>).detail;
      setLog((prev) => [...prev, {
        kind: 'step', ts: ev.ts, tool: ev.tool, args: ev.args, ok: ev.ok, message: ev.message,
      }]);
    };
    const onTurn = (e: Event) => {
      const ev = (e as CustomEvent<AgentTurnEvent>).detail;
      setLog((prev) => [...prev, { kind: 'turn', ts: ev.ts, turnKind: ev.kind, text: ev.text }]);
    };
    const onProgress = (e: Event) => {
      const ev = (e as CustomEvent<AgentProgressEvent>).detail;
      setProgress(ev);
    };
    document.addEventListener('agent:step', onStep);
    document.addEventListener('agent:turn', onTurn);
    document.addEventListener('agent:progress', onProgress);
    return () => {
      document.removeEventListener('agent:step', onStep);
      document.removeEventListener('agent:turn', onTurn);
      document.removeEventListener('agent:progress', onProgress);
    };
  }, []);

  // Auto-scroll log to the latest entry.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [log]);

  const start = async (text?: string) => {
    const g = (text ?? goal).trim();
    if (!g) return;
    if (isAgentRunning()) return;
    if (!activeStoryId) { toast.error('Pick a story first'); return; }
    setRunning(true);
    setGoal('');
    setProgress(null); // Reset milestone plan — the AI will define a new one for this goal.
    setLog((prev) => [...prev, { kind: 'turn', ts: Date.now(), turnKind: 'reply', text: `▶ ${g}` }]);
    try {
      await runAgent(g);
    } finally {
      setRunning(false);
    }
  };

  const stop = () => {
    // Abort the in-flight request immediately (cancelAgent aborts the
    // run's AbortController) + give instant visual feedback. The runner
    // exits within ~250ms, but we flip the UI now so Stop feels snappy.
    cancelAgent();
    setRunning(false);
    setLog((prev) => [...prev, { kind: 'turn', ts: Date.now(), turnKind: 'reply', text: '■ Stopping…' }]);
  };

  const handleClearMemory = () => {
    if (running) return;
    if (!confirm('Clear all agent memory for this story? Past plans + tool history will be deleted.')) return;
    clearMemory(activeStoryId);
    setLog([]);
    toast.success('Agent memory cleared');
  };

  // Width: ~440px when expanded, ~56px when minimized so the user can
  // see the workspace + still hit the maximize button.
  const width = minimized ? 56 : 440;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* NOTE: no backdrop. The drawer is non-modal — the user can
              keep interacting with the workspace while the agent runs. */}

          <motion.aside
            role="complementary"
            aria-label="AI co-worker"
            initial={{ x: width, opacity: 0 }}
            animate={{ x: 0, opacity: 1, width }}
            exit={{ x: width, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed top-0 bottom-0 right-0 bg-[var(--panel)] border-l border-[var(--rule)] z-40 flex flex-col shadow-2xl"
            style={{ width }}
          >
            {minimized ? (
              <MinimizedRail
                running={running}
                onExpand={() => setMinimized(false)}
                onClose={onClose}
              />
            ) : (
              <>
                {/* Header */}
                <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--rule)]">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--accent)' }}
                    >
                      <Bot className="w-4 h-4 text-[var(--accent-ink)]" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-display font-bold text-[var(--text)] truncate">Co-worker</div>
                      <div className="text-[10px] text-[var(--text-muted)] truncate">
                        {running ? 'Working…' : 'Tell me what to build'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={handleClearMemory}
                      disabled={running}
                      title="Clear agent memory for this story"
                      className="p-1 text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--hover)] rounded-md disabled:opacity-40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setMinimized(true)}
                      title="Minimize"
                      className="p-1 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)] rounded-md"
                    >
                      <Minimize2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={onClose}
                      title="Close panel"
                      className="p-1 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)] rounded-md"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </header>

                {/* Goal input */}
                <div className="p-3 border-b border-[var(--rule)]">
                  <div className="rounded-xl border border-[var(--rule)] bg-[var(--card)] focus-within:border-[var(--accent)] transition-colors">
                    <textarea
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); start(); }
                      }}
                      placeholder={running
                        ? 'Working — queue another instruction or hit Stop'
                        : 'Describe what to build. Examples: "Write the full opening scene…" "Add 10 more shots…" "Make the protagonist a former con artist instead…"'}
                      rows={3}
                      className="w-full bg-transparent px-3 py-2 text-xs text-[var(--text)] outline-none resize-none placeholder:text-[var(--text-muted)]/70"
                    />
                    <div className="flex items-center justify-between px-2 pb-2">
                      <span className="text-[10px] text-[var(--text-muted)]">
                        Enter to send · Shift+Enter for newline
                      </span>
                      {running ? (
                        <button
                          onClick={stop}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--danger)] text-white hover:brightness-110"
                        >
                          <Square className="w-3 h-3 fill-current" />
                          Stop
                        </button>
                      ) : (
                        <button
                          onClick={() => start()}
                          disabled={!goal.trim()}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40"
                          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                        >
                          <Send className="w-3 h-3" />
                          Run
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Suggestion chips — only when no log + not running */}
                  {!running && log.length === 0 && (
                    <div className="mt-3">
                      <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)] mb-1.5">
                        Try
                      </div>
                      <div className="flex flex-col gap-1">
                        {SUGGESTIONS.map((s) => (
                          <button
                            key={s}
                            onClick={() => start(s)}
                            className="text-left text-[11px] px-2 py-1.5 rounded-md bg-[var(--card)] border border-[var(--rule)] text-[var(--text-secondary)] hover:text-[var(--text)] hover:border-[var(--accent)]/50 transition-colors flex items-center gap-1.5"
                          >
                            <Sparkles className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                            <span className="flex-1">{s}</span>
                            <ChevronRight className="w-3 h-3 flex-shrink-0 opacity-50" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Milestone progress strip — shows the AI's OWN plan
                    for THIS specific request, not the runner's iteration
                    counter. "Step 2 of 5 — Creating characters". Hidden
                    when there's no plan yet. */}
                {progress && progress.steps.length > 0 && (
                  <div className="px-3 pt-2 pb-1 border-b border-[var(--rule)] bg-[var(--card)]/40">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)] mb-1">
                      <span>Step {Math.min(progress.currentStep + 1, progress.steps.length)} of {progress.steps.length}</span>
                      {running && <Loader2 className="w-3 h-3 animate-spin" />}
                    </div>
                    <div className="text-xs text-[var(--text)] font-medium leading-tight">
                      {progress.steps[progress.currentStep] || progress.steps[progress.steps.length - 1]}
                    </div>
                    {/* Mini progress bar — segments per step, the active one filled. */}
                    <div className="mt-1.5 flex gap-0.5">
                      {progress.steps.map((_, i) => (
                        <span
                          key={i}
                          className="h-0.5 flex-1 rounded-full transition-colors"
                          style={{
                            background: i <= progress.currentStep
                              ? 'var(--accent)'
                              : 'var(--rule)',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Live + persistent log */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-1.5">
                  {log.length === 0 && !running && (
                    <div className="text-center py-8 text-[var(--text-muted)] text-xs">
                      <Bot className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <div>Live actions stream here.</div>
                      <div className="mt-1 opacity-70">The agent remembers everything per-story.</div>
                    </div>
                  )}
                  {/* Filter out the per-turn "Thinking…" / "Step N of M"
                      status lines from the log itself — they're now in
                      the strip above. We still keep error replies and
                      the AI's own `thought` lines. */}
                  {log
                    .filter((e) => !(e.kind === 'turn' && e.turnKind === 'plan' && /^Step \d+ of \d+|^Thinking…$/.test(e.text)))
                    .map((entry, i) => <LogRow key={i} entry={entry} />)}
                  {running && !progress && (
                    <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs py-1 sticky bottom-0 bg-[var(--panel)]">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Working — switch tabs to watch
                    </div>
                  )}
                </div>

                <footer
                  className="px-3 py-2 border-t border-[var(--rule)] text-[10px] text-[var(--text-muted)]"
                  title="The agent runs up to 30 internal iterations as a safety cap. The user-facing step count comes from the AI's own plan for your request."
                >
                  Powered by the built-in AI · memory persists per story
                </footer>
              </>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/** Compact 56px-wide rail when minimized — shows the bot icon + a
 *  pulsing indicator when running, plus the expand button. */
function MinimizedRail({ running, onExpand, onClose }: { running: boolean; onExpand: () => void; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center py-3 gap-2">
      <button
        onClick={onExpand}
        title="Expand co-worker"
        className="relative w-10 h-10 rounded-md flex items-center justify-center"
        style={{ background: 'var(--accent)' }}
      >
        <Bot className="w-5 h-5 text-[var(--accent-ink)]" />
        {running && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
        )}
      </button>
      <button
        onClick={onExpand}
        title="Expand"
        className="w-10 h-8 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)] rounded-md"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </button>
      <div className="flex-1" />
      <button
        onClick={onClose}
        title="Close"
        className="w-10 h-8 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)] rounded-md"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  if (entry.kind === 'turn') {
    const color =
      entry.turnKind === 'error' ? 'var(--danger)'
      : entry.turnKind === 'plan' ? 'var(--text-muted)'
      : 'var(--text-secondary)';
    return (
      <div className="text-[11px] italic leading-snug px-1" style={{ color }}>
        {entry.text}
      </div>
    );
  }
  if (entry.kind === 'memory') {
    // Render persisted prior turns more compactly + faded so they don't
    // dominate the live log.
    const label =
      entry.role === 'user' ? 'You'
      : entry.role === 'assistant' ? 'AI'
      : '→';
    const accent =
      entry.role === 'user' ? 'var(--accent)'
      : entry.role === 'assistant' ? 'var(--text-secondary)'
      : 'var(--text-muted)';
    return (
      <div className="text-[10px] leading-snug px-2 py-1 border-l-2 opacity-70" style={{ borderColor: accent }}>
        <div className="text-[9px] uppercase tracking-wider font-bold" style={{ color: accent }}>{label}</div>
        <div className="text-[var(--text-secondary)] whitespace-pre-wrap line-clamp-4">{entry.content}</div>
      </div>
    );
  }
  // step
  return (
    <div className="flex items-start gap-2 text-[11px] bg-[var(--card)] border border-[var(--rule)] rounded-md px-2 py-1.5">
      {entry.ok ? (
        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: '#5c8b7e' }} />
      ) : (
        <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--danger)' }} />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-mono font-semibold text-[var(--text)]">
          {entry.tool}
          <span className="text-[var(--text-muted)] font-normal ml-1">
            {summarizeArgs(entry.args)}
          </span>
        </div>
        {entry.message && (
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5 line-clamp-2">
            {entry.message}
          </div>
        )}
      </div>
    </div>
  );
}

function summarizeArgs(args: any): string {
  if (!args || typeof args !== 'object') return '';
  const keys = Object.keys(args);
  if (keys.length === 0) return '';
  const first = args[keys[0]];
  if (typeof first === 'string') {
    return `(${keys[0]}: "${first.slice(0, 40)}${first.length > 40 ? '…' : ''}")`;
  }
  return `(${keys.slice(0, 2).join(', ')})`;
}
