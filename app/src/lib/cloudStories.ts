/**
 * Cloud story sync — Firestore data layer for multi-user collaboration.
 *
 * Schema (matches firestore.rules at the repo root):
 *
 *   /stories/{storyId}
 *     owner         string  — uid of creator
 *     collaborators string[] — uids who can read + write
 *     shareable     boolean — when true, any signed-in user can read
 *     ownerName     string  — display name for the Stories drawer
 *     title         string  — story title (de-duplicates from the payload
 *                             for the drawer without parsing the whole blob)
 *     data          string  — the JSON-stringified screenplay+scenes+etc.
 *     updatedAt     Timestamp — serverTimestamp() on every write
 *     createdAt     Timestamp — serverTimestamp() on create only
 *
 * /invites/{inviteId}
 *     storyId    string
 *     storyTitle string
 *     fromUid    string
 *     fromName   string
 *     toEmail    string
 *     status     'pending' | 'accepted' | 'declined' | 'cancelled'
 *     createdAt  Timestamp
 *
 * Local IndexedDB is still the source of truth for in-memory speed —
 * cloud writes happen on manual save, cloud reads happen on demand.
 */

import {
  doc,
  collection,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  deleteField,
  addDoc,
  orderBy,
  limit,
  getDocs,
  enableNetwork,
  disableNetwork,
  type Unsubscribe,
  type DocumentData,
} from 'firebase/firestore';
import { db, auth } from '@/firebase';

/**
 * Self-healing retry wrapper.
 *
 * The Firestore Web SDK has a long-standing quirk: when
 * `enableIndexedDbPersistence` is on (we enable it for offline support in
 * firebase.ts) and the very first request fires before the auth token
 * settles or the persistence tab-lock resolves, the SDK can get stuck
 * thinking it's offline. Every subsequent call then fails with
 * `code: unavailable` / "failed to get document because the client is
 * offline" — even though the network and the Firestore backend are both
 * fine. The user sees "client is offline" errors and assumes the database
 * isn't enabled, when actually it works perfectly after a page refresh.
 *
 * Cure: catch the offline-like error once, force a network cycle with
 * `disableNetwork` + `enableNetwork`, then retry. The user never sees the
 * spurious failure.
 */
// Build signature — visible in DevTools so you can confirm the new bundle
// is actually loaded (vs. the service worker serving a cached old one).
// eslint-disable-next-line no-console
console.log('[Kindling] cloudStories build v3 — multi-retry offline recovery active');

// Wait for an awaited auth state. Firestore calls before the token is
// attached can be silently rejected as "offline" — this awaits one tick
// of the auth listener so the token is present.
function waitForAuthSettled(): Promise<void> {
  return new Promise((resolve) => {
    if (!auth) { resolve(); return; }
    if (auth.currentUser) { resolve(); return; }
    const stop = setTimeout(resolve, 1500); // safety net
    const unsub = auth.onAuthStateChanged(() => {
      clearTimeout(stop); unsub(); resolve();
    });
  });
}

async function withRecovery<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const offlineLike =
      err?.code === 'unavailable' ||
      err?.code === 'failed-precondition' ||
      /client is offline/i.test(err?.message || '');
    if (!offlineLike) throw err;
    if (attempt >= 3) {
      // eslint-disable-next-line no-console
      console.error('[cloudStories] Firestore still offline after 3 reconnect attempts. Check DevTools → Network for blocked firestore.googleapis.com requests, or DevTools → Application → Service Workers to unregister any stale worker.');
      throw err;
    }
    // eslint-disable-next-line no-console
    console.warn(`[cloudStories] Firestore offline (attempt ${attempt + 1}/3) — forcing reconnect…`, err?.code || err?.message);
    try {
      await disableNetwork(db);
      // Small delay so the SDK fully tears down before reopening.
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      await enableNetwork(db);
      await waitForAuthSettled();
    } catch {/* fall through to retry */}
    return withRecovery(fn, attempt + 1);
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type StoryRole = 'writer' | 'director' | 'both';

