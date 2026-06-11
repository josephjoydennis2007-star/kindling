import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Clapperboard, Youtube, Plus, FolderKanban, Wand2, Search, ArrowRight,
  PenLine, ImageIcon, LayoutDashboard, ChevronDown, ChevronUp, Film,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import StoryDashboard from '@/components/StoryDashboard';
import type { Story } from '@/types';

/**
 * CreatorHome — the Creator OS landing page at `/`. One brand, two wings:
 * 🎬 Film Studio (industry screenplay/director tools) and ▶ YouTube Studio
 * (shorts & content). Plus: continue-where-you-left-off, projects, recent
 * stories, and quick actions. The per-story snapshot (StoryDashboard) stays
 * available behind the "Overview" toggle on the continue card.
 */
export default function CreatorHome() {
  const stories = useAppStore((s) => s.stories);
  const projects = useAppStore((s) => s.projects);
  const activeStoryId = useAppStore((s) => s.activeStoryId);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const createStory = useAppStore((s) => s.createStory);
  const loadStory = useAppStore((s) => s.loadStory);
  const setTab = useAppStore((s) => s.setTab);
  const [showOverview, setShowOverview] = useState(false);

  const activeStory = stories.find((s) => s.id === activeStoryId);
  const filmStories = useMemo(() => stories.filter((s) => s.type !== 'youtube'), [stories]);
  const ytStories = useMemo(() => stories.filter((s) => s.type === 'youtube'), [stories]);
  const recent = useMemo(
    () => [...stories].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 8),
    [stories],
  );

  const openStory = (s: Story) => {
    loadStory(s.id);
    setTab(s.type === 'youtube' ? 'youtube' : 'writer');
  };

  const newFilm = () => {
    const title = window.prompt('Name your film story:', 'Untitled Story');
    if (title === null) return;
    createStory(title || 'Untitled Story', 'movie', activeProjectId || undefined);
    setTab('writer');
    toast.success('New story created');
  };
  const newYouTube = () => {
    const title = window.prompt('Name this YouTube video:', 'New YouTube video');
    if (title === null) return;
    createStory(title || 'New YouTube video', 'youtube', activeProjectId || undefined);
    setTab('youtube');
    toast.success('New YouTube video created');
  };

  const chip = (s: Story) =>
    s.type === 'youtube'
      ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] uppercase tracking-wider font-bold bg-[#ff0000]/15 text-[#ff5555]"><Youtube className="w-2.5 h-2.5" /> YouTube</span>
      : <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] uppercase tracking-wider font-bold bg-[var(--accent-soft)] text-[var(--accent)]"><Clapperboard className="w-2.5 h-2.5" /> Film</span>;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="h-full overflow-y-auto bg-[var(--bg)]">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Brand header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[var(--accent-ink)] font-display font-bold text-lg" style={{ background: 'var(--accent)' }}>K</div>
          <div>
            <h1 className="text-lg font-display font-bold text-[var(--text)] leading-tight">Kindling — Creator OS</h1>
            <p className="text-[11px] text-[var(--text-muted)]">One home. Two studios. Everything from idea to screen.</p>
          </div>
          <div className="flex-1" />
          <button onClick={() => document.dispatchEvent(new CustomEvent('app:openPalette'))} title="Search anything (Ctrl/Cmd+K)"
            className="p-2 rounded-md bg-[var(--card)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)]"><Search className="w-4 h-4" /></button>
          <button onClick={() => document.dispatchEvent(new CustomEvent('app:openQuickTools'))} title="Quick Tools"
            className="p-2 rounded-md bg-[var(--card)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)]"><Wand2 className="w-4 h-4" /></button>
        </div>

        {/* Continue where you left off */}
        {activeStory && (
          <div className="mb-6 p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Continue</span>
              {chip(activeStory)}
              <span className="text-sm font-bold text-[var(--text)] truncate">{activeStory.title}</span>
              <div className="flex-1" />
              {activeStory.type === 'youtube' ? (
                <button onClick={() => setTab('youtube')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-110">
                  <Youtube className="w-3.5 h-3.5" /> Open YouTube Studio
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setTab('writer')} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-110"><PenLine className="w-3 h-3" /> Writer</button>
                  <button onClick={() => setTab('director')} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold bg-[var(--panel)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]"><Clapperboard className="w-3 h-3" /> Director</button>
                  <button onClick={() => setTab('storyboard')} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold bg-[var(--panel)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]"><ImageIcon className="w-3 h-3" /> Storyboard</button>
                </div>
              )}
              <button onClick={() => setShowOverview((v) => !v)} title="Story overview (stats, progress, recent edits)"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold bg-[var(--panel)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]">
                <LayoutDashboard className="w-3 h-3" /> Overview {showOverview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
            {showOverview && (
              <div className="mt-3 h-[70vh] rounded-xl border border-[var(--border)] overflow-hidden">
                <StoryDashboard />
              </div>
            )}
          </div>
        )}

        {/* The two studios */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {/* Film Studio */}
          <div className="group p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)]/60 transition-all">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="p-2 rounded-xl bg-[var(--accent-soft)]"><Clapperboard className="w-5 h-5 text-[var(--accent)]" /></span>
              <div>
                <h2 className="text-sm font-display font-bold text-[var(--text)]">Film Studio</h2>
                <p className="text-[10.5px] text-[var(--text-muted)]">{filmStories.length} stor{filmStories.length === 1 ? 'y' : 'ies'} · screenplay → director → storyboard</p>
              </div>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-snug mb-3">Industry-grade writing and directing: paginated screenplay, plot board, shots, breakdowns, schedule, exports.</p>
            <div className="flex items-center gap-2">
              <button onClick={newFilm} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-110"><Plus className="w-3.5 h-3.5" /> New film story</button>
              <button onClick={() => document.dispatchEvent(new CustomEvent('app:openStories'))} className="flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-[var(--panel)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]">Browse <ArrowRight className="w-3 h-3" /></button>
            </div>
          </div>

          {/* YouTube Studio */}
          <div className="group p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] hover:border-[#ff0000]/50 transition-all">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="p-2 rounded-xl bg-[#ff0000]/10"><Youtube className="w-5 h-5 text-[#ff0000]" /></span>
              <div>
                <h2 className="text-sm font-display font-bold text-[var(--text)]">YouTube Studio</h2>
                <p className="text-[10.5px] text-[var(--text-muted)]">{ytStories.length} video{ytStories.length === 1 ? '' : 's'} · idea → script → clips → publish</p>
              </div>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-snug mb-3">Your content factory: one idea becomes title, hook, script, clips, thumbnail — ready for Runway + CapCut.</p>
            <div className="flex items-center gap-2">
              <button onClick={newYouTube} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold bg-[#ff0000] text-white hover:brightness-110"><Plus className="w-3.5 h-3.5" /> New video</button>
              <button onClick={() => setTab('youtube')} className="flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-[var(--panel)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[#ff5555] hover:border-[#ff0000]/60">Open studio <ArrowRight className="w-3 h-3" /></button>
            </div>
          </div>
        </div>

        {/* Projects */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold flex items-center gap-1.5"><FolderKanban className="w-3 h-3" /> Projects</h3>
            <button onClick={() => document.dispatchEvent(new CustomEvent('app:openProjects'))} className="text-[10px] font-bold text-[var(--accent)] hover:underline">Manage →</button>
          </div>
          {projects.length === 0 ? (
            <button onClick={() => document.dispatchEvent(new CustomEvent('app:openProjects'))}
              className="w-full p-3 rounded-xl border border-dashed border-[var(--border)] text-[11px] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-left">
              + Create a project — a master brief (prompt, instructions, knowledge) that many stories share. Claude/ChatGPT build on-brand from it.
            </button>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {projects.map((p) => {
                const n = stories.filter((s) => s.projectId === p.id).length;
                return (
                  <button key={p.id} onClick={() => document.dispatchEvent(new CustomEvent('app:openProjects'))}
                    className="flex-shrink-0 px-3.5 py-2.5 rounded-xl bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)] text-left transition-colors min-w-[150px]">
                    <div className="text-[12px] font-bold text-[var(--text)] truncate max-w-[180px]">{p.name}</div>
                    <div className="text-[9.5px] text-[var(--text-muted)]">{n} stor{n === 1 ? 'y' : 'ies'}{p.defaultType ? ` · ${p.defaultType}` : ''}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent stories */}
        <div>
          <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2 flex items-center gap-1.5"><Film className="w-3 h-3" /> Recent</h3>
          {recent.length === 0 ? (
            <p className="text-[11px] text-[var(--text-muted)]">Nothing yet — create your first story above, or ask Claude/ChatGPT to build one.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {recent.map((s) => (
                <button key={s.id} onClick={() => openStory(s)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)] text-left transition-colors">
                  {chip(s)}
                  <span className="text-[12.5px] font-semibold text-[var(--text)] truncate flex-1">{s.title}</span>
                  <ArrowRight className="w-3 h-3 text-[var(--text-muted)]" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
