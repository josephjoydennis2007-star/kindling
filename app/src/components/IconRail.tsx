import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PenLine, Clapperboard, LayoutGrid, Calendar as CalendarIcon, Briefcase, Sparkles,
  Settings, Plus, X, ChevronRight,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { t } from '@/lib/i18n';
import type { Story } from '@/types';

/**
 * IconRail — the ONE persistent navigation surface.
 *
 * A 56px-wide vertical rail on the far left of the app. Holds:
 *   - The K logo (click → opens the Stories drawer)
 *   - Six view icons (Home / Writer / Director / Plot / Calendar / Workspace)
 *   - Settings + User avatar at the bottom
 *
 * This replaces the previous 280px Sidebar's 2x3 tab grid + Story Tools list
 * + AI Tools list + Settings list + User dock. Everything that used to be in
 * that sidebar is now reachable via:
 *   - Rail icons (the six views)
 *   - Logo click → Stories drawer
 *   - Settings cog → Settings overlay
 *   - User avatar → Profile/sign-out sheet
 *   - Top bar "…" menu (AI tools, Export, etc.)
 *   - Cmd/Ctrl+K command palette
 *
 * The active view gets a Tobacco-gold left bar marker — that's the only
 * always-on accent in the rail. Inspired by ElevenLabs / Notion / Linear.
 */

interface Props {
  activeTab: string;
  onTabChange: (tab: string) => void;
  stories: Story[];
  activeStoryId: string | null;
  onStoryChange: (id: string) => void;
  onNewStory: () => void;
  onOpenSettings: () => void;
  onOpenProfile?: () => void;
  user?: { displayName?: string | null; photoURL?: string | null; email?: string | null } | null;
}

const VIEWS = [
  { id: 'dashboard', key: 'tab.dashboard', icon: Sparkles },
  { id: 'writer',    key: 'tab.writer',    icon: PenLine },
  { id: 'director',  key: 'tab.director',  icon: Clapperboard },
  { id: 'plot',      key: 'tab.plot',      icon: LayoutGrid },
  { id: 'calendar',  key: 'tab.calendar',  icon: CalendarIcon },
  { id: 'workspace', key: 'tab.workspace', icon: Briefcase },
];

