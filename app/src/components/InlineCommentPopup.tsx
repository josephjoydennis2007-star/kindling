import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Loader2, Quote, MessageCircle, GripHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { auth } from '@/firebase';
import { addComment, updateCommentText, deleteComment } from '@/lib/cloudStories';

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
  /** Set when reopening an existing comment for editing. The popup
   *  pre-fills the textarea + saves via updateCommentText / deletes via
   *  deleteComment instead of creating a new comment. */
  editing?: { commentId: string; initialText: string; authorId: string };
}

// Popup dimensions used for positioning math + clamping. Must match the
// rendered <motion.div style={{ width: W }} /> + roughly the actual
// rendered height (close enough — we clamp on the live rect anyway).
const POPUP_W = 320;
const POPUP_H = 230;

/** Find the workspace bounds the popup is allowed to roam in. The user
 *  asked for the popup to be moveable only within the "panel actual
 *  working space" — i.e. NOT over the IconRail (left), Context/Right
 *  panel, TopBar, or StatusLine. The .view-container div in App.tsx
 *  spans exactly that area, so we anchor to its bounding rect. Falls
 *  back to the full viewport if for some reason the element isn't
 *  found. */
function getWorkspaceBounds(): { left: number; top: number; right: number; bottom: number } {
  const el = document.querySelector('.view-container') as HTMLElement | null;
  if (el) {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }
  return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
}

/** Clamp a desired (x, y) so the popup stays fully inside the workspace. */
function clampToWorkspace(x: number, y: number, w = POPUP_W, h = POPUP_H) {
  const b = getWorkspaceBounds();
  return {
    x: Math.min(Math.max(x, b.left + 8), b.right - w - 8),
    y: Math.min(Math.max(y, b.top + 8), b.bottom - h - 8),
  };
}

