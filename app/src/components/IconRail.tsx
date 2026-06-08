import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PenLine, Clapperboard, LayoutGrid, Calendar as CalendarIcon, Briefcase, Sparkles,
  Settings, Plus, X, ChevronRight, Trash2,
  ListTree, Globe2, Image as ImageIcon, MapPin,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { t } from '@/lib/i18n';
import type { Story } from '@/types';

/**
 * IconRail — the ONE persistent navigation surface.
 *
 * A 56px-wide vertical rail on the far left. The user explicitly asked for
 * the rail to be SECTIONED so that everything in the top group belongs to
 * the writer's job and everything in the bottom group belongs to the
 * director's job. If a collaborator is invited as a director only, their
 * Writer-section icons render LOCKED (and clicking shows a permissions
 * toast). And vice versa. Owners and 'both'-role users see no locks.
 *
 *   K logo
 *   ──── (rule)
 *   Dashboard
 *   ──── (writer-section label) ────
 *   Writer    PenLine
 *   Outline   ListTree
 *   World     Globe2
 *   ──── (director-section label) ────
 *   Director  Clapperboard
 *   Plot      LayoutGrid
 *   Storyboard ImageIcon
 *   Schedule  Calendar
 *   Locations MapPin
 *   ──── (general) ────
 *   Workspace Briefcase
 *   (spacer)
 *   Settings cog
 *   Avatar
 *
 * Each section icon highlights when its tab is active using the same
 * Tobacco-gold left bar marker the previous rail used. Section dividers
 * are visible faint rules so the user can see at a glance which group
 * an item belongs to.
 */

interface Props {
  activeTab: string;
  onTabChange: (tab: string) => void;
  stories: Story[];
  activeStoryId: string | null;
  onStoryChange: (id: string) => void;
  onNewStory: () => void;
  onDeleteStory?: (id: string) => void;
  onOpenSettings: () => void;
  onOpenProfile?: () => void;
  user?: { displayName?: string | null; photoURL?: string | null; email?: string | null } | null;
  /** Permission flags from the story role hook. Default true so the
   *  rail still renders unlocked when nothing is wired up. */
  canWrite?: boolean;
  canDirect?: boolean;
}

// Writer section — everything here is part of the writer's job.
const WRITER_VIEWS = [
  { id: 'writer',  labelKey: 'tab.writer',  fallback: 'Writer',  icon: PenLine,  desc: 'The screenplay editor' },
  { id: 'outline', labelKey: 'tab.outline', fallback: 'Outline', icon: ListTree, desc: 'Treatment, theme, story points' },
  { id: 'world',   labelKey: 'tab.world',   fallback: 'World',   icon: Globe2,   desc: 'Worldbuilding wiki' },
];

// Director section — everything here is part of the director's job.
const DIRECTOR_VIEWS = [
  { id: 'director',   labelKey: 'tab.director',   fallback: 'Director',   icon: Clapperboard, desc: 'Scenes + shot list' },
  { id: 'plot',       labelKey: 'tab.plot',       fallback: 'Plot',       icon: LayoutGrid,   desc: 'Plot board / beat sheet' },
  { id: 'storyboard', labelKey: 'tab.storyboard', fallback: 'Storyboard', icon: ImageIcon,    desc: 'Full storyboard grid' },
  { id: 'calendar',   labelKey: 'tab.calendar',   fallback: 'Schedule',   icon: CalendarIcon, desc: 'Shoot schedule' },
  { id: 'locations',  labelKey: 'tab.locations',  fallback: 'Locations',  icon: MapPin,       desc: 'Production location scout' },
];

// General — accessible to all roles.
const GENERAL_VIEWS = [
  { id: 'dashboard', labelKey: 'tab.dashboard', fallback: 'Dashboard', icon: Sparkles,  desc: 'Story dashboard' },
  { id: 'workspace', labelKey: 'tab.workspace', fallback: 'Workspace', icon: Briefcase, desc: 'External tools + links' },
];