export default function IconRail({
  activeTab,
  onTabChange,
  stories,
  activeStoryId,
  onStoryChange,
  onNewStory,
  onOpenSettings,
  onOpenProfile,
  user,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const locale = (useAppStore((s) => (s.settings as any).locale) as ('en'|'es'|'fr')) || 'en';
  const activeStory = stories.find((s) => s.id === activeStoryId);

  return (
    <>
      {/* Desktop + tablet: vertical 56px rail on the left.
          Phone (<sm): becomes a 56px BOTTOM nav bar pinned to the screen
          bottom (above the StatusLine), exactly like iOS tab bar. The
          drawer + Settings cog + avatar are reachable via the same icons. */}
      <nav
        className="hidden sm:flex flex-col items-center py-2 gap-1 bg-[var(--rail-bg)] border-r border-[var(--rule)] flex-shrink-0 w-14 z-30"
        aria-label="Primary navigation"
      >
        {/* Logo — opens the stories drawer */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="w-10 h-10 rounded-md flex items-center justify-center text-[var(--accent-ink)] font-display font-bold text-base mb-1 transition-colors"
          style={{ background: 'var(--accent)' }}
          aria-label="Open stories drawer"
          title="Stories"
        >
          K
        </button>

        <div className="w-8 h-px bg-[var(--rule)] my-1" aria-hidden />

        {/* View icons */}
        <ul className="flex flex-col gap-0.5">
          {VIEWS.map((v) => {
            const isActive = activeTab === v.id;
            return (
              <li key={v.id} className="relative">
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                    style={{ background: 'var(--accent)' }}
                  />
                )}
                <button
                  onClick={() => onTabChange(v.id)}
                  title={t(v.key, locale)}
                  aria-label={t(v.key, locale)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-10 h-10 rounded-md flex items-center justify-center transition-colors ${
                    isActive
                      ? 'rail-active-bg text-[var(--accent)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
                  }`}
                >
                  <v.icon className="w-[18px] h-[18px]" />
                </button>
              </li>
            );
          })}
        </ul>

        {/* Spacer pushes Settings + avatar to the bottom */}
        <div className="flex-1" />

        <button
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
          className="w-10 h-10 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)] transition-colors"
        >
          <Settings className="w-[18px] h-[18px]" />
        </button>

        <button
          onClick={() => onOpenProfile?.()}
          title={user?.displayName || user?.email || 'You'}
          aria-label="Open profile menu"
          className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center bg-[var(--surface-2)] border border-[var(--rule)] hover:border-[var(--border-light)] transition-colors"
        >
          {user?.photoURL
            ? <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
            : <span className="text-xs font-semibold text-[var(--text)]">
                {(user?.displayName || user?.email || 'Y').charAt(0).toUpperCase()}
              </span>}
        </button>
      </nav>

      {/* Mobile bottom nav (< sm) — same icons, horizontal layout */}
      <nav
        className="sm:hidden fixed bottom-7 left-0 right-0 h-12 flex items-center justify-around px-1 bg-[var(--rail-bg)] border-t border-[var(--rule)] z-30"
        aria-label="Primary navigation"
      >
        <button
          onClick={() => setDrawerOpen(true)}
          className="w-9 h-9 rounded-md flex items-center justify-center text-[var(--accent-ink)] font-display font-bold text-sm"
          style={{ background: 'var(--accent)' }}
          aria-label="Stories"
        >
          K
        </button>
        {VIEWS.slice(0, 5).map((v) => {
          const isActive = activeTab === v.id;
          return (
            <button
              key={v.id}
              onClick={() => onTabChange(v.id)}
              aria-label={t(v.key, locale)}
              aria-current={isActive ? 'page' : undefined}
              className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors ${
                isActive
                  ? 'rail-active-bg text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--hover)]'
              }`}
            >
              <v.icon className="w-[18px] h-[18px]" />
            </button>
          );
        })}
        <button
          onClick={onOpenSettings}
          aria-label="Settings"
          className="w-9 h-9 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
        >
          <Settings className="w-[18px] h-[18px]" />
        </button>
      </nav>

      {/* Stories drawer — slides out from the rail when the logo is clicked */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 bg-black/40 z-40"
              aria-hidden
            />
            <motion.aside
              role="dialog"
              aria-label="Stories"
              initial={{ x: -280, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -280, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="fixed top-0 bottom-0 left-14 w-[280px] bg-[var(--panel)] border-r border-[var(--rule)] z-50 flex flex-col"
            >
              <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--rule)]">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">
                    {t('sb.stories', locale)}
                  </div>
                  <div className="text-xs text-[var(--text)] font-semibold mt-0.5">
                    {activeStory?.title || 'No story selected'}
                  </div>
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close stories drawer"
                  className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </header>

              <div className="flex-1 overflow-y-auto py-2">
                {stories.length === 0 && (
                  <div className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">
                    No stories yet.
                  </div>
                )}
                {stories.map((story) => {
                  const isActive = story.id === activeStoryId;
                  return (
                    <button
                      key={story.id}
                      onClick={() => { onStoryChange(story.id); setDrawerOpen(false); }}
                      className={`w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${
                        isActive
                          ? 'rail-active-bg text-[var(--accent)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
                      }`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: storyTypeColor(story.type) }}
                        aria-hidden
                      />
                      <span className="flex-1 truncate font-medium">{story.title}</span>
                      {isActive && <ChevronRight className="w-3 h-3 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <footer className="border-t border-[var(--rule)] p-3">
                <button
                  onClick={() => { onNewStory(); setDrawerOpen(false); }}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-md bg-[var(--accent)] text-[var(--accent-ink)] text-xs font-semibold hover:brightness-110 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('sb.new_story', locale)}
                </button>
              </footer>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function storyTypeColor(type?: string): string {
  switch (type) {
    case 'tv-series': return '#a45a9c';
    case 'tv-show': return '#c89651';
    case 'mini-series': return '#7a82c4';
    case 'thriller': return '#9c4736';
    case 'documentary': return '#5c8b7e';
    case 'short-film': return '#5c93a6';
    case 'music-video': return '#9c5fa6';
    case 'commercial': return '#c98a4f';
    case 'youtube': return '#b35a4d';
    case 'web-series': return '#5b7bb3';
    case 'stage-play': return '#7e508c';
    case 'animation': return '#4f8a85';
    case 'movie':
    default: return 'var(--accent)';
  }
}
