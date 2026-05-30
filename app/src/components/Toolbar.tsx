import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Plus,
  Film,
  Grid3X3,
  Layers,
  AlignLeft,
  User,
  Parentheses,
  MessageSquare,
  ArrowRight,
  Menu,
  Briefcase,
  BookmarkPlus,
  Sparkles,
  Mic,
  Image as ImageIcon,
  Megaphone,
  Drama,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { getTemplate } from '@/lib/storyTemplates';

// Match underlying ScreenplayElement formats to icons regardless of label
const ICON_FOR_FORMAT: Record<string, LucideIcon> = {
  'scene-heading': Film,
  action: AlignLeft,
  character: User,
  parenthetical: Parentheses,
  dialogue: MessageSquare,
  transition: ArrowRight,
};

// Override icons by label for video / stage variants so the buttons read right
const ICON_FOR_LABEL: Record<string, LucideIcon> = {
  Hook: Sparkles,
  'B-roll': ImageIcon,
  'V.O.': Mic,
  'On-Screen': Megaphone,
  'CTA / Cut': ArrowRight,
  Speaker: User,
  'Stage Dir.': Drama,
  Aside: Parentheses,
  Line: MessageSquare,
  Curtain: ArrowRight,
  Chapter: Film,
  Interview: User,
};

interface ToolbarProps {
  activeTab: string;
  /** Unused after the layout rewrite — kept for prop-compat with App.tsx. */
  onToggleFocusMode?: () => void;
  /** Unused — kept for prop-compat. */
  isFocusMode?: boolean;
  onAddAct: () => void;
  onAddShot: () => void;
  onAddSection?: () => void;
  onOpenMobileSidebar: () => void;
  /** Unused after the layout rewrite — Export lives in the TopBar ⋯ menu. */
  onOpenExportDialog?: () => void;
}

export default function Toolbar({
  activeTab,
  onAddAct,
  onAddShot,
  onAddSection,
  onOpenMobileSidebar,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <button
        onClick={onOpenMobileSidebar}
        title="Menu"
        className="md:hidden p-1.5 mr-1 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)] transition-all"
      >
        <Menu className="w-4 h-4" />
      </button>

      {activeTab === 'writer' && (
        <WriterFormatRow onAddSection={onAddSection} />
      )}

      {activeTab === 'director' && (
        <div className="flex items-center gap-3 animate-fade-in">
          <Film className="w-4 h-4 text-[var(--accent)]" />
          <span className="text-xs text-[var(--text-secondary)] font-medium">Director View</span>
          <div className="w-px h-5 bg-[var(--border)] mx-2" />
          <button
            onClick={onAddShot}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent)] text-[var(--bg)] rounded-lg text-xs font-semibold hover:brightness-110 transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Add Shot
          </button>
        </div>
      )}

      {activeTab === 'plot' && (
        <div className="flex items-center gap-3 animate-fade-in">
          <Grid3X3 className="w-4 h-4 text-[var(--accent)]" />
          <span className="text-xs text-[var(--text-secondary)] font-medium">Plot Board</span>
          <div className="w-px h-5 bg-[var(--border)] mx-2" />
          <button
            onClick={onAddAct}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text)] transition-all"
          >
            <Layers className="w-3.5 h-3.5" /> Add Act
          </button>
        </div>
      )}

      {activeTab === 'workspace' && (
        <div className="flex items-center gap-3 animate-fade-in">
          <Briefcase className="w-4 h-4 text-[var(--accent)]" />
          <span className="text-xs text-[var(--text-secondary)] font-medium">Production Workspace</span>
        </div>
      )}

      <div className="flex-1" />

      {/* Reports stays — opens the printable shot list / cast / location
          report. Everything else (AI tools, Export, Focus) was moved into
          the TopBar's ⋯ menu in the layout rewrite. */}
      <ReportsButton />
    </div>
  );
}

