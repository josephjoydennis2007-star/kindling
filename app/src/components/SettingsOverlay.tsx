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
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { fsSupported, pickFolder, saveFolderHandle, clearFolderHandle } from '@/lib/folderHandle';
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
  const [tab, setTab] = useState<'appearance' | 'editor' | 'files' | 'story' | 'collab' | 'ai' | 'cloud'>('appearance');

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
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow">
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
                      <ThemeBtn icon={Moon} label="Dark" active={draft.theme === 'dark'} onClick={() => setDraft({ ...draft, theme: 'dark' })} />
                      <ThemeBtn icon={Sun} label="Light" active={draft.theme === 'light'} onClick={() => setDraft({ ...draft, theme: 'light' })} />
                      <ThemeBtn icon={Palette} label="Custom" active={draft.theme === 'custom'} onClick={() => setDraft({ ...draft, theme: 'custom' })} />
                    </div>
                  </Section>

                  {draft.theme === 'custom' && (
                    <Section title="Custom colors">
                      <ColorRow label="Primary"  value={draft.primaryColor}  onChange={(v) => setDraft({ ...draft, primaryColor: v })} />
                      <ColorRow label="Accent"   value={draft.accentColor}   onChange={(v) => setDraft({ ...draft, accentColor: v })} />
                      <ColorRow label="Background" value={draft.bgColor}     onChange={(v) => setDraft({ ...draft, bgColor: v })} />
                      <ColorRow label="Sidebar"  value={draft.sidebarColor}  onChange={(v) => setDraft({ ...draft, sidebarColor: v })} />
                      <ColorRow label="Panel"    value={draft.panelColor}    onChange={(v) => setDraft({ ...draft, panelColor: v })} />
                      <ColorRow label="Text"     value={draft.textColor}     onChange={(v) => setDraft({ ...draft, textColor: v })} />
                      <ColorRow label="Text (muted)" value={draft.textSecondaryColor} onChange={(v) => setDraft({ ...draft, textSecondaryColor: v })} />
                      <ColorRow label="Border"   value={draft.borderColor}   onChange={(v) => setDraft({ ...draft, borderColor: v })} />
                    </Section>
                  )}
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
                  <Section title="Auto-save">
                    <Toggle value={draft.autoSave} onChange={(v) => setDraft({ ...draft, autoSave: v })} label={draft.autoSave ? 'On' : 'Off'} />
                    {draft.autoSave && (
                      <>
                        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mt-3">Interval — {draft.autoSaveInterval / 1000}s</div>
                        <input type="range" min={10000} max={300000} step={10000} value={draft.autoSaveInterval} onChange={(e) => setDraft({ ...draft, autoSaveInterval: Number(e.target.value) })} className="w-full accent-[var(--accent)] mt-1" />
                      </>
                    )}
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
                  </Section>
                  <Section title="Default role">
                    <select
                      value={draft.userRole}
                      onChange={(e) => setDraft({ ...draft, userRole: e.target.value as any })}
                      className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs outline-none focus:border-[var(--accent)]"
                    >
                      <option value="admin">Admin</option>
                      <option value="writer">Writer</option>
                      <option value="director">Director</option>
                      <option value="viewer">Viewer</option>
                    </select>
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
                    <input type="password" value={draft.aiApiKey} onChange={(e) => setDraft({ ...draft, aiApiKey: e.target.value })} placeholder="sk-…"
                      className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs font-mono outline-none focus:border-[var(--accent)]" />
                  </Section>
                  {draft.aiProvider === 'custom' && (
                    <Section title="Endpoint">
                      <input value={draft.aiEndpoint} onChange={(e) => setDraft({ ...draft, aiEndpoint: e.target.value })} placeholder="https://api.example.com/v1/chat/completions"
                        className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs outline-none focus:border-[var(--accent)]" />
                    </Section>
                  )}
                </div>
              )}

              {tab === 'cloud' && (
                <div className="space-y-4">
                  <Section title="Cloud sync (Firebase)">
                    <Toggle value={draft.cloudSync} onChange={(v) => setDraft({ ...draft, cloudSync: v })} label={draft.cloudSync ? 'On' : 'Off'} />
                    <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
                      Stories sync to your Firebase project so they appear on every device you sign into. Needs a configured Firebase project — see SETUP.md.
                    </p>
                  </Section>
                  <Section title="Storage">
                    <p className="text-[11px] text-[var(--text-secondary)] flex items-start gap-1.5">
                      <Monitor className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[var(--info)]" />
                      Local-first. Drafts auto-save to IndexedDB. Cloud sync pushes on save, with offline merge.
                    </p>
                  </Section>
                </div>
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

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-8 h-8 rounded cursor-pointer border border-[var(--border)]" />
        <input value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded-md text-xs outline-none focus:border-[var(--accent)]" />
      </div>
    </div>
  );
}
