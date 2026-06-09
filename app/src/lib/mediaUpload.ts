/**
 * Cloud media upload — the fix for "my computer/RAM keeps filling up".
 *
 * THE PROBLEM: images were stored as base64 `data:` URLs INLINE in the story
 * JSON. That means every picture lived inside the document text — held in RAM
 * while the story is open, written to the local IndexedDB on disk, and too big
 * for Firestore's 1 MB document limit. Your cloud bucket stayed empty while
 * your computer filled up.
 *
 * THE FIX: upload the actual bytes to Firebase **Storage** (a real cloud blob
 * bucket, separate from the 1 MB Firestore docs) and keep only the tiny
 * download URL in the story. Images (and later videos) then live in the cloud;
 * the story JSON stays small, so RAM/disk/sync all stay light.
 *
 * Everything degrades gracefully: if Storage isn't reachable (offline, not
 * signed in, bucket not enabled), we keep the original value so nothing breaks
 * — the migration tool can move it to the cloud later.
 */

import { storage, auth } from '@/firebase';
import { ref, uploadBytes, uploadString, getDownloadURL } from 'firebase/storage';
import { useAppStore } from '@/store/useAppStore';

let _warned = false;
function warnOnce(msg: string) {
  if (_warned) return;
  _warned = true;
  import('sonner').then(({ toast }) => toast.warning('Cloud image upload unavailable', { description: msg, duration: 9000 })).catch(() => {});
}

/** True when we can upload (signed in + Storage SDK present). */
export function canUploadToCloud(): boolean {
  return !!(storage && auth?.currentUser);
}

/** A value already safe to store as-is (a hosted URL — not base64). */
export function isHostedUrl(v: string | null | undefined): boolean {
  return typeof v === 'string' && /^https?:\/\//i.test(v);
}

function isDataUrl(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.startsWith('data:');
}

function rand(): string {
  // No Math.random dependency concerns here (browser runtime), but keep it simple.
  return Math.abs(Date.now() ^ Math.floor(Math.random() * 1e9)).toString(36);
}

function extFromDataUrl(dataUrl: string): string {
  const m = /^data:([^;,]+)/.exec(dataUrl);
  const mime = m?.[1] || 'image/png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('png')) return 'png';
  if (mime.startsWith('video/')) return 'mp4';
  return 'bin';
}

function storagePath(storyId: string, ext: string): string {
  const uid = auth?.currentUser?.uid || 'anon';
  return `users/${uid}/media/${storyId || 'misc'}/${Date.now()}-${rand()}.${ext}`;
}

/**
 * Upload a File/Blob to cloud Storage, return its public download URL.
 * Falls back to a base64 data URL only if Storage is unavailable.
 */
export async function uploadFileToCloud(file: File | Blob, storyId: string): Promise<string> {
  if (!canUploadToCloud()) {
    warnOnce('Sign in (and enable Firebase Storage) to store images in the cloud. They’re kept on this device for now.');
    return await blobToDataUrl(file);
  }
  try {
    const ext = (file.type && extFromDataUrl(`data:${file.type}`)) || 'png';
    const r = ref(storage, storagePath(storyId, ext));
    await uploadBytes(r, file, { contentType: file.type || 'application/octet-stream' });
    return await getDownloadURL(r);
  } catch (e: any) {
    console.warn('[Kindling] cloud upload failed, keeping local copy:', e?.code || e?.message || e);
    warnOnce('Could not reach Firebase Storage — image kept on this device. Check Storage is enabled in your Firebase console.');
    return await blobToDataUrl(file);
  }
}

/**
 * Normalize ANY image value into a cloud URL when possible:
 *   - hosted http(s) URL → returned unchanged (already in the cloud / remote)
 *   - data: URL          → uploaded to Storage, returns the download URL
 * On failure returns the input unchanged so callers never lose the image.
 */
export async function uploadDataUrlToCloud(value: string, storyId: string): Promise<string> {
  if (!value || isHostedUrl(value)) return value;
  if (!isDataUrl(value)) return value;
  if (!canUploadToCloud()) {
    warnOnce('Sign in (and enable Firebase Storage) to store images in the cloud. They’re kept on this device for now.');
    return value;
  }
  try {
    const ext = extFromDataUrl(value);
    const r = ref(storage, storagePath(storyId, ext));
    await uploadString(r, value, 'data_url');
    return await getDownloadURL(r);
  } catch (e: any) {
    console.warn('[Kindling] cloud upload (data url) failed, keeping inline copy:', e?.code || e?.message || e);
    warnOnce('Could not reach Firebase Storage — image kept on this device. Check Storage is enabled in your Firebase console.');
    return value;
  }
}

/**
 * Migrate ONE story's inline base64 images to cloud Storage, replacing each
 * with its download URL, then persist the (now tiny) snapshot. This is how the
 * Storage Manager moves the old 725 MB of embedded images off the device and
 * into the cloud without losing them. Reads/writes one story at a time.
 */
export async function migrateStoryImagesToCloud(storyId: string): Promise<{ moved: number; failed: number; bytesMoved: number }> {
  if (!canUploadToCloud()) return { moved: 0, failed: 0, bytesMoved: 0 };
  const { getStateRecord, putStateRecord } = await import('@/lib/idbAdmin');
  const state: any = await getStateRecord(storyId);
  if (!state) return { moved: 0, failed: 0, bytesMoved: 0 };

  let moved = 0, failed = 0, bytesMoved = 0;
  const up = async (v: any): Promise<any> => {
    if (!isDataUrl(v)) return v;
    const len = (v as string).length;
    const url = await uploadDataUrlToCloud(v, storyId);
    if (isHostedUrl(url)) { moved += 1; bytesMoved += len; return url; }
    failed += 1; return v;
  };

  if (state.screenplay && Array.isArray(state.screenplay.assets)) {
    for (const a of state.screenplay.assets) if (isDataUrl(a?.data)) a.data = await up(a.data);
  }
  if (state.shots && typeof state.shots === 'object') {
    for (const k of Object.keys(state.shots)) {
      const sh = state.shots[k];
      if (isDataUrl(sh?.storyboard)) sh.storyboard = await up(sh.storyboard);
      if (isDataUrl(sh?.lastFrame)) sh.lastFrame = await up(sh.lastFrame);
      if (isDataUrl(sh?.audioFile)) sh.audioFile = await up(sh.audioFile);
    }
  }
  if (Array.isArray(state.characters)) {
    for (const c of state.characters) if (isDataUrl(c?.image)) c.image = await up(c.image);
  }
  if (state.bRolls && typeof state.bRolls === 'object') {
    for (const k of Object.keys(state.bRolls)) {
      const b = state.bRolls[k];
      if (isDataUrl(b?.frame)) b.frame = await up(b.frame);
    }
  }

  if (moved > 0) await putStateRecord(storyId, state);
  return { moved, failed, bytesMoved };
}

function blobToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

/** The active story id, for namespacing uploads. */
export function currentStoryId(): string {
  try { return useAppStore.getState().activeStoryId || 'misc'; } catch { return 'misc'; }
}
