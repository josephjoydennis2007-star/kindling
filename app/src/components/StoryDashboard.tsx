import { useEffect, useMemo, useState } from 'react';
import { Flame, BarChart3, Banknote } from 'lucide-react';
import { getStats } from '@/lib/writingStats';
import { formatMoney } from '@/lib/money';
import { motion } from 'framer-motion';
import {
  Sparkles,
  PenLine,
  Clapperboard,
  LayoutGrid,
  History,
  ArrowRight,
  FileText,
  Users,
  Target,
  Clock,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { getTemplate } from '@/lib/storyTemplates';
import SceneHeatMap from '@/components/SceneHeatMap';

/**
 * "Home" view for the active story — a quick snapshot of:
 *  - word count
 *  - scene / act progress
 *  - recent history entries (with one-click restore)
 *  - jump-to-last-edited section / scene shortcuts
 */
export default function StoryDashboard() {
  const stories = useAppStore((s) => s.stories);
  const activeStoryId = useAppStore((s) => s.activeStoryId);
  const screenplay = useAppStore((s) => s.screenplay);
  const scenes = useAppStore((s) => s.scenes);
  const characters = useAppStore((s) => s.characters);
  const plotBoard = useAppStore((s) => s.plotBoard);
  const beats = useAppStore((s) => s.beats);
  const history = useAppStore((s) => s.history);
  const setTab = useAppStore((s) => s.setTab);
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const setActiveDirectorScene = useAppStore((s) => s.setActiveDirectorScene);

  const activeStory = stories.find((s) => s.id === activeStoryId);
  const template = getTemplate(activeStory?.type);

  // Word count from screenplay elements (strip HTML)
  const stats = useMemo(() => {
    const stripTags = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
    let words = 0;
    let pages = 0;
    for (const e of screenplay.elements || []) {
      const text = stripTags(e.content || '').trim();
      if (text) words += text.split(/\s+/).filter(Boolean).length;
    }
    pages = Math.max(1, Math.round(words / 250));
    return { words, pages };
  }, [screenplay.elements]);

  // Scene / shot / b-roll progress
  const sceneStats = useMemo(() => {
    const total = scenes.length;
    const withShots = scenes.filter((s) => s.shotIds.length > 0).length;
    const totalShots = scenes.reduce((acc, s) => acc + s.shotIds.length, 0);
    const statusCount: Record<string, number> = { todo: 0, 'in-progress': 0, shot: 0, final: 0 };
    for (const s of scenes) statusCount[s.status] = (statusCount[s.status] || 0) + 1;
    return { total, withShots, totalShots, statusCount };
  }, [scenes]);

  // Plot beats per act
  const beatsByAct = useMemo(() => {
    return plotBoard.acts.map((a) => ({
      title: a.title,
      count: a.beatIds.length,
      filled: a.beatIds.filter((id) => beats[id]?.title?.trim()).length,
    }));
  }, [plotBoard.acts, beats]);

  // Recent history (last 6)
  const recentHistory = useMemo(() => {
    return history
      .filter((h) => h.storyId === activeStoryId)
      .slice(0, 6);
  }, [history, activeStoryId]);

  const [writingStats, setWritingStats] = useState(() => getStats());
  useEffect(() => {
    // Re-read on mount so the latest save shows up immediately.
    setWritingStats(getStats());
  }, []);

  const lastEditedSection = useMemo(() => {
    const list = (screenplay.sections || []).slice();
    if (!list.length) return null;
    // Most recent active section is the safest "last edit" heuristic we have
    // without per-element timestamps.
    return list.find((s) => s.id === screenplay.activeSectionId) || list[list.length - 1];
  }, [screenplay.sections, screenplay.activeSectionId]);

  if (!activeStory) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
        Pick or create a story to see its dashboard.
      </div>
    );
  }

  const goalPages = activeStory.type === 'short-film' ? 15
    : activeStory.type === 'youtube' || activeStory.type === 'music-video' || activeStory.type === 'commercial' ? 4
    : activeStory.type === 'tv-show' ? 35
    : activeStory.type === 'tv-series' || activeStory.type === 'mini-series' ? 55
    : 110;
  const pageProgress = Math.min(100, Math.round((stats.pages / goalPages) * 100));

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg)]">
      <div className="max-w-5xl mx-auto p-4 sm:p-8">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-gradient-to-br from-blue-500/20 via-purple-500/15 to-pink-500/15 border border-[var(--border)] rounded-2xl p-6 mb-6 relative overflow-hidden"
        >
          <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full bg-purple-500/20 blur-3xl pointer-events-none" />
          <div className="relative flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" /> {template.label}
              </div>
              <h1 className="text-2xl font-bold text-[var(--text)] mt-1">{activeStory.title}</h1>
              {screenplay.logline && (
                <p className="text-sm text-[var(--text-secondary)] mt-2 italic max-w-xl">{screenplay.logline}</p>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setTab('writer')} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--bg)] text-xs font-bold hover:brightness-110 flex items-center gap-1.5">
                <PenLine className="w-3.5 h-3.5" /> Open Writer
              </button>
              <button onClick={() => setTab('director')} className="px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] flex items-center gap-1.5">
                <Clapperboard className="w-3.5 h-3.5" /> Director
              </button>
              <button onClick={() => setTab('plot')} className="px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] flex items-center gap-1.5">
                <LayoutGrid className="w-3.5 h-3.5" /> Plot
              </button>
            </div>
          </div>
        </motion.div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Stat icon={FileText} label="Words" value={stats.words.toLocaleString()} sub={`~${stats.pages} page${stats.pages !== 1 ? 's' : ''}`} />
          <Stat icon={Clapperboard} label="Scenes" value={sceneStats.total} sub={`${sceneStats.totalShots} shots`} />
          <Stat icon={Users} label="Characters" value={characters.length} sub="cast" />
          <Stat icon={LayoutGrid} label="Beats" value={Object.keys(beats).length} sub={`${plotBoard.acts.length} acts`} />
        </div>

        {/* Scene Heat Map — pacing at a glance, click-to-jump */}
        <div className="mb-6">
          <SceneHeatMap />
        </div>

        {/* Two-column body */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Page progress */}
          <Card title="Page goal" icon={Target}>
            <div className="text-3xl font-bold text-[var(--text)]">
              {stats.pages} <span className="text-base text-[var(--text-muted)] font-normal">/ {goalPages}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-[var(--border)] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
                style={{ width: `${pageProgress}%` }}
              />
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-2">
              {pageProgress >= 100 ? '🎬 First-draft length reached. Time to revise!' : `${100 - pageProgress}% to first-draft length for a ${template.label.split(' ')[0]} project.`}
            </p>
          </Card>

          {/* Scene status breakdown + doughnut */}
          <Card title="Scene status" icon={Clapperboard}>
            {sceneStats.total === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No scenes yet — open the Director tab to start building.</p>
            ) : (
              <div className="flex items-start gap-3">
                <Doughnut
                  size={84}
                  segments={(['todo', 'in-progress', 'shot', 'final'] as const).map((st) => ({
                    label: st,
                    value: sceneStats.statusCount[st] || 0,
                    color: st === 'todo' ? 'var(--text-muted)'
                          : st === 'in-progress' ? '#f59e0b'
                          : st === 'shot' ? '#3b82f6'
                          : '#10b981',
                  }))}
                />
                <div className="flex-1 space-y-1.5">
                  {(['todo', 'in-progress', 'shot', 'final'] as const).map((st) => {
                    const n = sceneStats.statusCount[st] || 0;
                    const pct = Math.round((n / sceneStats.total) * 100);
                    const color = st === 'todo' ? 'var(--text-muted)'
                                : st === 'in-progress' ? '#f59e0b'
                                : st === 'shot' ? '#3b82f6'
                                : '#10b981';
                    return (
                      <div key={st} className="flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1.5 text-[var(--text-secondary)] capitalize">
                          <span className="w-2 h-2 rounded-sm" style={{ background: color }} aria-hidden />
                          {st.replace('-', ' ')}
                        </span>
                        <span className="text-[var(--text-muted)] tabular-nums">{n} · {pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          {/* Beats per act */}
          <Card title="Plot board" icon={LayoutGrid}>
            {beatsByAct.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No acts yet.</p>
            ) : (
              <div className="space-y-2">
                {beatsByAct.map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] gap-3">
                    <span className="text-[var(--text-secondary)] truncate flex-1">{a.title}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden max-w-[120px]">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                        style={{ width: `${a.count ? Math.round((a.filled / a.count) * 100) : 0}%` }}
                      />
                    </div>
                    <span className="text-[var(--text-muted)] tabular-nums w-16 text-right">{a.filled}/{a.count}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Production budget */}
          <Card title="Production budget" icon={Banknote}>
            {(() => {
              const cats: Record<string, number> = { cast: 0, crew: 0, location: 0, props: 0, post: 0 };
              const colors: Record<string, string> = {
                cast:     '#3b82f6',
                crew:     '#a855f7',
                location: '#f97316',
                props:    '#10b981',
                post:     '#ec4899',
              };
              let total = 0;
              for (const s of scenes) {
                const b = (s as any).budget || {};
                for (const k of Object.keys(cats)) {
                  const v = Number(b[k]) || 0;
                  cats[k] += v;
                  total += v;
                }
              }
              return (
                <>
                  <div className="text-2xl font-bold text-[var(--text)] tabular-nums mb-2">{formatMoney(total)}</div>
                  {total > 0 && (
                    <div className="h-3 flex rounded-full overflow-hidden mb-3 bg-[var(--border)]">
                      {Object.entries(cats).map(([k, v]) => {
                        const pct = total ? (v / total) * 100 : 0;
                        if (!pct) return null;
                        return (
                          <div
                            key={k}
                            title={`${k}: ${formatMoney(v)} (${pct.toFixed(0)}%)`}
                            style={{ width: `${pct}%`, background: colors[k] }}
                          />
                        );
                      })}
                    </div>
                  )}
                  <div className="grid grid-cols-5 gap-2">
                    {Object.entries(cats).map(([k, v]) => (
                      <div key={k} className="text-center">
                        <div className="flex items-center justify-center gap-1 text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-bold">
                          <span className="inline-block w-1.5 h-1.5 rounded-sm" style={{ background: colors[k] }} aria-hidden />
                          {k}
                        </div>
                        <div className="text-[10px] text-[var(--text)] tabular-nums truncate" title={formatMoney(v)}>{formatMoney(v)}</div>
                      </div>
                    ))}
                  </div>
                  {total === 0 && (
                    <p className="text-[11px] text-[var(--text-muted)] italic mt-2">
                      Set per-scene budgets in the Director view.
                    </p>
                  )}
                </>
              );
            })()}
          </Card>

          {/* Writing streak + 30-day sparkline */}
          <Card title="Writing streak" icon={Flame}>
            <div className="flex items-baseline gap-3 mb-2">
              <div className="text-3xl font-bold text-[var(--text)]">
                {writingStats.streak} <span className="text-xs text-[var(--text-muted)] font-normal">days</span>
              </div>
              <div className="text-xs text-[var(--text-muted)] tabular-nums">
                longest: {writingStats.longest} · today: {writingStats.today.toLocaleString()} words
              </div>
            </div>
            {(() => {
              const series = (writingStats as any).series90 || writingStats.series;
              const max = Math.max(1, ...series.map((s: any) => s.words));
              const W = 100, H = 36;
              const points = series.map((d: any, i: number) => {
                const x = (i / (series.length - 1)) * W;
                const y = H - (d.words / max) * H;
                return `${x.toFixed(2)},${y.toFixed(2)}`;
              }).join(' ');
              return (
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-12">
                  <defs>
                    <linearGradient id="wsg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polyline
                    points={`0,${H} ${points} ${W},${H}`}
                    fill="url(#wsg)"
                    stroke="none"
                  />
                  <polyline
                    points={points}
                    fill="none"
                    stroke="#a855f7"
                    strokeWidth="1.2"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              );
            })()}
            <div className="text-[10px] text-[var(--text-muted)] mt-1.5 flex items-center gap-1">
              <BarChart3 className="w-3 h-3" /> Last 90 days
            </div>
          </Card>

          {/* Recent activity */}
          <Card title="Recent activity" icon={History}>
            {recentHistory.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No history yet — save to start tracking.</p>
            ) : (
              <ul className="space-y-1.5">
                {recentHistory.map((h) => (
                  <li key={h.id} className="flex items-center gap-2 text-[11px]">
                    <Clock className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0" />
                    <span className="text-[var(--text-secondary)] flex-1 truncate">{h.label}</span>
                    <span className="text-[var(--text-muted)] tabular-nums text-[10px]">
                      {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Jump-to */}
        <div className="mt-6 flex flex-wrap gap-2">
          {lastEditedSection && (
            <button
              onClick={() => { setActiveSection(lastEditedSection.id); setTab('writer'); }}
              className="text-xs px-3 py-1.5 rounded-full bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[var(--text-secondary)] flex items-center gap-1.5"
            >
              Jump to "{lastEditedSection.name}" <ArrowRight className="w-3 h-3" />
            </button>
          )}
          {scenes[0] && (
            <button
              onClick={() => { setActiveDirectorScene(scenes[0].id); setTab('director'); }}
              className="text-xs px-3 py-1.5 rounded-full bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[var(--text-secondary)] flex items-center gap-1.5"
            >
              First scene → Director <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon: any; label: string; value: any; sub?: string }) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-xl font-bold text-[var(--text)] mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-[var(--text-muted)]">{sub}</div>}
    </div>
  );
}

/**
 * Tiny SVG doughnut chart. Segments with value=0 are skipped. Total label is
 * centered. Used by the Scene Status card; can be reused elsewhere.
 */
function Doughnut({ segments, size = 80 }: { segments: { label: string; value: number; color: string }[]; size?: number }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total === 0) return <div className="text-[10px] text-[var(--text-muted)]">no data</div>;
  const r = size / 2 - 4;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segments.map((seg, i) => {
        if (seg.value === 0) return null;
        const frac = seg.value / total;
        const dash = circumference * frac;
        const gap = circumference - dash;
        const el = (
          <circle
            key={i}
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={size / 7}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${c} ${c})`}
          >
            <title>{seg.label}: {seg.value}</title>
          </circle>
        );
        offset += dash;
        return el;
      })}
      <text x={c} y={c} dominantBaseline="middle" textAnchor="middle" className="fill-[var(--text)]" fontSize={size / 4} fontWeight="bold">
        {total}
      </text>
    </svg>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--panel)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-3">
        <Icon className="w-3 h-3" /> {title}
      </div>
      {children}
    </div>
  );
}
