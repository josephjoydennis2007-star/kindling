import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageCircle, Send, Loader2, Check, Trash2, CircleDot, Circle } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { auth } from '@/firebase';
import {
  watchComments,
  addComment,
  setCommentResolved,
  deleteComment,
  type CloudComment,
} from '@/lib/cloudStories';

/**
 * CommentsPanel — story-wide comment thread for owner + collaborators.
 *
 * Producers can only comment (no editing), so this panel is their main
 * surface. Writers / directors can also comment to leave notes for each
 * other. Comments live at /stories/{storyId}/comments and update live
 * via onSnapshot.
 *
 * For v1 each comment is a story-wide note; the `target` field is set
 * to whatever view the user was on when they posted (writer / director /
 * plot). Later rounds can anchor comments to a specific line / scene /
 * beat using the same target string.
 */

interface Props {
  onClose: () => void;
  /** The view the user is currently on — stamped into the comment so we
   *  can show a small badge ("Writer · " / "Director · ") on each note. */
  currentTab?: string;
}

export default function CommentsPanel({ onClose, currentTab }: Props) {
  const activeStoryId = useAppStore((s) => s.activeStoryId);
  const [comments, setComments] = useState<CloudComment[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const me = auth?.currentUser;
  const myUid = me?.uid;

  // Subscribe to comments on the active story. Cleans up when storyId
  // changes or the panel closes.
  useEffect(() => {
    if (!activeStoryId || !me) { setComments([]); return; }
    const unsub = watchComments(activeStoryId,
      (items) => setComments(items),
      (err) => {
        // eslint-disable-next-line no-console
        console.warn('[CommentsPanel] watch failed:', err);
      });
    return () => unsub();
  }, [activeStoryId, me?.uid]);

  const visible = filter === 'open' ? comments.filter((c) => !c.resolved) : comments;

  const post = async () => {
    if (!text.trim() || !activeStoryId) return;
    setBusy(true);
    try {
      await addComment({
        storyId: activeStoryId,
        text: text.trim(),
        target: currentTab || 'general',
      });
      setText('');
    } catch (err: any) {
      toast.error(err?.message || 'Could not post comment');
    } finally { setBusy(false); }
  };

  if (!me) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
        className="h-full flex flex-col bg-[var(--panel)]"
      >
        <Header onClose={onClose} count={0} />
        <div className="flex-1 flex items-center justify-center p-6 text-center text-[11px] text-[var(--text-muted)]">
          <div>
            <MessageCircle className="w-7 h-7 mx-auto opacity-40 mb-2" />
            Sign in to leave or read comments.
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
      className="h-full flex flex-col bg-[var(--panel)]"
    >
      <Header onClose={onClose} count={comments.filter((c) => !c.resolved).length} />

      {/* Filter strip */}
      <div className="flex border-b border-[var(--rule)]">
        {(['open', 'all'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`flex-1 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
              filter === k ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {k === 'open' ? 'Open' : 'All'}
            <span className="ml-1 text-[var(--text-muted)]">
              ({k === 'open' ? comments.filter((c) => !c.resolved).length : comments.length})
            </span>
          </button>
        ))}
      </div>

      {/* Comment list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {visible.length === 0 && (
          <div className="text-center py-10 text-[var(--text-muted)] text-xs">
            <MessageCircle className="w-7 h-7 mx-auto opacity-50 mb-2" />
            <p>No {filter === 'open' ? 'open' : ''} comments yet</p>
            <p className="text-[10px] mt-1">Leave a note for your team below.</p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {visible.map((c) => (
            <motion.div
              key={c.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className={`p-3 rounded-md border ${
                c.resolved
                  ? 'bg-[var(--surface-2)] border-[var(--rule)] opacity-70'
                  : 'bg-[var(--card)] border-[var(--border)]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[10.5px] text-[var(--text-muted)]">
                    <span className="font-bold text-[var(--text)]">{c.authorName}</span>
                    {c.target && c.target !== 'general' && (
                      <span className="px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] text-[9px] uppercase tracking-wider">
                        {c.target}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[12px] text-[var(--text)] whitespace-pre-wrap break-words leading-relaxed">
                    {c.text}
                  </p>
                  <div className="mt-1 text-[9.5px] text-[var(--text-muted)]">
                    {new Date(c.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    title={c.resolved ? 'Reopen' : 'Mark resolved'}
                    onClick={async () => {
                      try {
                        await setCommentResolved(activeStoryId!, c.id, !c.resolved);
                      } catch (err: any) { toast.error(err?.message || 'Could not update'); }
                    }}
                    className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--hover)]"
                  >
                    {c.resolved ? <Circle className="w-3 h-3" /> : <CircleDot className="w-3 h-3" />}
                  </button>
                  {c.authorId === myUid && (
                    <button
                      title="Delete"
                      onClick={async () => {
                        if (!confirm('Delete this comment?')) return;
                        try {
                          await deleteComment(activeStoryId!, c.id);
                        } catch (err: any) { toast.error(err?.message || 'Could not delete'); }
                      }}
                      className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/10"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              {c.resolved && (
                <div className="mt-1.5 text-[9.5px] text-[var(--accent)] uppercase tracking-wider font-bold flex items-center gap-1">
                  <Check className="w-2.5 h-2.5" />
                  Resolved
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Composer */}
      <div className="border-t border-[var(--rule)] p-2 bg-[var(--bg)]">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); post(); }
            }}
            rows={2}
            placeholder={activeStoryId
              ? `Leave a note${currentTab ? ` on the ${currentTab} view` : ''}…`
              : 'Open a story to comment.'}
            disabled={!activeStoryId || busy}
            className="flex-1 px-3 py-2 rounded-md bg-[var(--card)] border border-[var(--border)] text-[11.5px] text-[var(--text)] outline-none focus:border-[var(--accent)] resize-none"
          />
          <button
            onClick={post}
            disabled={!text.trim() || busy || !activeStoryId}
            className="p-2 rounded-md bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-110 disabled:opacity-50"
            title="Post (Ctrl+Enter)"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="mt-1 text-[9.5px] text-[var(--text-muted)] text-right">Ctrl+Enter to post</p>
      </div>
    </motion.div>
  );
}

function Header({ onClose, count }: { onClose: () => void; count: number }) {
  return (
    <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-[var(--accent-soft)] border border-[var(--accent)]/40 flex items-center justify-center">
          <MessageCircle className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <div className="text-xs font-semibold text-[var(--text)]">Comments</div>
          <div className="text-[10px] text-[var(--text-muted)]">{count} open</div>
        </div>
      </div>
      <button onClick={onClose} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