export interface CloudStory {
  id: string;
  owner: string;
  ownerName?: string;
  collaborators: string[];
  /** Per-collaborator role on this story. Key = uid, value = role. Missing
   *  entries default to 'both' (full access — legacy invites pre-roles). */
  collaboratorRoles?: Record<string, StoryRole>;
  shareable: boolean;
  title: string;
  data: string;        // JSON payload (exportStory output)
  updatedAt?: number;  // ms since epoch (converted from Timestamp)
  createdAt?: number;
}

export interface CloudInvite {
  id: string;
  storyId: string;
  storyTitle: string;
  fromUid: string;
  fromName: string;
  toEmail: string;
  /** Role the inviter assigned. Determines what the invitee can edit on
   *  the story. 'both' = full access (writer + director). */
  role?: StoryRole;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  createdAt?: number;
}

/** Resolve the current user's role on a story.
 *   - Owner          → 'both' (always full access)
 *   - In collaborators → collaboratorRoles[uid] or 'both' if not set
 *   - Anyone else    → null  (no access; UI should treat as read-only)
 */
export function resolveStoryRole(story: CloudStory | null, uid: string | undefined): StoryRole | null {
  if (!story || !uid) return null;
  if (story.owner === uid) return 'both';
  if (story.collaborators.includes(uid)) {
    return (story.collaboratorRoles?.[uid] as StoryRole) || 'both';
  }
  return null;
}

/** Convenience: can this user edit the writer view? */
export function canEditWriter(role: StoryRole | null): boolean {
  return role === 'writer' || role === 'both';
}

/** Convenience: can this user edit the director view? */
export function canEditDirector(role: StoryRole | null): boolean {
  return role === 'director' || role === 'both';
}

// ─── Write ──────────────────────────────────────────────────────────────────

/** Push a story to Firestore. Creates the doc if it doesn't exist; updates
 *  only the data + title + updatedAt if it does. Owner/collaborators are
 *  preserved across writes (rules enforce that anyway). */
export async function pushStory(input: {
  storyId: string;
  title: string;
  data: string;
}): Promise<void> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Not signed in');
  return withRecovery(async () => {
    const ref = doc(db, 'stories', input.storyId);
    // Determine whether the doc exists. If the rules deny the read
    // (because the doc is non-existent and the rule references
    // resource.data), treat it as not-exists and proceed to create.
    let exists = false;
    try {
      const snap = await getDoc(ref);
      exists = snap.exists();
    } catch (err: any) {
      if (err?.code !== 'permission-denied') throw err;
      // Permission-denied on a non-existent doc → treat as not-exists.
      // (If the doc DOES exist but is owned by someone else, the setDoc
      //  below will fail with permission-denied from the create/update
      //  rule, which is the correct outcome.)
      exists = false;
    }
    if (!exists) {
      // First write — create with owner = current user.
      await setDoc(ref, {
        owner: user.uid,
        ownerName: user.displayName || user.email || 'Anonymous',
        collaborators: [],
        shareable: false,
        title: input.title,
        data: input.data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      // Update — only the data slice changes.
      await updateDoc(ref, {
        title: input.title,
        data: input.data,
        updatedAt: serverTimestamp(),
      });
    }
  });
}

/** Toggle `shareable: true` so anyone with the link can read.
 *  Returns the share URL the owner can copy. */
export async function setShareable(storyId: string, shareable: boolean): Promise<string> {
  return withRecovery(async () => {
    const ref = doc(db, 'stories', storyId);
    await updateDoc(ref, { shareable });
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    return shareable ? `${base}/?s=${storyId}` : '';
  });
}

// ─── Read ───────────────────────────────────────────────────────────────────

/** One-shot pull. Returns null if the story doesn't exist or the current
 *  user can't read it (Firestore rules enforce). */
export async function pullStory(storyId: string): Promise<CloudStory | null> {
  return withRecovery(async () => {
    const ref = doc(db, 'stories', storyId);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      return hydrate(snap.id, snap.data());
    } catch (err: any) {
      // permission-denied on a non-existent doc happens because the rule
      // references resource.data which is null. Treat as not-found so the
      // caller can render an empty state instead of a scary error banner.
      // (For docs that DO exist but the user can't access, this is also
      //  the correct UX — they just see "no such story".)
      if (err?.code === 'permission-denied') return null;
      throw err;
    }
  });
}

