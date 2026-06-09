import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X, Sparkles, Wand2, Copy, Check, Bot, StickyNote, ExternalLink, ArrowLeft,
  Lightbulb, Type, Film, ListVideo, Search, Repeat2, Mic2, ImageIcon, Rocket,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { aiOnce } from '@/lib/aiClient';
import { sendPromptToRunway } from '@/lib/sendToRunway';

/**
 * Quick Tools — a YouTube-content command center. Give a prompt, get the piece
 * you need. Every tool runs TWO ways:
 *   • In-app (free) — uses your configured AI provider (Groq/Gemini/DeepSeek all
 *     have free tiers) via aiOnce.
 *   • Via Claude — "Copy as Claude prompt" hands the exact instruction to your
 *     Claude subscription; with the connector on, Claude can write it straight
 *     into the story.
 * Opens on `app:openQuickTools`.
 */

type ToolKind = 'text' | 'imagePrompt';
interface Tool {
  id: string;
  label: string;
  blurb: string;
  icon: any;
  kind: ToolKind;
  placeholder: string;
  system: string;
  buildUser: (input: string) => string;
  maxTokens?: number;
  accent?: boolean;
}

const TOOLS: Tool[] = [
  {
    id: 'package', label: 'Full video package', accent: true,
    blurb: 'One topic → titles, hook, full script, description, tags, thumbnail prompt & b-roll.',
    icon: Rocket, kind: 'text', maxTokens: 3000,
    placeholder: 'Your video topic or idea, e.g. "what if you never slept again"',
    system: 'You are a senior YouTube producer + scriptwriter. Output a complete, ready-to-shoot package. Be punchy, specific, and optimized for retention. Use clear section headers.',
    buildUser: (t) => `Create a COMPLETE YouTube video package for this idea:\n"${t}"\n\nInclude, with headers:\n1. 5 CLICKABLE TITLES (curiosity + clarity)\n2. THUMBNAIL TEXT (3-5 words) + a one-line thumbnail visual idea\n3. THE HOOK (first 3 seconds, spoken)\n4. FULL SCRIPT (cold open → value → payoff → CTA), with [VISUAL: ...] cues\n5. DESCRIPTION (SEO, 2 short paragraphs)\n6. 15 TAGS (comma separated)\n7. CHAPTERS (timestamped guesses)\n8. B-ROLL / SHOT LIST (8-12 concrete visuals)`,
  },
  {
    id: 'ideas', label: 'Viral ideas', blurb: '10 video ideas with hooks for your niche.', icon: Lightbulb, kind: 'text',
    placeholder: 'Your niche or channel theme, e.g. "space facts, sci-fi what-ifs"',
    system: 'You are a YouTube strategist who knows what makes people click and stay.',
    buildUser: (t) => `Give me 10 high-potential YouTube video ideas for this niche: "${t}". For each: a clickable TITLE + a one-line HOOK + why it could pop. Number them.`,
  },
  {
    id: 'titles', label: 'Titles + thumbnail text', blurb: 'Clickable titles and overlay text.', icon: Type, kind: 'text',
    placeholder: 'What is the video about?',
    system: 'You write irresistible-but-honest YouTube titles and punchy thumbnail text.',
    buildUser: (t) => `Video: "${t}".\nGive 10 CLICKABLE TITLES (mix curiosity, numbers, stakes) and for the best 3, a 3-5 word THUMBNAIL TEXT each.`,
  },
  {
    id: 'hooks', label: 'Hooks (first 3s)', blurb: '10 scroll-stopping opening lines.', icon: Sparkles, kind: 'text',
    placeholder: 'What is the video / short about?',
    system: 'You write scroll-stopping opening hooks for YouTube + Shorts. Short, spoken, punchy.',
    buildUser: (t) => `Write 10 different first-3-second HOOKS for a video about: "${t}". Each must make the viewer NEED to keep watching. Vary the angle (question, bold claim, visual tease, stakes).`,
  },
  {
    id: 'script-long', label: 'Long-form script', blurb: 'Full script: cold open → value → CTA.', icon: Film, kind: 'text', maxTokens: 3000,
    placeholder: 'Topic + rough angle/length, e.g. "history of the internet, ~8 min"',
    system: 'You are a retention-obsessed YouTube scriptwriter. Conversational, second person, visual.',
    buildUser: (t) => `Write a full YouTube script for: "${t}".\nStructure: HOOK (3s) → cold open → context → 3-5 escalating value beats → payoff → CTA. Add [VISUAL: ...] and [B-ROLL: ...] cues. Keep sentences tight and spoken.`,
  },
  {
    id: 'script-short', label: 'Shorts script', blurb: 'Vertical 30-50s, loopable.', icon: ListVideo, kind: 'text',
    placeholder: 'The single idea for the Short',
    system: 'You write viral vertical Shorts: 30-50s, ~110 words max, hook in line 1, hard payoff, loopable.',
    buildUser: (t) => `Write a vertical YouTube Short script for: "${t}".\nFirst line is the hook. 3-5 escalating beats. End on a twist/button + a 1-line CTA. Add [VISUAL: ...] and [TEXT ON SCREEN: ...] cues. Keep total VO under ~110 words.`,
  },
  {
    id: 'seo', label: 'Description + tags + chapters', blurb: 'SEO description, hashtags, timestamps.', icon: Search, kind: 'text',
    placeholder: 'Paste your script or describe the video',
    system: 'You write YouTube SEO: natural keyword-rich descriptions, relevant tags, and chapter timestamps.',
    buildUser: (t) => `For this video, write: a 2-paragraph SEO DESCRIPTION, 15 TAGS (comma separated), 8 HASHTAGS, and CHAPTERS with timestamp guesses.\n\nVideo:\n"${t}"`,
  },
  {
    id: 'broll', label: 'B-roll / shot list', blurb: 'Concrete visuals for each beat.', icon: Film, kind: 'text',
    placeholder: 'Paste your script or describe the video',
    system: 'You are a director planning concrete, shootable/generatable visuals for a video.',
    buildUser: (t) => `List 12 concrete B-ROLL / shot ideas for this video — each a short visual description I could film or generate in Runway. Number them.\n\nVideo:\n"${t}"`,
  },
  {
    id: 'repurpose', label: 'Repurpose', blurb: 'Long video → Shorts, tweets, captions.', icon: Repeat2, kind: 'text', maxTokens: 2400,
    placeholder: 'Paste your long script / transcript',
    system: 'You repurpose long-form content into short, platform-native pieces.',
    buildUser: (t) => `From this long video, create: 3 SHORTS scripts (vertical, <110 words each), 5 TWEETS/X posts, and 3 INSTAGRAM captions with hashtags.\n\nSource:\n"${t}"`,
  },
  {
    id: 'voiceover', label: 'Narration polish', blurb: 'Rewrite text to sound great spoken.', icon: Mic2, kind: 'text', maxTokens: 2400,
    placeholder: 'Paste the text to turn into smooth narration',
    system: 'You rewrite text into clean, natural spoken narration — short sentences, easy to read aloud, no tongue-twisters.',
    buildUser: (t) => `Rewrite this as smooth voiceover narration for a YouTube video. Keep the meaning, make it flow when spoken, mark natural [pause] beats:\n\n"${t}"`,
  },
  {
    id: 'thumbnail', label: 'Thumbnail image prompt', blurb: 'A prompt to generate the thumbnail.', icon: ImageIcon, kind: 'imagePrompt',
    placeholder: 'What is the video about?',
    system: 'You write vivid image-generation prompts for click-worthy YouTube thumbnails (bold subject, high contrast, clear focal point, space for text).',
    buildUser: (t) => `Write ONE detailed image-generation prompt for a high-CTR YouTube thumbnail for a video about: "${t}". Describe subject, expression, composition (rule of thirds, space for text), lighting, mood, color punch. One paragraph, no preamble.`,
  },
];

