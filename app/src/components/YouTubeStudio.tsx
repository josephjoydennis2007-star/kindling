import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Youtube, Sparkles, Wand2, Copy, ImagePlus, ExternalLink, Maximize2, Clapperboard,
  Lightbulb, Loader2, Rocket,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import type { YouTubePack } from '@/types';
import { aiOnce } from '@/lib/aiClient';
import { sendPromptToRunway } from '@/lib/sendToRunway';
import { viewMedia } from '@/lib/mediaViewer';

/**
 * YouTube Studio — a dedicated creator workspace, separate from the industry
 * film-making side. Everything here is about packaging + making a YouTube
 * video/short from a single idea: title, hook, script, description, tags,
 * thumbnail, and the clip strip. Generates free in-app, or hand any field to
 * Claude. Data lives on screenplay.youtube so it travels with the story.
 */
export default function YouTubeStudio() {
  const screenplay = useAppStore((s) => s.screenplay);
  const scenes = useAppStore((s) => s.scenes);
  const shots = useAppStore((s) => s.shots);
  const settings = useAppStore((s) => s.settings);
  const activeStoryId = useAppStore((s) => s.activeStoryId);
  const stories = useAppStore((s) => s.stories);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const createStory = useAppStore((s) => s.createStory);
  const loadStory = useAppStore((s) => s.loadStory);
  const updateScreenplayField = useAppStore((s) => s.updateScreenplayField);
  const setTab = useAppStore((s) => s.setTab);

  const activeStory = stories.find((s) => s.id === activeStoryId);
  const isYouTubeStory = activeStory?.type === 'youtube';
  const youtubeStories = stories.filter((s) => s.type === 'youtube');

  const newYouTubeVideo = () => {
    const title = window.prompt('Name this YouTube video:', 'New YouTube video');
    if (title === null) return;
    // A YouTube video is its OWN story (type youtube), filed in the active
    // project if one is open. createStory makes it the active story.
    createStory(title || 'New YouTube video', 'youtube', activeProjectId || undefined);
    toast.success('New YouTube video created');
  };

  const [form, setForm] = useState<YouTubePack>(() => screenplay.youtube || { format: 'short' });
  const [busy, setBusy] = useState<string | null>(null);

  // Re-sync when the open story changes.
  useEffect(() => {
    setForm(useAppStore.getState().screenplay.youtube || { format: 'short' });
  }, [activeStoryId]);

  const update = (p: Partial<YouTubePack>) => {
    setForm((f) => {
      const next = { ...f, ...p };
      updateScreenplayField('youtube', next);
      return next;
    });
  };

  const isShort = (form.format || 'short') === 'short';

  // Generate one field with the AI provider (free tiers work).
  const gen = async (key: string, system: string, user: string, apply: (text: string) => void, maxTokens = 1400) => {
    setBusy(key);
    const r = await aiOnce(settings as any, system, user, { maxTokens, temperature: 0.8 });
    setBusy(null);
    if (r.ok) apply(r.text.trim());
    else toast.error('AI failed', { description: (r.error || '') + ' — set a free provider in Settings → AI, or use Claude.' });
  };

  const needIdea = () => {
    if (!(form.idea || '').trim()) { toast.error('Type your idea first'); return true; }
    return false;
  };

  const genTitle = () => { if (needIdea()) return; gen('title', 'You write irresistible, honest YouTube titles + thumbnail text.', `Video idea: "${form.idea}". Give 6 clickable TITLES (one per line, no numbering), then a line "THUMB:" with 3-5 word thumbnail text.`, (t) => {
    const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
    const thumbLine = lines.find((l) => /^thumb[:\-]/i.test(l));
    const titles = lines.filter((l) => !/^thumb[:\-]/i.test(l));
    update({ title: (titles[0] || '').replace(/^["'\d.\)\s]+/, ''), altTitles: titles.join('\n'), thumbnailText: thumbLine ? thumbLine.replace(/^thumb[:\-]\s*/i, '') : form.thumbnailText });
  }); };

  const genHook = () => { if (needIdea()) return; gen('hook', 'You write scroll-stopping first-3-second hooks.', `Write the single best first-3-second spoken HOOK for a YouTube ${isShort ? 'Short' : 'video'} about: "${form.idea}". One line, no preamble.`, (t) => update({ hook: t.replace(/^["']|["']$/g, '') }), 200); };

  const genScript = () => { if (needIdea()) return; gen('script',
    isShort
      ? 'You write viral vertical Shorts: hook in line 1, escalating beats, hard payoff, loopable, ~110 words max.'
      : 'You are a retention-obsessed YouTube scriptwriter — conversational, second person, visual.',
    isShort
      ? `Write a vertical YouTube Short script for: "${form.idea}". First line = hook${form.hook ? ` ("${form.hook}")` : ''}. 3-5 escalating beats, twist/button, 1-line CTA. Add [VISUAL: ...] + [TEXT: ...] cues. Under ~110 words VO.`
      : `Write a full YouTube script for: "${form.idea}". HOOK → cold open → 3-5 value beats → payoff → CTA. Add [VISUAL: ...] + [B-ROLL: ...] cues. Spoken, tight.`,
    (t) => update({ script: t }), 3000); };

  const genDesc = () => { if (needIdea() && !(form.script || '').trim()) return; gen('desc', 'You write YouTube SEO.', `Write a 2-paragraph SEO DESCRIPTION, then a line "TAGS:" with 15 comma-separated tags, then a line "HASHTAGS:" with 8 hashtags, for this ${isShort ? 'Short' : 'video'}.\nIdea: "${form.idea}".\n${form.script ? `Script:\n${form.script.slice(0, 2000)}` : ''}`, (t) => {
    const tagM = t.match(/TAGS:\s*(.+)/i);
    const hashM = t.match(/HASHTAGS:\s*(.+)/i);
    const desc = t.split(/TAGS:/i)[0].trim();
    update({ description: desc, tags: tagM ? tagM[1].trim() : form.tags, hashtags: hashM ? hashM[1].trim() : form.hashtags });
  }); };

  const genThumbPrompt = () => { if (needIdea()) return; gen('thumbprompt', 'You write vivid image-generation prompts for high-CTR YouTube thumbnails.', `Write ONE image-gen prompt for a thumbnail for: "${form.idea}". Bold subject, expression, rule-of-thirds with space for text, high contrast, color punch. One paragraph.`, (t) => { sendPromptToRunway({ prompt: t, target: 'image', shotLabel: 'YouTube thumbnail' }); toast.success('Thumbnail prompt sent to Runway panel'); }, 400); };

  const genEverything = async () => {
    if (needIdea()) return;
    toast.message('Building your video package…', { description: 'Title → hook → script → description. A few seconds.' });
    await new Promise<void>((res) => { genTitle(); res(); });
    // Run sequentially so each can build on the last; keep it simple + safe.
    setTimeout(genHook, 50);
    setTimeout(genScript, 120);
    setTimeout(genDesc, 220);
  };

  const uploadThumb = async (file: File) => {
    const tid = toast.loading('Uploading thumbnail…');
    try {
      const { uploadFileToCloud, currentStoryId } = await import('@/lib/mediaUpload');
      const url = await uploadFileToCloud(file, currentStoryId());
      update({ thumbnail: url });
      toast.success('Thumbnail saved', { id: tid });
    } catch { toast.error('Upload failed', { id: tid }); }
  };

  const copyAll = async () => {
    const txt = [
      `IDEA: ${form.idea || ''}`,
      `TITLE: ${form.title || ''}`,
      form.altTitles ? `ALT TITLES:\n${form.altTitles}` : '',
      `THUMBNAIL TEXT: ${form.thumbnailText || ''}`,
      `HOOK: ${form.hook || ''}`,
      `\nSCRIPT:\n${form.script || ''}`,
      `\nDESCRIPTION:\n${form.description || ''}`,
      `\nTAGS: ${form.tags || ''}`,
      `HASHTAGS: ${form.hashtags || ''}`,
    ].filter(Boolean).join('\n');
    try { await navigator.clipboard.writeText(txt); toast.success('Full package copied'); } catch { toast.error('Copy failed'); }
  };

  const clips = scenes.flatMap((sc) => (sc.shotIds || []).map((id) => shots[id]).filter(Boolean));
  const GenBtn = ({ k, on }: { k: string; on: () => void }) => (
    <button onClick={on} disabled={!!busy} title="Generate with AI" className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-110 disabled:opacity-50">
      {busy === k ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} AI
    </button>
  );
  const field = 'w-full bg-[var(--card)] border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]';
  const lbl = 'flex items-center justify-between mb-1';
  const lblTxt = 'text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold';

  // ── Launcher ── A YouTube video is its OWN story. If the open story isn't a
  // YouTube one (or nothing is open), show the launcher instead of editing a
  // film story by mistake.
  if (!isYouTubeStory) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="h-full overflow-y-auto">
        <div className="px-6 py-4 border-b border-[var(--rule)] flex items-center gap-3">
          <Youtube className="w-5 h-5 text-[#ff0000]" />
          <h1 className="text-sm font-display font-bold text-[var(--text)]">YouTube Studio</h1>
        </div>
        <div className="max-w-2xl mx-auto p-6">
          <div className="p-5 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/40 text-center">
            <Youtube className="w-10 h-10 text-[#ff0000] mx-auto mb-2" />
            <h2 className="text-base font-bold text-[var(--text)]">Each YouTube video is its own story</h2>
            <p className="text-[12px] text-[var(--text-secondary)] mt-1.5 max-w-md mx-auto">
              It has its own script, storyboard, clips and packaging — completely separate from your film projects. Create one to start{activeProjectId ? ' (it’ll be filed in your open project)' : ''}.
            </p>
            <button onClick={newYouTubeVideo} className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-110">
              <Rocket className="w-4 h-4" /> New YouTube video
            </button>
          </div>

          {youtubeStories.length > 0 && (
            <div className="mt-6">
              <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2">Your YouTube videos</div>
              <div className="space-y-1.5">
                {youtubeStories.map((s) => (
                  <button key={s.id} onClick={() => loadStory(s.id)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)] text-left transition-colors">
                    <Youtube className="w-4 h-4 text-[#ff0000] flex-shrink-0" />
                    <span className="text-[13px] font-semibold text-[var(--text)] truncate flex-1">{s.title}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">open →</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-[var(--text-muted)] mt-5 text-center">
            Tip: you can also tell Claude/ChatGPT “make a new YouTube short about …” and it’ll build it as its own story.
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--rule)] sticky top-0 bg-[var(--bg)] z-10 flex items-center gap-3 flex-wrap">
        <Youtube className="w-5 h-5 text-[#ff0000] flex-shrink-0" />
        <h1 className="text-sm font-display font-bold text-[var(--text)]">YouTube Studio</h1>
        <div className="flex items-center gap-1 bg-[var(--card)] border border-[var(--rule)] rounded-md p-0.5 ml-1">
          {(['short', 'long'] as const).map((f) => (
            <button key={f} onClick={() => update({ format: f })}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${(form.format || 'short') === f ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
              {f === 'short' ? 'Short' : 'Long-form'}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-[var(--text-muted)] truncate hidden sm:inline">· {activeStory?.title}</span>
        <div className="flex-1" />
        <button onClick={newYouTubeVideo} title="Create another YouTube video (its own story)" className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]"><Rocket className="w-3.5 h-3.5" /> New video</button>
        <button onClick={() => document.dispatchEvent(new CustomEvent('app:openQuickTools'))} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]"><Wand2 className="w-3.5 h-3.5" /> Quick Tools</button>
        <button onClick={copyAll} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]"><Copy className="w-3.5 h-3.5" /> Copy all</button>
      </div>

      <div className="max-w-3xl mx-auto p-6 space-y-5">
        {/* Idea + generate everything */}
        <div className="p-4 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/40">
          <div className={lbl}><span className={lblTxt + ' flex items-center gap-1'}><Lightbulb className="w-3 h-3" /> Your idea</span></div>
          <textarea value={form.idea || ''} onChange={(e) => update({ idea: e.target.value })} rows={2}
            placeholder='e.g. "what if you never slept again"'
            className={field + ' resize-y'} />
          <button onClick={genEverything} disabled={!!busy}
            className="mt-2.5 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-110 disabled:opacity-50">
            <Rocket className="w-4 h-4" /> Build the whole video from this idea
          </button>
        </div>

        {/* Title + thumbnail */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className={lbl}><span className={lblTxt}>Title</span><GenBtn k="title" on={genTitle} /></div>
            <input value={form.title || ''} onChange={(e) => update({ title: e.target.value })} placeholder="Your video title" className={field} />
            {form.altTitles && (
              <details className="mt-1.5"><summary className="text-[10px] text-[var(--text-muted)] cursor-pointer">More title options</summary>
                <pre className="whitespace-pre-wrap text-[11px] text-[var(--text-secondary)] mt-1 bg-[var(--card)] border border-[var(--border)] rounded-md p-2">{form.altTitles}</pre>
              </details>
            )}
            <div className={lbl + ' mt-3'}><span className={lblTxt}>Thumbnail text</span></div>
            <input value={form.thumbnailText || ''} onChange={(e) => update({ thumbnailText: e.target.value })} placeholder="3-5 punchy words" className={field} />
          </div>
          {/* Thumbnail image */}
          <div>
            <div className={lbl}><span className={lblTxt}>Thumbnail image</span><button onClick={genThumbPrompt} disabled={!!busy} className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]"><ExternalLink className="w-3 h-3" /> Prompt → Runway</button></div>
            <div className="aspect-video rounded-lg border border-[var(--border)] overflow-hidden bg-[var(--card)] relative group">
              {form.thumbnail ? (
                <>
                  <img src={form.thumbnail} alt="thumbnail" loading="lazy" decoding="async" onClick={() => viewMedia(form.thumbnail!, 'image', 'Thumbnail')} className="w-full h-full object-cover cursor-zoom-in" />
                  <button onClick={() => viewMedia(form.thumbnail!, 'image', 'Thumbnail')} className="absolute top-2 right-2 p-1.5 rounded-md bg-black/55 text-white opacity-0 group-hover:opacity-100"><Maximize2 className="w-3.5 h-3.5" /></button>
                </>
              ) : (
                <label className="w-full h-full flex flex-col items-center justify-center gap-1 text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer">
                  <ImagePlus className="w-5 h-5" /><span className="text-[10px] uppercase tracking-widest font-bold">Upload thumbnail</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadThumb(f); }} />
                </label>
              )}
            </div>
            {form.thumbnail && (
              <label className="mt-1.5 inline-block text-[10px] text-[var(--accent)] hover:underline cursor-pointer">Replace<input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadThumb(f); }} /></label>
            )}
          </div>
        </div>

        {/* Hook */}
        <div>
          <div className={lbl}><span className={lblTxt}>Hook (first 3 seconds)</span><GenBtn k="hook" on={genHook} /></div>
          <textarea value={form.hook || ''} onChange={(e) => update({ hook: e.target.value })} rows={2} placeholder="The line that stops the scroll…" className={field + ' resize-y'} />
        </div>

        {/* Script */}
        <div>
          <div className={lbl}><span className={lblTxt}>{isShort ? 'Short script (VO + on-screen text)' : 'Script'}</span><GenBtn k="script" on={genScript} /></div>
          <textarea value={form.script || ''} onChange={(e) => update({ script: e.target.value })} rows={isShort ? 8 : 14} placeholder="Your spoken script with [VISUAL: …] cues…" className={field + ' resize-y font-mono text-[12px] leading-relaxed'} />
        </div>

        {/* Description / tags */}
        <div>
          <div className={lbl}><span className={lblTxt}>Description · tags · hashtags</span><GenBtn k="desc" on={genDesc} /></div>
          <textarea value={form.description || ''} onChange={(e) => update({ description: e.target.value })} rows={4} placeholder="SEO description…" className={field + ' resize-y'} />
          <input value={form.tags || ''} onChange={(e) => update({ tags: e.target.value })} placeholder="tags, comma, separated" className={field + ' mt-2'} />
          <input value={form.hashtags || ''} onChange={(e) => update({ hashtags: e.target.value })} placeholder="#hashtags" className={field + ' mt-2'} />
        </div>

        {/* Clips strip → links to the storyboard for the heavy visual work */}
        <div>
          <div className={lbl}>
            <span className={lblTxt}>Clips ({clips.length})</span>
            <button onClick={() => setTab('storyboard')} className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]"><Clapperboard className="w-3 h-3" /> Open Storyboard</button>
          </div>
          {clips.length === 0 ? (
            <p className="text-[11px] text-[var(--text-muted)]">No clips yet. Open the Storyboard to add frames + videos, generate them in Runway, then Export Reel for CapCut.</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {clips.map((sh, i) => (
                <button key={sh.id} onClick={() => sh.video ? viewMedia(sh.video, 'video', `Clip ${i + 1}`) : sh.storyboard ? viewMedia(sh.storyboard, 'image', `Clip ${i + 1}`) : setTab('storyboard')}
                  className="relative w-24 aspect-video flex-shrink-0 rounded-md overflow-hidden border border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]">
                  {sh.storyboard ? <img src={sh.storyboard} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" /> : <span className="absolute inset-0 flex items-center justify-center text-[9px] text-[var(--text-muted)]">{i + 1}</span>}
                  {sh.video && <span className="absolute bottom-1 right-1 px-1 rounded bg-black/70 text-white text-[7px] font-bold">▶ VID</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="text-[10px] text-[var(--text-muted)] pt-2 border-t border-[var(--rule)]">
          Tip: every <span className="text-[var(--accent)] font-semibold">AI</span> button runs free with your provider (Settings → AI). Prefer Claude? Use <b>Quick Tools → Copy as Claude prompt</b>. This page is saved with your story.
        </p>
      </div>
    </motion.div>
  );
}
