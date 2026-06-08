import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, History, RotateCcw, Loader2, Clock, User } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { listVersions, saveVersion, type StoryVersion } from '@/lib/cloudStories';

/**
 * VersionHistory — browse + restore cloud snapshots of the active story.
 * Opens on the `app:openVersions` event (fired from the TopBar ⋯ menu).
 * Restoring first snapshots the CURRENT state ("Before restore") so a restore
 * is itself undoable, then loads the chosen snapshot and saves it.
 */
function relTime(ms?: number): string {
  if (!ms) return 'just now';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}

function sizeKb(bytes?: number): string {
  if (!bytes) return '';
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function VersionHistory() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<StoryVersion[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const activeStoryId = useAppStore((s) => s.activeStoryId);

  const load = useCallback(async () => {
    if (!activeStoryId) return;
    setLoading(true);
    try {
      setVersions(await listVersions(activeStoryId));
    } catch {
      toast.error('Could not load version history (are you signed in?)');
    } finally {
      setLoading(false);
    }
  }, [activeStoryId]);

  useEffect(() => {
    const onOpen = () => { setOpen(true); load(); };
    document.addEventListener('app:openVersions', onOpen);
    return () => document.removeEventListener('app:openVersions', onOpen);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const restore = async (v: StoryVersion) => {
    if (!activeStoryId) return;
    if (!window.confirm(`Restore this version from ${relTime(v.createdAt)}? Your current version is snapshotted first, so you can undo this.`)) return;
    setRestoringId(v.id);
    try {
      // Snapshot the current state first so the restore itself is reversible.
      const current = useAppStore.getState().exportStory();
      const title = useAppStore.getState().stories.find((s) => s.id === activeStoryId)?.title || 'Untitled';
      await saveVersion(activeStoryId, { data: current, title, label: 'Before restore' }).catch(() => {});
      // Load the chosen snapshot into the live store + persist.
      const ok = useAppStore.getState().importStory(v.data);
      if (!ok) { toast.error('That snapshot is corrupt and could not be restored.'); return; }
      setTimeout(() => document.dispatchEvent(new CustomEvent('writer:rebuild')), 0);
      document.dispatchEvent(new CustomEvent('app:save'));
      toast.success(`Restored version from ${relTime(v.createdAt)}`);
      setOpen(false);
    } finally {
      setRestoringId(null);
    }
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
            className="w-full max-w-md max-h-[80vh] bg-[var(--panel)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[var(--accent)]" />
                <span className="text-sm font-bold text-[var(--text)]">Version history</span>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]">
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-2">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-[var(--text-muted)] text-sm gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : versions.length === 0 ? (
                <div className="text-center py-12 px-4 text-[var(--text-muted)] text-sm">
                  <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No saved versions yet. Snapshots are created each time you save (Ctrl/Cmd+S) while signed in.
                </div>
              ) : (
                versions.map((v, i) => (
                  <div
                    key={v.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--hover)] transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-[13px] text-[var(--text)] font-medium">
                        {v.label || 'Save'}
                        {i === 0 && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] font-bold">Latest</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[10.5px] text-[var(--text-muted)]">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{relTime(v.createdAt)}</span>
                        {v.authorName && <span className="flex items-center gap-1 truncate"><User className="w-3 h-3" />{v.authorName}</span>}
                        {v.bytes ? <span className="tabular-nums">{sizeKb(v.bytes)}</span> : null}
                      </div>
                    </div>
                    <button
                      onClick={() => restore(v)}
                      disabled={restoringId === v.id}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all disabled:opacity-60"
                    >
                      {restoringId === v.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                      Restore
                    </button>
                  </div>
                ))
              )}
            </div>

            <footer className="px-4 py-2.5 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)]">
              Keeps the latest {versions.length > 0 ? versions.length : ''} snapshots. Restoring snapshots your current version first.
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