export default function QuickToolsPanel() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Tool | null>(null);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const settings = useAppStore((s) => s.settings);
  const addNote = useAppStore((s) => s.addNote);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    document.addEventListener('app:openQuickTools', onOpen);
    return () => document.removeEventListener('app:openQuickTools', onOpen);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { active ? back() : setOpen(false); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, active]);

  const back = () => { setActive(null); setInput(''); setOutput(''); setBusy(false); };
  const pickTool = (t: Tool) => { setActive(t); setInput(''); setOutput(''); };

  const claudePrompt = useMemo(() => {
    if (!active) return '';
    return `${active.system}\n\n${active.buildUser(input || '[describe your video here]')}`;
  }, [active, input]);

  const run = async () => {
    if (!active) return;
    if (!input.trim()) { toast.error('Type your topic / text first'); return; }
    setBusy(true); setOutput('');
    const res = await aiOnce(settings as any, active.system, active.buildUser(input.trim()), { maxTokens: active.maxTokens ?? 1800, temperature: 0.7 });
    setBusy(false);
    if (res.ok) setOutput(res.text);
    else toast.error('AI failed', { description: res.error + ' — or use “Copy as Claude prompt”.' });
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); toast.success('Copied'); setTimeout(() => setCopied(false), 1500); }
    catch { toast.error('Copy failed'); }
  };

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
            className="w-full max-w-3xl h-[min(720px,92vh)] bg-[var(--panel)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-2">
              {active ? (
                <button onClick={back} className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]"><ArrowLeft className="w-4 h-4" /></button>
              ) : (
                <Wand2 className="w-4 h-4 text-[var(--accent)]" />
              )}
              <span className="text-sm font-bold text-[var(--text)]">{active ? active.label : 'Quick Tools — YouTube studio'}</span>
              <div className="flex-1" />
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]"><X className="w-4 h-4" /></button>
            </div>

            {!active ? (
              <div className="flex-1 overflow-y-auto p-4">
                <p className="text-[11px] text-[var(--text-secondary)] mb-3">Pick a tool. It runs free in-app with your AI provider, or copy it as a prompt for your Claude.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {TOOLS.map((t) => {
                    const Icon = t.icon;
                    return (
                      <button key={t.id} onClick={() => pickTool(t)}
                        className={`text-left p-3 rounded-xl border transition-all hover:-translate-y-0.5 ${t.accent ? 'bg-[var(--accent-soft)] border-[var(--accent)]/50 hover:border-[var(--accent)]' : 'bg-[var(--card)] border-[var(--border)] hover:border-[var(--accent)]/60'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className={`w-4 h-4 ${t.accent ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`} />
                          <span className="text-[12.5px] font-bold text-[var(--text)]">{t.label}</span>
                        </div>
                        <p className="text-[10.5px] text-[var(--text-muted)] leading-snug">{t.blurb}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                <p className="text-[11px] text-[var(--text-muted)]">{active.blurb}</p>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={active.placeholder}
                  rows={3}
                  className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] resize-y"
                />
                <div className="flex flex-wrap gap-2">
                  <button onClick={run} disabled={busy}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-bold bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-110 disabled:opacity-50">
                    <Sparkles className="w-3.5 h-3.5" /> {busy ? 'Generating…' : 'Generate (free)'}
                  </button>
                  <button onClick={() => copy(claudePrompt)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]">
                    <Bot className="w-3.5 h-3.5" /> Copy as Claude prompt
                  </button>
                </div>

                {output && (
                  <div className="mt-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Result</span>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => copy(output)} className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)]">
                          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy
                        </button>
                        <button onClick={() => { addNote(output, 'general'); toast.success('Saved to story notes'); }} className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)]">
                          <StickyNote className="w-3 h-3" /> Save to notes
                        </button>
                        {active.kind === 'imagePrompt' && (
                          <button onClick={() => sendPromptToRunway({ prompt: output, target: 'image', shotLabel: 'Thumbnail' })} className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold bg-[var(--accent)] text-[var(--accent-ink)]">
                            <ExternalLink className="w-3 h-3" /> Send to Runway
                          </button>
                        )}
                      </div>
                    </div>
                    <pre className="whitespace-pre-wrap text-[12px] text-[var(--text)] bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3 leading-relaxed font-sans">{output}</pre>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
