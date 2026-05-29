import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Send, Trash2, Settings2, Bot, Loader2, Wand2, Check, Eye, EyeOff, ArrowDownToLine, PencilLine } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';

// Sensible model defaults per provider. The user's earlier "model `chatgpt`
// does not exist" 404 came from typing 'chatgpt' as the model name — these
// defaults stop that from happening.
const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  openrouter: 'openai/gpt-4o-mini',
  groq: 'llama-3.3-70b-versatile',
  ollama: 'llama3.2',
  custom: '',
};

const MODEL_SUGGESTIONS: Record<string, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest'],
  openrouter: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.3-70b-instruct:free', 'google/gemini-flash-1.5'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
  ollama: ['llama3.2', 'mistral', 'qwen2.5-coder'],
  custom: [],
};

const PROVIDER_HELP: Record<string, { name: string; url: string; note: string }> = {
  openai: { name: 'OpenAI', url: 'https://platform.openai.com/api-keys', note: 'Paid (small free credits for new accounts)' },
  anthropic: { name: 'Anthropic', url: 'https://console.anthropic.com/', note: 'Paid' },
  openrouter: { name: 'OpenRouter', url: 'https://openrouter.ai/keys', note: '✨ Has FREE models (look for ":free" suffix)' },
  groq: { name: 'Groq', url: 'https://console.groq.com/keys', note: '✨ FREE — fast Llama/Mixtral inference' },
  ollama: { name: 'Ollama', url: 'http://localhost:11434', note: '✨ FREE — runs locally, no key needed' },
  custom: { name: 'Custom endpoint', url: '', note: 'Any OpenAI-compatible endpoint' },
};

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

