import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2, X, Copy, Check, Loader2, Eye, EyeOff, AlertCircle, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { setShareable, pushStory } from '@/lib/cloudStories';
import type { User } from 'firebase/auth';

/**
 * ShareDialog — toggle a story between private and shareable, copy the link.
 *
 * Workflow:
 *   1. User picks "Share story…" from the TopBar ⋯ menu
 *   2. Dialog opens, shows current shareable state
 *   3. If signed in: a switch toggles shareable. The link is shown and
 *      a copy button is provided. Before the first share, we push the
 *      story to Firestore so there's something to read.
 *   4. If NOT signed in: shows a sign-in CTA instead — sharing requires
 *      a cloud-backed copy of the story.
 *
 * Opens via the `app:shareStory` custom event dispatched by the TopBar ⋯
 * menu. Closes on outside click + Escape.
 */

interface Props {
  user: User | null;
  onOpenAuth: () => void;
}

export default function ShareDialog({ user, onOpenAuth }: Props) {
  const stories = useAppStore((s) => s.stories);
  const activeStoryId = useAppStore((s) => s.activeStoryId);
  const exportStory = useAppStore((s) => s.exportStory);
  const story = stories.find((s) => s.id === activeStoryId);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shareable, setShareableLocal] = useState(false);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = () => { setOpen(true); setError(null); setCopied(false); };
    document.addEventListener('app:shareStory', onOpen);
    return () => document.removeEventListener('app:shareStory', onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const toggleShare = async (next: boolean) => {
    if (!user || !activeStoryId || !story) return;
    setBusy(true); setError(null);
    try {
      // Make sure the story exists in Firestore before flipping shareable
      // (rules can't read a doc that doesn't exist yet).
      await pushStory({
        storyId: activeStoryId,
        title: story.title || 'Untitled',
        data: exportStory(),
      });
      const url = await setShareable(activeStoryId, next);
      setShareableLocal(next);
      setLink(next ? url : '');
      if (next) toast.success('Anyone with this link can now view the story.');
      else toast.success('Story is private again.');
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[ShareDialog] toggleShare failed', err);
      const msg = err?.code === 'permission-denied'
        ? 'The Firestore rules denied this write. Check DevTools Console for the exact error.'
        : (err?.message || 'Could not change share state.');
      setError(msg);
      // Don't double the toast for permission errors — the inline banner
      // already shows them.
      if (err?.code !== 'permission-denied') toast.error(msg);
    } finally { setBusy(false); }
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success('Link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — long-press the link to copy manually.');
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-3"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.96, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[var(--panel)] border border-[var(--rule)] rounded-lg shadow-2xl overflow-hidden"
            role="dialog"
            aria-label="Share story"
          >
            <header className="flex items-center justify-between px-4 h-11 border-b border-[var(--rule)] bg-[var(--bg)]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-[var(--accent-soft)] border border-[var(--accent)]/40 flex items-center justify-center">
                  <Share2 className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                </div>
                <div>
                  <div className="text-xs font-semibold">Share story</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{story?.title || 'Untitled'}</div>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-md hover:bg-[var(--hover)]" aria-label="Close">
                <X className="w-3.5 h-3.5" />
              </button>
            </header>

            <div className="p-4 space-y-4">
              {!user ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-md bg-[var(--warning)]/10 border border-[var(--warning)]/30 flex items-start gap-2 text-[11px] text-[var(--text-secondary)]">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
                    Sharing requires signing in. The story is stored in your Firebase project so other people can read it via the link.
                  </div>
                  <button
                    onClick={() => { setOpen(false); onOpenAuth(); }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md bg-[var(--accent)] text-[var(--accent-ink)] text-sm font-semibold hover:brightness-110"
                  >
                    <LogIn className="w-4 h-4" /> Sign in to share
                  </button>
                </div>
              ) : (
                <>
                  <label className="flex items-center justify-between gap-3 p-3 rounded-md bg-[var(--surface-2)] border border-[var(--border)]">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--text)]">
                        {shareable ? 'Anyone with the link can view' : 'Private to you'}
                      </div>
                      <div className="text-[10.5px] text-[var(--text-muted)] mt-0.5">
                        {shareable
                          ? 'Read-only. Editors must be invited individually.'
                          : 'Only you can open this story.'}
                      </div>
                    </div>
                    <button
                      role="switch"
                      aria-checked={shareable}
                      disabled={busy}
                      onClick={() => toggleShare(!shareable)}
                      className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
                        shareable ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 ${shareable ? 'left-[18px]' : 'left-0.5'} w-5 h-5 rounded-full bg-white transition-all flex items-center justify-center`}
                      >
                        {busy ? <Loader2 className="w-3 h-3 animate-spin text-[var(--text-muted)]" />
                          : shareable ? <Eye className="w-3 h-3 text-[var(--accent)]" />
                          : <EyeOff className="w-3 h-3 text-[var(--text-muted)]" />}
                      </span>
                    </button>
                  </label>

                  {shareable && link && (
                    <div className="space-y-2">
                      <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">
                        Share link
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          readOnly
                          value={link}
                          className="flex-1 px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-md text-[11px] text-[var(--text)] outline-none focus:border-[var(--accent)] font-mono"
                          onClick={(e) => (e.target as HTMLInputElement).select()}
                        />
                        <button
                          onClick={copyLink}
                          className="px-3 py-2 rounded-md bg-[var(--accent)] text-[var(--accent-ink)] text-[11px] font-semibold hover:brightness-110 flex items-center gap-1.5"
                        >
                          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          {copied ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        Anyone with this link who is signed in can open the latest saved version.
                        They get a read-only copy — to let them edit, use <strong>Invite collaborator</strong>.
                      </p>
                    </div>
                  )}

                  {error && (
                    <div className="p-2 rounded-md bg-[var(--danger)]/10 border border-[var(--danger)]/30 text-[11px] text-[var(--danger)] flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      {error}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
