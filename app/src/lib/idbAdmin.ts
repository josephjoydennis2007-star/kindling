/**
 * Direct IndexedDB maintenance — used by the Storage Manager and the crash-loop
 * safe-mode to inspect, slim, and reclaim space WITHOUT going through React.
 *
 * Critically, operations work one story at a time and deletes are done by KEY
 * (no read), so reclaiming space never has to load a memory-busting snapshot
 * into the JS heap.
 */

import type { AppState } from '@/types';
import { stripHeavyMedia, estimateMediaBytes } from '@/lib/mediaStrip';

const DB_NAME = 'ScreenwriterProDB';
const DB_VERSION = 1;
const STORE_STATE = 'appState';
const STORE_HISTORY = 'history';
const STORE_STORIES = 'stories';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    // No onupgradeneeded here — the app's hook owns schema creation. If the DB
    // doesn't exist yet there's nothing to maintain.
  });
}

export interface UsageInfo {
  usage: number;
  quota: number;
  /** Total bytes of IndexedDB if the browser breaks it out (best-effort). */
  indexedDB?: number;
}

/** Browser storage estimate (usage / quota). */
export async function estimateUsage(): Promise<UsageInfo> {
  try {
    if (navigator?.storage?.estimate) {
      const e: any = await navigator.storage.estimate();
      return { usage: e.usage || 0, quota: e.quota || 0, indexedDB: e.usageDetails?.indexedDB };
    }
  } catch { /* ignore */ }
  return { usage: 0, quota: 0 };
}

/** Read one story's snapshot. May allocate a lot for a heavy story — callers
 *  use this sparingly and one at a time. */
export async function getStateRecord(storyId: string): Promise<Partial<AppState> | null> {
  const db = await openDB();
  try {
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_STATE, 'readonly');
      const req = tx.objectStore(STORE_STATE).get(storyId);
      req.onsuccess = () => resolve(req.result ? req.result.state : null);
      req.onerror = () => resolve(null);
    });
  } finally { db.close(); }
}

export async function putStateRecord(storyId: string, state: Partial<AppState>): Promise<boolean> {
  const db = await openDB();
  try {
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_STATE, 'readwrite');
      const req = tx.objectStore(STORE_STATE).put({ id: storyId, state, updatedAt: Date.now() });
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } finally { db.close(); }
}

/** Inline-media size of one stored story (0 if absent / unreadable). */
export async function storyMediaBytes(storyId: string): Promise<number> {
  try {
    const state = await getStateRecord(storyId);
    return estimateMediaBytes(state);
  } catch { return 0; }
}

/** Strip inline base64 media from ONE story's stored snapshot. Returns bytes freed. */
export async function purgeStoryImages(storyId: string): Promise<{ ok: boolean; bytesFreed: number; removed: number }> {
  try {
    const state = await getStateRecord(storyId);
    if (!state) return { ok: true, bytesFreed: 0, removed: 0 };
    const { slim, bytesFreed, removedCount } = stripHeavyMedia(state);
    const ok = await putStateRecord(storyId, slim);
    return { ok, bytesFreed, removed: removedCount };
  } catch {
    return { ok: false, bytesFreed: 0, removed: 0 };
  }
}

/** Delete ONE story everywhere in IndexedDB — by key, no read (safe even for a
 *  snapshot too big to load). Also clears its history entries. */
export async function deleteStoryRecords(storyId: string): Promise<boolean> {
  const db = await openDB();
  try {
    return await new Promise((resolve) => {
      const tx = db.transaction([STORE_STORIES, STORE_STATE, STORE_HISTORY], 'readwrite');
      try { tx.objectStore(STORE_STORIES).delete(storyId); } catch { /* store may be missing */ }
      try { tx.objectStore(STORE_STATE).delete(storyId); } catch { /* ignore */ }
      try {
        const hist = tx.objectStore(STORE_HISTORY);
        const all = hist.getAllKeys();
        all.onsuccess = () => {
          // History keys are the entry ids; we can't filter by storyId without
          // reading, so clear entries whose value matches. Cheap getAll of keys
          // only — values are small for history.
          const getAll = hist.getAll();
          getAll.onsuccess = () => {
            for (const h of (getAll.result as any[]) || []) {
              if (h?.storyId === storyId) { try { hist.delete(h.id); } catch { /* ignore */ } }
            }
          };
        };
      } catch { /* ignore */ }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } finally { db.close(); }
}

/** Nuke all per-story snapshots + history (keeps nothing). The metadata in
 *  localStorage is cleared separately by the caller. */
export async function clearAllStoryData(): Promise<boolean> {
  const db = await openDB();
  try {
    return await new Promise((resolve) => {
      const tx = db.transaction([STORE_STATE, STORE_HISTORY, STORE_STORIES], 'readwrite');
      try { tx.objectStore(STORE_STATE).clear(); } catch { /* ignore */ }
      try { tx.objectStore(STORE_HISTORY).clear(); } catch { /* ignore */ }
      try { tx.objectStore(STORE_STORIES).clear(); } catch { /* ignore */ }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } finally { db.close(); }
}

export function humanBytes(b: number): string {
  if (!b) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
