import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Palette,
  Type,
  Wifi,
  FolderOpen,
  Users,
  Sparkles,
  BookOpen,
  Save,
  RotateCcw,
  Moon,
  Sun,
  Monitor,
  Keyboard,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { fsSupported, pickFolder, saveFolderHandle, clearFolderHandle } from '@/lib/folderHandle';
import { gistPush, gistPull, jsonbinPush, jsonbinPull, dropboxPush, dropboxPull, supabasePush, supabasePull, webdavPush, webdavPull, pastebinPush, isOnline } from '@/lib/cloudSync';
import { auth, exportAllUserData, deleteUserProfile, deleteAuthUser } from '@/firebase';
import { ACCENTS, THEME_MODES } from '@/lib/themePresets';
import { LOCALES, localeName, type Locale } from '@/lib/i18n';
import { CURRENCY_OPTIONS } from '@/lib/money';
import type { AppSettings, StoryType, Story } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

const STORY_TYPES: { id: StoryType; label: string }[] = [
  { id: 'movie', label: 'Feature Film' },
  { id: 'tv-series', label: 'TV Series' },
  { id: 'tv-show', label: 'TV Show' },
  { id: 'mini-series', label: 'Mini Series' },
  { id: 'thriller', label: 'Thriller' },
  { id: 'documentary', label: 'Documentary' },
  { id: 'short-film', label: 'Short Film' },
  { id: 'music-video', label: 'Music Video' },
  { id: 'commercial', label: 'Commercial' },
  { id: 'youtube', label: 'YouTube / Vlog' },
  { id: 'web-series', label: 'Web Series' },
  { id: 'stage-play', label: 'Stage Play' },
  { id: 'animation', label: 'Animation' },
];

