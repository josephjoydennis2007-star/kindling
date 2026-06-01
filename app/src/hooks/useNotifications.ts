import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { auth } from '@/firebase';
import { listMyInvites, watchComments, type CloudComment } from '@/lib/cloudStories';

/**
 * useNotifications — collapses the "do I have stuff to look at?" question
 * into two numbers + a single touch-to-mark-read API.
 *
 * pendingInvites : count of /invites docs addressed to the current user
 *                  with status === 'pending'.  Polled on mount and every
 *                  90 seconds while the tab is visible — we don't have a
 *                  live invitee subscription because invites aren't
 *                  story-scoped (a user can be invited to many stories).
 *
 * unreadComments : total live comments on the ACTIVE story minus the
 *                  count the user has seen, persisted per-story in
 *                  localStorage as `kindling-comments-seen-{storyId}`.
 *                  Updates live via watchComments.
 *
 * markCommentsSeen() — call this when the user opens the Comments panel
 *                      or right-side inspector that displays the comment
 *                      list. Stamps the current total so the badge clears.
 */

const SEEN_KEY = (storyId: string) => `kindling-comments-seen-${storyId}`;

export function useNotifications(): {
  pendingInvites: number;
  unreadComments: number;
  markCommentsSeen: () => void;
} {
  const activeStoryId = useAppStore((s) => s.activeStoryId);
  const [pendingInvites, setPendingInvites] = useState(0);
  const [totalComments, setTotalComments] = useState(0);
  const [seenComments, setSeenComments] = useState(0);

  // Pending invites — poll every 90s. Cheap (a single where-query) and
  // covers the "someone invited me while I was looking at another story"
  // case without needing a dedicated subscription per user.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (!auth?.currentUser) { setPendingInvites(0); return; }
      try {
        const inv = await listMyInvites();
        if (!cancelled) setPendingInvites(inv.length);
      } catch { /* silent — best-effort */ }
    };
    tick();
    const id = window.setInterval(tick, 90_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  // Live comment count for the active story.
  useEffect(() => {
    setTotalComments(0);
    setSeenComments(0);
    if (!activeStoryId || !auth?.currentUser) return;
    // Pull the user's last-seen count from localStorage so the badge
    // doesn't blink to "10" the first time the comments load.
    try {
      const raw = localStorage.getItem(SEEN_KEY(activeStoryId));
      if (raw) setSeenComments(parseInt(raw, 10) || 0);
    } catch {/* private mode */}
    const unsub = watchComments(activeStoryId,
      (items: CloudComment[]) => setTotalComments(items.length),
      () => { /* silent */ });
    return () => unsub();
  }, [activeStoryId]);

  const unreadComments = Math.max(0, totalComments - seenComments);

  const markCommentsSeen = () => {
    if (!activeStoryId) return;
    setSeenComments(totalComments);
    try { localStorage.setItem(SEEN_KEY(activeStoryId), String(totalComments)); }
    catch {/* private mode */}
  };

  return { pendingInvites, unreadComments, markCommentsSeen };
}
