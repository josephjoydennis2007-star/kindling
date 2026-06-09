import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, HardDrive, Trash2, ImageOff, AlertTriangle, RefreshCw, Gauge, CloudUpload } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import {
  estimateUsage, storyMediaBytes, purgeStoryImages, deleteStoryRecords,
  clearAllStoryData, humanBytes,
} from '@/lib/idbAdmin';

/**
 * Storage Manager — diagnose and reclaim browser memory/space. The real cause
 * of the out-of-memory crashes is base64 images embedded in stories piling up
 * (e.g. 725 MB in IndexedDB). This panel lets the user SEE the usage and free
 * it: remove images per-story (keeps the script), delete stories (safe even for
 * snapshots too big to open), or clear everything. Opens on `app:openStorage`.
 */
export default function StorageManager({ autoCrashedId }: { autoCrashedId?: string | null } = {}) {
  const [open, setOpen] = useState(false);
  const [crashedId, setCrashedId] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const stories = useAppStore((s) => s.stories);
  const removeStoryFromStore = useAppStore((s) => s.deleteStory);

  const refreshUsage = useCallback(async () => {
    setUsage(await estimateUsage());
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent).detail?.crashedStoryId || null;
      setCrashedId(id);
      setOpen(true);
      refreshUsage();
    };
    document.addEventListener('app:openStorage', onOpen);
    return () => document.removeEventListener('app:openStorage', onOpen);
  }, [refreshUsage]);

  // Safe-mode: App passes the id of the story that crashed last boot — open
  // automatically so the user lands straight on the recovery screen.
  useEffect(() => {
    if (autoCrashedId) { setCrashedId(autoCrashedId); setOpen(true); refreshUsage(); }
  }, [autoCrashedId, refreshUsage]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Measure per-story media sizes one at a time (don't hold them all in memory).
  const measureSizes = useCallback(async () => {
    setBusy('measure');
    const out: Record<string, number> = {};
    for (const s of useAppStore.getState().stories) {
      try { out[s.id] = await storyMediaBytes(s.id); } catch { out[s.id] = 0; }
    }
    setSizes(out);
    setBusy(null);
  }, []);

  const removeImages = useCallback(async (id: string, title: string) => {
    setBusy(id);
    const r = await purgeStoryImages(id);
    setBusy(null);
    if (r.ok) {
      setSizes((s) => ({ ...s, [id]: 0 }));
      refreshUsage();
      toast.success(`Removed images from “${title}”`, {
        description: r.removed ? `Freed ${humanBytes(r.bytesFreed)}. Script & scenes kept.` : 'No embedded images found.',
      });
    } else {
      toast.error('Could not remove images', { description: 'The story may be too large to open. Try Delete instead.' });
    }
  }, [refreshUsage]);

  const deleteStory = useCallback(async (id: string, title: string) => {
    if (!window.confirm(`Delete “${title}” permanently from this device? This frees its memory and cannot be undone.`)) return;
    setBusy(id);
    await deleteStoryRecords(id);          // IndexedDB (by key — safe even if huge)
    try { removeStoryFromStore(id); } catch { /* ignore */ }
    // Best-effort cloud delete too.
    try { const m = await import('@/lib/cloudStories'); await (m as any).deleteStoryCloud?.(id); } catch { /* ignore */ }
    setBusy(null);
    setSizes((s) => { const n = { ...s }; delete n[id]; return n; });
    if (crashedId === id) setCrashedId(null);
    refreshUsage();
    toast.success(`Deleted “${title}”`);
  }, [removeStoryFromStore, refreshUsage, crashedId]);

  const removeAllImages = useCallback(async () => {
    if (!window.confirm('Remove embedded images from ALL stories? Scripts, scenes and structure are kept. Images attached by URL are kept; only uploaded/base64 images are removed.')) return;
    setBusy('all');
    let freed = 0;
    for (const s of useAppStore.getState().stories) {
      try { const r = await purgeStoryImages(s.id); freed += r.bytesFreed; } catch { /* skip */ }
    }
    setBusy(null);
    setSizes({});
    refreshUsage();
    toast.success('Removed images from all stories', { description: `Freed ${humanBytes(freed)}.` });
  }, [refreshUsage]);

  const moveAllToCloud = useCallback(async () => {
    const { canUploadToCloud } = await import('@/lib/mediaUpload');
    if (!canUploadToCloud()) {
      toast.error('Sign in first', { description: 'Cloud upload needs you signed in with Firebase Storage enabled.' });
      return;
    }
    if (!window.confirm('Move all embedded images from this device into your cloud Storage? Stories keep their images (now as cloud links) and your device/RAM use drops a lot. This can take a while for large stories.')) return;
    setBusy('cloud');
    let moved = 0, freed = 0;
    const { migrateStoryImagesToCloud } = await import('@/lib/mediaUpload');
    for (const s of useAppStore.getState().stories) {
      try { const r = await migrateStoryImagesToCloud(s.id); moved += r.moved; freed += r.bytesMoved; } catch { /* skip */ }
    }
    setBusy(null);
    setSizes({});
    refreshUsage();
    toast.success(`Moved ${moved} image${moved === 1 ? '' : 's'} to the cloud`, {
      description: moved ? `Freed ~${humanBytes(freed)} from this device. Reload to see the lighter stories.` : 'No embedded images to move.',
      duration: 8000,
    });
  }, [refreshUsage]);

  const clearEverything = useCallback(async () => {
    if (!window.confirm('Clear ALL local story data on this device? This cannot be undone. Stories synced to the cloud (Firebase/GitHub) can be recovered by signing in again.')) return;
    setBusy('nuke');
    await clearAllStoryData();
    try { localStorage.removeItem('kindling-load-attempt'); } catch { /* ignore */ }
    setBusy(null);
    toast.success('Local data cleared — reloading…');
    setTimeout(() => window.location.reload(), 800);
  }, []);

  const pct = usage && usage.quota ? Math.min(100, (usage.usage / usage.quota) * 100) : 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[260] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[90vh] bg-[var(--panel)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-[var(--accent)]" />
              <span className="text-sm font-bold text-[var(--text)]">Storage &amp; memory</span>
              <div className="flex-1" />
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {crashedId && (
                <div className="flex gap-3 p-3 rounded-lg bg-[var(--danger)]/10 border border-[var(--danger)]/40">
                  <AlertTriangle className="w-5 h-5 text-[var(--danger)] flex-shrink-0 mt-0.5" />
                  <div className="text-[12px] text-[var(--text)]">
                    <b>One story was too large and crashed the app.</b> It’s “{stories.find((s) => s.id === crashedId)?.title || crashedId}”. To recover, <b>Remove images</b> (keeps the script) or <b>Delete</b> it below. The rest of the app is safe.
                  </div>
                </div>
              )}

              {/* Usage gauge */}
              <div className="p-3 rounded-lg bg-[var(--card)] border border-[var(--border)]">
                <div className="flex items-center gap-2 mb-2">
                  <Gauge className="w-4 h-4 text-[var(--accent)]" />
                  <span className="text-[12px] font-semibold text-[var(--text)]">This device</span>
                  <div className="flex-1" />
                  <button onClick={refreshUsage} className="text-[var(--text-muted)] hover:text-[var(--accent)]" title="Refresh"><RefreshCw className="w-3.5 h-3.5" /></button>
                </div>
                <div className="h-2.5 rounded-full bg-[var(--hover)] overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1.5 text-[11px] text-[var(--text-secondary)]">
                  {usage ? `${humanBytes(usage.usage)} used of ${humanBytes(usage.quota)} available` : 'Measuring…'}
                  {usage && usage.quota > 0 && ` (${pct.toFixed(1)}%)`}
                </p>
                <p className="mt-1 text-[10.5px] text-[var(--text-muted)]">
                  Crashes come from <b>memory (RAM)</b>, not from running out of this space — embedded images make a single story too big to open. Remove images to fix it.
                </p>
              </div>

              {/* Bulk actions */}
              <div className="flex flex-wrap gap-2">
                <button onClick={measureSizes} disabled={!!busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-40">
                  {busy === 'measure' ? '…measuring' : <><Gauge className="w-3.5 h-3.5" /> Measure story sizes</>}
                </button>
                <button onClick={moveAllToCloud} disabled={!!busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-110 disabled:opacity-40">
                  {busy === 'cloud' ? '…moving' : <><CloudUpload className="w-3.5 h-3.5" /> Move images to cloud (recommended)</>}
                </button>
                <button onClick={removeAllImages} disabled={!!busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--danger)] hover:border-[var(--danger)] disabled:opacity-40">
                  {busy === 'all' ? '…working' : <><ImageOff className="w-3.5 h-3.5" /> Remove images from all stories</>}
                </button>
              </div>

              {/* Per-story list */}
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-1.5">Stories on this device</div>
                {stories.length === 0 && <p className="text-[11px] text-[var(--text-muted)]">No stories.</p>}
                <div className="space-y-1.5">
                  {stories.map((s) => (
                    <div key={s.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${crashedId === s.id ? 'border-[var(--danger)]/50 bg-[var(--danger)]/5' : 'border-[var(--border)] bg-[var(--card)]'}`}>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-semibold text-[var(--text)] truncate">{s.title}</div>
                        <div className="text-[10px] text-[var(--text-muted)]">
                          {sizes[s.id] != null ? (sizes[s.id] > 0 ? `${humanBytes(sizes[s.id])} of images` : 'no embedded images') : 'size unknown'}
                          {s.storedOn === 'github' && ' · on GitHub'}
                        </div>
                      </div>
                      <button onClick={() => removeImages(s.id, s.title)} disabled={!!busy}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold bg-[var(--hover)] text-[var(--text-secondary)] hover:text-[var(--accent)] disabled:opacity-40" title="Remove embedded images, keep the script">
                        {busy === s.id ? '…' : <><ImageOff className="w-3 h-3" /> Images</>}
                      </button>
                      <button onClick={() => deleteStory(s.id, s.title)} disabled={!!busy}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/10 disabled:opacity-40" title="Delete story permanently">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Danger zone */}
              <div className="pt-2 border-t border-[var(--border)]">
                <button onClick={clearEverything} disabled={!!busy}
                  className="text-[11px] font-semibold text-[var(--danger)] hover:underline disabled:opacity-40">
                  {busy === 'nuke' ? '…clearing' : 'Clear ALL local story data (last resort)'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