/** List every story the current user owns or collaborates on, ordered by
 *  most recent first. Used by the Stories drawer to show cloud stories. */
export async function listMyStories(): Promise<CloudStory[]> {
  const user = auth?.currentUser;
  if (!user) return [];
  return withRecovery(async () => {
    const stories: Record<string, CloudStory> = {};

    // 1) Stories I own
    const ownedQ = query(collection(db, 'stories'), where('owner', '==', user.uid));
    const ownedSnap = await getDocs(ownedQ);
    ownedSnap.forEach((d) => { stories[d.id] = hydrate(d.id, d.data()); });

    // 2) Stories I collaborate on
    const collabQ = query(collection(db, 'stories'), where('collaborators', 'array-contains', user.uid));
    const collabSnap = await getDocs(collabQ);
    collabSnap.forEach((d) => { stories[d.id] = hydrate(d.id, d.data()); });

    return Object.values(stories).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  });
}

/** Live subscription — fires whenever the story doc changes (remote save
 *  by another user, or any field update). Returns the unsubscribe function. */
export function watchStory(
  storyId: string,
  onUpdate: (story: CloudStory) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const ref = doc(db, 'stories', storyId);
  return onSnapshot(ref,
    (snap) => { if (snap.exists()) onUpdate(hydrate(snap.id, snap.data())); },
    (err) => onError?.(err as any),
  );
}

// ─── Collaborators ──────────────────────────────────────────────────────────

/** Owner-only: add a uid to the story's collaborators array. */
export async function addCollaborator(storyId: string, uid: string): Promise<void> {
  return withRecovery(async () => {
    await updateDoc(doc(db, 'stories', storyId), { collaborators: arrayUnion(uid) });
  });
}

/** Owner-only: remove a uid from the collaborators array. */
export async function removeCollaborator(storyId: string, uid: string): Promise<void> {
  return withRecovery(async () => {
    await updateDoc(doc(db, 'stories', storyId), {
      collaborators: arrayRemove(uid),
      [`collaboratorRoles.${uid}`]: deleteField(),
    });
  });
}

/** Owner-only: change a collaborator's role on this story. */
export async function setCollaboratorRole(storyId: string, uid: string, role: StoryRole): Promise<void> {
  return withRecovery(async () => {
    await updateDoc(doc(db, 'stories', storyId), {
      [`collaboratorRoles.${uid}`]: role,
    });
  });
}

// ─── Invites ────────────────────────────────────────────────────────────────

/** Create a pending invite to a collaborator's email. They see it when
 *  they sign in with the same email and can accept/decline. */
export async function inviteByEmail(input: {
  storyId: string;
  storyTitle: string;
  toEmail: string;
  role?: StoryRole;
}): Promise<void> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Not signed in');
  return withRecovery(async () => {
    // Use a DETERMINISTIC invite ID — "{storyId}__{lowercaseEmail}" — so the
    // /stories security rule can verify "does an invite exist for this user
    // on this story?" via a known exists() path.
    const inviteId = inviteIdFor(input.storyId, input.toEmail);
    await setDoc(doc(db, 'invites', inviteId), {
      storyId: input.storyId,
      storyTitle: input.storyTitle,
      fromUid: user.uid,
      fromName: user.displayName || user.email || 'Anonymous',
      toEmail: input.toEmail.toLowerCase().trim(),
      // Role the inviter is granting. Default to 'both' — full access —
      // because that's the safest assumption when the inviter didn't pick.
      // The /stories self-join rule reads this back to enforce that the
      // invitee can't elevate their own role on accept.
      role: input.role || 'both',
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  });
}

/** Deterministic invite document ID. MUST match the path checked by the
 *  /stories update rule in firestore.rules. */
function inviteIdFor(storyId: string, email: string): string {
  return `${storyId}__${email.toLowerCase().trim()}`;
}

/** List pending invites addressed to the current user's email. */
export async function listMyInvites(): Promise<CloudInvite[]> {
  const user = auth?.currentUser;
  if (!user?.email) return [];
  return withRecovery(async () => {
    const q = query(
      collection(db, 'invites'),
      where('toEmail', '==', user.email!.toLowerCase()),
      where('status', '==', 'pending'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
      createdAt: tsToMs(d.data().createdAt),
    })) as CloudInvite[];
  });
}

