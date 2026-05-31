import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { auth } from '@/firebase';
import {
  pullStory,
  resolveStoryRole,
  canEditWriter,
  canEditDirector,
  type StoryRole,
} from '@/lib/cloudStories';

/**
 * useStoryRole — resolves the current user's role on the active story.
 *
 * For local-only sessions (no signed-in Firebase user OR no cloud copy
 * of the active story), this returns a "full access" sentinel — the
 * legacy single-user experience. Once both conditions are true we
 * fetch the cloud story to read `owner` + `collaboratorRoles[uid]`
 * and derive what the current user is allowed to edit.
 *
 * Returns:
 *   - role: 'writer' | 'director' | 'both' | null
 *     null = no access at all (shouldn't happen for the active story,
 *     but defensively handled in case a collaborator is removed).
 *   - canWrite: boolean — gates the Writer view (editor, format bar)
 *   - canDirect: boolean — gates the Director view (add scene/shot)
 *   - isOwner: boolean — owner always has full access
 *   - isCloud: boolean — false for local-only sessions (no gating)
 */
export function useStoryRole(): {
  role: StoryRole | null;
  canWrite: boolean;
  canDirect: boolean;
  isOwner: boolean;
  isCloud: boolean;
} {
  const activeStoryId = useAppStore((s) => s.activeStoryId);
  const [role, setRole] = useState<StoryRole | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isCloud, setIsCloud] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const uid = auth?.currentUser?.uid;
    if (!uid || !activeStoryId) {
      setRole(null); setIsOwner(false); setIsCloud(false);
      return;
    }
    (async () => {
      try {
        const cloudStory = await pullStory(activeStoryId);
        if (cancelled) return;
        if (!cloudStory) {
          // Story isn't in the cloud yet — local-only, full access.
          setRole(null); setIsOwner(false); setIsCloud(false);
          return;
        }
        const r = resolveStoryRole(cloudStory, uid);
        setRole(r);
        setIsOwner(cloudStory.owner === uid);
        setIsCloud(true);
      } catch {
        // Permission-denied or other failure → fall back to local-only mode.
        if (!cancelled) { setRole(null); setIsOwner(false); setIsCloud(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [activeStoryId]);

  // For local-only sessions (no cloud story or not signed in), the user
  // has full control of their local copy. Only enforce gating when isCloud.
  if (!isCloud) {
    return { role: 'both', canWrite: true, canDirect: true, isOwner: false, isCloud: false };
  }
  return {
    role,
    canWrite: canEditWriter(role),
    canDirect: canEditDirector(role),
    isOwner,
    isCloud: true,
  };
}
