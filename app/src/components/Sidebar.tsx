import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PenLine,
  Clapperboard,
  LayoutGrid,
  StickyNote,
  History,
  Users,
  Settings,
  Plus,
  ChevronDown,
  Download,
  Upload,
  PanelLeftClose,
  PanelLeftOpen,
  Lightbulb,
  X,
  Briefcase,
  Bot,
  Users2,
  Sparkles,
  Image as ImageIcon,
  CalendarDays,
  MessageSquareQuote,
  Mic2,
  Search,
  GitCompare,
  Wand2,
} from 'lucide-react';
import type { Story } from '@/types';
import { t } from '@/lib/i18n';
import { useAppStore } from '@/store/useAppStore';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: any) => void;
  onTogglePanel: (panel: any) => void;
  rightPanel: string | null;
  stories: Story[];
  activeStoryId: string | null;
  onStoryChange: (id: string) => void;
  onShowStorySelector: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onExport: () => void;
  onImport: () => void;
  onOpenSettings?: () => void;
}

const TAB_DEFS = [
  { id: 'dashboard', key: 'tab.dashboard', icon: Sparkles },
  { id: 'writer',    key: 'tab.writer',    icon: PenLine },
  { id: 'director',  key: 'tab.director',  icon: Clapperboard },
  { id: 'plot',      key: 'tab.plot',      icon: LayoutGrid },
  { id: 'calendar',  key: 'tab.calendar',  icon: CalendarDays },
  { id: 'workspace', key: 'tab.workspace', icon: Briefcase },
];