/** Accept an invite — adds the current user to the story's collaborators
 *  and marks the invite as accepted. */
export async function acceptInvite(inviteId: string): Promise<string | null> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Not signed in');
  return withRecovery(async () => {
    const inviteRef = doc(db, 'invites', inviteId);
    const inviteSnap = await getDoc(inviteRef);
    if (!inviteSnap.exists()) return null;
    const invite = inviteSnap.data() as any;
    if (invite.toEmail !== user.email?.toLowerCase()) {
      throw new Error('Invite is for a different email address');
    }
    const role: StoryRole = (invite.role as StoryRole) || 'both';

    // Mark the invite accepted first (always allowed by invite update rule).
    await updateDoc(inviteRef, { status: 'accepted' });

    // Short-circuit if we're already a collaborator on this story (e.g. the
    // user is accepting a duplicate invite, or already accepted earlier and
    // the UI is showing a stale row). The /stories update rule's self-join
    // branch REQUIRES !(uid in collaborators) so trying to re-add would
    // throw permission-denied — instead we just bail with success.
    try {
      const storySnap = await getDoc(doc(db, 'stories', invite.storyId));
      if (storySnap.exists()) {
        const storyData = storySnap.data() as any;
        if ((storyData.collaborators || []).includes(user.uid)) {
          return invite.storyId;
        }
      }
    } catch {/* if the read fails (permission denied for non-existent doc), fall through to the write */}

    // Self-join the story: add ourselves to collaborators AND set our
    // entry in collaboratorRoles. The /stories update rule verifies the
    // role matches invite.role so the invitee can't elevate themselves.
    await updateDoc(doc(db, 'stories', invite.storyId), {
      collaborators: arrayUnion(user.uid),
      [`collaboratorRoles.${user.uid}`]: role,
    });
    return invite.storyId;
  });
}

export async function declineInvite(inviteId: string): Promise<void> {
  return withRecovery(async () => {
    await updateDoc(doc(db, 'invites', inviteId), { status: 'declined' });
  });
}

// ─── Delete ─────────────────────────────────────────────────────────────────

/** Owner-only: delete the story doc. Does not delete IndexedDB local copy. */
export async function deleteStoryCloud(storyId: string): Promise<void> {
  await deleteDoc(doc(db, 'stories', storyId));
}

// ─── Chat (real-time, Firestore-backed) ─────────────────────────────────────
//
// Chat lives in the /stories/{storyId}/chat/{msgId} subcollection. Rules
// restrict read+write to the owner or any user in the story's collaborators
// array. We use onSnapshot for live updates so collaborators see new
// messages without polling.

export interface CloudChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  attachments?: Array<{ kind: string; url: string; name?: string }>;
  timestamp: number;
}

/** Live subscription to the chat for a story. Returns unsubscribe fn. */
export function watchChat(
  storyId: string,
  onUpdate: (msgs: CloudChatMessage[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'stories', storyId, 'chat'),
    orderBy('timestamp', 'asc'),
    limit(200),
  );
  return onSnapshot(q,
    (snap) => {
      const msgs: CloudChatMessage[] = snap.docs.map((d) => {
        const raw = d.data() as any;
        return {
          id: d.id,
          authorId: raw.authorId,
          authorName: raw.authorName,
          text: raw.text || '',
          attachments: raw.attachments || [],
          timestamp: tsToMs(raw.timestamp) || Date.now(),
        };
      });
      onUpdate(msgs);
    },
    (err) => { if (onError) onError(err as any); },
  );
}

export async function sendCloudChatMessage(input: {
  storyId: string;
  text: string;
  attachments?: Array<{ kind: string; url: string; name?: string }>;
}): Promise<void> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Not signed in');
  return withRecovery(async () => {
    await addDoc(collection(db, 'stories', input.storyId, 'chat'), {
      authorId: user.uid,
      authorName: user.displayName || user.email || 'Anonymous',
      text: input.text,
      attachments: input.attachments || [],
      timestamp: serverTimestamp(),
    });
  });
}

