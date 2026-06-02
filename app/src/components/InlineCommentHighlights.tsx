import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { auth } from '@/firebase';
import { watchComments, type CloudComment } from '@/lib/cloudStories';

/**
 * InlineCommentHighlights — overlay layer that paints a semi-transparent
 * highlight onto every commented snippet visible in the current panel
 * (writer / director / plot). Double-clicking a highlight opens the
 * InlineCommentPopup in EDIT MODE so the comment author can revise the
 * text + delete from the popup.
 *
 * Implementation: we walk the .view-container's text nodes once per
 * comments-update (or scroll / resize / content tick) and compute a
 * client rect for each snippet match. We render the highlights as
 * absolute-positioned divs in a fixed overlay layer so they don't have to
 * touch any of the existing DOM that React owns. Doesn't conflict with
 * ProseMirror or any other panel-specific rendering.
 *
 * Performance: rect computation is cheap (~ms for a few dozen comments)
 * and only re-runs when comments change or the workspace scrolls.
 */

interface HighlightRect {
  commentId: string;
  text: string;       // the comment body, for the popup pre-fill
  authorId: string;
  rect: { left: number; top: number; width: number; height: number };
  snippet: string;
}

export default function InlineCommentHighlights() {
  const activeStoryId = useAppStore((s) => s.activeStoryId);
  const activeTab = useAppStore((s) => s.activeTab);
  const [comments, setComments] = useState<CloudComment[]>([]);
  const [rects, setRects] = useState<HighlightRect[]>([]);

  // Subscribe to the active story's comments. Listener is per-storyId so
  // changing stories resubscribes cleanly.
  useEffect(() => {
    setComments([]);
    if (!activeStoryId || !auth?.currentUser) return;
    const unsub = watchComments(activeStoryId,
      (items) => setComments(items),
      () => { /* silent — highlights are best-effort */ });
    return () => unsub();
  }, [activeStoryId]);

  // Only show highlights for the panel the user is currently on.
  const relevant = useMemo(() => {
    return comments.filter((c) => {
      if (c.resolved) return false;
      if (!c.snippet && !c.target) return false;
      const tab = (c.target || '').split(':')[0];
      return tab === activeTab;
    });
  }, [comments, activeTab]);

  // Recompute rect positions whenever the relevant comment set OR the
  // visible content changes (tab switch, scroll, resize, panel content
  // updates via store data).
  //
  // CRITICAL: setRects is called with a functional updater that COMPARES
  // the new array to the previous one and bails when they're equivalent.
  // Without this, calling setRects(out) every recompute creates a new
  // array reference each time which triggers a re-render, which triggers
  // the effect again, which calls setRects again — React error #185
  // ('Maximum update depth exceeded'). The shallow compare breaks the
  // cycle. The deps array is also kept small + stable (no full store
  // objects) so the effect only re-runs when the comment SET changes.
  useEffect(() => {
    let cancelled = false;
    const recompute = () => {
      if (cancelled) return;
      const container = document.querySelector('.view-container') as HTMLElement | null;
      if (!container) { setRectsIfChanged(setRects, []); return; }
      const containerRect = container.getBoundingClientRect();

      const out: HighlightRect[] = [];
      for (const c of relevant) {
        const snippet = (c.snippet || c.target?.split(':').slice(1).join(':') || '').trim();
        if (!snippet) continue;
        const range = findSnippetRange(container, snippet);
        if (!range) continue;
        const r = range.getBoundingClientRect();
        if (r.bottom < containerRect.top || r.top > containerRect.bottom) continue;
        if (r.right < containerRect.left || r.left > containerRect.right) continue;
        out.push({
          commentId: c.id,
          text: c.text,
          authorId: c.authorId,
          snippet,
          rect: { left: r.left, top: r.top, width: r.width, height: r.height },
        });
      }
      if (!cancelled) setRectsIfChanged(setRects, out);
    };
    const id = window.setTimeout(recompute, 60);
    const container = document.querySelector('.view-container') as HTMLElement | null;
    const obs = new ResizeObserver(() => recompute());
    if (container) obs.observe(container);
    const onScroll = () => recompute();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      cancelled = true;
      clearTimeout(id);
      obs.disconnect();
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [relevant, activeTab]);

  if (!rects.length) return null;

  return (
    <div
      className="fixed inset-0 z-[40] pointer-events-none"
      aria-hidden
    >
      {rects.map((h) => (
        <div
          key={h.commentId}
          onDoubleClick={() => {
            document.dispatchEvent(new CustomEvent('app:openInlineComment', {
              detail: {
                x: h.rect.left,
                y: h.rect.top + h.rect.height + 6,
                tab: activeTab,
                snippet: h.snippet,
                target: `${activeTab}:${h.snippet.slice(0, 40)}`,
                // Edit-mode payload so the popup pre-fills + saves to this
                // existing comment instead of creating a new one.
                editing: {
                  commentId: h.commentId,
                  initialText: h.text,
                  authorId: h.authorId,
                },
              },
            }));
          }}
          title="Double-click to edit comment"
          className="absolute rounded-sm transition-colors"
          style={{
            left: h.rect.left,
            top: h.rect.top,
            width: h.rect.width,
            height: h.rect.height,
            background: 'rgba(168, 85, 247, 0.18)',
            outline: '1px solid rgba(168, 85, 247, 0.5)',
            pointerEvents: 'auto',
            cursor: 'pointer',
          }}
        />
      ))}
    </div>
  );
}

/**
 * findSnippetRange — walk text nodes inside the container looking for the
 * first occurrence of the snippet and return a DOM Range covering it.
 * Works for plain text inside divs/spans (writer's TipTap output,
 * director scene names, plot beat titles) and contenteditable. Doesn't
 * see inside form fields (textarea/input value), which is acceptable for
 * v1 — we just won't draw highlights for snippets that live in those.
 */
/**
 * setRectsIfChanged — functional updater that only commits the new rect
 * array when it's structurally different from the previous one. Prevents
 * the effect → setState → re-render → effect loop that was throwing
 * React error #185.
 */
function setRectsIfChanged(
  setRects: (updater: (prev: HighlightRect[]) => HighlightRect[]) => void,
  next: HighlightRect[],
): void {
  setRects((prev) => {
    if (prev.length !== next.length) return next;
    for (let i = 0; i < next.length; i++) {
      const p = prev[i];
      const n = next[i];
      if (p.commentId !== n.commentId) return next;
      if (Math.round(p.rect.left) !== Math.round(n.rect.left)) return next;
      if (Math.round(p.rect.top) !== Math.round(n.rect.top)) return next;
      if (Math.round(p.rect.width) !== Math.round(n.rect.width)) return next;
      if (Math.round(p.rect.height) !== Math.round(n.rect.height)) return next;
    }
    return prev;
  });
}

function findSnippetRange(container: HTMLElement, snippet: string): Range | null {
  if (!snippet) return null;
  const needle = snippet.toLowerCase();
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node: Node) {
        const t = (node.nodeValue || '').toLowerCase();
        if (t.includes(needle)) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      },
    } as any,
  );
  const node = walker.nextNode() as Text | null;
  if (!node) return null;
  const text = (node.nodeValue || '').toLowerCase();
  const idx = text.indexOf(needle);
  if (idx < 0) return null;
  const range = document.createRange();
  range.setStart(node, idx);
  range.setEnd(node, idx + snippet.length);
  return range;
}