export default function SettingsOverlay({ open, onClose }: Props) {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const resetSettings = useAppStore((s) => s.resetSettings);
  const activeStoryId = useAppStore((s) => s.activeStoryId);
  const stories = useAppStore((s) => s.stories);
  const updateStory = useAppStore((s) => s.updateStory);
  const screenplay = useAppStore((s) => s.screenplay);
  const updateScreenplayField = useAppStore((s) => s.updateScreenplayField);

  const activeStory = useMemo(
    () => stories.find((s) => s.id === activeStoryId) || null,
    [stories, activeStoryId],
  );

  // Local drafts — only commit on Save
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [storyDraft, setStoryDraft] = useState<Partial<Story>>(activeStory || {});
  const [scrDraft, setScrDraft] = useState({
    title: screenplay.title,
    author: screenplay.author,
    contact: screenplay.contact,
    logline: screenplay.logline,
    synopsis: screenplay.synopsis,
  });
  const [tab, setTab] = useState<'appearance' | 'editor' | 'files' | 'story' | 'collab' | 'ai' | 'cloud' | 'shortcuts'>('appearance');
  const [syncing, setSyncing] = useState<string | null>(null);

  // Allow external code (Command Palette → "Keyboard shortcuts") to deep-link
  // into a specific tab. The event MUST be dispatched after this overlay has
  // mounted, so callers use a requestAnimationFrame after toggling `open`.
  useEffect(() => {
    if (!open) return;
    const onOpenTab = (ev: Event) => {
      const t = (ev as CustomEvent).detail?.tab;
      if (typeof t === 'string') setTab(t as any);
    };
    document.addEventListener('settings:openTab', onOpenTab as EventListener);
    return () => document.removeEventListener('settings:openTab', onOpenTab as EventListener);
  }, [open]);

  type Provider = 'gist' | 'jsonbin' | 'dropbox' | 'supabase' | 'webdav' | 'pastebin';
  const PROVIDER_NAME: Record<Provider, string> = {
    gist: 'GitHub Gist',
    jsonbin: 'JSONBin',
    dropbox: 'Dropbox',
    supabase: 'Supabase',
    webdav: 'WebDAV',
    pastebin: 'Pastebin',
  };

  // Push the current story to a cloud provider. Saves the returned remote id
  // back into settings so subsequent syncs PATCH the same record.
  const pushToProvider = async (provider: Provider) => {
    if (!isOnline()) { toast.error('You\'re offline — sync will resume when back online.'); return; }
    setSyncing(provider);
    const json = useAppStore.getState().exportStory();
    const d = draft as any;
    try {
      let res: Awaited<ReturnType<typeof gistPush>>;
      let remoteIdKey: string | null = null;
      if (provider === 'gist')         { res = await gistPush(d.githubGistToken || '', json, d.githubGistId); remoteIdKey = 'githubGistId'; }
      else if (provider === 'jsonbin') { res = await jsonbinPush(d.jsonbinKey || '', json, d.jsonbinId); remoteIdKey = 'jsonbinId'; }
      else if (provider === 'dropbox') { res = await dropboxPush(d.dropboxToken || '', json); }
      else if (provider === 'webdav')  { res = await webdavPush(d.webdavUrl || '', d.webdavAuth || '', json); }
      else if (provider === 'pastebin'){
        const pb = await pastebinPush(d.pastebinKey || '', json);
        if (pb.ok) { toast.success(`Pasted to ${(pb as any).url}`); navigator.clipboard?.writeText((pb as any).url || ''); }
        res = pb;
      }
      else                             { res = await supabasePush(d.supabaseUrl || '', d.supabaseAnonKey || '', json); }
      if (!res.ok) { toast.error(`${PROVIDER_NAME[provider]} sync failed — ${res.error}`); return; }
      const newSettings: any = { ...draft, lastCloudSyncAt: new Date().toISOString() };
      if (remoteIdKey && res.remoteId) newSettings[remoteIdKey] = res.remoteId;
      setDraft(newSettings as AppSettings);
      updateSettings(newSettings as Partial<AppSettings>);
      toast.success(`Pushed to ${PROVIDER_NAME[provider]}`);
    } finally { setSyncing(null); }
  };

  const pullFromProvider = async (provider: Provider) => {
    if (!isOnline()) { toast.error('You\'re offline.'); return; }
    if (!confirm('Restoring will overwrite your current story with the cloud version. Continue?')) return;
    setSyncing(provider);
    const d = draft as any;
    try {
      let res: Awaited<ReturnType<typeof gistPull>>;
      if (provider === 'gist')         res = await gistPull(d.githubGistToken || '', d.githubGistId || '');
      else if (provider === 'jsonbin') res = await jsonbinPull(d.jsonbinKey || '', d.jsonbinId || '');
      else if (provider === 'dropbox') res = await dropboxPull(d.dropboxToken || '');
      else if (provider === 'webdav')  res = await webdavPull(d.webdavUrl || '', d.webdavAuth || '');
      else if (provider === 'pastebin') { toast.error('Pastebin is push-only (one-way share).'); return; }
      else                             res = await supabasePull(d.supabaseUrl || '', d.supabaseAnonKey || '');
      if (!res.ok) { toast.error(`Restore failed — ${res.error}`); return; }
      const ok = useAppStore.getState().importStory(res.data || '');
      if (!ok) { toast.error('Restore failed — invalid cloud data'); return; }
      toast.success(`Restored from ${PROVIDER_NAME[provider]}`);
    } finally { setSyncing(null); }
  };

  useEffect(() => { if (open) { setDraft(settings); setStoryDraft(activeStory || {}); setScrDraft({ title: screenplay.title, author: screenplay.author, contact: screenplay.contact, logline: screenplay.logline, synopsis: screenplay.synopsis }); } }, [open, settings, activeStory, screenplay]);

  const dirty =
    JSON.stringify(draft) !== JSON.stringify(settings) ||
    (activeStory && JSON.stringify({ title: activeStory.title, type: activeStory.type }) !== JSON.stringify({ title: storyDraft.title, type: storyDraft.type })) ||
    scrDraft.title !== screenplay.title ||
    scrDraft.author !== screenplay.author ||
    scrDraft.contact !== screenplay.contact ||
    scrDraft.logline !== screenplay.logline ||
    scrDraft.synopsis !== screenplay.synopsis;

  const save = () => {
    updateSettings(draft);
    if (activeStory && storyDraft) {
      updateStory(activeStory.id, { title: storyDraft.title || activeStory.title, type: storyDraft.type as StoryType });
    }
    updateScreenplayField('title', scrDraft.title);
    updateScreenplayField('author', scrDraft.author);
    updateScreenplayField('contact', scrDraft.contact);
    updateScreenplayField('logline', scrDraft.logline);
    updateScreenplayField('synopsis', scrDraft.synopsis);
    toast.success('Settings saved');
    onClose();
  };

  const cancel = () => {
    setDraft(settings);
    setStoryDraft(activeStory || {});
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[250] bg-black/70 backdrop-blur-sm"
          onClick={cancel}
        >
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 240, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-0 bottom-0 w-full sm:w-[480px] bg-[var(--panel)] border-l border-[var(--border)] shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center shadow">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="text-sm font-bold text-[var(--text)]">Settings</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{dirty ? 'Unsaved changes' : 'Saved'}</div>
                </div>
              </div>
              <button onClick={cancel} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[var(--border)] overflow-x-auto thin-scrollbar">
              {[
                { id: 'appearance' as const, icon: Palette,    label: 'Look' },
                { id: 'editor' as const,     icon: Type,        label: 'Editor' },
                { id: 'story' as const,      icon: BookOpen,    label: 'Story' },
                { id: 'files' as const,      icon: FolderOpen,  label: 'Files' },
                { id: 'collab' as const,     icon: Users,       label: 'Profile' },
                { id: 'ai' as const,         icon: Sparkles,    label: 'AI' },
                { id: 'cloud' as const,      icon: Wifi,        label: 'Cloud' },
                { id: 'shortcuts' as const,  icon: Keyboard,    label: 'Keys' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 min-w-[64px] flex items-center justify-center gap-1.5 py-3 text-[11px] font-semibold transition-all whitespace-nowrap ${
                    tab === t.id ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {tab === 'appearance' && (
                <div className="space-y-4">
                  <Section title="Theme">
                    <div className="grid grid-cols-3 gap-2">
                      {THEME_MODES.map((m) => {
                        const Icon = m.id === 'light' ? Sun : m.id === 'dark' ? Moon : Monitor;
                        const active = (draft.theme || 'dark') === m.id;
                        return (
                          <ThemeBtn key={m.id} icon={Icon} label={m.label} active={active} onClick={() => setDraft({ ...draft, theme: m.id as any })} />
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] mt-2">
                      Dark mode is the studio default. System follows your OS preference.
                    </p>
                  </Section>

                  <Section title="Accent">
                    <div className="grid grid-cols-4 gap-2">
                      {ACCENTS.map((a) => {
                        const active = ((draft as any).accent || 'tobacco') === a.id;
                        return (
                          <button
                            key={a.id}
                            onClick={() => setDraft({ ...(draft as any), accent: a.id })}
                            title={a.description}
                            className={`flex flex-col items-center gap-2 px-2 py-3 rounded-md border transition-all ${
                              active
                                ? 'border-[var(--accent)] bg-[var(--surface-2)]'
                                : 'border-[var(--border)] hover:border-[var(--border-light)]'
                            }`}
                          >
                            <span
                              className="w-6 h-6 rounded-full"
                              style={{ background: a.swatch, boxShadow: active ? `0 0 0 2px var(--bg), 0 0 0 4px ${a.swatch}` : 'none' }}
                              aria-hidden
                            />
                            <span className={`text-[10px] font-semibold ${active ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
                              {a.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] mt-2">
                      One accent, used sparingly — for the active tab, the save state, and revision badges. Tobacco Gold is the default.
                    </p>
                  </Section>

                  <Section title="Budget currency">
                    <select
                      value={(draft as any).currency || 'USD'}
                      onChange={(e) => setDraft({ ...draft, currency: e.target.value as any })}
                      className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    >
                      {CURRENCY_OPTIONS.map((c) => (
                        <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                      ))}
                    </select>
                  </Section>

                  <Section title="Language">
                    <div className="grid grid-cols-3 gap-2">
                      {LOCALES.map((loc) => (
                        <button
                          key={loc}
                          onClick={() => setDraft({ ...draft, locale: loc } as any)}
                          className={`py-2 rounded-md text-xs font-semibold border ${
                            ((draft as any).locale || 'en') === loc
                              ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                              : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50'
                          }`}
                        >
                          {localeName(loc as Locale)}
                        </button>
                      ))}
                    </div>
                  </Section>

                </div>
              )}

              {tab === 'editor' && (
                <div className="space-y-4">
                  <Section title="Font">
                    <select
                      value={draft.fontFamily}
                      onChange={(e) => setDraft({ ...draft, fontFamily: e.target.value })}
                      className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    >
                      <option value="Courier New, Courier, monospace">Courier New (Screenplay)</option>
                      <option value="Courier Prime, monospace">Courier Prime</option>
                      <option value="Inter, sans-serif">Inter (Modern)</option>
                      <option value="Georgia, serif">Georgia (Serif)</option>
                    </select>
                  </Section>
                  <Section title={`Font size — ${draft.fontSize}pt`}>
                    <input type="range" min={8} max={18} value={draft.fontSize} onChange={(e) => setDraft({ ...draft, fontSize: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
                  </Section>
                  <Section title={`Line height — ${draft.lineHeight}`}>
                    <input type="range" min={0.8} max={2} step={0.1} value={draft.lineHeight} onChange={(e) => setDraft({ ...draft, lineHeight: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
                  </Section>
                  <Section title="Saving">
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                      Kindling uses manual save (<kbd className="px-1 py-0.5 rounded bg-[var(--hover)] text-[10px]">Ctrl/⌘+S</kbd>) like a normal document editor. The status bar shows <span className="text-[var(--warning)] font-semibold">Unsaved</span> when you have changes that haven't been written. Closing the tab with unsaved work prompts you to confirm. Inside the script, <kbd className="px-1 py-0.5 rounded bg-[var(--hover)] text-[10px]">Ctrl/⌘+Z</kbd> undoes recent edits.
                    </p>
                  </Section>
                  <Section title="Scene heat strip">
                    <Toggle
                      value={(draft as any).showHeatStrip !== false}
                      onChange={(v) => setDraft({ ...draft, showHeatStrip: v } as any)}
                      label={(draft as any).showHeatStrip !== false ? 'Visible above the writer paper' : 'Hidden'}
                    />
                  </Section>
                  <Section title="Dialogue density gutter">
                    <Toggle
                      value={(draft as any).showGutter !== false}
                      onChange={(v) => setDraft({ ...draft, showGutter: v } as any)}
                      label={(draft as any).showGutter !== false ? 'Visible to the left of the paper' : 'Hidden'}
                    />
                  </Section>
                </div>
              )}

              {tab === 'story' && (
                <div className="space-y-4">
                  {activeStory ? (
                    <>
                      <Section title="Story title">
                        <input
                          value={storyDraft.title ?? ''}
                          onChange={(e) => setStoryDraft({ ...storyDraft, title: e.target.value })}
                          className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
                        />
                      </Section>
                      <Section title="Story type">
                        <select
                          value={(storyDraft.type as string) || 'movie'}
                          onChange={(e) => setStoryDraft({ ...storyDraft, type: e.target.value as StoryType })}
                          className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
                        >
                          {STORY_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                      </Section>
                    </>
                  ) : (
                    <div className="text-[11px] text-[var(--text-muted)]">No story is currently active.</div>
                  )}

                  <Section title="Author">
                    <input value={scrDraft.author} onChange={(e) => setScrDraft({ ...scrDraft, author: e.target.value })} className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs outline-none focus:border-[var(--accent)]" />
                  </Section>
                  <Section title="Contact">
                    <input value={scrDraft.contact} onChange={(e) => setScrDraft({ ...scrDraft, contact: e.target.value })} className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs outline-none focus:border-[var(--accent)]" />
                  </Section>
                  <Section title="Logline">
                    <textarea value={scrDraft.logline} onChange={(e) => setScrDraft({ ...scrDraft, logline: e.target.value })} rows={2} className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs outline-none focus:border-[var(--accent)] resize-y" />
                  </Section>
                  <Section title="Synopsis">
                    <textarea value={scrDraft.synopsis} onChange={(e) => setScrDraft({ ...scrDraft, synopsis: e.target.value })} rows={4} className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs outline-none focus:border-[var(--accent)] resize-y" />
                  </Section>
                </div>
              )}

              {tab === 'files' && (
                <div className="space-y-4">
                  <Section title="Default save folder">
                    <p className="text-[11px] text-[var(--text-secondary)] mb-2">
                      Exports go silently into the chosen folder. {!fsSupported() && '(Folder picking is only supported on Chrome/Edge/Opera.)'}
                    </p>
                    <div className="text-[11px] text-[var(--text-secondary)] mb-2">
                      Current: <span className="text-[var(--accent)] font-mono">{draft.defaultSaveFolder || 'Not set'}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={!fsSupported()}
                        onClick={async () => {
                          const h = await pickFolder();
                          if (h) { await saveFolderHandle(h); setDraft({ ...draft, defaultSaveFolder: h.name }); toast.success(`Folder set to "${h.name}"`); }
                        }}
                        className="flex-1 px-3 py-2 bg-[var(--accent)] text-[var(--bg)] rounded-md text-xs font-semibold hover:brightness-110 disabled:opacity-40"
                      >
                        {draft.defaultSaveFolder ? 'Change folder' : 'Choose folder'}
                      </button>
                      {draft.defaultSaveFolder && (
                        <button
                          onClick={async () => { await clearFolderHandle(); setDraft({ ...draft, defaultSaveFolder: null }); }}
                          className="px-3 py-2 bg-[var(--card)] border border-[var(--border)] text-xs rounded-md hover:border-red-400 hover:text-red-400"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </Section>

                  <Section title="Social bar">
                    <Toggle value={draft.socialBarEnabled} onChange={(v) => setDraft({ ...draft, socialBarEnabled: v })} label={draft.socialBarEnabled ? 'Visible' : 'Hidden'} />
                  </Section>
                </div>
              )}

              {tab === 'collab' && (
                <div className="space-y-4">
                  <Section title="Display name">
                    <input value={draft.userDisplayName} onChange={(e) => setDraft({ ...draft, userDisplayName: e.target.value })} placeholder="How collaborators see you"
                      className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs outline-none focus:border-[var(--accent)]" />
                    <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">
                      Shown on invites, comments, and the People tab.
                    </p>
                  </Section>
                  <Section title="Your role">
                    <select
                      value={draft.userRole}
                      onChange={(e) => setDraft({ ...draft, userRole: e.target.value as any })}
                      className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs outline-none focus:border-[var(--accent)]"
                    >
                      <option value="writer">Writer — I write scripts</option>
                      <option value="director">Director — I plan scenes + shots</option>
                      <option value="both">Both — I do both</option>
                      <option value="producer">Producer — I review + leave notes</option>
                    </select>
                    <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">
                      Your default for invites + what other people see when they look you up by email.
                      For per-story permissions, the story owner picks the role when inviting.
                    </p>
                  </Section>
                  <Section title="Full profile">
                    <button
                      onClick={() => {
                        document.dispatchEvent(new CustomEvent('app:openProfileEditor'));
                        onClose();
                      }}
                      className="w-full px-3 py-2 rounded-md bg-[var(--accent)] text-[var(--accent-ink)] text-[11px] font-semibold hover:brightness-110"
                    >
                      Open full profile editor →
                    </button>
                    <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">
                      Change your avatar, set the "Accept invites from the opposite role" preference,
                      and sync to the cloud profile that powers invite previews.
                    </p>
                  </Section>

                  {/* Privacy: export-all-data + delete-account. Required for
                      any real launch and good practice anyway. */}
                  <Section title="Your data">
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={async () => {
                          try {
                            const json = await exportAllUserData();
                            const blob = new Blob([json], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `kindling-export-${new Date().toISOString().slice(0,10)}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                            toast.success('Data exported');
                          } catch (err: any) {
                            toast.error(err?.message || 'Export failed');
                          }
                        }}
                        className="w-full px-3 py-2 rounded-md bg-[var(--card)] border border-[var(--border)] text-[11px] text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)] text-left"
                      >
                        Export all my data (.json)
                      </button>
                      <p className="text-[10px] text-[var(--text-muted)] -mt-1 leading-relaxed">
                        Downloads your profile + every story you have locally as a single JSON file you can
                        archive or move to another machine.
                      </p>

                      <button
                        onClick={async () => {
                          if (!auth?.currentUser) {
                            toast.error('Sign in first.');
                            return;
                          }
                          const confirmText = prompt(
                            'This DELETES your Kindling account, your profile, your email lookup record, ' +
                            'and signs you out. Stories you own are NOT auto-deleted — delete them ' +
                            'manually first if you want them gone too.\n\n' +
                            'Type DELETE to confirm:',
                          );
                          if (confirmText !== 'DELETE') {
                            toast.info('Cancelled.');
                            return;
                          }
                          try {
                            await deleteUserProfile(auth.currentUser.uid, auth.currentUser.email);
                            await deleteAuthUser();
                            toast.success('Account deleted. Refresh to start over.');
                            // Stash a marker so the next load lands on the auth wall.
                            try { localStorage.removeItem('kindling-auth-skipped'); } catch {}
                            try { localStorage.removeItem('kindling-cached-profile'); } catch {}
                            setTimeout(() => window.location.reload(), 1500);
                          } catch (err: any) {
                            if (err?.code === 'auth/requires-recent-login') {
                              toast.error('For security, sign out and back in, then try again.');
                            } else {
                              toast.error(err?.message || 'Delete failed');
                            }
                          }
                        }}
                        className="w-full px-3 py-2 rounded-md bg-[var(--danger)]/10 border border-[var(--danger)]/30 text-[11px] text-[var(--danger)] hover:bg-[var(--danger)]/20 text-left font-semibold"
                      >
                        Delete my account…
                      </button>
                      <p className="text-[10px] text-[var(--text-muted)] -mt-1 leading-relaxed">
                        Permanent. Removes your profile, your email lookup record, and your Firebase
                        account. Re-sign-up is allowed afterward.
                      </p>
                    </div>
                  </Section>
                </div>
              )}

              {tab === 'ai' && (
                <div className="space-y-4">
                  <Section title="Provider">
                    <div className="flex gap-1.5">
                      {(['anthropic','openai','custom'] as const).map((p) => (
                        <button key={p} onClick={() => setDraft({ ...draft, aiProvider: p })}
                          className={`flex-1 px-2 py-1.5 rounded-md text-[11px] border ${draft.aiProvider === p ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-secondary)]'}`}
                        >{p}</button>
                      ))}
                    </div>
                  </Section>
                  <Section title="Model">
                    <input value={draft.aiModel} onChange={(e) => setDraft({ ...draft, aiModel: e.target.value })} placeholder="claude-opus-4-7 / gpt-4o / …"
                      className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs outline-none focus:border-[var(--accent)]" />
                  </Section>
                  <Section title="API key (stays on this device)">
                    <input
                      type="password"
                      value={draft.aiApiKey}
                      // Trim whitespace as the user types — a stray space
                      // or newline from a copy-paste is the #1 reason
                      // Gemini keys are rejected.
                      onChange={(e) => setDraft({ ...draft, aiApiKey: e.target.value.trim() })}
                      placeholder="sk-…"
                      className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs font-mono outline-none focus:border-[var(--accent)]"
                    />
                    {draft.aiProvider === 'gemini' && (
                      <button
                        onClick={async () => {
                          const key = (draft.aiApiKey || '').trim();
                          if (!key) {
                            import('sonner').then(({ toast }) => toast.error('Paste a Gemini key first'));
                            return;
                          }
                          import('sonner').then(({ toast }) => toast.loading('Testing Gemini key…', { id: 'gem' }));
                          const { testGeminiKey } = await import('@/lib/geminiTest');
                          const result = await testGeminiKey(key, draft.aiModel || 'gemini-2.0-flash');
                          import('sonner').then(({ toast }) => {
                            if (result.ok) {
                              toast.success(result.message, { id: 'gem', duration: 4000 });
                            } else {
                              // 12s so the user has time to read the
                              // specific reason. New-account quota,
                              // bad-key, billing — all distinct.
                              toast.error(result.message, { id: 'gem', duration: 12_000 });
                            }
                          });
                        }}
                        className="mt-2 w-full px-3 py-2 rounded-md text-xs font-semibold bg-[var(--card)] border border-[var(--rule)] hover:border-[var(--accent)] transition-colors text-[var(--text)]"
                      >
                        Test Gemini key
                      </button>
                    )}
                    {draft.aiProvider === 'gemini' && (
                      <p className="mt-2 text-[10px] text-[var(--text-muted)] leading-snug">
                        Brand-new Gemini keys can take 5–15 minutes for Google to provision quota. If Test returns 429 RESOURCE_EXHAUSTED with no quota id, that's what's happening — wait then test again.
                      </p>
                    )}
                  </Section>
                  {draft.aiProvider === 'custom' && (
                    <Section title="Endpoint">
                      <input value={draft.aiEndpoint} onChange={(e) => setDraft({ ...draft, aiEndpoint: e.target.value })} placeholder="https://api.example.com/v1/chat/completions"
                        className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs outline-none focus:border-[var(--accent)]" />
                    </Section>
                  )}

                  {/* ---- Runway integration ----
                      Optional second-stage AI: image + video generation
                      from Runway Gen-4. When this key is set, the co-worker
                      agent unlocks the generateShotImage / generateShotVideo
                      tools so it can populate the storyboard with real
                      generated frames during a build run. */}
                  <div className="pt-3 mt-3 border-t border-[var(--rule)]">
                    <h3 className="text-[11px] uppercase tracking-widest font-bold text-[var(--text-secondary)] mb-2 flex items-center gap-1.5">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: 'var(--accent)' }}
                      />
                      Runway (image + video generation)
                    </h3>
                    <p className="text-[11px] text-[var(--text-secondary)] mb-3">
                      Connect your Runway account to let the AI co-worker generate shot images + video clips while it builds the story. Get a key at{' '}
                      <a
                        href="https://dev.runwayml.com/"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--accent)] underline"
                      >
                        dev.runwayml.com
                      </a>
                      . Your key stays on this device.
                    </p>
                    <Section title="Runway API key">
                      <input
                        type="password"
                        value={(draft as any).runwayApiKey || ''}
                        onChange={(e) => setDraft({ ...draft, runwayApiKey: e.target.value } as any)}
                        placeholder="key_…"
                        className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs font-mono outline-none focus:border-[var(--accent)]"
                      />
                    </Section>

                    {/* Proxy URL — REQUIRED for browser-side use.
                        Runway's Developer API doesn't send CORS headers,
                        so we route every request through a Cloudflare
                        Worker the user deploys once (5 minutes, free,
                        no card). The script is checked into the repo at
                        docs/runway-cors-proxy.js and a button below
                        opens it. When this URL is set, runwayClient
                        replaces api.dev.runwayml.com with this prefix
                        in every call. */}
                    <Section title="Proxy URL (Cloudflare Worker)">
                      <input
                        value={(draft as any).runwayProxyUrl || ''}
                        onChange={(e) => setDraft({ ...draft, runwayProxyUrl: e.target.value } as any)}
                        placeholder="https://kindling-runway.your-name.workers.dev"
                        className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs font-mono outline-none focus:border-[var(--accent)]"
                      />
                      <p className="mt-1.5 text-[10px] text-[var(--text-muted)] leading-snug">
                        Without this, Runway calls fail with a CORS error from the browser. The proxy is a one-time 5-minute setup on Cloudflare's free tier.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <a
                          href="https://github.com/josephjoydennis2007-star/kindling/blob/main/docs/runway-cors-proxy.js"
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 text-center text-[10px] font-bold uppercase tracking-wider px-2 py-1.5 rounded-md bg-[var(--card)] border border-[var(--rule)] hover:border-[var(--accent)] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
                        >
                          1. View worker script
                        </a>
                        <a
                          href="https://dash.cloudflare.com/sign-up"
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 text-center text-[10px] font-bold uppercase tracking-wider px-2 py-1.5 rounded-md bg-[var(--card)] border border-[var(--rule)] hover:border-[var(--accent)] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
                        >
                          2. Deploy on Cloudflare
                        </a>
                      </div>
                    </Section>
                    {/* Image model — Runway's API only accepts a fixed
                        set of model IDs. Free-text was letting users
                        type display names like "Nano Banana 2" which
                        Runway rejects with a 400. The dropdown lists
                        only the IDs Runway's developer API currently
                        accepts (per their docs as of 2026). */}
                    <Section title="Image model">
                      <select
                        value={(draft as any).runwayImageModel || 'gen4_image'}
                        onChange={(e) => setDraft({ ...draft, runwayImageModel: e.target.value } as any)}
                        className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs outline-none focus:border-[var(--accent)]"
                      >
                        <option value="gen4_image">gen4_image (Gen-4 — recommended)</option>
                        <option value="nano_banana">nano_banana (Google Nano Banana — needs separate access)</option>
                      </select>
                    </Section>
                    <Section title="Video model">
                      <select
                        value={(draft as any).runwayVideoModel || 'gen4_turbo'}
                        onChange={(e) => setDraft({ ...draft, runwayVideoModel: e.target.value } as any)}
                        className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs outline-none focus:border-[var(--accent)]"
                      >
                        <option value="gen4_turbo">gen4_turbo (fast)</option>
                        <option value="gen4.5">gen4.5 (newest — best quality)</option>
                        <option value="gen3a_turbo">gen3a_turbo (older fallback)</option>
                        <option value="seedance-pro-1-0">seedance-pro-1-0 (ByteDance Seedance)</option>
                      </select>
                    </Section>
                    <button
                      onClick={async () => {
                        const key = ((draft as any).runwayApiKey || '').trim();
                        if (!key) {
                          import('sonner').then(({ toast }) => toast.error('Paste a key first'));
                          return;
                        }
                        import('sonner').then(({ toast }) => toast.loading('Pinging Runway…', { id: 'rwy' }));
                        const { runwayPing } = await import('@/lib/runwayClient');
                        const result = await runwayPing(key, (draft as any).runwayProxyUrl);
                        // Result is now structured — surface the SPECIFIC
                        // reason so the user can act on it (e.g. "you
                        // pasted a regular-Runway key, not a Developer
                        // API key" vs. "CORS is blocking the browser").
                        import('sonner').then(({ toast }) => {
                          if (result.ok) {
                            toast.success(result.message, { id: 'rwy', duration: 4000 });
                          } else {
                            toast.error(result.message, { id: 'rwy', duration: 12_000 });
                          }
                        });
                      }}
                      className="mt-2 w-full px-3 py-2 rounded-md text-xs font-semibold bg-[var(--card)] border border-[var(--rule)] hover:border-[var(--accent)] transition-colors text-[var(--text)]"
                    >
                      Test connection
                    </button>
                    <p className="mt-2 text-[10px] text-[var(--text-muted)] leading-snug">
                      <strong className="text-[var(--text-secondary)]">Important:</strong> Runway has TWO products. Your regular runwayml.com subscription does NOT give you an API key — you need a separate <strong>Developer</strong> account at{' '}
                      <a
                        href="https://dev.runwayml.com/"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--accent)] underline"
                      >
                        dev.runwayml.com
                      </a>{' '}
                      with its own credit balance. Developer keys start with <code>key_</code> or <code>rwk_</code>. If your key works in their{' '}
                      <a
                        href="https://dev.runwayml.com/playground"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--accent)] underline"
                      >
                        playground
                      </a>{' '}
                      but the Test button here fails, it's almost certainly a browser CORS block on the API — your key is fine, the browser just can't reach the API directly.
                    </p>
                  </div>
                </div>
              )}

              {tab === 'cloud' && (
                <div className="space-y-3">
                  <Section title="Where your work lives">
                    <p className="text-[11px] text-[var(--text-secondary)] flex items-start gap-1.5">
                      <Monitor className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[var(--info)]" />
                      Local-first. Drafts auto-save to your browser (IndexedDB) and work fully offline. Cloud providers below give you backups + sync across devices.
                    </p>
                  </Section>

                  <Section title="✓ Firebase cloud sync (configured by you)">
                    <Toggle value={draft.cloudSync} onChange={(v) => setDraft({ ...draft, cloudSync: v })} label={draft.cloudSync ? 'Enabled — syncing when online' : 'Disabled'} />
                    <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
                      Real-time sync of stories, characters and history. Free Spark tier gives 1&nbsp;GB storage &amp; 50k reads/day.
                      Add your project to <code className="text-[var(--accent)]">.env</code> as <code>VITE_FIREBASE_*</code>.
                    </p>
                  </Section>

                  <CloudProvider
                    name="GitHub Gist"
                    badge="FREE — UNLIMITED"
                    description={`Save your story as a private gist. Unlimited free, syncs across devices with a Personal Access Token.${(draft as any).githubGistId ? ` Gist: ${(draft as any).githubGistId.slice(0,8)}…` : ''}`}
                    setupUrl="https://github.com/settings/tokens/new?scopes=gist&description=Kindling"
                    tokenLabel="Personal Access Token (gist scope)"
                    tokenValue={(draft as any).githubGistToken || ''}
                    onTokenChange={(v) => setDraft({ ...draft, githubGistToken: v } as any)}
                    syncing={syncing === 'gist'}
                    onSync={() => pushToProvider('gist')}
                    onRestore={() => pullFromProvider('gist')}
                    lastSyncedAt={(draft as any).lastCloudSyncAt}
                  />

                  <CloudProvider
                    name="Dropbox"
                    badge="2 GB FREE"
                    description="Backup .json snapshots to a Dropbox folder. 2 GB free tier."
                    setupUrl="https://www.dropbox.com/developers/apps"
                    tokenLabel="App access token"
                    tokenValue={(draft as any).dropboxToken || ''}
                    onTokenChange={(v) => setDraft({ ...draft, dropboxToken: v } as any)}
                    syncing={syncing === 'dropbox'}
                    onSync={() => pushToProvider('dropbox')}
                    onRestore={() => pullFromProvider('dropbox')}
                    lastSyncedAt={(draft as any).lastCloudSyncAt}
                  />

                  <CloudProvider
                    name="Google Drive"
                    badge="15 GB FREE"
                    description="Sync to Google Drive. Needs an OAuth client — easier on a published deploy than localhost."
                    setupUrl="https://console.cloud.google.com/apis/credentials"
                    tokenLabel="OAuth client ID"
                    tokenValue={(draft as any).googleDriveClientId || ''}
                    onTokenChange={(v) => setDraft({ ...draft, googleDriveClientId: v } as any)}
                  />

                  <CloudProvider
                    name="WebDAV (Nextcloud / Owncloud / mailbox.org)"
                    badge="MANY FREE HOSTS"
                    description="Self-hosted or pick a free Nextcloud provider. Works with any WebDAV server. Note: the server must allow CORS from this origin."
                    setupUrl="https://nextcloud.com/sign-up/"
                    tokenLabel="WebDAV URL (https://…/remote.php/dav/files/USER/)"
                    tokenValue={(draft as any).webdavUrl || ''}
                    onTokenChange={(v) => setDraft({ ...draft, webdavUrl: v } as any)}
                    secondaryLabel="Username:Password (basic auth)"
                    secondaryValue={(draft as any).webdavAuth || ''}
                    onSecondaryChange={(v) => setDraft({ ...draft, webdavAuth: v } as any)}
                    syncing={syncing === 'webdav'}
                    onSync={() => pushToProvider('webdav')}
                    onRestore={() => pullFromProvider('webdav')}
                    lastSyncedAt={(draft as any).lastCloudSyncAt}
                  />

                  <CloudProvider
                    name="Supabase"
                    badge="500 MB FREE DB"
                    description="Postgres + storage. Generous free tier. Drop in your project URL + anon key. Requires a public bucket named 'kindling'."
                    setupUrl="https://supabase.com/dashboard"
                    tokenLabel="Project URL"
                    tokenValue={(draft as any).supabaseUrl || ''}
                    onTokenChange={(v) => setDraft({ ...draft, supabaseUrl: v } as any)}
                    secondaryLabel="Anon public key"
                    secondaryValue={(draft as any).supabaseAnonKey || ''}
                    onSecondaryChange={(v) => setDraft({ ...draft, supabaseAnonKey: v } as any)}
                    syncing={syncing === 'supabase'}
                    onSync={() => pushToProvider('supabase')}
                    onRestore={() => pullFromProvider('supabase')}
                    lastSyncedAt={(draft as any).lastCloudSyncAt}
                  />

                  <CloudProvider
                    name="JSONBin.io"
                    badge="FREE — 10k req/mo"
                    description={`Quick private JSON storage. Paste an API key and you're done.${(draft as any).jsonbinId ? ` Bin: ${(draft as any).jsonbinId.slice(0,10)}…` : ''}`}
                    setupUrl="https://jsonbin.io/api-reference"
                    tokenLabel="X-Master-Key"
                    tokenValue={(draft as any).jsonbinKey || ''}
                    onTokenChange={(v) => setDraft({ ...draft, jsonbinKey: v } as any)}
                    syncing={syncing === 'jsonbin'}
                    onSync={() => pushToProvider('jsonbin')}
                    onRestore={() => pullFromProvider('jsonbin')}
                    lastSyncedAt={(draft as any).lastCloudSyncAt}
                  />

                  <CloudProvider
                    name="Pastebin"
                    badge="FREE — share link"
                    description="One-way share. Push uploads your story as an unlisted paste and copies the share URL to your clipboard. Useful for read-only collaborators."
                    setupUrl="https://pastebin.com/doc_api"
                    tokenLabel="Pastebin dev API key"
                    tokenValue={(draft as any).pastebinKey || ''}
                    onTokenChange={(v) => setDraft({ ...draft, pastebinKey: v } as any)}
                    syncing={syncing === 'pastebin'}
                    onSync={() => pushToProvider('pastebin')}
                    lastSyncedAt={(draft as any).lastCloudSyncAt}
                  />

                  <Section title="Local folder backup">
                    {fsSupported() ? (
                      <button
                        onClick={async () => {
                          const h = await pickFolder();
                          if (h) {
                            await saveFolderHandle(h);
                            setDraft({ ...draft, defaultSaveFolder: h.name });
                            toast.success(`Backups will save to /${h.name}/`);
                          }
                        }}
                        className="w-full px-3 py-2 rounded-md bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] flex items-center justify-center gap-1.5"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        {draft.defaultSaveFolder ? `/${draft.defaultSaveFolder}` : 'Pick a folder on disk'}
                      </button>
                    ) : (
                      <p className="text-[11px] text-[var(--text-muted)]">
                        This browser doesn't support the File System Access API. Use the Export button instead.
                      </p>
                    )}
                    {draft.defaultSaveFolder && (
                      <button
                        onClick={async () => { await clearFolderHandle(); setDraft({ ...draft, defaultSaveFolder: null }); }}
                        className="mt-2 text-[10px] text-[var(--text-muted)] hover:text-red-400"
                      >
                        Clear folder
                      </button>
                    )}
                  </Section>

                  <p className="text-[10px] text-[var(--text-muted)] text-center pt-1">
                    All tokens are stored on this device only. None of them leave your browser unless you trigger a sync.
                  </p>
                </div>
              )}

              {tab === 'shortcuts' && (
                <ShortcutsPanel />
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--border)] bg-[var(--sidebar)]">
              <button
                onClick={() => { if (confirm('Reset all settings to defaults?')) { resetSettings(); onClose(); toast.success('Settings reset'); } }}
                title="Reset to defaults"
                className="p-2 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <div className="flex-1" />
              <button onClick={cancel} className="px-4 py-2 rounded-md bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:border-[var(--text-muted)]">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={!dirty}
                className="px-4 py-2 rounded-md bg-[var(--accent)] text-[var(--bg)] text-xs font-bold hover:brightness-110 disabled:opacity-40 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                Save
              </button>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-3 bg-[var(--card)] rounded-lg border border-[var(--border)]">
      <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2">{title}</div>
      {children}
    </div>
  );
}

function CloudProvider({
  name,
  badge,
  description,
  setupUrl,
  tokenLabel,
  tokenValue,
  onTokenChange,
  secondaryLabel,
  secondaryValue,
  onSecondaryChange,
  syncing,
  onSync,
  onRestore,
  lastSyncedAt,
}: {
  name: string;
  badge: string;
  description: string;
  setupUrl: string;
  tokenLabel: string;
  tokenValue: string;
  onTokenChange: (v: string) => void;
  secondaryLabel?: string;
  secondaryValue?: string;
  onSecondaryChange?: (v: string) => void;
  syncing?: boolean;
  onSync?: () => Promise<void> | void;
  onRestore?: () => Promise<void> | void;
  lastSyncedAt?: string;
}) {
  const [open, setOpen] = useState(false);
  const configured = !!tokenValue.trim();
  return (
    <div className="p-3 bg-[var(--card)] rounded-lg border border-[var(--border)]">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 text-left">
        <div className={`w-2 h-2 rounded-full ${configured ? 'bg-emerald-400' : 'bg-[var(--text-muted)]'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--text)]">{name}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold">{badge}</span>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-snug">{description}</p>
        </div>
        <span className="text-[10px] text-[var(--text-muted)]">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <a href={setupUrl} target="_blank" rel="noreferrer" className="text-[10px] text-[var(--accent)] underline">
            Get it on {name.split(' ')[0]} →
          </a>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-1">{tokenLabel}</div>
            <input
              value={tokenValue}
              onChange={(e) => onTokenChange(e.target.value)}
              type="password"
              placeholder="paste here"
              className="w-full px-2 py-1.5 text-xs bg-[var(--bg)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--accent)] font-mono"
            />
          </div>
          {secondaryLabel && onSecondaryChange !== undefined && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-1">{secondaryLabel}</div>
              <input
                value={secondaryValue || ''}
                onChange={(e) => onSecondaryChange(e.target.value)}
                placeholder="paste here"
                className="w-full px-2 py-1.5 text-xs bg-[var(--bg)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--accent)] font-mono"
              />
            </div>
          )}
          {(onSync || onRestore) && (
            <div className="flex items-center gap-2 pt-2">
              {onSync && (
                <button
                  onClick={onSync}
                  disabled={!configured || syncing}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--accent)] text-[var(--bg)] text-xs font-semibold hover:brightness-110 disabled:opacity-40"
                >
                  {syncing ? '…syncing' : 'Sync now ↑'}
                </button>
              )}
              {onRestore && (
                <button
                  onClick={onRestore}
                  disabled={!configured || syncing}
                  className="flex-1 px-3 py-1.5 rounded-md border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-40"
                >
                  Restore ↓
                </button>
              )}
            </div>
          )}
          {lastSyncedAt && (
            <p className="text-[10px] text-[var(--text-muted)]">
              Last synced: {new Date(lastSyncedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(!value)}
        className={`w-10 h-5 rounded-full transition-all ${value ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`}
      >
        <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
      <span className="text-xs text-[var(--text-secondary)]">{label}</span>
    </div>
  );
}

function ThemeBtn({ icon: Icon, label, active, onClick }: { icon: any; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 py-3 rounded-lg border transition-all ${
        active
          ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
          : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-light)] hover:text-[var(--text)]'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

// ColorRow removed — the new disciplined design system uses an Accent picker
// (4 metals) instead of raw color editing.

/**
 * Read-only reference list of every keyboard shortcut wired in App.tsx
 * (plus a few editor-local ones). Keep this in sync when shortcuts change.
 * Detects the user's platform and renders ⌘ on macOS, Ctrl elsewhere.
 */
function ShortcutsPanel() {
  // Detect macOS so we render the right modifier symbol.
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const mod = isMac ? '⌘' : 'Ctrl';
  const shift = isMac ? '⇧' : 'Shift';

  const groups: { title: string; rows: { keys: string; action: string }[] }[] = [
    {
      title: 'Files & saving',
      rows: [
        { keys: `${mod}+S`,             action: 'Save the active story now' },
        { keys: `${mod}+${shift}+E`,    action: 'Open the Export dialog (PDF / Word / Fountain / FDX)' },
        { keys: `${mod}+,`,             action: 'Open Settings' },
        { keys: `${mod}+K`,             action: 'Open the Command Palette' },
      ],
    },
    {
      title: 'View',
      rows: [
        { keys: `${mod}+\\`,            action: 'Collapse / expand the sidebar' },
        { keys: `${mod}+.`,             action: 'Toggle Focus Mode' },
      ],
    },
    {
      title: 'AI tools (writer tab)',
      rows: [
        { keys: `${mod}+${shift}+D`,    action: 'Open the AI Dialogue Coach' },
        { keys: `${mod}+${shift}+L`,    action: 'Coach the dialogue line under the cursor' },
        { keys: `${mod}+${shift}+R`,    action: 'Open Table-Read mode (read aloud)' },
        { keys: `${mod}+${shift}+S`,    action: 'Open the Style Assistant' },
        { keys: `${mod}+${shift}+C`,    action: 'Open the Compare overlay' },
        { keys: `${mod}+${shift}+W`,    action: 'What if? — AI alternate take for the selection' },
        { keys: `${mod}+F`,             action: 'Find & Replace in the script' },
      ],
    },
    {
      title: 'Plot board',
      rows: [
        { keys: 'B',                    action: 'Add a beat to the first act (when not typing)' },
      ],
    },
    {
      title: 'Editor (TipTap)',
      rows: [
        { keys: `${mod}+B`,             action: 'Bold the selection' },
        { keys: `${mod}+I`,             action: 'Italicize the selection' },
        { keys: `${mod}+U`,             action: 'Underline the selection' },
        { keys: `${mod}+Z`,             action: 'Undo' },
        { keys: `${mod}+${shift}+Z`,    action: 'Redo' },
        { keys: 'Tab',                  action: 'Cycle screenplay format (Action → Character → …)' },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[11px] text-[var(--text-secondary)] flex items-start gap-2">
        <Keyboard className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-[var(--accent)]" />
        <div>
          Every keyboard shortcut in Kindling, grouped by what it does. The
          buttons in the sidebar's <strong>AI Tools</strong> section show the
          same shortcuts inline — both routes do the same thing.
        </div>
      </div>

      {groups.map((g) => (
        <Section key={g.title} title={g.title}>
          <div className="space-y-1">
            {g.rows.map((r) => (
              <div
                key={r.keys + r.action}
                className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-[var(--hover)]"
              >
                <kbd className="px-2 py-1 rounded-md bg-[var(--bg)] border border-[var(--border)] text-[11px] font-mono text-[var(--text)] tabular-nums flex-shrink-0 min-w-[88px] text-center">
                  {r.keys}
                </kbd>
                <span className="text-[11px] text-[var(--text-secondary)] flex-1">
                  {r.action}
                </span>
              </div>
            ))}
          </div>
        </Section>
      ))}

      <p className="text-[10px] text-[var(--text-muted)] text-center pt-2">
        Showing {isMac ? 'macOS' : 'Windows / Linux'} shortcuts based on your browser.
      </p>
    </div>
  );
}