export default function Sidebar({
  activeTab,
  onTabChange,
  onTogglePanel,
  rightPanel,
  stories,
  activeStoryId,
  onStoryChange,
  onShowStorySelector,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  onExport,
  onImport,
  onOpenSettings,
  user,
  onOpenProfile,
  onSignOut,
}: SidebarProps & { user?: { displayName?: string | null; photoURL?: string | null; email?: string | null } | null; onOpenProfile?: () => void; onSignOut?: () => void }) {
  const [showUser, setShowUser] = useState(false);
  const currentStory = stories.find(s => s.id === activeStoryId);
  // Backwards-compat: the old dropdown state is no longer used since stories
  // are shown inline now.
  const showStories = false;
  const locale = (useAppStore((s) => (s.settings as any).locale) as ('en'|'es'|'fr')) || 'en';

  const handleNav = (fn: () => void) => {
    fn();
    onCloseMobile();
  };

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      {/* Header */}
      <div className="p-3 border-b border-[var(--border)]">
        <div className={`flex items-center gap-3 mb-3 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg flex-shrink-0">
            <PenLine className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-bold tracking-wide truncate">Kindling</h1>
              <p className="text-[10px] text-[var(--text-muted)]">Studio for writers &amp; directors</p>
            </div>
          )}
          {/* Desktop collapse toggle */}
          <button
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden md:flex p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] transition-all flex-shrink-0"
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
          {/* Mobile close */}
          <button
            onClick={onCloseMobile}
            title="Close menu"
            className="md:hidden p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] transition-all flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Story switcher — inline list (Notion-style). Each entry shows a
            color dot tied to its type. Click to switch, "+ New" at the bottom. */}
        {!collapsed && (
          <div className="space-y-0.5">
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Stories</span>
              <span className="text-[9px] text-[var(--text-muted)]">{stories.length}</span>
            </div>
            <div className="max-h-44 overflow-y-auto pr-1 -mr-1">
              {stories.length === 0 && (
                <p className="text-[10px] text-[var(--text-muted)] px-2 py-1.5 italic">No stories yet</p>
              )}
              {stories.map((story) => {
                const isActive = story.id === activeStoryId;
                const typeColor = storyTypeColor(story.type);
                return (
                  <button
                    key={story.id}
                    onClick={() => { onStoryChange(story.id); onCloseMobile(); }}
                    title={`${story.title} · ${story.type || 'movie'}`}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors ${
                      isActive ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: typeColor }} aria-hidden />
                    <span className="truncate flex-1 font-medium">{story.title}</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => { onShowStorySelector(); onCloseMobile(); }}
              className="w-full mt-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] text-[var(--accent)] hover:bg-[var(--hover)] border border-dashed border-[var(--border)]"
            >
              <Plus className="w-3 h-3" /> New story
            </button>
            <div className="hidden">{showStories ? '' : ''}{currentStory?.title}</div>
          </div>
        )}
      </div>

      {/* Tabs — wrap into rows so they aren't crushed when 4 are present */}
      <div className={`p-3 border-b border-[var(--border)] space-y-2 ${collapsed ? 'flex flex-col gap-1' : ''}`}>
        <div className="grid grid-cols-2 gap-2">
          {TAB_DEFS.map((tab) => {
            const label = t(tab.key, locale);
            return (
              <motion.button
                key={tab.id}
                onClick={() => handleNav(() => onTabChange(tab.id))}
                title={label}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.95 }}
                className={`flex flex-col items-center justify-center gap-1.5 px-3 py-3 rounded-xl text-[11px] font-semibold uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 text-white shadow-lg ring-2 ring-offset-2 ring-offset-[var(--bg)] ring-purple-400'
                    : 'text-[var(--text-secondary)] bg-[var(--card)]/60 hover:bg-[var(--card)] border border-[var(--border)]/50 hover:border-[var(--accent)]/50'
                }`}
              >
                <tab.icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span>{label}</span>}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Story Tools */}
        <div className="mb-4">
          {!collapsed && (
            <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2 px-2">
              Story Tools
            </h3>
          )}
          <div className="space-y-0.5">
            {activeTab === 'writer' && (
              <SidebarItem
                icon={Lightbulb}
                label={t('sb.instructions', locale)}
                collapsed={collapsed}
                active={rightPanel === 'instructions'}
                onClick={() => handleNav(() => onTogglePanel('instructions'))}
              />
            )}
            <SidebarItem
              icon={StickyNote}
              label={t('sb.notes', locale)}
              collapsed={collapsed}
              active={rightPanel === 'notes'}
              onClick={() => handleNav(() => onTogglePanel('notes'))}
            />
            <SidebarItem
              icon={Users}
              label={t('sb.characters', locale)}
              collapsed={collapsed}
              active={rightPanel === 'characters'}
              onClick={() => handleNav(() => onTogglePanel('characters'))}
            />
            <SidebarItem
              icon={History}
              label={t('sb.history', locale)}
              collapsed={collapsed}
              active={rightPanel === 'history'}
              onClick={() => handleNav(() => onTogglePanel('history'))}
            />
            <SidebarItem
              icon={Users2}
              label={t('sb.collaborate', locale)}
              collapsed={collapsed}
              active={rightPanel === 'collab'}
              onClick={() => handleNav(() => onTogglePanel('collab'))}
            />
            <SidebarItem
              icon={Bot}
              label={t('sb.ai_helper', locale)}
              collapsed={collapsed}
              active={rightPanel === 'ai'}
              onClick={() => handleNav(() => onTogglePanel('ai'))}
            />
            <SidebarItem
              icon={ImageIcon}
              label={t('sb.assets', locale)}
              collapsed={collapsed}
              active={rightPanel === 'assets'}
              onClick={() => handleNav(() => onTogglePanel('assets'))}
            />
          </div>
        </div>

        {/* AI Tools — features that used to be keyboard-only.
            Each button dispatches a custom event that App.tsx listens for. */}
        <div className="mb-4">
          {!collapsed && (
            <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2 px-2">
              {t('sb.ai_tools', locale)}
            </h3>
          )}
          <div className="space-y-0.5">
            <SidebarItem
              icon={MessageSquareQuote}
              label={t('sb.dialogue_coach', locale)}
              collapsed={collapsed}
              shortcut="⇧⌘D"
              onClick={() => handleNav(() => document.dispatchEvent(new CustomEvent('writer:openCoach')))}
            />
            <SidebarItem
              icon={Mic2}
              label={t('sb.table_read', locale)}
              collapsed={collapsed}
              shortcut="⇧⌘R"
              onClick={() => handleNav(() => document.dispatchEvent(new CustomEvent('writer:openTableRead')))}
            />
            <SidebarItem
              icon={Wand2}
              label={t('sb.style_assist', locale)}
              collapsed={collapsed}
              shortcut="⇧⌘S"
              onClick={() => handleNav(() => document.dispatchEvent(new CustomEvent('writer:openStyle')))}
            />
            <SidebarItem
              icon={Search}
              label={t('sb.find_replace', locale)}
              collapsed={collapsed}
              shortcut="⌘F"
              onClick={() => handleNav(() => document.dispatchEvent(new CustomEvent('writer:findOpen')))}
            />
            <SidebarItem
              icon={GitCompare}
              label={t('sb.compare', locale)}
              collapsed={collapsed}
              shortcut="⇧⌘C"
              onClick={() => handleNav(() => document.dispatchEvent(new CustomEvent('writer:openCompare')))}
            />
          </div>
        </div>

        {/* Settings */}
        <div>
          {!collapsed && (
            <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2 px-2">
              Settings
            </h3>
          )}
          <div className="space-y-0.5">
            <SidebarItem
              icon={Settings}
              label={t('sb.app_settings', locale)}
              collapsed={collapsed}
              onClick={() => handleNav(() => onOpenSettings?.())}
            />
            <SidebarItem
              icon={Download}
              label={t('sb.export', locale)}
              collapsed={collapsed}
              onClick={() => handleNav(onExport)}
            />
            <SidebarItem
              icon={Upload}
              label={t('sb.import', locale)}
              collapsed={collapsed}
              onClick={() => handleNav(onImport)}
            />
          </div>
        </div>
      </div>

      {/* User dock — always visible. In local-only mode the user is null, but
          we still show a profile chip with "You / Local profile" so it behaves
          like a real user dock (Claude-app style). */}
      <div className="relative border-t border-[var(--border)] p-2 flex-shrink-0 bg-[var(--sidebar)]">
        <button
          onClick={() => setShowUser((v) => !v)}
          className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-[var(--hover)] transition-all ${collapsed ? 'justify-center' : ''}`}
          title={user?.displayName || user?.email || 'You'}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 via-red-500 to-pink-500 flex items-center justify-center text-xs font-bold text-white overflow-hidden flex-shrink-0 ring-2 ring-[var(--bg)] shadow">
            {user?.photoURL
              ? <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
              : (user?.displayName || user?.email || 'Y').charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0 text-left">
              <div className="text-xs font-semibold text-[var(--text)] truncate">
                {user?.displayName || user?.email || 'You'}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] truncate flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {user?.email || 'Local profile'}
              </div>
            </div>
          )}
          {!collapsed && (
            <ChevronDown className={`w-3 h-3 text-[var(--text-muted)] transition-transform ${showUser ? 'rotate-180' : ''}`} />
          )}
        </button>

        <AnimatePresence>
          {showUser && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="absolute bottom-full left-2 right-2 mb-1 bg-[var(--panel)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden z-50"
            >
              <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--card)]">
                <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Account</div>
                <div className="text-xs text-[var(--text)] truncate font-medium">{user?.displayName || 'You'}</div>
                <div className="text-[10px] text-[var(--text-muted)] truncate">{user?.email || 'No account — local only'}</div>
              </div>
              <button
                onClick={() => { setShowUser(false); onOpenProfile?.(); }}
                className="w-full text-left px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)] flex items-center gap-2"
              >
                <Users className="w-3.5 h-3.5" />
                Edit profile
              </button>
              <button
                onClick={() => { setShowUser(false); onOpenSettings?.(); }}
                className="w-full text-left px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)] flex items-center gap-2"
              >
                <Settings className="w-3.5 h-3.5" />
                Settings
              </button>
              <button
                onClick={() => { setShowUser(false); onSignOut?.(); }}
                className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 border-t border-[var(--border)] flex items-center gap-2"
              >
                <X className="w-3.5 h-3.5" />
                {user ? 'Sign out' : 'Reset session'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  );
}

