import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MoreHorizontal, FileDown, Upload, MessageSquareQuote, Mic2, Wand2,
  GitCompare, Search, Shuffle, Focus, Eye, BookOpen, Sparkles, ChevronRight,
  LogOut, UserCircle2,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

/**
 * TopBar — slim 44px row above the workspace.
 *
 * Houses:
 *   - LEFT  : Active story title + active tab breadcrumb
 *   - RIGHT : Focus button + ⋯ action menu (everything else)
 *
 * The ⋯ menu is the single discoverability surface for all AI tools,
 * import/export, and account actions. It's where Dialogue Coach, Table
 * Read, Compare, "What if", Style assistant, Find live now — replacing
 * the old toolbar icon strip + sidebar AI Tools list.
 *
 * The menu is grouped, keyboard-navigable, and each item shows its
 * shortcut. Inspired by Notion / Linear / Arc action menus.
 */

interface Props {
  activeTab: string;
  isFocusMode: boolean;
  onToggleFocusMode: () => void;
  onOpenExport: () => void;
  onOpenSettings: () => void;
  onSignOut?: () => void;
  storyTitle?: string;
}

const FMT_MOD = (() => {
  if (typeof navigator === 'undefined') return 'Ctrl';
  return /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
})();
const FMT_SHIFT = FMT_MOD === '⌘' ? '⇧' : 'Shift';

