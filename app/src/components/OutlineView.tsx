import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ListTree, Plus, ChevronRight, Trash2, GripVertical, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';

/**
 * OutlineView — the high-level "treatment" workspace for the writer.
 *
 * Distinct from the Writer view (which is the actual prose / screenplay
 * editor) and the Plot view (which is the act / beat board). The Outline
 * is the story bible: logline, premise, theme, synopsis, plus a flat
 * editable list of outline points. Think of it as the document that
 * answers "what is this story about?" before you write the words.
 *
 * Each outline point can be edited inline, deleted, or reordered. The
 * whole outline persists into the screenplay record (.outline string + a
 * normalized .outlinePoints list).
 */
export default function OutlineView() {
  const screenplay = useAppStore((s) => s.screenplay);
  const updateScreenplayField = useAppStore((s) => s.updateScreenplayField);

  const [logline, setLogline] = useState(screenplay.logline || '');
  const [theme, setTheme] = useState((screenplay as any).theme || '');
  const [synopsis, setSynopsis] = useState(screenplay.synopsis || '');
  const [points, setPoints] = useState<string[]>(
    Array.isArray((screenplay as any).outlinePoints)
      ? (screenplay as any).outlinePoints
      : (screenplay as any).outlinePoints ? [] : [],
  );

  // Computed reading-time-ish heuristic — gives the user feedback on
  // how rich their outline is.
  const stats = useMemo(() => {
    const words =
      (logline.trim().split(/\s+/).filter(Boolean).length) +
      (theme.trim().split(/\s+/).filter(Boolean).length) +
      (synopsis.trim().split(/\s+/).filter(Boolean).length) +
      points.reduce((acc, p) => acc + p.trim().split(/\s+/).filter(Boolean).length, 0);
    return { words, points: points.length };
  }, [logline, theme, synopsis, points]);

  const save = () => {
    updateScreenplayField('logline', logline);
    updateScreenplayField('synopsis', synopsis);
    updateScreenplayField('theme' as any, theme);
    updateScreenplayField('outlinePoints' as any, points);
    toast.success('Outline saved');
  };

  const addPoint = () => setPoints((p) => [...p, '']);
  const updatePoint = (i: number, v: string) =>
    setPoints((p) => p.map((x, idx) => (idx === i ? v : x)));
  const removePoint = (i: number) =>
    setPoints((p) => p.filter((_, idx) => idx !== i));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full overflow-y-auto"
    >
      <div className="max-w-3xl mx-auto p-6 sm:p-10">
        <header className="mb-8">
          <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs uppercase tracking-widest font-bold mb-1">
            <ListTree className="w-4 h-4" />
            Outline
          </div>
          <h1 className="text-3xl font-display font-bold text-[var(--text)]">
            {screenplay.title || 'Untitled story'}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            The high-level shape of your story — premise, theme, and a flat list of beats you want to hit.
          </p>
        </header>

        {/* Logline */}
        <section className="mb-6">
          <label className="block text-xs uppercase tracking-widest font-bold text-[var(--text-muted)] mb-2">
            Logline
            <span className="ml-2 font-normal normal-case tracking-normal text-[var(--text-muted)]/70">
              One sentence — protagonist, want, obstacle.
            </span>
          </label>
          <textarea
            value={logline}
            onChange={(e) => setLogline(e.target.value)}
            rows={2}
            placeholder="A burned-out detective must catch the serial killer who's mimicking her own unsolved cases — before he reaches the case that ruined her."
            className="w-full bg-[var(--card)] border border-[var(--rule)] rounded-md px-3 py-2 text-sm text-[var(--text)] resize-none focus:outline-none focus:border-[var(--accent)]"
          />
        </section>

        {/* Theme */}
        <section className="mb-6">
          <label className="block text-xs uppercase tracking-widest font-bold text-[var(--text-muted)] mb-2">
            Theme
            <span className="ml-2 font-normal normal-case tracking-normal text-[var(--text-muted)]/70">
              The argument your story makes about the world.
            </span>
          </label>
          <input
            type="text"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="You cannot outrun the truth — but you can choose what to do once it catches you."
            className="w-full bg-[var(--card)] border border-[var(--rule)] rounded-md px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
          />
        </section>

        {/* Synopsis */}
        <section className="mb-6">
          <label className="block text-xs uppercase tracking-widest font-bold text-[var(--text-muted)] mb-2">
            Synopsis
            <span className="ml-2 font-normal normal-case tracking-normal text-[var(--text-muted)]/70">
              The 1-2 paragraph treatment.
            </span>
          </label>
          <textarea
            value={synopsis}
            onChange={(e) => setSynopsis(e.target.value)}
            rows={8}
            placeholder="Open on the morning after the worst night of Detective Ana Rios' career…"
            className="w-full bg-[var(--card)] border border-[var(--rule)] rounded-md px-3 py-2 text-sm text-[var(--text)] resize-y focus:outline-none focus:border-[var(--accent)] font-serif leading-relaxed"
          />
        </section>

        {/* Outline points */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs uppercase tracking-widest font-bold text-[var(--text-muted)]">
              Outline points
              <span className="ml-2 font-normal normal-case tracking-normal text-[var(--text-muted)]/70">
                One line per major story moment.
              </span>
            </label>
            <button
              onClick={addPoint}
              className="text-xs flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--card)] border border-[var(--rule)] text-[var(--text-secondary)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
            >
              <Plus className="w-3 h-3" /> Add point
            </button>
          </div>
          {points.length === 0 ? (
            <div className="text-xs text-[var(--text-muted)] py-6 text-center border border-dashed border-[var(--rule)] rounded-md">
              No points yet. Click "Add point" to jot the next story beat.
            </div>
          ) : (
            <ol className="space-y-1">
              {points.map((pt, i) => (
                <li
                  key={i}
                  className="group flex items-start gap-2 bg-[var(--card)] border border-[var(--rule)] rounded-md px-2 py-1.5 hover:border-[var(--accent)]/50 transition-colors"
                >
                  <GripVertical className="w-3.5 h-3.5 text-[var(--text-muted)] mt-1 flex-shrink-0" />
                  <span className="text-xs text-[var(--text-muted)] tabular-nums mt-1 flex-shrink-0">{i + 1}.</span>
                  <input
                    type="text"
                    value={pt}
                    onChange={(e) => updatePoint(i, e.target.value)}
                    placeholder="The protagonist makes their first irreversible choice…"
                    className="flex-1 bg-transparent text-sm text-[var(--text)] focus:outline-none min-w-0"
                  />
                  <button
                    onClick={() => removePoint(i)}
                    title="Remove this point"
                    className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--danger)] transition-all p-0.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <footer className="flex items-center justify-between border-t border-[var(--rule)] pt-4 mt-8">
          <div className="text-xs text-[var(--text-muted)] flex items-center gap-3">
            <span><ChevronRight className="w-3 h-3 inline" /> {stats.points} points</span>
            <span><ChevronRight className="w-3 h-3 inline" /> {stats.words} words</span>
          </div>
          <button
            onClick={save}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            <Save className="w-3.5 h-3.5" /> Save outline
          </button>
        </footer>
      </div>
    </motion.div>
  );
}
