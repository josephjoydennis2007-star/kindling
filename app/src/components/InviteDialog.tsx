import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, X, Loader2, AlertCircle, LogIn, Check, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { inviteByEmail, pushStory } from '@/lib/cloudStories';
import type { User } from 'firebase/auth';

/**
 * InviteDialog — send an email invite to a collaborator.
 *
 * When the inviter sends, we:
 *   1. Push the latest story payload to Firestore so the invitee has
 *      something to read once they accept.
 *   2. Create an /invites doc keyed by their lowercased email. They'll
 *      see it in their pending-invites list as soon as they sign in
 *      with the same address.
 *
 * Opens via the `app:invite` custom event from the TopBar ⋯ menu.
 */

interface Props {
  user: User | null;
  onOpenAuth: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function InviteDialog({ user, onOpenAuth }: Props) {
  const stories = useAppStore((s) => s.stories);
  const activeStoryId = useAppStore((s) => s.activeStoryId);
  const exportStory = useAppStore((s) => s.exportStory);
  const story = stories.find((s) => s.id === activeStoryId);

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true); setEmail(''); setSent([]); setError(null);
    };
    document.addEventListener('app:invite', onOpen);
    return () => document.removeEventListener('app:invite', onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const send = async () => {
    const addr = email.trim().toLowerCase();
    if (!user || !activeStoryId || !story) return;
    if (!EMAIL_RE.test(addr)) { setError("That doesn't look like a valid email."); return; }
    if (addr === user.email?.toLowerCase()) { setError("That's your own address."); return; }
    if (sent.includes(addr)) { setError('Already invited in this session.'); return; }

    setBusy(true); setError(null);
    try {
      await pushStory({
        storyId: activeStoryId,
        title: story.title || 'Untitled',
        data: exportStory(),
      });
      await inviteByEmail({
        storyId: activeStoryId,
        storyTitle: story.title || 'Untitled',
        toEmail: addr,
      });
      setSent((prev) => [...prev, addr]);
      setEmail('');
      toast.success(`Invite sent to ${addr}`);
    } catch (err: any) {
      const msg = err?.code === 'permission-denied'
        ? 'Cloud sync blocked — check Firestore rules in Firebase Console.'
        : (err?.message || 'Could not send invite.');
      setError(msg);
      toast.error(msg);
    } finally { setBusy(false); }
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
            aria-label="Invite collaborator"
          >
            <header className="flex items-center justify-between px-4 h-11 border-b border-[var(--rule)] bg-[var(--bg)]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-[var(--accent-soft)] border border-[var(--accent)]/40 flex items-center justify-center">
                  <UserPlus className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                </div>
                <div>
                  <div className="text-xs font-semibold">Invite collaborator</div>
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
                    Inviting collaborators requires a signed-in account.
                  </div>
                  <button
                    onClick={() => { setOpen(false); onOpenAuth(); }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md bg-[var(--accent)] text-[var(--accent-ink)] text-sm font-semibold hover:brightness-110"
                  >
                    <LogIn className="w-4 h-4" /> Sign in to invite
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label htmlFor="invite-email" className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">
                      Email address
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1 relative">
                        <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
                        <input
                          id="invite-email"
                          type="email"
                          autoFocus
                          value={email}
                          onChange={(e) => { setEmail(e.target.value); setError(null); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !busy) send(); }}
                          placeholder="collaborator@example.com"
                          disabled={busy}
                          className="w-full pl-8 pr-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-md text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                      <button
                        onClick={send}
                        disabled={busy || !email.trim()}
                        className="px-3 py-2 rounded-md bg-[var(--accent)] text-[var(--accent-ink)] text-[11px] font-semibold hover:brightness-110 disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                        Send
                      </button>
                    </div>
                    <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">
                      They'll see the invite when they sign in with that email.
                      Accepting adds them as an editor (read + write).
                    </p>
                  </div>

                  {sent.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">
                        Sent this session
                      </div>
                      <ul className="space-y-1">
                        {sent.map((addr) => (
                          <li key={addr} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[var(--surface-2)] text-[11px]">
                            <Check className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                            <span className="flex-1 truncate text-[var(--text)]">{addr}</span>
                            <span className="text-[9.5px] text-[var(--text-muted)] uppercase tracking-wider">Pending</span>
                          </li>
                        ))}
                      </ul>
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
