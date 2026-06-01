import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Loader2, Quote, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { auth } from '@/firebase';
import { addComment } from '@/lib/cloudStories';

/**
 * InlineCommentPopup — a floating comment editor that opens near a text
 * selection or click location and posts to /stories/{id}/comments.
 *
 * Three ways to open it:
 *   1. TopBar Comment button — dispatches `app:openInlineComment` with
 *      the current selection (if any).
 *   2. Cmd/Ctrl + Shift + M keyboard shortcut — same.
 *   3. Right-click on the writer / director / plot view → custom context
 *      menu has an "Add comment" entry that dispatches the event.
 *
 * Payload format (CustomEvent detail):
 *   {
 *     x:       number   // viewport x for popup positioning
 *     y:       number   // viewport y
 *     tab:     string   // 'writer' | 'director' | 'plot' — current panel
 *     snippet: string   // (optional) the selected text the user is
 *                       //   commenting on, max ~120 chars
 *     target:  string   // (optional) free-form anchor string the comment
 *                       //   will be stored against. Defaults to a
 *                       //   'tab:line-snippet' descriptor.
 *   }
 *
 * The popup positions itself with the selection rect when possible so the
 * comment box appears RIGHT NEXT to the highlighted text — not in a far-
 * away modal — which matches what the user asked for.
 *
 * NOTE for v2: inline highlight overlays on commented lines + dblclick-to-
 * reopen need a ProseMirror plugin for the writer view + per-element data
 * attributes in director/plot views. They're a separate piece of work and
 * are intentionally NOT in this round.
 */

interface OpenState {
  open: boolean;
  x: number;
  y: number;
  tab: string;
  snippet: string;
  target: string;
}

export default function InlineCommentPopup() {
  const activeStoryId = useAppStore((s) => s.activeStoryId);
  const [state, setState] = useState<OpenState | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Listen for the open event from anywhere in the app.
  useEffect(() => {
    const onOpen = (e: any) => {
      const d = e.detail || {};
      // Default position: visible center if no anchor.
      const x = typeof d.x === 'number' ? d.x : Math.round(window.innerWidth / 2 - 160);
      const y = typeof d.y === 'number' ? d.y : 120;
      setState({
        open: true,
        x, y,
        tab: d.tab || 'general',
        snippet: (d.snippet || '').toString().slice(0, 240),
        target: d.target || `${d.tab || 'general'}${d.snippet ? ':' + d.snippet.slice(0, 40) : ''}`,
      });
      setText('');
    };
    document.addEventListener('app:openInlineComment', onOpen);
    return () => document.removeEventListener('app:openInlineComment', onOpen);
  }, []);

  // Auto-focus the textarea on open.
  useEffect(() => {
    if (state?.open) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [state?.open]);

  // Escape closes.
  useEffect(() => {
    if (!state?.open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setState(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state?.open]);

  const submit = async () => {
    if (!text.trim() || !activeStoryId || !state) return;
    if (!auth?.currentUser) {
      toast.error('Sign in to comment.');
      return;
    }
    setBusy(true);
    try {
      await addComment({
        storyId: activeStoryId,
        text: text.trim(),
        // Encode tab + snippet so the Comments panel can show what the
        // comment is attached to. The "writer" / "director" / "plot"
        // prefix mirrors the target strings used by addComment elsewhere.
        target: state.target,
      });
      toast.success('Comment posted');
      setState(null);
      setText('');
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[InlineCommentPopup] post failed', err);
      const msg = err?.code === 'permission-denied'
        ? 'You need to be a story member to comment.'
        : err?.message || 'Could not post comment';
      toast.error(msg);
    } finally { setBusy(false); }
  };

  if (!state?.open) return null;

  // Clamp position so the popup is always fully visible.
  const W = 320;
  const H = 220;
  const x = Math.min(Math.max(state.x, 12), window.innerWidth - W - 12);
  const y = Math.min(Math.max(state.y, 12), window.innerHeight - H - 12);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: -4 }}
        transition={{ duration: 0.12 }}
        className="fixed z-[300] bg-[var(--panel)] border border-[var(--accent)]/40 rounded-lg shadow-2xl overflow-hidden"
        style={{ left: x, top: y, width: W }}
        role="dialog"
        aria-label="Add a comment"
      >
        <div className="flex items-center justify-between px-3 h-9 border-b border-[var(--rule)] bg-[var(--bg)]">
          <div className="flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
            <span className="text-[11px] font-semibold text-[var(--text)]">Add comment</span>
            <span className="text-[9.5px] text-[var(--text-muted)] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--surface-2)]">
              {state.tab}
            </span>
          </div>
          <button onClick={() => setState(null)} className="p-1 rounded hover:bg-[var(--hover)]" aria-label="Close">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Snippet preview — what they're commenting on. */}
        {state.snippet && (
          <div className="px-3 py-2 bg-[var(--surface-2)] border-b border-[var(--rule)] flex items-start gap-1.5">
            <Quote className="w-3 h-3 flex-shrink-0 mt-0.5 text-[var(--text-muted)]" />
            <span className="text-[10.5px] text-[var(--text-secondary)] italic leading-snug line-clamp-2 break-words">
              {state.snippet}
            </span>
          </div>
        )}

        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
          }}
          rows={4}
          placeholder="Type your note…"
          disabled={busy}
          className="w-full px-3 py-2 bg-[var(--panel)] text-[12px] text-[var(--text)] outline-none resize-none border-b border-[var(--rule)]"
        />

        <div className="flex items-center justify-between gap-2 px-3 h-9 bg-[var(--bg)]">
          <span className="text-[9.5px] text-[var(--text-muted)]">Ctrl + Enter to post</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setState(null)}
              className="px-2.5 py-1 rounded text-[11px] text-[var(--text-secondary)] hover:bg-[var(--hover)]"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!text.trim() || busy}
              className="px-2.5 py-1 rounded bg-[var(--accent)] text-[var(--accent-ink)] text-[11px] font-semibold hover:brightness-110 disabled:opacity-50 flex items-center gap-1"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Post
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * openInlineCommentFromSelection — helper to fire the open event with the
 * current text selection (if any) and position the popup right next to it.
 * Used by the TopBar button + keyboard shortcut + context menu.
 */
export function openInlineCommentFromSelection(tab: string, fallbackX?: number, fallbackY?: number): void {
  const sel = typeof window !== 'undefined' ? window.getSelection() : null;
  let snippet = '';
  let x = fallbackX ?? Math.round(window.innerWidth / 2 - 160);
  let y = fallbackY ?? 120;
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
    const range = sel.getRangeAt(0);
    snippet = sel.toString().trim();
    const rect = range.getBoundingClientRect();
    if (rect && (rect.width > 0 || rect.height > 0)) {
      // Position popup BELOW the selection, slightly offset to the right.
      x = rect.left;
      y = rect.bottom + 8;
    }
  }
  document.dispatchEvent(new CustomEvent('app:openInlineComment', {
    detail: { x, y, tab, snippet, target: `${tab}${snippet ? ':' + snippet.slice(0, 40) : ''}` },
  }));
}
