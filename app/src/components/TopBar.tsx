import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MoreHorizontal, FileDown, Upload, MessageSquareQuote, Mic2, Wand2,
  GitCompare, Search, Shuffle, Focus, Eye, BookOpen, Sparkles, ChevronRight,
  LogOut, UserCircle2, Share2, UserPlus, PanelRight, Lightbulb, StickyNote,
  Users, History as HistoryIcon, Users2, Bot, Image as ImageIcon, X, Stethoscope,
  MessageCircle, Briefcase, ExternalLink, Copy,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { openInlineCommentFromSelection } from './InlineCommentPopup';

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
  /** Currently open right-panel name (or null if closed). Drives Tools button active state. */
  currentPanel?: string | null;
  /** Called when the user picks a panel from the Tools dropdown. */
  onOpenPanel?: (panel: string) => void;
  /** Optional role pill shown next to the story title. null = local-only
   *  story, no badge. Owner shows "Owner". */
  roleBadge?: { role: 'writer' | 'director' | 'producer' | 'both'; isOwner: boolean } | null;
  /** Number of pending invites for the current user across all stories.
   *  Shown as a dot on the Tools button + a count on the Collaborate item. */
  pendingInvites?: number;
  /** Unread comments on the active story. Shown as a dot on Tools + a
   *  count on the Comments item. */
  unreadComments?: number;
}

// Story tools dropdown menu — same panels as the ContextPanel footer, but
// reachable from every tab (Writer included). Mirrors ContextPanel's labels.
const TOOL_ITEMS: Array<{ key: string; label: string; icon: any }> = [
  { key: 'instructions', label: 'Instructions', icon: Lightbulb },
  { key: 'notes',        label: 'Notes',        icon: StickyNote },
  { key: 'characters',   label: 'Characters',   icon: Users },
  { key: 'comments',     label: 'Comments',     icon: MessageCircle },
  { key: 'history',      label: 'History',      icon: HistoryIcon },
  { key: 'collab',       label: 'Collaborate',  icon: Users2 },
  { key: 'ai',           label: 'AI Helper',    icon: Bot },
  { key: 'assets',       label: 'Assets',       icon: ImageIcon },
];

const FMT_MOD = (() => {
  if (typeof navigator === 'undefined') return 'Ctrl';
  return /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
})();
const FMT_SHIFT = FMT_MOD === '⌘' ? '⇧' : 'Shift';