/** Color dot per story type — matches the Story Selector theme. */
function storyTypeColor(type?: string): string {
  switch (type) {
    case 'tv-series': return '#ec4899';
    case 'tv-show': return '#f59e0b';
    case 'mini-series': return '#6366f1';
    case 'thriller': return '#dc2626';
    case 'documentary': return '#10b981';
    case 'short-film': return '#06b6d4';
    case 'music-video': return '#a855f7';
    case 'commercial': return '#f97316';
    case 'youtube': return '#ef4444';
    case 'web-series': return '#0ea5e9';
    case 'stage-play': return '#9333ea';
    case 'animation': return '#14b8a6';
    case 'movie':
    default: return '#3b82f6';
  }
}

function SidebarItem({ icon: Icon, label, active, onClick, collapsed, shortcut }: { icon: any; label: string; active?: boolean; onClick: () => void; collapsed?: boolean; shortcut?: string }) {
  return (
    <button
      onClick={onClick}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-all text-left ${
        collapsed ? 'justify-center' : ''
      } ${
        active
          ? 'bg-[var(--active)] text-[var(--accent)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
      }`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {!collapsed && (
        <>
          <span className="font-medium flex-1">{label}</span>
          {shortcut && (
            <span className="text-[9px] text-[var(--text-muted)] tabular-nums select-none">
              {shortcut}
            </span>
          )}
        </>
      )}
    </button>
  );
}
