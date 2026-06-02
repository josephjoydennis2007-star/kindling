import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, X, Square, Send, Sparkles, CheckCircle2, AlertCircle, Loader2, ChevronRight } from 'lucide-react';
import { runAgent, cancelAgent, type AgentTurnEvent } from '@/lib/agentRunner';
import { isAgentRunning, type AgentEvent } from '@/lib/agentTools';

/**
 * AgentPanel — the live "watch the AI work" UI.
 *
 * Right-side drawer, ~420px wide. Big input at the top, live action log
 * below. Each step shows the tool name, args, and ok/fail. While the
 * agent is running, the input is disabled and a Stop button appears.
 *
 * The actual loop lives in agentRunner.ts; this panel just dispatches
 * `runAgent(goal)` and renders DOM events `agent:turn` + `agent:step`.
 */

interface Props {
  open: boolean;
  onClose: () => void;
}

type LogEntry =
  | { kind: 'step'; ts: number; tool: string; args: any; ok: boolean; message?: string }
  | { kind: 'turn'; ts: number; turnKind: AgentTurnEvent['kind']; text: string };

const SUGGESTIONS = [
  'Write the opening 3-page scene of a heist thriller set in Lisbon',
  'Build a 3-act outline + main characters for a coming-of-age short film about a 13-year-old chess prodigy',
  'Add 6 storyboard shots for the warehouse confrontation scene',
  'Create a worldbuilding wiki for a near-future dystopia with 4 factions',
  'Plan a documentary about urban farmers — beats, locations, and 5 interview scenes',
];

export default function AgentPanel({ open, onClose }: Props) {
  const [goal, setGoal] = useState('');
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Listen for live events.
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
    document.addEventListener('agent:step', onStep);
    document.addEventListener('agent:turn', onTurn);
    return () => {
      document.removeEventListener('agent:step', onStep);
      document.removeEventListener('agent:turn', onTurn);
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
    setRunning(true);
    setGoal('');
    setLog((prev) => [...prev, { kind: 'turn', ts: Date.now(), turnKind: 'reply', text: `▶ ${g}` }]);
    try {
      await runAgent(g);
    } finally {
      setRunning(false);
    }
  };

  const stop = () => {
    cancelAgent();
  };

  const clearLog = () => setLog([]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — click to close */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onClick={() => { if (!running) onClose(); }}
            className="fixed inset-0 bg-black/30 z-40"
            aria-hidden
          />

          <motion.aside
            role="dialog"
            aria-label="AI co-worker"
            initial={{ x: 420, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 420, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed top-0 bottom-0 right-0 w-full sm:w-[440px] bg-[var(--panel)] border-l border-[var(--rule)] z-50 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--rule)]">
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center"
                  style={{ background: 'var(--accent)' }}
                >
                  <Bot className="w-4 h-4 text-[var(--accent-ink)]" />
                </div>
                <div>
                  <div className="text-xs font-display font-bold text-[var(--text)]">Co-worker</div>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    {running ? 'Working — watch the rail + workspace' : 'Tell me what to build'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {log.length > 0 && (
                  <button
                    onClick={clearLog}
                    className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]"
                    title="Clear log"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={onClose}
                  disabled={running}
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)] rounded-md disabled:opacity-40"
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
                  placeholder="Describe what you want — &quot;Write a 1-page opening scene for a heist thriller in Lisbon&quot; or &quot;Build a 3-act outline and main characters for a YouTube short about a chess prodigy.&quot;"
                  rows={3}
                  disabled={running}
                  className="w-full bg-transparent px-3 py-2 text-xs text-[var(--text)] outline-none resize-none placeholder:text-[var(--text-muted)]/70 disabled:opacity-50"
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

              {/* Suggestion chips — only show when not running + log empty */}
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

            {/* Live log */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {log.length === 0 && !running && (
                <div className="text-center py-8 text-[var(--text-muted)] text-xs">
                  <Bot className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Live actions will stream here.
                </div>
              )}
              {log.map((entry, i) => (
                <LogRow key={i} entry={entry} />
              ))}
              {running && (
                <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs py-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Working…
                </div>
              )}
            </div>

            <footer className="px-3 py-2 border-t border-[var(--rule)] text-[10px] text-[var(--text-muted)]">
              Powered by the built-in AI (Pollinations.ai). Change provider in Settings → AI.
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  if (entry.kind === 'turn') {
    const color =
      entry.turnKind === 'error' ? 'var(--danger)'
      : entry.turnKind === 'plan' ? 'var(--text-muted)'
      : 'var(--text-secondary)';
    return (
      <div
        className="text-[11px] italic leading-snug px-1"
        style={{ color }}
      >
        {entry.text}
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
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">
            {entry.message}
          </div>
        )}
      </div>
    </div>
  );
}

function summarizeArgs(args: any): string {
  if (!args || typeof args !== 'object') return '';
  // Pull the first interesting field
  const keys = Object.keys(args);
  if (keys.length === 0) return '';
  const first = args[keys[0]];
  if (typeof first === 'string') {
    return `(${keys[0]}: "${first.slice(0, 40)}${first.length > 40 ? '…' : ''}")`;
  }
  return `(${keys.slice(0, 2).join(', ')})`;
}
