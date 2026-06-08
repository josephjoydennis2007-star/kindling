import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Clapperboard, Wallet, CalendarRange, FileDown, MapPin, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { formatMoney } from '@/lib/money';
import type { Scene } from '@/types';

/**
 * Production — turns the data you've already captured (scene budgets, breakdown
 * cast, shoot dates, locations) into a budget roll-up and a shooting schedule
 * with exportable call sheets. Opens on `app:openProduction`.
 */
const BUDGET_CATS: { key: 'cast' | 'crew' | 'location' | 'props' | 'post'; label: string }[] = [
  { key: 'cast', label: 'Cast' },
  { key: 'crew', label: 'Crew' },
  { key: 'location', label: 'Location' },
  { key: 'props', label: 'Props' },
  { key: 'post', label: 'Post' },
];

function strip(s: string): string { return (s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim(); }
function fmtDate(iso: string): string {
  if (!iso) return 'Unscheduled';
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ProductionView() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'budget' | 'schedule'>('budget');
  const scenes = useAppStore((s) => s.scenes);
  const screenplay = useAppStore((s) => s.screenplay);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    document.addEventListener('app:openProduction', onOpen);
    return () => document.removeEventListener('app:openProduction', onOpen);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const locations = (screenplay as any).locations as Array<{ id: string; name: string; intExt: string; timeOfDay: string; linkedSceneIds: string[]; address?: string }> || [];
  const locForScene = (id: string) => locations.find((l) => (l.linkedSceneIds || []).includes(id)) || null;

  // ── Budget roll-up ──
  const budget = useMemo(() => {
    const totals: Record<string, number> = { cast: 0, crew: 0, location: 0, props: 0, post: 0 };
    let grand = 0;
    for (const sc of scenes) {
      const b = sc.budget || {};
      for (const c of BUDGET_CATS) { const v = Number((b as any)[c.key]) || 0; totals[c.key] += v; grand += v; }
    }
    return { totals, grand };
  }, [scenes]);

  // ── Schedule (group by shoot date) ──
  const days = useMemo(() => {
    const map = new Map<string, Scene[]>();
    for (const sc of scenes) {
      const key = sc.shootDate || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(sc);
    }
    // Dated days first (sorted), then unscheduled last.
    return Array.from(map.entries()).sort((a, b) => {
      if (!a[0]) return 1; if (!b[0]) return -1; return a[0] < b[0] ? -1 : 1;
    });
  }, [scenes]);

  const exportCallSheets = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight();
    const M = 48; let y = M; let first = true;
    const line = (h = 14) => { if (y + h > H - M) { doc.addPage(); y = M; } };
    for (const [date, dayScenes] of days) {
      if (!first) { doc.addPage(); y = M; } first = false;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
      doc.text('Call Sheet', M, y); y += 20;
      doc.setFontSize(11); doc.text(fmtDate(date), M, y); y += 14;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110);
      doc.text(strip(screenplay.title) || 'Untitled', M, y); y += 16; doc.setTextColor(0);
      dayScenes.forEach((sc, i) => {
        const loc = locForScene(sc.id);
        const cast = (sc.breakdown?.cast as string[]) || [];
        line(40); doc.setDrawColor(210); doc.line(M, y, W - M, y); y += 14;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
        doc.text(`${i + 1}. ${strip(sc.name) || 'Scene'}`, M, y); y += 13;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        if (loc) { doc.text(`Location: ${loc.name}${loc.address ? ' — ' + loc.address : ''} (${loc.intExt.toUpperCase()}/${loc.timeOfDay})`, M + 6, y); y += 12; }
        if (cast.length) { for (const ln of doc.splitTextToSize(`Cast: ${cast.join(', ')}`, W - M * 2 - 6) as string[]) { line(12); doc.text(ln, M + 6, y); y += 12; } }
        if (sc.description) { doc.setTextColor(110); for (const ln of doc.splitTextToSize(strip(sc.description), W - M * 2 - 6) as string[]) { line(12); doc.text(ln, M + 6, y); y += 12; } doc.setTextColor(0); }
        y += 4;
      });
    }
    doc.save(`${(strip(screenplay.title) || 'call-sheets').replace(/[^\w]+/g, '-').toLowerCase()}-call-sheets.pdf`);
    toast.success('Call sheets exported');
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
            className="w-full max-w-3xl h-[min(660px,90vh)] bg-[var(--panel)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            <header className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clapperboard className="w-4 h-4 text-[var(--accent)]" />
                <span className="text-sm font-bold text-[var(--text)]">Production</span>
                <div className="flex items-center gap-1 ml-3 bg-[var(--card)] border border-[var(--border)] rounded-lg p-0.5">
                  <button onClick={() => setTab('budget')} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold ${tab === 'budget' ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}><Wallet className="w-3 h-3" /> Budget</button>
                  <button onClick={() => setTab('schedule')} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold ${tab === 'schedule' ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}><CalendarRange className="w-3 h-3" /> Schedule</button>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]"><X className="w-4 h-4" /></button>
            </header>

            <div className="flex-1 overflow-y-auto p-5">
              {tab === 'budget' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {BUDGET_CATS.map((c) => (
                      <div key={c.key} className="p-3 rounded-lg bg-[var(--card)] border border-[var(--border)]">
                        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold">{c.label}</div>
                        <div className="text-base font-bold text-[var(--text)] tabular-nums mt-0.5">{formatMoney(budget.totals[c.key])}</div>
                      </div>
                    ))}
                    <div className="p-3 rounded-lg bg-[var(--accent-soft)] border border-[var(--accent)]/40">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--accent)] font-bold">Grand total</div>
                      <div className="text-base font-bold text-[var(--accent)] tabular-nums mt-0.5">{formatMoney(budget.grand)}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2">Per scene</div>
                    {scenes.length === 0 && <p className="text-xs text-[var(--text-muted)]">No scenes yet.</p>}
                    {scenes.map((sc, i) => {
                      const b = sc.budget || {};
                      const tot = BUDGET_CATS.reduce((n, c) => n + (Number((b as any)[c.key]) || 0), 0);
                      return (
                        <div key={sc.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[var(--hover)] text-[13px]">
                          <span className="text-[var(--text)] truncate">{i + 1}. {strip(sc.name) || 'Scene'}</span>
                          <span className="tabular-nums text-[var(--text-secondary)]">{formatMoney(tot)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)]">Per-scene budgets are set in the Director view (scene → budget). Currency follows Settings → Look.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button onClick={exportCallSheets} disabled={!scenes.length} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-110 disabled:opacity-40">
                      <FileDown className="w-3.5 h-3.5" /> Export call sheets (PDF)
                    </button>
                  </div>
                  {scenes.length === 0 && <p className="text-xs text-[var(--text-muted)]">No scenes yet. Add scenes + shoot dates in the Director view.</p>}
                  {days.map(([date, dayScenes]) => (
                    <div key={date || 'unscheduled'} className="rounded-lg border border-[var(--border)] overflow-hidden">
                      <div className="px-3 py-2 bg-[var(--card)] flex items-center gap-2 text-[12px] font-bold text-[var(--text)]">
                        <CalendarRange className="w-3.5 h-3.5 text-[var(--accent)]" /> {fmtDate(date)}
                        <span className="text-[10px] text-[var(--text-muted)] font-normal">· {dayScenes.length} scene{dayScenes.length === 1 ? '' : 's'}</span>
                      </div>
                      {dayScenes.map((sc, i) => {
                        const loc = locForScene(sc.id);
                        const cast = (sc.breakdown?.cast as string[]) || [];
                        return (
                          <div key={sc.id} className="px-3 py-2 border-t border-[var(--border)] text-[12px]">
                            <div className="text-[var(--text)] font-medium">{i + 1}. {strip(sc.name) || 'Scene'}</div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-0.5 text-[10.5px] text-[var(--text-muted)]">
                              {loc && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{loc.name} ({loc.intExt.toUpperCase()}/{loc.timeOfDay})</span>}
                              {cast.length > 0 && <span className="flex items-center gap-1 truncate"><Users className="w-3 h-3" />{cast.join(', ')}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  <p className="text-[10px] text-[var(--text-muted)]">Scenes group by shoot date (set per scene in the Director view). Cast comes from the Script Breakdown; locations from the Locations view.</p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
