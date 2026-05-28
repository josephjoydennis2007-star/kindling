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
  FileText,
  Download,
  Upload,
  PanelLeftClose,
  PanelLeftOpen,
  Lightbulb,
  X,
  Briefcase,
  Bot,
  Users2,
} from 'lucide-react';
import type { Story } from '@/types';

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

const tabs = [
  { id: 'writer', label: 'Writer', icon: PenLine },
  { id: 'director', label: 'Director', icon: Clapperboard },
  { id: 'plot', label: 'Plot', icon: LayoutGrid },
  { id: 'workspace', label: 'Workspace', icon: Briefcase },
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
  const [showStories, setShowStories] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const currentStory = stories.find(s => s.id === activeStoryId);

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

        {/* Story selector */}
        {!collapsed && (
          <div className="relative">
            <button
              onClick={() => setShowStories(!showStories)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-[var(--card)] rounded-lg border border-[var(--border)] hover:border-[var(--accent)] transition-all text-left"
            >
              <FileText className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
              <span className="text-xs font-medium truncate flex-1">
                {currentStory?.title || 'Select Story'}
              </span>
              <ChevronDown className={`w-3 h-3 text-[var(--text-muted)] transition-transform ${showStories ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showStories && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="absolute top-full left-0 right-0 mt-1 bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-xl z-50 overflow-hidden"
                >
                  {stories.map(story => (
                    <button
                      key={story.id}
                      onClick={() => {
                        onStoryChange(story.id);
                        setShowStories(false);
                        onCloseMobile();
                      }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-[var(--hover)] transition-colors ${
                        story.id === activeStoryId ? 'text-[var(--accent)] bg-[var(--hover)]' : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {story.title}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      onShowStorySelector();
                      setShowStories(false);
                      onCloseMobile();
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-[var(--accent)] hover:bg-[var(--hover)] border-t border-[var(--border)] flex items-center gap-2"
                  >
                    <Plus className="w-3 h-3" /> New Story
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Tabs — wrap into rows so they aren't crushed when 4 are present */}
      <div className={`p-3 border-b border-[var(--border)] space-y-2 ${collapsed ? 'flex flex-col gap-1' : ''}`}>
        <div className="grid grid-cols-2 gap-2">
          {tabs.map((tab) => (
            <motion.button
              key={tab.id}
              onClick={() => handleNav(() => onTabChange(tab.id))}
              title={tab.label}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.95 }}
              className={`flex flex-col items-center justify-center gap-1.5 px-3 py-3 rounded-xl text-[11px] font-semibold uppercase tracking-wider transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 text-white shadow-lg ring-2 ring-offset-2 ring-offset-[var(--bg)] ring-purple-400'
                  : 'text-[var(--text-secondary)] bg-[var(--card)]/60 hover:bg-[var(--card)] border border-[var(--border)]/50 hover:border-[var(--accent)]/50'
              }`}
            >
              <tab.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>{tab.label}</span>}
            </motion.button>
          ))}
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
                label="Instructions"
                collapsed={collapsed}
                active={rightPanel === 'instructions'}
                onClick={() => handleNav(() => onTogglePanel('instructions'))}
              />
            )}
            <SidebarItem
              icon={StickyNote}
              label="Notes"
              collapsed={collapsed}
              active={rightPanel === 'notes'}
              onClick={() => handleNav(() => onTogglePanel('notes'))}
            />
            <SidebarItem
              icon={Users}
              label="Characters"
              collapsed={collapsed}
              active={rightPanel === 'characters'}
              onClick={() => handleNav(() => onTogglePanel('characters'))}
            />
            <SidebarItem
              icon={History}
              label="History"
              collapsed={collapsed}
              active={rightPanel === 'history'}
              onClick={() => handleNav(() => onTogglePanel('history'))}
            />
            <SidebarItem
              icon={Users2}
              label="Collaborate"
              collapsed={collapsed}
              active={rightPanel === 'collab'}
              onClick={() => handleNav(() => onTogglePanel('collab'))}
            />
            <SidebarItem
              icon={Bot}
              label="AI Helper"
              collapsed={collapsed}
              active={rightPanel === 'ai'}
              onClick={() => handleNav(() => onTogglePanel('ai'))}
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
              label="App Settings"
              collapsed={collapsed}
              onClick={() => handleNav(() => onOpenSettings?.())}
            />
            <SidebarItem
              icon={Download}
              label="Export"
              collapsed={collapsed}
              onClick={() => handleNav(onExport)}
            />
            <SidebarItem
              icon={Upload}
              label="Import"
              collapsed={collapsed}
              onClick={() => handleNav(onImport)}
            />
          </div>
        </div>
      </div>

      {/* User chip */}
      {user && (
        <div className="relative border-t border-[var(--border)] p-2">
          <button
            onClick={() => setShowUser((v) => !v)}
            className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-[var(--hover)] transition-all ${collapsed ? 'justify-center' : ''}`}
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 via-red-500 to-pink-500 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden flex-shrink-0">
              {user.photoURL ? <img src={user.photoURL} alt="" className="w-full h-full object-cover" /> : (user.displayName || user.email || 'U').charAt(0).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0 text-left">
                <div className="text-xs font-semibold text-[var(--text)] truncate">{user.displayName || user.email || 'You'}</div>
                <div className="text-[10px] text-[var(--text-muted)] truncate">{user.email || 'Local profile'}</div>
              </div>
            )}
          </button>
          {showUser && (
            <div className="absolute bottom-full left-2 right-2 mb-1 bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-2xl overflow-hidden z-50">
              <button
                onClick={() => { setShowUser(false); onOpenProfile?.(); }}
                className="w-full text-left px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
              >
                Edit profile
              </button>
              <button
                onClick={() => { setShowUser(false); onSignOut?.(); }}
                className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

function SidebarItem({ icon: Icon, label, active, onClick, collapsed }: { icon: any; label: string; active?: boolean; onClick: () => void; collapsed?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-all text-left ${
        collapsed ? 'justify-center' : ''
      } ${
        active
          ? 'bg-[var(--active)] text-[var(--accent)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
      }`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {!collapsed && <span className="font-medium">{label}</span>}
    </button>
  );
}