function WriterFormatRow({ onAddSection }: { onAddSection?: () => void }) {
  // Subscribing to activeStoryId + stories keeps the row reactive to story
  // creation/loading.
  const activeStoryId = useAppStore((s) => s.activeStoryId);
  const stories = useAppStore((s) => s.stories);
  const activeStory = stories.find((s) => s.id === activeStoryId);
  const template = getTemplate(activeStory?.type);
  return (
    <div className="flex items-center gap-2 animate-fade-in flex-wrap">
      <span
        className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mr-2 px-1.5 py-0.5 bg-[var(--card)] rounded-md border border-[var(--border)]"
        title={`Format buttons tuned for: ${template.label}`}
      >
        {template.label.split(' ')[0]}
      </span>
      {template.toolbarFormats.map((f) => (
        <ToolButton
          key={f.label}
          icon={ICON_FOR_LABEL[f.label] || ICON_FOR_FORMAT[f.format] || AlignLeft}
          label={f.label}
          format={f.format}
        />
      ))}
      {onAddSection && (
        <>
          <div className="w-px h-5 bg-[var(--border)] mx-1" />
          <button
            onClick={onAddSection}
            title="Add a new writer section / page"
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[11px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all font-medium"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            Add Section
          </button>
        </>
      )}
    </div>
  );
}

// ToolbarIconButton removed — the AI tool icons moved to the TopBar ⋯ menu.

function ToolButton({ icon: Icon, label, format }: { icon: any; label: string; format: string }) {
  const [activeFormat, setActiveFormat] = useState<string>('action');
  const [justApplied, setJustApplied] = useState(false);

  // Listen for the WriterView's format-changed broadcast so we can highlight
  // the button that matches the current paragraph.
  useEffect(() => {
    const onChange = (e: Event) => {
      const fmt = (e as CustomEvent).detail?.format;
      if (typeof fmt === 'string') setActiveFormat(fmt);
    };
    document.addEventListener('writer:formatchanged', onChange as EventListener);
    return () => document.removeEventListener('writer:formatchanged', onChange as EventListener);
  }, []);

  const applyFormat = () => {
    // Bring the editor back into focus first so the format actually applies
    // even if the user clicked on the toolbar after switching views.
    const editor = document.querySelector('.ProseMirror') as HTMLElement | null;
    if (editor) (editor as HTMLElement).focus?.();
    document.dispatchEvent(new CustomEvent('writer:applyformat', { detail: { format } }));
    editor?.dispatchEvent(new CustomEvent('applyformat', { detail: { format } }));
    setJustApplied(true);
    setTimeout(() => setJustApplied(false), 600);
    toast(`Format → ${label}`, { duration: 1200 });
  };

  const isActive = activeFormat === format;
  // ReportsButton lives next door — declared at bottom of file via hoisted
  // function decl so we can render it inline above.

  return (
    <button
      onClick={applyFormat}
      title={`Apply ${label} format`}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] transition-all font-medium border ${
        isActive
          ? 'bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--accent)] shadow-sm'
          : 'bg-[var(--card)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text)]'
      } ${justApplied ? 'ring-2 ring-[var(--accent)]/40 scale-[1.03]' : ''}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

/**
 * Reports dropdown — generates printable HTML for shot list / cast / locations.
 */
function ReportsButton() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Production reports (PDF via print)"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text)] transition-all"
      >
        <ClipboardList className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Reports</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 w-48 bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-xl z-50 overflow-hidden">
          {([
            { id: 'shot-list',     label: 'Shot list' },
            { id: 'cast-list',     label: 'Cast list' },
            { id: 'location-list', label: 'Location list' },
          ] as const).map((r) => (
            <button
              key={r.id}
              onClick={async () => {
                setOpen(false);
                const { useAppStore } = await import('@/store/useAppStore');
                const { buildReport, openReport } = await import('@/lib/reports');
                const s = useAppStore.getState();
                const story = s.stories.find((x) => x.id === s.activeStoryId);
                const html = buildReport(s, r.id, story?.title || 'Untitled');
                openReport(html, `${story?.title || 'story'}-${r.id}`);
              }}
              className="block w-full text-left px-3 py-2 text-xs hover:bg-[var(--hover)] text-[var(--text-secondary)] hover:text-[var(--text)]"
              role="menuitem"
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
