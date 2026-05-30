import type { HistoryEntry } from '@/types';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  enableIndexedDbPersistence,
  collection,
  doc,
  setDoc,
  getDoc,
  query,
  where,
  getDocs,
  deleteDoc,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, type FirebaseStorage } from 'firebase/storage';
import {
  getAuth,
  signInAnonymously,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  type Auth,
  type User,
} from 'firebase/auth';

/**
 * Reads Firebase config from Vite env vars. Drop these into a `.env`:
 *   VITE_FIREBASE_API_KEY=...
 *   VITE_FIREBASE_AUTH_DOMAIN=...
 *   VITE_FIREBASE_PROJECT_ID=...
 *   VITE_FIREBASE_STORAGE_BUCKET=...
 *   VITE_FIREBASE_MESSAGING_SENDER_ID=...
 *   VITE_FIREBASE_APP_ID=...
 * See SETUP.md for the 5-minute setup walkthrough.
 */
const env = (import.meta as any).env || {};
const firebaseConfig = {
  apiKey:            env.VITE_FIREBASE_API_KEY || 'AIzaSyDummyKeyForKindling',
  authDomain:        env.VITE_FIREBASE_AUTH_DOMAIN || 'kindling-demo.firebaseapp.com',
  projectId:         env.VITE_FIREBASE_PROJECT_ID || 'kindling-demo',
  storageBucket:     env.VITE_FIREBASE_STORAGE_BUCKET || 'kindling-demo.appspot.com',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '0',
  appId:             env.VITE_FIREBASE_APP_ID || '1:0:web:0',
};

export const isFirebaseConfigured = !!env.VITE_FIREBASE_API_KEY;

// Friendlier dev-console hint when only SOME of the 6 keys are set.
// Helps spot copy-paste mistakes (e.g. forgot to fill in appId).
if (typeof window !== 'undefined' && env.DEV) {
  const required = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
  ];
  const set = required.filter((k) => !!env[k]);
  if (set.length > 0 && set.length < required.length) {
    // eslint-disable-next-line no-console
    console.warn(
      `[Kindling] Firebase env is partially configured (${set.length}/${required.length}). ` +
      `Missing: ${required.filter((k) => !env[k]).join(', ')}. ` +
      `Open app/.env and paste the missing values from the Firebase console.`
    );
  }
}

let app: FirebaseApp | null = null;
let _db: Firestore | null = null;
let _storage: FirebaseStorage | null = null;
let _auth: Auth | null = null;

try {
  app = initializeApp(firebaseConfig);
  _db = getFirestore(app);
  _storage = getStorage(app);
  _auth = getAuth(app);
  setPersistence(_auth, browserLocalPersistence).catch(() => {});
  enableIndexedDbPersistence(_db).catch((err) => {
    if (err.code === 'failed-precondition') console.warn('Multiple tabs open, persistence enabled in first tab only');
    else if (err.code === 'unimplemented') console.warn('Browser does not support offline persistence');
  });
} catch (e) {
  console.warn('Firebase failed to initialize — running in local-only mode.', e);
}

export const db = _db as Firestore;
export const storage = _storage as FirebaseStorage;
export const auth = _auth as Auth;
export { app };

// ───────── AUTH ─────────

export function watchAuth(cb: (user: User | null) => void): () => void {
  if (!_auth) return () => {};
  return onAuthStateChanged(_auth, cb);
}

export async function ensureAuth(): Promise<User | null> {
  if (!_auth) return null;
  return new Promise((resolve) => {
    onAuthStateChanged(_auth!, async (user) => {
      if (user) resolve(user);
      else {
        try {
          const cred = await signInAnonymously(_auth!);
          resolve(cred.user);
        } catch {
          resolve(null);
        }
      }
    });
  });
}

export async function signInWithGoogle(): Promise<User | null> {
  if (!_auth) throw new Error('Firebase not configured');
  const provider = new GoogleAuthProvider();
  try {
    const r = await signInWithPopup(_auth, provider);
    return r.user;
  } catch (e: any) {
    if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/popup-closed-by-user') {
      await signInWithRedirect(_auth, provider);
      return null;
    }
    throw e;
  }
}

export async function signInEmail(email: string, password: string): Promise<User> {
  if (!_auth) throw new Error('Firebase not configured');
  const r = await signInWithEmailAndPassword(_auth, email, password);
  return r.user;
}

export async function signUpEmail(email: string, password: string): Promise<User> {
  if (!_auth) throw new Error('Firebase not configured');
  const r = await createUserWithEmailAndPassword(_auth, email, password);
  return r.user;
}

