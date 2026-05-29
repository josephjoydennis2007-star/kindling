import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Stethoscope, X, AlertTriangle, AlertCircle, Info, Wand2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { analyzeText, type Finding } from '@/lib/styleAssistant';
import { useAppStore } from '@/store/useAppStore';

/**
 * Floating style/doctor panel — opened by Ctrl+Shift+S from the App. Reads
 * the writer's plain text and lists rule-based findings.
 */
export default function StylePane() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen((v) => !v);
    document.addEventListener('writer:openStyle', onOpen);
    return () => document.removeEventListener('writer:openStyle', onOpen);
  }, []);

  const text = useMemo(() => {
    if (!open) return '';
    const pm = document.querySelector('.ProseMirror') as HTMLElement | null;
    return pm?.innerText || '';
  }, [open]);

  const findings = useMemo(() => (open ? analyzeText(text) : []), [open, text]);
  const [aiFindings, setAiFindings] = useState<Finding[]>([]);
  const [busy, setBusy] = useState(false);

  const runDoctor = async () => {
    const settings = useAppStore.getState().settings;
    if (!settings.aiApiKey && settings.aiProvider !== 'ollama') {
      toast.error('Add an AI API key in Settings first');
      return;
    }
    const stripped = (document.querySelector('.ProseMirror') as HTMLElement | null)?.innerText || '';
    if (stripped.length < 80) { toast.error('Write more before asking the doctor'); return; }
    setBusy(true);
    try {
      const url = settings.aiProvider === 'openai'    ? 'https://api.openai.com/v1/chat/completions'
                : settings.aiProvider === 'groq'      ? 'https://api.groq.com/openai/v1/chat/completions'
                : settings.aiProvider === 'openrouter'? 'https://openrouter.ai/api/v1/chat/completions'
                : settings.aiProvider === 'ollama'    ? `${(settings.aiEndpoint || 'http://localhost:11434').replace(/\/$/, '')}/v1/chat/completions`
                : settings.aiProvider === 'anthropic' ? 'https://api.anthropic.com/v1/messages'
                : settings.aiEndpoint;
      if (!url) throw new Error('No endpoint configured');

      const system = 'You are a script doctor. Return ONLY a JSON object {"findings": [{"severity":"info|warn|error","note":"...","text":"snippet"}, ...]}. ' +
        'Look for pacing problems, weak hooks, overlong scenes, dialogue blocks too long, characters absent for too long, repeated scene-beats, missing stakes. Max 8 findings.';
      const user = `Critique this screenplay excerpt:\n\n${stripped.slice(0, 7000)}`;

      let reply = '';
      if (settings.aiProvider === 'anthropic') {
        const r = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': settings.aiApiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: settings.aiModel || 'claude-3-5-haiku-latest',
            max_tokens: 1200,
            system,
            messages: [{ role: 'user', content: user }],
          }),
        });
        if (!r.ok) throw new Error(`Anthropic ${r.status}`);
        reply = (await r.json()).content?.[0]?.text || '';
      } else {
        const r = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(settings.aiApiKey ? { authorization: `Bearer ${settings.aiApiKey}` } : {}),
          },
          body: JSON.stringify({
            model: settings.aiModel || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            response_format: { type: 'json_object' },
          }),
        });
        if (!r.ok) throw new Error(`AI ${r.status}`);
        reply = (await r.json()).choices?.[0]?.message?.content || '';
      }
      const m = reply.match(/\{[\s\S]*\}/);
      if (!m) { toast.error('AI returned no JSON'); return; }
      const json = JSON.parse(m[0]);
      const fs: Finding[] = Array.isArray(json.findings) ? json.findings.map((f: any) => ({
        kind: 'long-sentence',
        severity: ['info', 'warn', 'error'].includes(f.severity) ? f.severity : 'info',
        note: f.note || 'finding',
        text: (f.text || '').slice(0, 200),
      })) : [];
      setAiFindings(fs);
      toast.success(`${fs.length} doctor finding${fs.length !== 1 ? 's' : ''}`);
    } catch (e: any) {
      toast.error(`Doctor failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const allFindings = [...findings, ...aiFindings];

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 20, opacity: 0 }}
          className="fixed right-4 top-20 bottom-12 z-[260] w-80 bg-[var(--panel)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col"
        >
          <header className="p-3 border-b border-[var(--border)] flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-sm font-bold text-[var(--text)] flex-1">Style assistant</h3>
            <button onClick={() => setOpen(false)} aria-label="Close" className="p-1 text-[var(--text-muted)] hover:text-[var(--text)]">
              <X className="w-4 h-4" />
            </button>
          </header>

          <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--card)] text-[10px] uppercase tracking-widest font-bold flex items-center gap-3">
            <span className="text-emerald-400">{allFindings.filter((f) => f.severity === 'info').length} note{allFindings.filter((f) => f.severity === 'info').length !== 1 ? 's' : ''}</span>
            <span className="text-amber-400">{allFindings.filter((f) => f.severity === 'warn').length} warn</span>
            <span className="text-red-400">{allFindings.filter((f) => f.severity === 'error').length} error</span>
            <button
              onClick={runDoctor}
              disabled={busy}
              className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white normal-case tracking-normal text-[10px] font-bold hover:brightness-110 disabled:opacity-50"
              title="Ask the AI for a script-doctor pass"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              {busy ? 'Doctor…' : 'Run Doctor'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {allFindings.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] text-center py-10 px-3">
                Nothing to flag — keep going. (Or you haven't written anything in the writer yet.)
              </p>
            ) : allFindings.map((f, i) => {
              const Icon = f.severity === 'error' ? AlertCircle : f.severity === 'warn' ? AlertTriangle : Info;
              const color = f.severity === 'error' ? 'text-red-400 border-red-500/30 bg-red-500/5'
                          : f.severity === 'warn' ? 'text-amber-400 border-amber-500/30 bg-amber-500/5'
                          : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5';
              return (
                <div key={i} className={`rounded-lg border p-2.5 ${color}`}>
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold mb-1">
                    <Icon className="w-3 h-3" /> {f.note}
                  </div>
                  <div className="text-[11px] text-[var(--text)] leading-snug">{f.text}</div>
                </div>
              );
            })}
          </div>

          <footer className="px-3 py-2 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)]">
            Local-only · no AI · refreshes when you re-open
          </footer>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