/** Read whatever is currently selected in the writer's editor (if any). */
function getEditorSelection(): string {
  const pm = document.querySelector('.ProseMirror');
  if (!pm) return '';
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return '';
  const r = sel.getRangeAt(0);
  if (!pm.contains(r.commonAncestorContainer)) return '';
  return sel.toString().trim();
}

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
  const [showKey, setShowKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState(settings.aiApiKey || '');
  const [modelDraft, setModelDraft] = useState(settings.aiModel || '');
  const [endpointDraft, setEndpointDraft] = useState(settings.aiEndpoint || '');
  const [justSaved, setJustSaved] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep local drafts in sync with stored settings (e.g. when switching providers)
  useEffect(() => { setKeyDraft(settings.aiApiKey || ''); }, [settings.aiApiKey]);
  useEffect(() => { setModelDraft(settings.aiModel || ''); }, [settings.aiModel]);
  useEffect(() => { setEndpointDraft(settings.aiEndpoint || ''); }, [settings.aiEndpoint]);

  // Safety: clean up legacy / hallucinated model names that the OpenAI 404'd
  // on in earlier sessions ("chatgpt", "claude-opus-4-7", etc.). If the stored
  // model isn't in the suggestion list AND isn't custom-ish, swap it for the
  // provider default.
  useEffect(() => {
    const LEGACY = ['chatgpt', 'claude-opus-4-7', 'gpt-5', 'gpt-4', 'claude-opus-5'];
    const m = (settings.aiModel || '').toLowerCase();
    if (!m) return;
    if (LEGACY.includes(m)) {
      const safe = DEFAULT_MODELS[settings.aiProvider] || 'gpt-4o-mini';
      updateSettings({ aiModel: safe });
      toast(`Updated model to "${safe}"`, { duration: 2500 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProviderChange = (p: 'anthropic' | 'openai' | 'openrouter' | 'groq' | 'ollama' | 'custom') => {
    updateSettings({ aiProvider: p as any });
    const wantModel = DEFAULT_MODELS[p] || '';
    if (!modelDraft || MODEL_SUGGESTIONS[(settings.aiProvider as string)]?.includes(modelDraft)) {
      // Auto-replace stale default when switching providers
      setModelDraft(wantModel);
      updateSettings({ aiModel: wantModel });
    }
  };

  const saveSettings = () => {
    const cleanedModel = (modelDraft || DEFAULT_MODELS[settings.aiProvider] || '').trim();
    updateSettings({
      aiApiKey: keyDraft.trim(),
      aiModel: cleanedModel,
      aiEndpoint: endpointDraft.trim(),
    });
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1600);
    toast.success('AI settings saved');
  };

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

    // Ollama runs locally and never needs a key — only gate on missing key for
    // hosted providers.
    if (!settings.aiApiKey && settings.aiProvider !== 'ollama') {
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
    // Insert an empty assistant placeholder, then stream tokens into it.
    const assistantTs = Date.now();
    setMessages((m) => [...m, { role: 'assistant', content: '', ts: assistantTs }]);

    // All providers stream now (Anthropic uses event-typed SSE, others use OpenAI-style).
    const streamable = true;

    try {
      const reply = await callAI({
        provider: settings.aiProvider,
        endpoint: settings.aiEndpoint,
        apiKey: settings.aiApiKey,
        model: settings.aiModel,
        messages: [sys, ...messages, userMsg],
        onToken: streamable
          ? (chunk: string) => {
              setMessages((m) => {
                const copy = m.slice();
                const last = copy[copy.length - 1];
                if (last && last.role === 'assistant' && last.ts === assistantTs) {
                  copy[copy.length - 1] = { ...last, content: (last.content || '') + chunk };
                }
                return copy;
              });
            }
          : undefined,
      });
      // For non-streaming providers, set the final reply now.
      if (!streamable) {
        setMessages((m) => {
          const copy = m.slice();
          const idx = copy.findIndex((x) => x.role === 'assistant' && x.ts === assistantTs);
          if (idx >= 0) copy[idx] = { ...copy[idx], content: reply };
          return copy;
        });
      }
    } catch (e: any) {
      toast.error(`AI error: ${e?.message || e}`);
      setMessages((m) => {
        const copy = m.slice();
        const idx = copy.findIndex((x) => x.role === 'assistant' && x.ts === assistantTs);
        const errMsg = `⚠ ${e?.message || 'request failed'}`;
        if (idx >= 0) copy[idx] = { ...copy[idx], content: errMsg };
        else copy.push({ role: 'assistant', content: errMsg, ts: Date.now() });
        return copy;
      });
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
            <div className="grid grid-cols-3 gap-1.5">
              {(['openai', 'anthropic', 'openrouter', 'groq', 'ollama', 'custom'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => handleProviderChange(p)}
                  className={`px-2 py-1.5 rounded-md text-[11px] border transition-all ${
                    settings.aiProvider === p
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                      : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50'
                  }`}
                >
                  {PROVIDER_HELP[p].name}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-[var(--text-muted)]">
              {PROVIDER_HELP[settings.aiProvider]?.note}
              {PROVIDER_HELP[settings.aiProvider]?.url && (
                <>
                  {' · '}
                  <a href={PROVIDER_HELP[settings.aiProvider].url} target="_blank" rel="noreferrer" className="underline text-[var(--accent)]">
                    Get a key →
                  </a>
                </>
              )}
            </p>

            <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)] mt-2">Model</div>
            <input
              value={modelDraft}
              onChange={(e) => setModelDraft(e.target.value)}
              placeholder={DEFAULT_MODELS[settings.aiProvider] || 'model name'}
              className="w-full px-3 py-2 rounded-md bg-[var(--bg)] border border-[var(--border)] text-xs outline-none focus:border-[var(--accent)] font-mono"
            />
            {(MODEL_SUGGESTIONS[settings.aiProvider] || []).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {MODEL_SUGGESTIONS[settings.aiProvider].map((m) => (
                  <button
                    key={m}
                    onClick={() => setModelDraft(m)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                      modelDraft === m
                        ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                        : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/60 hover:text-[var(--text)]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}

            <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)] mt-2">API key</div>
            <div className="relative">
              <input
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                type={showKey ? 'text' : 'password'}
                placeholder={settings.aiProvider === 'ollama' ? '(local Ollama needs no key)' : 'sk-… / paste here'}
                className="w-full pr-9 px-3 py-2 rounded-md bg-[var(--bg)] border border-[var(--border)] text-xs font-mono outline-none focus:border-[var(--accent)]"
              />
              <button
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)]"
                title={showKey ? 'Hide' : 'Show'}
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>

            {(settings.aiProvider === 'custom' || settings.aiProvider === 'ollama') && (
              <>
                <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)] mt-2">Endpoint</div>
                <input
                  value={endpointDraft}
                  onChange={(e) => setEndpointDraft(e.target.value)}
                  placeholder={settings.aiProvider === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com/v1/chat/completions'}
                  className="w-full px-3 py-2 rounded-md bg-[var(--bg)] border border-[var(--border)] text-xs outline-none focus:border-[var(--accent)] font-mono"
                />
              </>
            )}

            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={saveSettings}
                className={`flex-1 py-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  justSaved
                    ? 'bg-emerald-500 text-white'
                    : 'bg-[var(--accent)] text-[var(--bg)] hover:brightness-110'
                }`}
              >
                {justSaved ? <><Check className="w-3.5 h-3.5" /> Saved</> : 'Save'}
              </button>
              <button
                onClick={() => { setKeyDraft(''); setModelDraft(DEFAULT_MODELS[settings.aiProvider] || ''); }}
                className="px-3 py-2 rounded-md text-xs border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)]"
              >
                Reset
              </button>
            </div>

            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              Keys are stored only on this device. Calls go directly from your browser to the provider.
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
            <div className={`group max-w-[88%] rounded-2xl px-3 py-2 ${
              m.role === 'user'
                ? 'bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white rounded-br-sm'
                : 'bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded-bl-sm'
            }`}>
              <div
                className="text-xs whitespace-pre-wrap leading-snug"
                style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
              >
                {m.content}
              </div>
              {m.role === 'assistant' && m.content && (
                <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      // Dispatch the assistant reply into the writer as an action block.
                      // The writer's applyformat bridge will insert it at the cursor.
                      document.dispatchEvent(new CustomEvent('writer:insertText', { detail: { text: m.content } }));
                      toast.success('Inserted into editor');
                    }}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] flex items-center gap-1"
                    title="Insert this reply into your script"
                  >
                    <ArrowDownToLine className="w-2.5 h-2.5" />
                    Insert
                  </button>
                  <button
                    onClick={() => { navigator.clipboard.writeText(m.content); toast('Copied to clipboard'); }}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    title="Copy"
                  >
                    Copy
                  </button>
                </div>
              )}
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

      {/* Selection / context shortcuts */}
      <div className="px-3 pt-2 flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => {
            const sel = getEditorSelection();
            if (!sel) { toast.error('Select some text in the writer first'); return; }
            send(`Rewrite this passage to be sharper, more visual, and stay in voice. Return ONLY the rewrite, no preamble:\n\n${sel}`);
          }}
          className="text-[10px] px-2 py-1 rounded-full bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[var(--text-secondary)] transition-all flex items-center gap-1"
        >
          <PencilLine className="w-3 h-3" /> Rewrite selection
        </button>
        <button
          onClick={() => {
            const sel = getEditorSelection();
            if (!sel) { toast.error('Select some text first'); return; }
            send(`Continue this passage in the same voice for another paragraph:\n\n${sel}`);
          }}
          className="text-[10px] px-2 py-1 rounded-full bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[var(--text-secondary)] transition-all"
        >
          Continue ↓
        </button>
        <button
          onClick={async () => {
            const sel = getEditorSelection();
            if (!sel) { toast.error('Select text in the editor first'); return; }
            if (!settings.aiApiKey && settings.aiProvider !== 'ollama') {
              toast.error('Add an API key (⚙) to use inline rewrite');
              return;
            }
            document.dispatchEvent(new CustomEvent('writer:streamStart'));
            setBusy(true);
            try {
              let acc = '';
              await callAI({
                provider: settings.aiProvider,
                endpoint: settings.aiEndpoint,
                apiKey: settings.aiApiKey,
                model: settings.aiModel,
                messages: [
                  { role: 'system', content: 'You are a sharp screenplay co-writer. Return ONLY the rewritten text — no preamble, no explanation, no quotes.', ts: Date.now() },
                  { role: 'user', content: `Rewrite this passage. Keep voice, make it sharper:\n\n${sel}`, ts: Date.now() },
                ],
                onToken: (chunk) => {
                  acc += chunk;
                  document.dispatchEvent(new CustomEvent('writer:streamChunk', { detail: { text: acc } }));
                },
              });
            } catch (e: any) {
              toast.error(`Rewrite failed: ${e?.message || e}`);
            } finally {
              document.dispatchEvent(new CustomEvent('writer:streamEnd'));
              setBusy(false);
            }
          }}
          className="text-[10px] px-2 py-1 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white hover:brightness-110 flex items-center gap-1"
          title="Rewrite the selected text in-place, streaming"
        >
          <Sparkles className="w-3 h-3" /> Inline rewrite
        </button>
      </div>

      {/* Input */}
      <div className="p-3 border-t border-[var(--border)] bg-[var(--sidebar)] flex-shrink-0">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] focus-within:border-[var(--accent)] transition-colors">
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
            className="w-full max-w-full block px-3 py-2 bg-transparent text-xs text-[var(--text)] outline-none resize-none placeholder:text-[var(--text-muted)]"
            style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-[10px] text-[var(--text-muted)]">
              {settings.aiApiKey ? `${settings.aiProvider} · ${settings.aiModel || '(default model)'}` : 'No key set — click ⚙ to add one'}
            </span>
            <button
              onClick={() => send()}
              disabled={busy || !text.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white text-xs font-bold shadow hover:brightness-110 disabled:opacity-40 transition-all"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send
            </button>
          </div>
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mt-1.5 text-right">
          Enter to send · Shift+Enter for a new line
        </p>
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
  provider: 'anthropic' | 'openai' | 'openrouter' | 'groq' | 'ollama' | 'custom';
  endpoint: string;
  apiKey: string;
  model: string;
  messages: Msg[];
  /** If set, tokens are emitted to this callback as they arrive (SSE). */
  onToken?: (chunk: string) => void;
}): Promise<string> {
  // OpenAI-style chat-completions request (used by OpenAI, OpenRouter, Groq,
  // Ollama (when its /v1/chat/completions endpoint is enabled), and custom).
  const openAIStyle = async (url: string, extraHeaders: Record<string, string> = {}) => {
    const wantStream = !!opts.onToken;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
        ...extraHeaders,
      },
      body: JSON.stringify({
        model: opts.model || DEFAULT_MODELS[opts.provider] || 'gpt-4o-mini',
        messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: 1500,
        temperature: 0.7,
        stream: wantStream,
      }),
    });
    if (!r.ok) {
      const body = (await r.text()).slice(0, 300);
      throw new Error(`${opts.provider} ${r.status}: ${body}`);
    }
    if (!wantStream || !r.body) {
      const j = await r.json();
      return (j.choices?.[0]?.message?.content || j.content || '').toString().trim();
    }
    // Server-sent events stream: "data: {...}\n\n" until "data: [DONE]"
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return full;
        try {
          const j = JSON.parse(data);
          const delta = j.choices?.[0]?.delta?.content || j.choices?.[0]?.message?.content || '';
          if (delta) { full += delta; opts.onToken!(delta); }
        } catch { /* ignore parse glitches */ }
      }
    }
    return full;
  };

  if (opts.provider === 'anthropic') {
    const sys = opts.messages.find((m) => m.role === 'system')?.content;
    const wantStream = !!opts.onToken;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: opts.model || DEFAULT_MODELS.anthropic,
        max_tokens: 1500,
        system: sys,
        messages: opts.messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role, content: m.content })),
        stream: wantStream,
      }),
    });
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
    if (!wantStream || !r.body) {
      const j = await r.json();
      return (j.content?.[0]?.text || '').trim();
    }
    // Anthropic SSE: each event has `event: <name>\n` then `data: {...}\n\n`.
    // We only care about `content_block_delta` with delta.type === 'text_delta'.
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buffer = '';
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      const blocks = buffer.split(/\n\n/);
      buffer = blocks.pop() || '';
      for (const block of blocks) {
        const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
        if (!dataLine) continue;
        const payload = dataLine.slice(5).trim();
        if (!payload) continue;
        try {
          const j = JSON.parse(payload);
          if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta') {
            const chunk = j.delta.text || '';
            if (chunk) { full += chunk; opts.onToken!(chunk); }
          }
        } catch { /* ignore */ }
      }
    }
    return full;
  }

  if (opts.provider === 'openai') return openAIStyle('https://api.openai.com/v1/chat/completions');
  if (opts.provider === 'openrouter') return openAIStyle('https://openrouter.ai/api/v1/chat/completions', {
    'HTTP-Referer': location.origin,
    'X-Title': 'Kindling',
  });
  if (opts.provider === 'groq') return openAIStyle('https://api.groq.com/openai/v1/chat/completions');
  if (opts.provider === 'ollama') {
    const base = (opts.endpoint || 'http://localhost:11434').replace(/\/$/, '');
    return openAIStyle(`${base}/v1/chat/completions`);
  }

  // custom
  if (!opts.endpoint) throw new Error('Custom endpoint not set');
  return openAIStyle(opts.endpoint);
}
