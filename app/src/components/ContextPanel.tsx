import { useMemo } from 'react';
import { ChevronDown, Clapperboard, LayoutGrid, Users } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

/**
 * ContextPanel — the second column in production mode.
 *
 * Swaps its content based on the active view:
 *
 *   - Home      → Recent activity + quick stats
 *   - Writer    → Hidden (writer mode is Focus Paper)
 *   - Director  → Scenes outline
 *   - Plot      → Acts + beats outline
 *   - Calendar  → Date navigator
 *   - Workspace → Story tools quick-access
 *
 * Story Tools (Notes / Characters / History / Collaborate / AI / Assets /
 * Instructions) used to live in a footer here too, but they were duplicated
 * by the TopBar "Tools" dropdown which works on every tab including Writer.
 * The footer was removed so there is one place — the top bar — to open the
 * right-side Inspector. The body of this panel now holds only the view-
 * specific outline (scenes, acts, etc.).
 */

interface Props {
  activeTab: string;
  // rightPanel/onTogglePanel kept on the prop type for backward compatibility
  // with any caller still passing them, but no longer used internally.
  rightPanel?: string | null;
  onTogglePanel?: (panel: string) => void;
}

export default function ContextPanel({ activeTab }: Props) {
  const scenes = useAppStore((s) => s.scenes);
  const setActiveDirectorScene = useAppStore((s) => s.setActiveDirectorScene);
  const activeDirectorSceneId = useAppStore((s) => s.activeDirectorSceneId);
  const plotBoard = useAppStore((s) => s.plotBoard);
  const beats = useAppStore((s) => s.beats);
  const characters = useAppStore((s) => s.characters);
  const stories = useAppStore((s) => s.stories);
  const activeStoryId = useAppStore((s) => s.activeStoryId);
  const story = stories.find((s) => s.id === activeStoryId);

  const sceneList = useMemo(
    () => [...(scenes || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [scenes]
  );

  return (
    <aside
      className="hidden md:flex w-[240px] flex-shrink-0 flex-col bg-[var(--bg)] border-r border-[var(--rule)] min-h-0"
      aria-label="Context panel"
    >
      {/* View-specific header */}
      <header className="px-4 py-3 border-b border-[var(--rule)]">
        <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">
          {viewLabel(activeTab)}
        </div>
        <div className="text-xs font-semibold text-[var(--text)] mt-0.5 truncate">
          {story?.title || 'No story'}
        </div>
      </header>

      {/* View-specific body */}
      <div className="flex-1 overflow-y-auto py-2 min-h-0">
        {activeTab === 'dashboard' && (
          <DashboardContext characters={characters.length} scenes={scenes.length} beats={Object.keys(beats || {}).length} />
        )}

        {activeTab === 'director' && (
          <SceneList
            scenes={sceneList}
            activeId={activeDirectorSceneId}
            onSelect={(id) => setActiveDirectorScene(id)}
          />
        )}

        {activeTab === 'plot' && (
          <ActsList acts={plotBoard?.acts || []} beats={beats || {}} />
        )}

        {activeTab === 'calendar' && (
          <SimpleNote text="Pick a date on the calendar to schedule a scene." />
        )}

        {activeTab === 'workspace' && (
          <SimpleNote text="Add coworker tools + cloud links from the workspace page." />
        )}
      </div>

      {/* Story Tools footer removed — use the TopBar "Tools" dropdown. */}
    </aside>
  );
}

// ─── View-specific bodies ────────────────────────────────────────────────────

function DashboardContext({ characters, scenes, beats }: { characters: number; scenes: number; beats: number }) {
  return (
    <div className="px-4 space-y-3">
      <Stat icon={Clapperboard} label="Scenes"     value={scenes} />
      <Stat icon={LayoutGrid}   label="Beats"      value={beats} />
      <Stat icon={Users}        label="Characters" value={characters} />
    </div>
  );
}

function SceneList({ scenes, activeId, onSelect }: { scenes: any[]; activeId: string | null; onSelect: (id: string) => void }) {
  if (!scenes.length) {
    return <SimpleNote text="No scenes yet — click + to add one." />;
  }
  return (
    <ul className="px-2">
      {scenes.map((s) => {
        const isActive = s.id === activeId;
        return (
          <li key={s.id}>
            <button
              onClick={() => onSelect(s.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left ${
                isActive
                  ? 'bg-[var(--surface-2)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
              }`}
              title={s.heading || s.name}
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: s.color || 'var(--text-muted)' }}
                aria-hidden
              />
              <span className="flex-1 truncate">{s.heading || s.name || 'Untitled scene'}</span>
              <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                {s.shotIds?.length || 0}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ActsList({ acts, beats }: { acts: any[]; beats: Record<string, any> }) {
  if (!acts.length) {
    return <SimpleNote text="No acts yet — head to the Plot board to add some." />;
  }
  return (
    <ul className="px-2 space-y-0.5">
      {acts.map((a, i) => {
        const beatList = Object.values(beats).filter((b: any) => b.actId === a.id);
        return (
          <li key={a.id}>
            <details className="group">
              <summary className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)] cursor-pointer list-none">
                <ChevronDown className="w-3 h-3 text-[var(--text-muted)] transition-transform group-open:rotate-0 -rotate-90" />
                <span className="flex-1 truncate font-medium">Act {i + 1}: {a.title || 'Untitled'}</span>
                <span className="text-[10px] text-[var(--text-muted)] tabular-nums">{beatList.length}</span>
              </summary>
              <ul className="pl-6">
                {beatList.map((b: any) => (
                  <li key={b.id} className="px-2 py-1 text-[11px] text-[var(--text-secondary)] truncate">
                    {b.title || '(untitled beat)'}
                  </li>
                ))}
              </ul>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between px-2 py-2 rounded-md bg-[var(--surface-2)] border border-[var(--rule)]">
      <span className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </span>
      <span className="text-sm font-semibold text-[var(--text)] tabular-nums">{value}</span>
    </div>
  );
}

function SimpleNote({ text }: { text: string }) {
  return <p className="px-4 py-3 text-[11px] text-[var(--text-muted)] leading-relaxed">{text}</p>;
}

function viewLabel(tab: string): string {
  switch (tab) {
    case 'dashboard': return 'Home';
    case 'writer':    return 'Writer';
    case 'director':  return 'Director';
    case 'plot':      return 'Plot board';
    case 'calendar':  return 'Calendar';
    case 'workspace': return 'Workspace';
    default:          return tab;
  }
}
