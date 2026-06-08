import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ClipboardList, Wand2, FileDown, Film } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { BREAKDOWN_CATEGORIES, type SceneBreakdown, type Scene } from '@/types';

/**
 * Script breakdown — tag each scene with the cast/props/wardrobe/SFX/etc.
 * needed to shoot it, then export 1st-AD-style breakdown sheets. Opens on the
 * `app:openBreakdown` event (TopBar ⋯ menu).
 */
function strip(html: string): string {
  return (html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

/** Split the screenplay into scene chunks and return the CHARACTER cues in each,
 *  so we can auto-assign cast to the director scenes by order. */
function castPerScriptScene(elements: { type: string; content: string }[]): string[][] {
  const chunks: string[][] = [];
  let current: string[] | null = null;
  for (const el of elements) {
    if (el.type === 'scene-heading') { current = []; chunks.push(current); continue; }
    if (el.type === 'character' && current) {
      const name = strip(el.content).replace(/\s*\(.*\)$/, '').toUpperCase();
      if (name && !current.includes(name)) current.push(name);
    }
  }
  return chunks;
}

export default function BreakdownView() {
  const [open, setOpen] = useState(false);
  const scenes = useAppStore((s) => s.scenes);
  const screenplay = useAppStore((s) => s.screenplay);
  const updateScene = useAppStore((s) => s.updateScene);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = () => { setOpen(true); setActiveId((id) => id || (useAppStore.getState().scenes[0]?.id ?? null)); };
    document.addEventListener('app:openBreakdown', onOpen);
    return () => document.removeEventListener('app:openBreakdown', onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const active = useMemo(() => scenes.find((s) => s.id === activeId) || null, [scenes, activeId]);

  const setItems = (sc: Scene, key: keyof SceneBreakdown, items: string[]) => {
    const bd: SceneBreakdown = { ...(sc.breakdown || {}), [key]: items };
    updateScene(sc.id, { breakdown: bd });
  };

  const addItem = (sc: Scene, key: keyof SceneBreakdown, value: string) => {
    const v = value.trim();
    if (!v) return;
    const cur = ((sc.breakdown?.[key] as string[]) || []);
    if (cur.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    setItems(sc, key, [...cur, v]);
  };

  const autoCast = () => {
    const chunks = castPerScriptScene((screenplay.elements as any) || []);
    let touched = 0;
    scenes.forEach((sc, i) => {
      const cast = chunks[i];
      if (cast && cast.length) {
        const existing = (sc.breakdown?.cast as string[]) || [];
        const merged = Array.from(new Set([...existing, ...cast]));
        if (merged.length !== existing.length) {
          updateScene(sc.id, { breakdown: { ...(sc.breakdown || {}), cast: merged } });
          touched++;
        }
      }
    });
    toast.success(touched ? `Auto-filled cast for ${touched} scene${touched === 1 ? '' : 's'}` : 'No new cast found in the script');
  };

  const exportPdf = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 48; let y = M;
    const line = (h = 16) => { if (y + h > H - M) { doc.addPage(); y = M; } };
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text('Breakdown Sheets', M, y); y += 22;
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(strip(screenplay.title) || 'Untitled', M, y); y += 18;

    scenes.forEach((sc, idx) => {
      line(40); y += 8;
      doc.setDrawColor(200); doc.line(M, y, W - M, y); y += 16;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
      doc.text(`${idx + 1}. ${strip(sc.name) || 'Scene'}`, M, y); y += 16;
      if (sc.description) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
        for (const ln of doc.splitTextToSize(strip(sc.description), W - M * 2) as string[]) { line(12); doc.text(ln, M, y); y += 12; } doc.setTextColor(0); }
      const bd = sc.breakdown || {};
      let any = false;
      for (const cat of BREAKDOWN_CATEGORIES) {
        const items = (bd[cat.key] as string[]) || [];
        if (!items.length) continue;
        any = true;
        line(14);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(`${cat.label}:`, M + 6, y);
        doc.setFont('helvetica', 'normal');
        for (const ln of doc.splitTextToSize(items.join(', '), W - M * 2 - 90) as string[]) { line(12); doc.text(ln, M + 96, y); y += 12; }
        y += 2;
      }
      if (bd.notes) { line(12); doc.setFont('helvetica', 'italic'); doc.setFontSize(9); for (const ln of doc.splitTextToSize(`Notes: ${bd.notes}`, W - M * 2) as string[]) { line(12); doc.text(ln, M + 6, y); y += 12; } }
      if (!any && !bd.notes) { doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(150); line(12); doc.text('(nothing tagged yet)', M + 6, y); y += 12; doc.setTextColor(0); }
      y += 6;
    });
    doc.save(`${(strip(screenplay.title) || 'breakdown').replace(/[^\w]+/g, '-').toLowerCase()}-breakdown.pdf`);
    toast.success('Breakdown sheets exported');
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[250] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl h-[min(680px,90vh)] bg-[var(--panel)] border border-[var(--border)] rounded-2xl shadow-2xl flex overflow-hidden"
          >
            {/* Scene list */}
            <div className="w-56 flex-shrink-0 border-r border-[var(--border)] bg-[var(--sidebar)] flex flex-col">
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-[var(--accent)]" />
                <span className="text-sm font-bold text-[var(--text)]">Breakdown</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {scenes.length === 0 && <p className="text-[11px] text-[var(--text-muted)] px-2 py-4">No scenes yet. Add scenes in the Director view.</p>}
                {scenes.map((sc, i) => {
                  const count = Object.values(sc.breakdown || {}).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
                  return (
                    <button key={sc.id} onClick={() => setActiveId(sc.id)}
                      className={`w-full text-left px-2.5 py-2 rounded-lg mb-0.5 transition-colors ${activeId === sc.id ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'}`}>
                      <div className="text-[12px] font-medium truncate">{i + 1}. {strip(sc.name) || 'Scene'}</div>
                      {count > 0 && <div className="text-[9.5px] text-[var(--text-muted)]">{count} tagged</div>}
                    </button>
                  );
                })}
              </div>
              <div className="p-2 border-t border-[var(--border)] space-y-1.5">
                <button onClick={autoCast} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors">
                  <Wand2 className="w-3.5 h-3.5" /> Auto-cast from script
                </button>
                <button onClick={exportPdf} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-110 transition-all">
                  <FileDown className="w-3.5 h-3.5" /> Export sheets (PDF)
                </button>
              </div>
            </div>

            {/* Category editor */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Film className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
                  <span className="text-sm font-bold text-[var(--text)] truncate">{active ? strip(active.name) || 'Scene' : 'Select a scene'}</span>
                </div>
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {!active ? (
                  <div className="text-center py-16 text-[var(--text-muted)] text-sm">Pick a scene on the left to tag what it needs.</div>
                ) : (
                  <>
                    {BREAKDOWN_CATEGORIES.map((cat) => (
                      <CategoryChips key={cat.key} label={cat.label} color={cat.color}
                        items={(active.breakdown?.[cat.key] as string[]) || []}
                        onAdd={(v) => addItem(active, cat.key, v)}
                        onRemove={(v) => setItems(active, cat.key, ((active.breakdown?.[cat.key] as string[]) || []).filter((x) => x !== v))}
                      />
                    ))}
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-1.5">Notes</div>
                      <textarea
                        defaultValue={active.breakdown?.notes || ''}
                        onBlur={(e) => updateScene(active.id, { breakdown: { ...(active.breakdown || {}), notes: e.target.value } })}
                        placeholder="Special equipment, permits, stunts, weather…"
                        className="w-full min-h-[60px] bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-[var(--text)] outline-none focus:border-[var(--accent)] resize-y"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CategoryChips({ label, color, items, onAdd, onRemove }: {
  label: string; color: string; items: string[]; onAdd: (v: string) => void; onRemove: (v: string) => void;
}) {
  const [val, setVal] = useState('');
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">{label}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <span key={it} className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-full text-[11px] bg-[var(--card)] border border-[var(--border)] text-[var(--text)]">
            {it}
            <button onClick={() => onRemove(it)} className="p-0.5 rounded-full hover:bg-[var(--danger)]/20 text-[var(--text-muted)] hover:text-[var(--danger)]"><X className="w-2.5 h-2.5" /></button>
          </span>
        ))}
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { onAdd(val); setVal(''); } }}
          placeholder="+ add"
          className="w-24 px-2 py-1 rounded-full text-[11px] bg-transparent border border-dashed border-[var(--border)] text-[var(--text)] outline-none focus:border-[var(--accent)] focus:w-32 transition-all"
        />
      </div>
    </div>
  );
}