export default function TopBar({
  activeTab, isFocusMode, onToggleFocusMode, onOpenExport, onOpenSettings, onSignOut, storyTitle,
}: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const activeStoryId = useAppStore((s) => s.activeStoryId);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <header className="h-11 flex items-center px-3 border-b border-[var(--rule)] bg-[var(--bg)] flex-shrink-0">
      {/* Story title + active tab breadcrumb */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-xs font-semibold text-[var(--text)] truncate">
          {storyTitle || 'Untitled story'}
        </span>
        <ChevronRight className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0" />
        <span className="text-xs text-[var(--text-muted)] capitalize truncate">
          {tabLabel(activeTab)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleFocusMode}
          title={isFocusMode ? 'Exit focus mode' : `Focus mode (${FMT_MOD}+.)`}
          className={`flex items-center gap-1.5 px-2.5 h-7 rounded-md text-[11px] font-semibold transition-colors ${
            isFocusMode
              ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/40'
              : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
          }`}
        >
          <Focus className="w-3.5 h-3.5" />
          {isFocusMode ? 'Exit' : 'Focus'}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOpen((v) => !v)}
            title="More actions"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={open}
            className={`flex items-center justify-center w-8 h-7 rounded-md transition-colors ${
              open
                ? 'bg-[var(--surface-2)] text-[var(--text)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
            }`}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          <AnimatePresence>
            {open && (
              <motion.div
                role="menu"
                aria-label="Actions"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute top-full right-0 mt-1 w-[260px] bg-[var(--panel)] border border-[var(--rule)] rounded-md shadow-lg overflow-hidden z-50"
              >
                <Group title="AI tools" disabled={!activeStoryId}>
                  <Item
                    icon={MessageSquareQuote}
                    label="Dialogue Coach"
                    shortcut={`${FMT_SHIFT}${FMT_MOD}D`}
                    onClick={() => { setOpen(false); document.dispatchEvent(new CustomEvent('writer:openCoach')); }}
                  />
                  <Item
                    icon={Mic2}
                    label="Table Read"
                    shortcut={`${FMT_SHIFT}${FMT_MOD}R`}
                    onClick={() => { setOpen(false); document.dispatchEvent(new CustomEvent('writer:openTableRead')); }}
                  />
                  <Item
                    icon={Shuffle}
                    label="What if…?"
                    shortcut={`${FMT_SHIFT}${FMT_MOD}W`}
                    onClick={() => {
                      setOpen(false);
                      const sel = window.getSelection();
                      const text = sel?.toString().trim() || '';
                      if (!text) {
                        import('sonner').then(({ toast }) => toast.error('Select a passage in the script first.'));
                        return;
                      }
                      document.dispatchEvent(new CustomEvent('writer:openAltTake', { detail: { text, label: 'Selection' } }));
                    }}
                  />
                  <Item
                    icon={Wand2}
                    label="Style Assistant"
                    shortcut={`${FMT_SHIFT}${FMT_MOD}S`}
                    onClick={() => { setOpen(false); document.dispatchEvent(new CustomEvent('writer:openStyle')); }}
                  />
                </Group>

                <Group title="Find & compare" disabled={!activeStoryId}>
                  <Item
                    icon={Search}
                    label="Find & Replace"
                    shortcut={`${FMT_MOD}F`}
                    onClick={() => { setOpen(false); document.dispatchEvent(new CustomEvent('writer:findOpen')); }}
                  />
                  <Item
                    icon={GitCompare}
                    label="Compare Scripts"
                    shortcut={`${FMT_SHIFT}${FMT_MOD}C`}
                    onClick={() => { setOpen(false); document.dispatchEvent(new CustomEvent('writer:openCompare')); }}
                  />
                </Group>

                <Group title="Read & format">
                  <Item
                    icon={BookOpen}
                    label="Reading mode"
                    onClick={() => { setOpen(false); document.dispatchEvent(new CustomEvent('writer:toggleReading')); }}
                  />
                  <Item
                    icon={Eye}
                    label="Focus typing"
                    onClick={() => { setOpen(false); document.dispatchEvent(new CustomEvent('writer:toggleFocusTyping')); }}
                  />
                  <Item
                    icon={Sparkles}
                    label="Command palette"
                    shortcut={`${FMT_MOD}K`}
                    onClick={() => { setOpen(false); document.dispatchEvent(new CustomEvent('writer:openPalette')); }}
                  />
                </Group>

                <Group title="Files">
                  <Item
                    icon={FileDown}
                    label="Export…"
                    shortcut={`${FMT_SHIFT}${FMT_MOD}E`}
                    onClick={() => { setOpen(false); onOpenExport(); }}
                  />
                  <Item
                    icon={Upload}
                    label="Import…"
                    onClick={() => { setOpen(false); document.dispatchEvent(new CustomEvent('app:import')); }}
                  />
                </Group>

                <Group title="Account">
                  <Item
                    icon={UserCircle2}
                    label="Settings"
                    shortcut={`${FMT_MOD},`}
                    onClick={() => { setOpen(false); onOpenSettings(); }}
                  />
                  {onSignOut && (
                    <Item
                      icon={LogOut}
                      label="Sign out"
                      danger
                      onClick={() => { setOpen(false); onSignOut(); }}
                    />
                  )}
                </Group>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Group({
  title, disabled, children,
}: { title: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <section
      role="group"
      aria-label={title}
      className={`py-1 border-b border-[var(--rule)] last:border-0 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
    >
      <div className="px-3 pt-1.5 pb-1 text-[9px] uppercase tracking-widest text-[var(--text-muted)] font-bold">
        {title}
      </div>
      {children}
    </section>
  );
}

function Item({
  icon: Icon, label, shortcut, onClick, danger,
}: { icon: any; label: string; shortcut?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      role="menuitem"
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[12px] transition-colors ${
        danger
          ? 'text-[var(--danger)] hover:bg-[var(--danger)]/10'
          : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
      }`}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="flex-1 font-medium">{label}</span>
      {shortcut && (
        <span className="text-[10px] text-[var(--text-muted)] tabular-nums select-none">
          {shortcut}
        </span>
      )}
    </button>
  );
}

function tabLabel(tab: string): string {
  switch (tab) {
    case 'dashboard': return 'Home';
    case 'writer':    return 'Writer';
    case 'director':  return 'Director';
    case 'plot':      return 'Plot';
    case 'calendar':  return 'Calendar';
    case 'workspace': return 'Workspace';
    default:          return tab;
  }
}