// ─── Profile lookup ─────────────────────────────────────────────────────────
//
// Batch-fetch /profiles/{uid} docs for a set of collaborator UIDs so we can
// show real names + avatars in the People tab instead of raw UID prefixes.
// Profile rules permit any authenticated user to read.

export interface CollaboratorProfile {
  uid: string;
  displayName?: string;
  email?: string;
  avatar?: string | null;
  role?: string;
}

/**
 * Look up a registered user by their email — used by the InviteDialog to
 * show the invitee's role + display name before sending. Returns null if
 * no one has ever signed in with that email. Reads from /profilesByEmail
 * (populated by upsertProfile).
 */
export async function lookupProfileByEmail(email: string): Promise<{
  uid: string;
  displayName: string;
  role: StoryRole | 'admin' | 'viewer';
  acceptOppositeRole: boolean;
  avatar?: string | null;
} | null> {
  if (!email) return null;
  const key = email.toLowerCase().trim();
  return withRecovery(async () => {
    try {
      const snap = await getDoc(doc(db, 'profilesByEmail', key));
      if (!snap.exists()) return null;
      const d = snap.data() as any;
      return {
        uid: d.uid,
        displayName: d.displayName || email,
        role: d.role || 'both',
        acceptOppositeRole: !!d.acceptOppositeRole,
        avatar: d.avatar || null,
      };
    } catch {
      return null;
    }
  });
}

/**
 * Decide whether `inviteRole` can be sent to a person whose own preferred
 * role is `inviteeRole`. Rules:
 *   - 'both' invitees accept any invite (their account is flexible).
 *   - 'both' invites are always accepted (full access).
 *   - Same-role invites always accepted.
 *   - Opposite-role invites need the invitee's acceptOppositeRole flag.
 *
 * Returns { ok: true } when allowed, { ok: false, reason } otherwise so the
 * UI can render a tailored message.
 */
export function isInviteRoleCompatible(
  inviteRole: StoryRole,
  invitee: { role: string; acceptOppositeRole: boolean; displayName?: string } | null,
): { ok: true } | { ok: false; reason: string } {
  if (!invitee) return { ok: true }; // unknown email — let them send; the recipient signs up later
  if (invitee.role === 'both' || inviteRole === 'both') return { ok: true };
  if (invitee.role === inviteRole) return { ok: true };
  if (invitee.acceptOppositeRole) return { ok: true };
  const inviteeRoleLabel = invitee.role === 'writer' ? 'Writer' : 'Director';
  const inviteRoleLabel = inviteRole === 'writer' ? 'Writer' : 'Director';
  return {
    ok: false,
    reason: `${invitee.displayName || 'This person'} signed up as a ${inviteeRoleLabel} and doesn't accept ${inviteRoleLabel} invites. Pick the ${inviteeRoleLabel} role or invite someone else.`,
  };
}

export async function getCollaboratorProfiles(uids: string[]): Promise<Record<string, CollaboratorProfile>> {
  if (!uids.length) return {};
  return withRecovery(async () => {
    const out: Record<string, CollaboratorProfile> = {};
    await Promise.all(uids.map(async (uid) => {
      try {
        const snap = await getDoc(doc(db, 'profiles', uid));
        if (snap.exists()) {
          const d = snap.data() as any;
          out[uid] = {
            uid,
            displayName: d.displayName,
            email: d.email,
            avatar: d.avatar,
            role: d.role,
          };
        }
      } catch {
        // Skip individual failures — caller renders the missing entry with
        // a UID fallback. Don't let one missing profile break the whole list.
      }
    }));
    return out;
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function hydrate(id: string, raw: DocumentData): CloudStory {
  return {
    id,
    owner: raw.owner,
    ownerName: raw.ownerName,
    collaborators: raw.collaborators || [],
    collaboratorRoles: raw.collaboratorRoles || {},
    shareable: !!raw.shareable,
    title: raw.title || 'Untitled',
    data: raw.data || '',
    createdAt: tsToMs(raw.createdAt),
    updatedAt: tsToMs(raw.updatedAt),
  };
}

function tsToMs(ts: any): number | undefined {
  if (!ts) return undefined;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  if (typeof ts === 'number') return ts;
  return undefined;
}