export default function IconRail({
  activeTab,
  onTabChange,
  stories,
  activeStoryId,
  onStoryChange,
  onNewStory,
  onDeleteStory,
  onOpenSettings,
  onOpenProfile,
  user,
  canWrite = true,
  canDirect = true,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const locale = (useAppStore((s) => (s.settings as any).locale) as ('en'|'es'|'fr')) || 'en';
  const activeStory = stories.find((s) => s.id === activeStoryId);

  // Wrap onTabChange so we can intercept locked-tab clicks and show a
  // toast instead of changing tabs.
  const tryTabChange = (tab: string, locked: boolean) => {
    if (locked) {
      toast.error("You don't have access to this workspace on this story", {
        description: 'Ask the story owner to grant you writer or director access.',
      });
      return;
    }
    onTabChange(tab);
  };

  // Render a single rail item with active marker + lock overlay.
  const renderItem = (
    v: { id: string; labelKey: string; fallback: string; icon: any; desc: string },
    locked: boolean,
  ) => {
    const isActive = activeTab === v.id;
    const label = t(v.labelKey, locale) === v.labelKey ? v.fallback : t(v.labelKey, locale);
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
          onClick={() => tryTabChange(v.id, locked)}
          title={locked ? `${label} (locked — no access)` : `${label} — ${v.desc}`}
          aria-label={label}
          aria-current={isActive ? 'page' : undefined}
          className={`relative w-10 h-10 rounded-md flex items-center justify-center transition-colors ${
            isActive
              ? 'rail-active-bg text-[var(--accent)]'
              : locked
                ? 'text-[var(--text-muted)]/40 hover:text-[var(--text-muted)]/60'
                : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
          }`}
        >
          <v.icon className="w-[18px] h-[18px]" />
          {locked && (
            <Lock
              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[var(--rail-bg)] rounded-full p-0.5"
              style={{ color: 'var(--text-muted)' }}
            />
          )}
        </button>
      </li>
    );
  };

  // Tiny section label glyph between groups — narrow capitalized hint
  // showing whose section this is. Helps a viewer instantly understand
  // why some icons are locked.
  const SectionLabel = ({ text, locked }: { text: string; locked: boolean }) => (
    <div
      className="my-1 text-[8px] uppercase tracking-widest font-bold text-center select-none"
      style={{ color: locked ? 'var(--text-muted)' : 'var(--text-secondary)', opacity: 0.7 }}
      aria-hidden
    >
      {text}
    </div>
  );

  return (
    <>
      {/* Desktop + tablet: vertical 56px rail. Mobile (<sm) becomes a
          horizontal bottom nav with a condensed view set. */}
      <nav
        className="hidden sm:flex flex-col items-center py-2 gap-0.5 bg-[var(--rail-bg)] border-r border-[var(--rule)] flex-shrink-0 w-14 z-30 overflow-y-auto"
        aria-label="Primary navigation"
      >
        {/* Logo — opens the stories drawer */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="w-10 h-10 rounded-md flex items-center justify-center text-[var(--accent-ink)] font-display font-bold text-base mb-1 transition-colors flex-shrink-0"
          style={{ background: 'var(--accent)' }}
          aria-label="Open stories drawer"
          title="Stories"
        >
          K
        </button>

        <div className="w-8 h-px bg-[var(--rule)] my-1 flex-shrink-0" aria-hidden />

        {/* Dashboard — always visible */}
        <ul className="flex flex-col gap-0.5 flex-shrink-0">
          {GENERAL_VIEWS.filter((v) => v.id === 'dashboard').map((v) => renderItem(v, false))}
        </ul>

        {/* Writer section */}
        <SectionLabel text="Writer" locked={!canWrite} />
        <ul className="flex flex-col gap-0.5 flex-shrink-0">
          {WRITER_VIEWS.map((v) => renderItem(v, !canWrite))}
        </ul>

        {/* Director section */}
        <SectionLabel text="Director" locked={!canDirect} />
        <ul className="flex flex-col gap-0.5 flex-shrink-0">
          {DIRECTOR_VIEWS.map((v) => renderItem(v, !canDirect))}
        </ul>

        {/* General — workspace always visible */}
        <div className="w-8 h-px bg-[var(--rule)] my-2 flex-shrink-0" aria-hidden />
        <ul className="flex flex-col gap-0.5 flex-shrink-0">
          {GENERAL_VIEWS.filter((v) => v.id === 'workspace').map((v) => renderItem(v, false))}
        </ul>

        {/* Spacer pushes Settings + avatar to the bottom */}
        <div className="flex-1 min-h-2" />

        <button
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
          className="w-10 h-10 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)] transition-colors flex-shrink-0"
        >
          <Settings className="w-[18px] h-[18px]" />
        </button>

        <button
          onClick={() => onOpenProfile?.()}
          title={user?.displayName || user?.email || 'You'}
          aria-label="Open user menu"
          className="avatar-gradient w-10 h-10 rounded-full overflow-hidden flex items-center justify-center transition-transform hover:scale-[1.04] flex-shrink-0"
        >
          {user?.photoURL
            ? <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
            : <span className="text-xs font-semibold text-white drop-shadow">
                {(user?.displayName || user?.email || 'Y').charAt(0).toUpperCase()}
              </span>}
        </button>
      </nav>

      {/* Mobile bottom nav — condensed: Stories + 5 most-used icons */}
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
        {/* Compressed mobile: writer + director + plot + dashboard + workspace */}
        {[
          { id: 'writer',    fallback: 'Writer',    icon: PenLine,     locked: !canWrite },
          { id: 'director',  fallback: 'Director',  icon: Clapperboard, locked: !canDirect },
          { id: 'plot',      fallback: 'Plot',      icon: LayoutGrid,  locked: !canDirect },
          { id: 'dashboard', fallback: 'Dashboard', icon: Sparkles,    locked: false },
          { id: 'workspace', fallback: 'Workspace', icon: Briefcase,   locked: false },
        ].map((v) => {
          const isActive = activeTab === v.id;
          return (
            <button
              key={v.id}
              onClick={() => tryTabChange(v.id, v.locked)}
              aria-label={v.fallback}
              aria-current={isActive ? 'page' : undefined}
              className={`relative w-9 h-9 rounded-md flex items-center justify-center transition-colors ${
                isActive
                  ? 'rail-active-bg text-[var(--accent)]'
                  : v.locked
                    ? 'text-[var(--text-muted)]/40'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--hover)]'
              }`}
            >
              <v.icon className="w-[18px] h-[18px]" />
              {v.locked && (
                <Lock className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[var(--rail-bg)] rounded-full p-0.5" style={{ color: 'var(--text-muted)' }} />
              )}
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
                    <div
                      key={story.id}
                      className={`group/story w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                        isActive
                          ? 'rail-active-bg text-[var(--accent)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
                      }`}
                    >
                      <button
                        onClick={() => { onStoryChange(story.id); setDrawerOpen(false); }}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: storyTypeColor(story.type) }}
                          aria-hidden
                        />
                        <span className="flex-1 truncate font-medium">{story.title}</span>
                        {isActive && <ChevronRight className="w-3 h-3 flex-shrink-0" />}
                      </button>
                      {onDeleteStory && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteStory(story.id); }}
                          title="Delete story"
                          className="p-1 rounded text-[var(--text-muted)] opacity-0 group-hover/story:opacity-100 hover:text-[var(--danger)] hover:bg-[var(--hover)] transition-all flex-shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
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
