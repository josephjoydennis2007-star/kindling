import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Send, Trash2, Settings2, Bot, Loader2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';

interface Props { onClose: () => void; }

type Msg = { role: 'user' | 'assistant' | 'system'; content: string; ts: number };

const QUICK_PROMPTS = [
  { label: 'Generate scene', prompt: 'Write a vivid 1-page scene based on my current story.' },
  { label: 'Suggest beats', prompt: 'Suggest 6 plot beats that would strengthen the current act.' },
  { label: 'Punch dialogue', prompt: 'Take the most recent dialogue I wrote and make it sharper, more visual, and more distinct per character.' },
  { label: 'Character flaw', prompt: 'Give each character a meaningful flaw that creates dramatic tension with another character.' },
  { label: 'Shot list', prompt: 'Suggest a director shot list (wide, medium, close-up, insert) for the active scene.' },
  { label: 'Logline polish', prompt: 'Rewrite my logline 3 different ways: punchier, more visual, and clearly genre-coded.' },
];

const STORAGE_KEY = 'kindling-ai-history';

export default function AIHelperPanel({ onClose }: Props) {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const screenplay = useAppStore((s) => s.screenplay);
  const characters = useAppStore((s) => s.characters);
  const scenes = useAppStore((s) => s.scenes);

  const [messages, setMessages] = useState<Msg[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, busy]);

  const send = async (override?: string) => {
    const userText = (override ?? text).trim();
    if (!userText) return;
    setText('');

    const context = buildContext({ screenplay, characters, scenes });
    const sys: Msg = {
      role: 'system',
      content:
        `You are a co-writer and director's assistant inside a screenplay app. ` +
        `Be concise, vivid, and structured. When useful, output screenplay format. ` +
        `Project context:\n${context}`,
      ts: Date.now(),
    };
    const userMsg: Msg = { role: 'user', content: userText, ts: Date.now() };
    setMessages((m) => [...m, userMsg]);

    if (!settings.aiApiKey) {
      // Local fallback — show a templated reply explaining how to enable.
      const stub: Msg = {
        role: 'assistant',
        ts: Date.now(),
        content:
          `(AI is offline — no API key configured.)\n\nClick the ⚙ settings icon and paste an Anthropic, OpenAI, or custom endpoint key to enable real responses.\n\nHere is what I would otherwise do with your request:\n\n• Use the project context (${characters.length} character${characters.length===1?'':'s'}, ${scenes.length} scene${scenes.length===1?'':'s'}, title "${screenplay.title || '(untitled)'}")\n• Generate 3 alternative angles and pick the best\n• Return tightly formatted screenplay text you can drop into your draft`,
      };
      setMessages((m) => [...m, stub]);
      return;
    }

    setBusy(true);
    try {
      const reply = await callAI({
        provider: settings.aiProvider,
        endpoint: settings.aiEndpoint,
        apiKey: settings.aiApiKey,
        model: settings.aiModel,
        messages: [sys, ...messages, userMsg],
      });
      setMessages((m) => [...m, { role: 'assistant', content: reply, ts: Date.now() }]);
    } catch (e: any) {
      toast.error(`AI error: ${e?.message || e}`);
      setMessages((m) => [...m, { role: 'assistant', content: `⚠ ${e?.message || 'request failed'}`, ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="h-full flex flex-col bg-[var(--panel)]"
    >
      {/* Header */}
      <div className="relative p-4 border-b border-[var(--border)] overflow-hidden">
        <div className="absolute inset-0 opacity-30 pointer-events-none bg-[radial-gradient(circle_at_top_left,_#a78bfa_0%,_transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 flex items-center justify-center shadow">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-[var(--text)]">AI Co-writer</div>
              <div className="text-[10px] text-[var(--text-muted)]">{settings.aiApiKey ? 'Connected' : 'No API key set'}</div>
            </div>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setShowSettings((v) => !v)} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]">
              <Settings2 className="w-4 h-4" />
            </button>
            <button onClick={() => { setMessages([]); }} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10" title="Clear">
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-[var(--border)] bg-[var(--card)] p-3 space-y-2"
          >
            <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)]">Provider</div>
            <div className="flex gap-1.5">
              {(['anthropic', 'openai', 'custom'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => updateSettings({ aiProvider: p })}
                  className={`flex-1 px-2 py-1.5 rounded-md text-[11px] border ${
                    settings.aiProvider === p
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                      : 'border-[var(--border)] text-[var(--text-secondary)]'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)] mt-2">Model</div>
            <input
              value={settings.aiModel}
              onChange={(e) => updateSettings({ aiModel: e.target.value })}
              placeholder="claude-opus-4-7 / gpt-4o / …"
              className="w-full px-3 py-2 rounded-md bg-[var(--bg)] border border-[var(--border)] text-xs outline-none focus:border-[var(--accent)]"
            />

            <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)] mt-2">API key</div>
            <input
              value={settings.aiApiKey}
              onChange={(e) => updateSettings({ aiApiKey: e.target.value })}
              type="password"
              placeholder="sk-… / paste here"
              className="w-full px-3 py-2 rounded-md bg-[var(--bg)] border border-[var(--border)] text-xs font-mono outline-none focus:border-[var(--accent)]"
            />

            {settings.aiProvider === 'custom' && (
              <>
                <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)] mt-2">Endpoint</div>
                <input
                  value={settings.aiEndpoint}
                  onChange={(e) => updateSettings({ aiEndpoint: e.target.value })}
                  placeholder="https://api.example.com/v1/chat/completions"
                  className="w-full px-3 py-2 rounded-md bg-[var(--bg)] border border-[var(--border)] text-xs outline-none focus:border-[var(--accent)]"
                />
              </>
            )}

            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              Keys are stored only on this device (localStorage). Calls go directly browser → provider.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat scroll */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 flex items-center justify-center shadow-xl">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <p className="text-xs text-[var(--text-secondary)] font-semibold">Your co-writer is ready.</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">Ask for scenes, beats, dialogue polish, or shot lists.</p>
            <div className="flex flex-wrap gap-1 justify-center mt-4 px-3">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q.label}
                  onClick={() => send(q.prompt)}
                  className="text-[10px] px-2.5 py-1 rounded-full bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[var(--text-secondary)] transition-all"
                >
                  <Wand2 className="w-2.5 h-2.5 inline mr-1" />
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.filter((m) => m.role !== 'system').map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[88%] rounded-2xl px-3 py-2 ${
              m.role === 'user'
                ? 'bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white rounded-br-sm'
                : 'bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded-bl-sm'
            }`}>
              <div className="text-xs whitespace-pre-wrap leading-snug">{m.content}</div>
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="max-w-[88%] rounded-2xl px-3 py-2 bg-[var(--card)] border border-[var(--border)] text-[var(--text-muted)] text-xs flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Thinking…
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-2 border-t border-[var(--border)] bg-[var(--sidebar)]">
        <div className="flex gap-1.5 items-end">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask the AI to help…"
            rows={2}
            className="flex-1 px-3 py-2 rounded-xl bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text)] outline-none focus:border-[var(--accent)] resize-none"
          />
          <button
            onClick={() => send()}
            disabled={busy || !text.trim()}
            className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ---- AI provider call helpers ----

function buildContext({ screenplay, characters, scenes }: any): string {
  const lines: string[] = [];
  if (screenplay?.title) lines.push(`Title: ${screenplay.title}`);
  if (screenplay?.logline) lines.push(`Logline: ${screenplay.logline}`);
  if (screenplay?.synopsis) lines.push(`Synopsis: ${screenplay.synopsis.slice(0, 600)}`);
  if (characters?.length) {
    lines.push(`Characters (${characters.length}):`);
    for (const c of characters.slice(0, 12)) lines.push(`  - ${c.name}${c.description ? ' — ' + c.description.slice(0, 120) : ''}`);
  }
  if (scenes?.length) {
    lines.push(`Scenes (${scenes.length}):`);
    for (const s of scenes.slice(0, 12)) lines.push(`  - ${s.heading || s.name} [${s.status}]`);
  }
  return lines.join('\n');
}

async function callAI(opts: {
  provider: 'anthropic' | 'openai' | 'custom';
  endpoint: string;
  apiKey: string;
  model: string;
  messages: Msg[];
}): Promise<string> {
  if (opts.provider === 'anthropic') {
    const sys = opts.messages.find((m) => m.role === 'system')?.content;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: opts.model || 'claude-opus-4-7',
        max_tokens: 1500,
        system: sys,
        messages: opts.messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    return (j.content?.[0]?.text || '').trim();
  }

  if (opts.provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${opts.apiKey}` },
      body: JSON.stringify({
        model: opts.model || 'gpt-4o-mini',
        messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: 1500,
        temperature: 0.7,
      }),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    return (j.choices?.[0]?.message?.content || '').trim();
  }

  // custom
  if (!opts.endpoint) throw new Error('Custom endpoint not set');
  const r = await fetch(opts.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${opts.apiKey}` },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!r.ok) throw new Error(`Custom endpoint ${r.status}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content || j.content || JSON.stringify(j).slice(0, 800);
}