export default function InlineCommentPopup() {
  const activeStoryId = useAppStore((s) => s.activeStoryId);
  const [state, setState] = useState<OpenState | null>(null);
  // Position is now tracked separately so the popup can be DRAGGED after
  // opening. The opening event sets the initial value; drag updates it.
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  // Listen for the open event from anywhere in the app.
  useEffect(() => {
    const onOpen = (e: any) => {
      const d = e.detail || {};
      const initialX = typeof d.x === 'number' ? d.x : Math.round(window.innerWidth / 2 - POPUP_W / 2);
      const initialY = typeof d.y === 'number' ? d.y : 120;
      setState({
        open: true,
        x: initialX, y: initialY,
        tab: d.tab || 'general',
        snippet: (d.snippet || '').toString().slice(0, 240),
        target: d.target || `${d.tab || 'general'}${d.snippet ? ':' + d.snippet.slice(0, 40) : ''}`,
        editing: d.editing,
      });
      setPos(clampToWorkspace(initialX, initialY));
      // Pre-fill text when editing an existing comment so the user can
      // revise instead of starting from scratch.
      setText(d.editing?.initialText || '');
    };
    document.addEventListener('app:openInlineComment', onOpen);
    return () => document.removeEventListener('app:openInlineComment', onOpen);
  }, []);

  // Drag handlers — start on header mousedown, follow the mouse, clamp
  // every frame to the .view-container bounds so the popup can't be
  // dragged onto a button bar / side panel / status line.
  const onDragStart = (ev: React.MouseEvent) => {
    if (!popupRef.current) return;
    ev.preventDefault(); // don't drag-select text in the header
    const startRect = popupRef.current.getBoundingClientRect();
    const offsetX = ev.clientX - startRect.left;
    const offsetY = ev.clientY - startRect.top;
    setDragging(true);

    const onMove = (mv: MouseEvent) => {
      const nx = mv.clientX - offsetX;
      const ny = mv.clientY - offsetY;
      const w = popupRef.current?.offsetWidth || POPUP_W;
      const h = popupRef.current?.offsetHeight || POPUP_H;
      setPos(clampToWorkspace(nx, ny, w, h));
    };
    const onUp = () => {
      setDragging(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // Re-clamp on viewport resize so the popup doesn't stick off-screen if
  // the user shrinks the window.
  useEffect(() => {
    if (!state?.open) return;
    const onResize = () => {
      const w = popupRef.current?.offsetWidth || POPUP_W;
      const h = popupRef.current?.offsetHeight || POPUP_H;
      setPos((p) => clampToWorkspace(p.x, p.y, w, h));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [state?.open]);

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
      if (state.editing) {
        // Editing an existing comment — update the text in place. Rules
        // enforce that only the author can do this.
        await updateCommentText(activeStoryId, state.editing.commentId, text.trim());
        toast.success('Comment updated');
      } else {
        // New comment — store the verbatim snippet so the highlight
        // overlay can find + paint it later.
        await addComment({
          storyId: activeStoryId,
          text: text.trim(),
          target: state.target,
          snippet: state.snippet || undefined,
        });
        toast.success('Comment posted');
      }
      setState(null);
      setText('');
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[InlineCommentPopup] post failed', err);
      const msg = err?.code === 'permission-denied'
        ? (state.editing ? 'Only the comment author can edit it.' : 'You need to be a story member to comment.')
        : err?.message || (state.editing ? 'Could not update comment' : 'Could not post comment');
      toast.error(msg);
    } finally { setBusy(false); }
  };

  const removeComment = async () => {
    if (!activeStoryId || !state?.editing) return;
    if (!confirm('Delete this comment?')) return;
    setBusy(true);
    try {
      await deleteComment(activeStoryId, state.editing.commentId);
      toast.success('Comment deleted');
      setState(null);
      setText('');
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[InlineCommentPopup] delete failed', err);
      toast.error(err?.code === 'permission-denied'
        ? 'Only the comment author or story owner can delete this.'
        : err?.message || 'Could not delete comment');
    } finally { setBusy(false); }
  };

  // True when current user is the author of the comment being edited.
  const canEdit = !!state?.editing && state.editing.authorId === auth?.currentUser?.uid;

  if (!state?.open) return null;

  return (
    <AnimatePresence>
      <motion.div
        ref={popupRef}
        initial={{ opacity: 0, scale: 0.92, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: -4 }}
        transition={{ duration: 0.12 }}
        className={`glass-surface fixed z-[300] rounded-lg overflow-hidden ${dragging ? 'select-none' : ''}`}
        style={{ left: pos.x, top: pos.y, width: POPUP_W }}
        role="dialog"
        aria-label="Add a comment"
      >
        {/* Drag handle — the header. Click + drag to move the popup
            within the workspace area. The cursor changes to 'move' on
            hover so users discover the affordance. */}
        <div
          onMouseDown={onDragStart}
          className="flex items-center justify-between px-3 h-9 border-b border-[var(--rule)] cursor-move select-none"
          title="Drag to move"
        >
          <div className="flex items-center gap-1.5 pointer-events-none">
            <GripHorizontal className="w-3 h-3 text-[var(--text-muted)]" />
            <MessageCircle className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
            <span className="text-[11px] font-semibold text-[var(--text)]">
              {state.editing ? (canEdit ? 'Edit comment' : 'Comment') : 'Add comment'}
            </span>
            <span className="text-[9.5px] text-[var(--text-muted)] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--surface-2)]">
              {state.tab}
            </span>
          </div>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setState(null)}
            className="p-1 rounded hover:bg-[var(--hover)]"
            aria-label="Close"
          >
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
          placeholder={state.editing ? 'Revise your comment…' : 'Type your note…'}
          disabled={busy || (state.editing && !canEdit)}
          readOnly={state.editing && !canEdit}
          className="w-full px-3 py-2 bg-transparent text-[12px] text-[var(--text)] outline-none resize-none border-b border-[var(--rule)]"
        />

        <div className="flex items-center justify-between gap-2 px-3 h-9">
          {/* Delete on the left when editing AND author */}
          {state.editing && canEdit ? (
            <button
              onClick={removeComment}
              disabled={busy}
              className="px-2 py-1 rounded text-[10.5px] text-[var(--danger)] hover:bg-[var(--danger)]/10 flex items-center gap-1 disabled:opacity-50"
              title="Delete comment"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
          ) : (
            <span className="text-[9.5px] text-[var(--text-muted)]">
              {state.editing ? 'Read-only — only the author can edit' : 'Ctrl + Enter to post'}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setState(null)}
              className="px-2.5 py-1 rounded text-[11px] text-[var(--text-secondary)] hover:bg-[var(--hover)]"
            >
              {state.editing && !canEdit ? 'Close' : 'Cancel'}
            </button>
            {(!state.editing || canEdit) && (
              <button
                onClick={submit}
                disabled={!text.trim() || busy}
                className="px-2.5 py-1 rounded bg-[var(--accent)] text-[var(--accent-ink)] text-[11px] font-semibold hover:brightness-110 disabled:opacity-50 flex items-center gap-1"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                {state.editing ? 'Save' : 'Post'}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * captureCurrentSelection — read the user's active text selection from
 * EITHER:
 *   (a) window.getSelection()  — works for contenteditable + plain text in
 *       divs/spans (the TipTap editor + most director/plot static text)
 *   (b) document.activeElement when it's a <textarea> or <input>  — for
 *       form fields where (a) returns nothing (scene names, plot beat
 *       titles, etc. that are edited inline)
 *
 * Returns the snippet + the rect of the selection on screen, or empty
 * when nothing is selected.
 */
function captureCurrentSelection(): { snippet: string; rect: DOMRect | null } {
  // (a) DOM Selection — preferred when available.
  const sel = typeof window !== 'undefined' ? window.getSelection() : null;
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
    const snippet = sel.toString().trim();
    if (snippet) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      return { snippet, rect: rect && (rect.width > 0 || rect.height > 0) ? rect : null };
    }
  }
  // (b) Active textarea / input — window.getSelection() returns nothing
  // for these, even when the user has highlighted text inside them. Use
  // the element's own selectionStart/End instead.
  const ae = document?.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')
      && typeof ae.selectionStart === 'number'
      && typeof ae.selectionEnd === 'number'
      && ae.selectionStart !== ae.selectionEnd) {
    const snippet = (ae.value || '').substring(ae.selectionStart, ae.selectionEnd).trim();
    if (snippet) {
      // Position the popup just under the element. For multi-line text
      // areas a tighter rect would be nicer but the bounding rect is the
      // pragmatic fallback that always works.
      const rect = ae.getBoundingClientRect();
      return { snippet, rect: rect && (rect.width > 0 || rect.height > 0) ? rect : null };
    }
  }
  return { snippet: '', rect: null };
}

/**
 * openInlineCommentFromSelection — helper to fire the open event with the
 * current text selection (if any) and position the popup right next to it.
 * Used by the TopBar button + keyboard shortcut + context menu.
 */
export function openInlineCommentFromSelection(tab: string, fallbackX?: number, fallbackY?: number): void {
  const { snippet, rect } = captureCurrentSelection();
  let x = fallbackX ?? Math.round(window.innerWidth / 2 - 160);
  let y = fallbackY ?? 120;
  if (rect) {
    // Position popup BELOW the selection.
    x = rect.left;
    y = rect.bottom + 8;
  }
  document.dispatchEvent(new CustomEvent('app:openInlineComment', {
    detail: { x, y, tab, snippet, target: `${tab}${snippet ? ':' + snippet.slice(0, 40) : ''}` },
  }));
}
