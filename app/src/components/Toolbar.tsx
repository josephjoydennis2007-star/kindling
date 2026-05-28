import {
  Focus,
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
  FileDown,
  Briefcase,
  BookmarkPlus,
} from 'lucide-react';

interface ToolbarProps {
  activeTab: string;
  onToggleFocusMode: () => void;
  isFocusMode: boolean;
  onAddAct: () => void;
  onAddShot: () => void;
  onAddSection?: () => void;
  onOpenMobileSidebar: () => void;
  onOpenExportDialog: () => void;
}

export default function Toolbar({
  activeTab,
  onToggleFocusMode,
  isFocusMode,
  onAddAct,
  onAddShot,
  onAddSection,
  onOpenMobileSidebar,
  onOpenExportDialog,
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
        <div className="flex items-center gap-2 animate-fade-in flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mr-2">
            Format
          </span>
          <ToolButton icon={Film} label="Scene" format="scene-heading" />
          <ToolButton icon={AlignLeft} label="Action" format="action" />
          <ToolButton icon={User} label="Character" format="character" />
          <ToolButton icon={Parentheses} label="Paren" format="parenthetical" />
          <ToolButton icon={MessageSquare} label="Dialogue" format="dialogue" />
          <ToolButton icon={ArrowRight} label="Trans" format="transition" />
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

      <button
        onClick={onOpenExportDialog}
        title="Export (PDF / Word / etc.)"
        className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-500/15 to-purple-500/15 border border-[var(--accent)]/40 rounded-lg text-xs text-[var(--accent)] hover:brightness-110 transition-all font-semibold"
      >
        <FileDown className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Export</span>
      </button>


      <button
        onClick={onToggleFocusMode}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text)] transition-all"
        title={isFocusMode ? 'Exit Focus Mode' : 'Focus Mode'}
      >
        <Focus className="w-3.5 h-3.5" />
        {isFocusMode ? 'Exit' : 'Focus'}
      </button>
    </div>
  );
}

function ToolButton({ icon: Icon, label, format }: { icon: any; label: string; format: string }) {
  const applyFormat = () => {
    // Dispatch on document so it works regardless of whether
    // .ProseMirror is currently mounted.
    document.dispatchEvent(new CustomEvent('writer:applyformat', { detail: { format } }));
    const editor = document.querySelector('.ProseMirror') as HTMLElement | null;
    editor?.dispatchEvent(new CustomEvent('applyformat', { detail: { format } }));
  };

  return (
    <button
      onClick={applyFormat}
      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[11px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text)] transition-all font-medium"
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