export async function resetPassword(email: string): Promise<void> {
  if (!_auth) throw new Error('Firebase not configured');
  await sendPasswordResetEmail(_auth, email);
}

export async function signOutUser(): Promise<void> {
  if (!_auth) return;
  await fbSignOut(_auth);
}

export async function signInAnon(): Promise<User | null> {
  if (!_auth) return null;
  try { const r = await signInAnonymously(_auth); return r.user; } catch { return null; }
}

// ───────── PROFILE ─────────

export interface UserProfile {
  uid: string;
  email?: string | null;
  displayName: string;
  age?: string;
  role: 'writer' | 'director' | 'both' | 'admin' | 'viewer';
  avatar?: string | null;
  createdAt: number;
  updatedAt: number;
}

export async function getProfile(uid: string): Promise<UserProfile | null> {
  if (!_db) return null;
  const snap = await getDoc(doc(_db, 'profiles', uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function upsertProfile(profile: UserProfile): Promise<void> {
  if (!_db) return;
  await setDoc(doc(_db, 'profiles', profile.uid), { ...profile, updatedAt: Date.now() }, { merge: true });
}

// ───────── STORIES (per-user cloud sync) ─────────

export async function saveToCloud(userId: string, storyId: string, data: any) {
  if (!_db) return false;
  try {
    const storyRef = doc(_db, 'users', userId, 'stories', storyId);
    await setDoc(storyRef, { ...data, updatedAt: Date.now(), synced: true }, { merge: true });
    return true;
  } catch (error) { console.error('Cloud save failed:', error); return false; }
}

export async function loadFromCloud(userId: string, storyId: string) {
  if (!_db) return null;
  try { const snap = await getDoc(doc(_db, 'users', userId, 'stories', storyId)); return snap.exists() ? snap.data() : null; }
  catch (error) { console.error('Cloud load failed:', error); return null; }
}

export async function listCloudStories(userId: string) {
  if (!_db) return [];
  try {
    const q = query(collection(_db, 'users', userId, 'stories'), orderBy('updatedAt', 'desc'), limit(50));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) { console.error('List stories failed:', error); return []; }
}

export async function deleteCloudStory(userId: string, storyId: string) {
  if (!_db) return false;
  try { await deleteDoc(doc(_db, 'users', userId, 'stories', storyId)); return true; }
  catch (error) { console.error('Delete story failed:', error); return false; }
}

export async function uploadFile(userId: string, path: string, file: File | Blob) {
  if (!_storage) return null;
  try {
    const fileRef = ref(_storage, `users/${userId}/${path}`);
    await uploadBytes(fileRef, file);
    return await getDownloadURL(fileRef);
  } catch (error) { console.error('Upload failed:', error); return null; }
}

export async function deleteFile(url: string) {
  if (!_storage) return false;
  try { await deleteObject(ref(_storage, url)); return true; }
  catch (error) { console.error('Delete file failed:', error); return false; }
}

export async function saveHistoryEntry(userId: string, entry: HistoryEntry) {
  if (!_db) return false;
  try { await setDoc(doc(_db, 'users', userId, 'history', entry.id), entry); return true; }
  catch (error) { console.error('Save history failed:', error); return false; }
}

export async function getHistoryForStory(userId: string, storyId: string) {
  if (!_db) return [];
  try {
    const q = query(collection(_db, 'users', userId, 'history'), where('storyId', '==', storyId), orderBy('timestamp', 'desc'), limit(50));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as HistoryEntry);
  } catch (error) { console.error('Get history failed:', error); return []; }
}

export async function cleanupOldHistory(userId: string, storyId: string, keepCount: number = 30) {
  if (!_db) return false;
  try {
    const q = query(collection(_db, 'users', userId, 'history'), where('storyId', '==', storyId), orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    if (snap.docs.length > keepCount) {
      for (const d of snap.docs.slice(keepCount)) await deleteDoc(d.ref);
    }
    return true;
  } catch (error) { console.error('Cleanup history failed:', error); return false; }
}

// ───────── ROOMS (collaboration: chat / presence / WebRTC signal) ─────────

export interface RoomInfo {
  id: string;
  storyId: string;
  ownerId: string;
  createdAt: number;
  allowedUserIds: string[];
}

export async function ensureRoom(storyId: string, ownerId: string): Promise<string | null> {
  if (!_db) return null;
  const roomId = `story-${storyId}`;
  try {
    const ref = doc(_db, 'rooms', roomId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { id: roomId, storyId, ownerId, createdAt: Date.now(), allowedUserIds: [ownerId] });
    }
    return roomId;
  } catch (e) { console.error('ensureRoom:', e); return null; }
}

export function watchChat(roomId: string, cb: (msgs: any[]) => void): () => void {
  if (!_db) return () => {};
  const q = query(collection(_db, 'rooms', roomId, 'chat'), orderBy('timestamp', 'asc'), limit(500));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function postChat(roomId: string, msg: { authorId: string; authorName: string; text: string; attachments?: any[] }): Promise<void> {
  if (!_db) return;
  await addDoc(collection(_db, 'rooms', roomId, 'chat'), { ...msg, timestamp: serverTimestamp() });
}

export function watchPresence(roomId: string, cb: (users: any[]) => void): () => void {
  if (!_db) return () => {};
  const q = query(collection(_db, 'rooms', roomId, 'presence'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function setPresence(roomId: string, userId: string, data: { name: string; role?: string; section?: string | null; status?: string }) {
  if (!_db) return;
  await setDoc(
    doc(_db, 'rooms', roomId, 'presence', userId),
    { ...data, lastSeen: Date.now() },
    { merge: true },
  );
}

export async function leavePresence(roomId: string, userId: string) {
  if (!_db) return;
  await deleteDoc(doc(_db, 'rooms', roomId, 'presence', userId)).catch(() => {});
}

// ───────── WEBRTC SIGNALING (via Firestore) ─────────
//
// One call = one document under rooms/{roomId}/calls/{callId}. Caller writes an
// `offer` field + ICE candidates into a subcollection; callee writes an `answer`
// + ICE in their own subcollection. Both sides listen.

export async function createCall(roomId: string, callerId: string): Promise<{ callId: string; offerRef: any } | null> {
  if (!_db) return null;
  const callRef = await addDoc(collection(_db, 'rooms', roomId, 'calls'), {
    callerId, createdAt: Date.now(), state: 'ringing',
  });
  return { callId: callRef.id, offerRef: callRef };
}

export function watchCall(roomId: string, callId: string, cb: (data: any) => void): () => void {
  if (!_db) return () => {};
  return onSnapshot(doc(_db, 'rooms', roomId, 'calls', callId), (snap) => cb(snap.data()));
}

export async function updateCall(roomId: string, callId: string, data: any): Promise<void> {
  if (!_db) return;
  await setDoc(doc(_db, 'rooms', roomId, 'calls', callId), data, { merge: true });
}

export async function pushCandidate(roomId: string, callId: string, who: 'caller' | 'callee', candidate: any): Promise<void> {
  if (!_db) return;
  await addDoc(collection(_db, 'rooms', roomId, 'calls', callId, `${who}Candidates`), candidate);
}

export function watchCandidates(roomId: string, callId: string, who: 'caller' | 'callee', cb: (c: any) => void): () => void {
  if (!_db) return () => {};
  return onSnapshot(collection(_db, 'rooms', roomId, 'calls', callId, `${who}Candidates`), (snap) => {
    snap.docChanges().forEach((ch) => {
      if (ch.type === 'added') cb(ch.doc.data());
    });
  });
}

// ───────── ACCESS REQUESTS (coworker approval system) ─────────

export interface AccessRequest {
  id: string;
  storyId: string;
  roomId: string;
  requesterId: string;
  requesterName: string;
  requesterEmail?: string;
  adminId: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: number;
  respondedAt?: number;
}

export async function createAccessRequest(roomId: string, storyId: string, requesterId: string, requesterName: string, requesterEmail: string | undefined, adminId: string): Promise<string | null> {
  if (!_db) return null;
  try {
    const ref = await addDoc(collection(_db, 'rooms', roomId, 'accessRequests'), {
      storyId,
      roomId,
      requesterId,
      requesterName,
      requesterEmail: requesterEmail || null,
      adminId,
      status: 'pending',
      createdAt: Date.now(),
    });
    return ref.id;
  } catch (e) { console.error('createAccessRequest:', e); return null; }
}

export function watchAccessRequests(roomId: string, cb: (reqs: AccessRequest[]) => void): () => void {
  if (!_db) return () => {};
  const q = query(collection(_db, 'rooms', roomId, 'accessRequests'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AccessRequest))));
}

export async function approveAccessRequest(roomId: string, requestId: string): Promise<void> {
  if (!_db) return;
  await setDoc(doc(_db, 'rooms', roomId, 'accessRequests', requestId), {
    status: 'approved',
    respondedAt: Date.now(),
  }, { merge: true });
}

export async function denyAccessRequest(roomId: string, requestId: string): Promise<void> {
  if (!_db) return;
  await setDoc(doc(_db, 'rooms', roomId, 'accessRequests', requestId), {
    status: 'denied',
    respondedAt: Date.now(),
  }, { merge: true });
}
