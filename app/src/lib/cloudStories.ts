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
  addDoc,
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
async function withRecovery<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const offlineLike =
      err?.code === 'unavailable' ||
      err?.code === 'failed-precondition' ||
      /client is offline/i.test(err?.message || '');
    if (!offlineLike) throw err;
    // eslint-disable-next-line no-console
    console.warn('[cloudStories] Firestore in stuck-offline state — forcing reconnect…', err?.code || err?.message);
    try {
      await disableNetwork(db);
      await enableNetwork(db);
    } catch {/* swallow — the retry below will surface a clearer error if reconnect didn't help */}
    return await fn();
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CloudStory {
  id: string;
  owner: string;
  ownerName?: string;
  collaborators: string[];
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
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  createdAt?: number;
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
    const snap = await getDoc(ref);
    if (!snap.exists()) {
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
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return hydrate(snap.id, snap.data());
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
    await updateDoc(doc(db, 'stories', storyId), { collaborators: arrayRemove(uid) });
  });
}

// ─── Invites ────────────────────────────────────────────────────────────────

/** Create a pending invite to a collaborator's email. They see it when
 *  they sign in with the same email and can accept/decline. */
export async function inviteByEmail(input: {
  storyId: string;
  storyTitle: string;
  toEmail: string;
}): Promise<void> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Not signed in');
  return withRecovery(async () => {
    await addDoc(collection(db, 'invites'), {
      storyId: input.storyId,
      storyTitle: input.storyTitle,
      fromUid: user.uid,
      fromName: user.displayName || user.email || 'Anonymous',
      toEmail: input.toEmail.toLowerCase().trim(),
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  });
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
    await addCollaborator(invite.storyId, user.uid);
    await updateDoc(inviteRef, { status: 'accepted' });
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function hydrate(id: string, raw: DocumentData): CloudStory {
  return {
    id,
    owner: raw.owner,
    ownerName: raw.ownerName,
    collaborators: raw.collaborators || [],
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
