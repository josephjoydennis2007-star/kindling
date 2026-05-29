import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, CalendarDays, AlertTriangle } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { Scene } from '@/types';

/**
 * Production calendar. Drag a scene chip onto another day to reschedule.
 * Clash detection: if two scenes share a location (parsed from heading) on
 * the same day, the day gets a warning badge.
 */
export default function CalendarView() {
  const scenes = useAppStore((s) => s.scenes);
  const updateScene = useAppStore((s) => s.updateScene);

  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });

  const month = cursor.getMonth();
  const year = cursor.getFullYear();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Group scenes by date
  const sceneByDate = useMemo(() => {
    const map: Record<string, Scene[]> = {};
    for (const s of scenes) {
      if (!s.shootDate) continue;
      (map[s.shootDate] = map[s.shootDate] || []).push(s);
    }
    return map;
  }, [scenes]);

  const todayStr = (() => { const d = new Date(); return ymd(d); })();

  const unscheduled = scenes.filter((s) => !s.shootDate);

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg)]">
      <div className="max-w-6xl mx-auto p-4 sm:p-8">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
              <CalendarDays className="w-6 h-6 text-[var(--accent)]" /> Production calendar
            </h1>
            <p className="text-xs text-[var(--text-muted)]">Drag a scene onto a date to schedule its shoot.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-2 rounded-md bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)]" aria-label="Previous month">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-3 py-1.5 bg-[var(--panel)] border border-[var(--border)] rounded-md text-sm font-bold text-[var(--text)] tabular-nums">
              {cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
            </div>
            <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-2 rounded-md bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)]" aria-label="Next month">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={() => { const d = new Date(); d.setDate(1); setCursor(d); }} className="px-3 py-1.5 rounded-md bg-[var(--accent)] text-[var(--bg)] text-xs font-bold">
              Today
            </button>
          </div>
        </header>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold px-1">{d}</div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDow }).map((_, i) => <div key={'pad-' + i} className="min-h-[110px]" />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const date = new Date(year, month, day);
            const key = ymd(date);
            const sceneList = sceneByDate[key] || [];
            const clash = detectClash(sceneList);
            const isToday = key === todayStr;
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.005 }}
                onDragOver={(e) => { if (e.dataTransfer.types.includes('text/x-kindling-scene')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData('text/x-kindling-scene');
                  if (id) { e.preventDefault(); updateScene(id, { shootDate: key }); }
                }}
                className={`min-h-[110px] p-1.5 rounded-lg border ${isToday ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] bg-[var(--panel)]'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[10px] tabular-nums font-bold ${isToday ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>{day}</span>
                  {clash && (
                    <span className="text-amber-500" title={`Clash: ${clash}`}>
                      <AlertTriangle className="w-3 h-3" />
                    </span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {sceneList.map((s) => (
                    <button
                      key={s.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/x-kindling-scene', s.id);
                      }}
                      className="w-full text-left px-1.5 py-1 rounded text-[10px] truncate"
                      style={{ background: `${s.color}22`, color: s.color, borderLeft: `2px solid ${s.color}` }}
                      title={s.name || s.heading}
                    >
                      {s.name || s.heading}
                    </button>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Unscheduled tray */}
        <section className="mt-6">
          <h2 className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2">Unscheduled ({unscheduled.length})</h2>
          {unscheduled.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] italic">Every scene is on the calendar — nice work.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {unscheduled.map((s) => (
                <button
                  key={s.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/x-kindling-scene', s.id);
                  }}
                  className="px-2 py-1 rounded-md text-[11px] cursor-grab active:cursor-grabbing"
                  style={{ background: `${s.color}22`, color: s.color, borderLeft: `2px solid ${s.color}` }}
                  title="Drag onto a date"
                >
                  {s.name || s.heading}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Clash = same location appears on the same day, OR more than 5 scenes
    booked (rough "too many" heuristic). */
function detectClash(scenes: Scene[]): string | null {
  if (scenes.length === 0) return null;
  if (scenes.length > 5) return `${scenes.length} scenes booked — that's a lot`;
  const locs = new Map<string, number>();
  for (const s of scenes) {
    const m = (s.heading || s.name).match(/^(INT\.|EXT\.|EST\.)\s*(.+?)(?:\s*[-–—]|$)/i);
    const loc = (m ? m[2] : '').trim().toUpperCase();
    if (loc) locs.set(loc, (locs.get(loc) || 0) + 1);
  }
  for (const [loc, count] of locs) if (count > 1) return `${count} scenes at "${loc}"`;
  return null;
}