export default function TopBar({
  activeTab, isFocusMode, onToggleFocusMode, onOpenExport, onOpenSettings, onSignOut, storyTitle,
  currentPanel, onOpenPanel, roleBadge,
  pendingInvites = 0, unreadComments = 0,
}: Props) {
  // Total badge count on the Tools button — any non-zero shows the dot.
  const totalBadge = (pendingInvites || 0) + (unreadComments || 0);
  const [open, setOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  // "My Tools" quick-launch dropdown — surfaces the user's saved
  // workspace links directly in the top bar so they can jump to
  // Runway / Pollinations / Frame.io / whatever without leaving the
  // active story. Distinct from the Tools menu (which is story-side
  // inspectors).
  const [myToolsOpen, setMyToolsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const toolsRef = useRef<HTMLDivElement | null>(null);
  const myToolsRef = useRef<HTMLDivElement | null>(null);
  const activeStoryId = useAppStore((s) => s.activeStoryId);
  // Workspace links live on the store. Used both by the workspace tab
  // and now by this header dropdown.
  const workspaceLinks = useAppStore((s) => s.workspaceLinks);
  const deleteWorkspaceLink = useAppStore((s) => s.deleteWorkspaceLink);

  // Close Tools popover on outside click + Escape.
  useEffect(() => {
    if (!toolsOpen) return;
    const onClick = (e: MouseEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) setToolsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setToolsOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [toolsOpen]);

  // Close My Tools popover on outside click + Escape.
  useEffect(() => {
    if (!myToolsOpen) return;
    const onClick = (e: MouseEvent) => {
      if (myToolsRef.current && !myToolsRef.current.contains(e.target as Node)) setMyToolsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMyToolsOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [myToolsOpen]);

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
        {roleBadge && (
          <span
            title={roleBadge.isOwner ? 'You own this story' : `Your role on this story: ${roleLabel(roleBadge.role)}`}
            className="hidden sm:inline-flex items-center gap-1 px-1.5 h-5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] text-[9.5px] uppercase tracking-wider font-bold flex-shrink-0"
          >
            {roleBadge.isOwner ? 'Owner' : roleLabel(roleBadge.role)}
          </span>
        )}
        <ChevronRight className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0" />
        <span className="text-xs text-[var(--text-muted)] capitalize truncate">
          {tabLabel(activeTab)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Inline Comment button — opens the floating comment popup
            anchored to the current text selection (if any). Available on
            Writer / Director / Plot tabs where commenting makes sense.
            Also triggerable via Cmd/Ctrl+Shift+M or by right-clicking
            in those views.
            CRITICAL: onMouseDown calls preventDefault() so clicking this
            button does NOT defocus / clear the user's text selection.
            Without it, the act of clicking the button blurs whatever
            input/textarea/editor held the selection and we end up reading
            an empty selection in onClick. The button still fires onClick
            normally because mousedown.preventDefault only blocks the
            FOCUS-change side effect, not the click. */}
        {(activeTab === 'writer' || activeTab === 'director' || activeTab === 'plot') && activeStoryId && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => openInlineCommentFromSelection(activeTab)}
            title={`Add comment (${FMT_SHIFT}${FMT_MOD}M)`}
            className="flex items-center gap-1.5 px-2 h-7 rounded-md text-[11px] font-semibold transition-colors text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            {/* Label hidden on screens narrower than 2xl (1536px) — at the
                user-reported 1366px laptop width the row otherwise clipped
                the rightmost button off the viewport. Icons stay visible
                with tooltips so identity is preserved. */}
            <span className="hidden 2xl:inline">Comment</span>
          </button>
        )}

        <button
          onClick={onToggleFocusMode}
          title={isFocusMode ? 'Exit focus mode' : `Focus mode (${FMT_MOD}+.)`}
          className={`flex items-center gap-1.5 px-2 h-7 rounded-md text-[11px] font-semibold transition-colors ${
            isFocusMode
              ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/40'
              : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
          }`}
        >
          <Focus className="w-3.5 h-3.5" />
          <span className="hidden 2xl:inline">{isFocusMode ? 'Exit' : 'Focus'}</span>
        </button>

        {/* Co-worker button — opens the agentic AI side-drawer. The AI can
            navigate tabs, write screenplay content, create scenes/shots/
            beats/characters/etc. on behalf of the user. This is the
            visible entry point for the "make changes for me" experience. */}
        <button
          onClick={() => document.dispatchEvent(new CustomEvent('app:openAgent'))}
          title="Open AI co-worker — describe what to build and watch it happen"
          aria-label="Open AI co-worker"
          disabled={!activeStoryId}
          className="relative flex items-center gap-1.5 px-2 h-7 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
        >
          <Bot className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
          <span className="hidden 2xl:inline">Co-worker</span>
        </button>

        {/* My Tools — quick-launch dropdown for the user's saved workspace
            links (Runway, Frame.io, Pollinations, any custom URL they
            bookmarked in the Workspace view). Opens each link in a STABLE
            named window per id so re-clicks reuse the existing tab — that
            tab is already signed-in, so the user lands inside their tool
            without re-authentication. */}
        <div className="relative" ref={myToolsRef}>
          <button
            onClick={() => setMyToolsOpen((v) => !v)}
            title="My saved tools — Runway, Frame.io, etc."
            aria-label="My tools"
            aria-haspopup="menu"
            aria-expanded={myToolsOpen}
            className={`relative flex items-center gap-1.5 px-2 h-7 rounded-md text-[11px] font-semibold transition-colors ${
              myToolsOpen
                ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/40'
                : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span className="hidden 2xl:inline">My Tools</span>
            {workspaceLinks && workspaceLinks.length > 0 && (
              <span className="hidden xl:inline-flex items-center justify-center min-w-[16px] h-[14px] px-1 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] text-[9px] font-bold tabular-nums">
                {workspaceLinks.length}
              </span>
            )}
          </button>
          <AnimatePresence>
            {myToolsOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                style={{ transformOrigin: 'top right' }}
                role="menu"
                className="glass-surface absolute right-0 top-full mt-1.5 w-[280px] max-h-[calc(100dvh-4.5rem)] overflow-y-auto overscroll-contain rounded-xl z-[320]"
              >
                <div className="px-3 py-2 border-b border-[var(--rule)] flex items-center justify-between flex-shrink-0">
                  <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">
                    My tools
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {workspaceLinks?.length || 0}
                  </span>
                </div>
                {(!workspaceLinks || workspaceLinks.length === 0) ? (
                  <div className="p-4 text-center">
                    <Briefcase className="w-6 h-6 mx-auto mb-2 text-[var(--text-muted)] opacity-50" />
                    <p className="text-[11px] text-[var(--text-muted)] mb-2">
                      No saved tools yet.
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      Go to the Workspace view to bookmark Runway, Frame.io, or any tool URL you use.
                    </p>
                  </div>
                ) : (
                  <ul className="py-1">
                    {workspaceLinks.map((link) => (
                      <li key={link.id} className="group flex items-center">
                        <button
                          onClick={() => {
                            // Same stable-named-window strategy as the
                            // Workspace tab: re-clicks reuse the already-
                            // signed-in tab instead of opening a duplicate.
                            window.open(link.url, `kindling_tool_${link.id}`);
                            setMyToolsOpen(false);
                          }}
                          className="flex-1 flex items-center gap-2 px-3 py-1.5 text-left text-[11px] hover:bg-[var(--hover)] transition-colors min-w-0"
                        >
                          <ExternalLink className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-[var(--text)] truncate font-semibold">
                              {link.label}
                            </div>
                            <div className="text-[9px] text-[var(--text-muted)] truncate">
                              {link.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                            </div>
                          </div>
                        </button>
                        <button
                          onClick={() => {
                            if (!confirm(`Remove "${link.label}" from your saved tools?`)) return;
                            deleteWorkspaceLink(link.id);
                          }}
                          title="Remove from saved tools"
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--text-muted)] hover:text-[var(--danger)] transition-all"
                          aria-label={`Remove ${link.label}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Story Tools dropdown — open Notes / Characters / History / Collab /
            AI Helper / Assets / Instructions from any tab, not just non-Writer
            tabs. Clicking the currently-open tool again toggles the panel
            closed. */}
        <div className="relative" ref={toolsRef}>
          <button
            onClick={() => setToolsOpen((v) => !v)}
            title={`Story tools${totalBadge ? ` — ${totalBadge} new` : ''}`}
            aria-label="Story tools"
            aria-haspopup="menu"
            aria-expanded={toolsOpen}
            disabled={!activeStoryId}
            className={`relative flex items-center gap-1.5 px-2 h-7 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              currentPanel || toolsOpen
                ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/40'
                : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
            }`}
          >
            <PanelRight className="w-3.5 h-3.5" />
            <span className="hidden 2xl:inline">Tools</span>
            {/* Notification dot — 6px dot in the top-right corner when
                there are pending invites or unread comments. */}
            {totalBadge > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--accent)] border-2 border-[var(--bg)]"
                aria-label={`${totalBadge} unread`}
              />
            )}
          </button>

          <AnimatePresence>
            {toolsOpen && (
              <motion.div
                role="menu"
                aria-label="Story tools"
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                style={{ transformOrigin: 'top right' }}
                className="glass-surface absolute top-full right-0 mt-1.5 w-[224px] rounded-xl max-h-[calc(100dvh-4.5rem)] overflow-y-auto overscroll-contain z-[320]"
              >
                <div className="px-3 pt-2 pb-1 text-[9px] uppercase tracking-widest text-[var(--text-muted)] font-bold">
                  Story tools
                </div>
                {TOOL_ITEMS.map((it) => {
                  const active = currentPanel === it.key;
                  // Per-item badge count for menu items that have a
                  // notification source: Comments (unread) + Collaborate
                  // (pending invites).
                  const itemBadge =
                    it.key === 'comments' ? unreadComments
                    : it.key === 'collab' ? pendingInvites
                    : 0;
                  return (
                    <button
                      key={it.key}
                      role="menuitem"
                      onClick={() => {
                        setToolsOpen(false);
                        onOpenPanel?.(it.key);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[12px] transition-colors ${
                        active
                          ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
                      }`}
                    >
                      <it.icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="flex-1 font-medium">{it.label}</span>
                      {itemBadge > 0 && (
                        <span className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-[var(--accent)]/30 text-[var(--accent)] font-bold">
                          {itemBadge > 99 ? '99+' : itemBadge}
                        </span>
                      )}
                      {active && itemBadge === 0 && (
                        <span className="text-[9.5px] text-[var(--accent)] uppercase tracking-wider">Open</span>
                      )}
                    </button>
                  );
                })}
                {currentPanel && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      setToolsOpen(false);
                      // Toggling the currently-open panel closes it.
                      onOpenPanel?.(currentPanel);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[12px] border-t border-[var(--rule)] text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
                  >
                    <X className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="flex-1 font-medium">Close tools panel</span>
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOpen((v) => !v)}
            title="More actions"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={open}
            className={`flex items-center justify-center w-8 h-7 rounded-md transition-all duration-150 active:scale-90 ${
              open
                ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/40'
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
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                style={{ transformOrigin: 'top right' }}
                className="glass-surface absolute top-full right-0 mt-1.5 w-[264px] rounded-xl max-h-[calc(100dvh-4.5rem)] overflow-y-auto overscroll-contain z-[320]"
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
                  <Item
                    icon={Copy}
                    label="Clean duplicate scenes"
                    onClick={async () => {
                      setOpen(false);
                      const { runTool } = await import('@/lib/agentTools');
                      const ev = await runTool('dedupeScreenplay', {});
                      const { toast } = await import('sonner');
                      if (ev.ok) toast.success(ev.message || 'Cleaned duplicates');
                      else toast.error(ev.message || 'Nothing to clean');
                    }}
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

                <Group title="Share & collaborate">
                  <Item
                    icon={Share2}
                    label="Share story…"
                    onClick={() => { setOpen(false); document.dispatchEvent(new CustomEvent('app:shareStory')); }}
                  />
                  <Item
                    icon={UserPlus}
                    label="Invite collaborator…"
                    onClick={() => { setOpen(false); document.dispatchEvent(new CustomEvent('app:invite')); }}
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
                    icon={Stethoscope}
                    label="Diagnose cloud…"
                    onClick={() => {
                      setOpen(false);
                      (window as any).__openDiagnostic?.();
                    }}
                  />
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
      className={`group/mi w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12px] transition-all duration-150 ${
        danger
          ? 'text-[var(--danger)] hover:bg-[var(--danger)]/12'
          : 'text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]'
      }`}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-150 group-hover/mi:scale-110" />
      <span className="flex-1 font-medium">{label}</span>
      {shortcut && (
        <span className="text-[10px] text-[var(--text-muted)] tabular-nums select-none px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--card)]/60 group-hover/mi:border-[var(--accent)]/30">
          {shortcut}
        </span>
      )}
    </button>
  );
}

function roleLabel(r: 'writer' | 'director' | 'producer' | 'both'): string {
  return r === 'writer' ? 'Writer'
    : r === 'director' ? 'Director'
    : r === 'producer' ? 'Producer'
    : 'Writer + Director';
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
