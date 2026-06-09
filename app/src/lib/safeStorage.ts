/**
 * Crash-proof storage for the Zustand `persist` middleware.
 *
 * THE BUG THIS FIXES: persist writes the app's metadata blob to localStorage on
 * every state change. When localStorage is full (a big story, a poisoned legacy
 * key, private-mode), the raw `localStorage.setItem` throws QuotaExceededError —
 * and because that throw happens *inside* a React state update, it propagates and
 * locks the whole UI ("the app sticks and I can't do anything").
 *
 * This wrapper guarantees setItem NEVER throws:
 *   1. Try the write.
 *   2. On a quota error, free space by deleting legacy per-story blobs
 *      (`swp_state_*`, `swp_history_*`) that an old fallback path used to dump
 *      into localStorage, then retry once.
 *   3. If it still fails, keep the value in an in-memory map so the running
 *      session stays correct, and return quietly. The app keeps working; the
 *      only cost is this one blob won't survive a refresh (the real data is in
 *      IndexedDB + the cloud anyway).
 */

const memory = new Map<string, string>();

function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { name?: string; code?: number };
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014
  );
}

/** Delete the heaviest legacy localStorage keys to reclaim space. Returns bytes freed (approx). */
function reclaimSpace(): number {
  let freed = 0;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      // These are the old IndexedDB-unavailable fallback dumps — full story
      // snapshots that should never have lived in localStorage. Safe to drop:
      // IndexedDB + cloud hold the real copies.
      if (k.startsWith('swp_state_') || k.startsWith('swp_history_')) doomed.push(k);
    }
    for (const k of doomed) {
      try { freed += (localStorage.getItem(k) || '').length; localStorage.removeItem(k); } catch { /* ignore */ }
    }
  } catch { /* localStorage not accessible */ }
  return freed;
}

export const safeStorage = {
  getItem(name: string): string | null {
    try {
      const v = localStorage.getItem(name);
      if (v !== null) return v;
    } catch { /* fall through to memory */ }
    return memory.has(name) ? memory.get(name)! : null;
  },

  setItem(name: string, value: string): void {
    // Always keep the in-memory mirror current so a later getItem is correct
    // even if the disk write below fails.
    memory.set(name, value);
    try {
      localStorage.setItem(name, value);
      return;
    } catch (e) {
      if (!isQuotaError(e)) {
        // Some other failure (private mode, disabled storage) — memory mirror
        // already holds it; never rethrow (that would freeze the UI).
        return;
      }
    }
    // Quota hit: reclaim space and retry ONCE.
    reclaimSpace();
    try {
      localStorage.setItem(name, value);
    } catch {
      // Still full. Surface a one-time, non-blocking warning so the user knows
      // device storage is full — but DO NOT throw. The session keeps running
      // from the in-memory mirror; data is safe in IndexedDB + cloud.
      warnOnce();
    }
  },

  removeItem(name: string): void {
    memory.delete(name);
    try { localStorage.removeItem(name); } catch { /* ignore */ }
  },
};

let warned = false;
function warnOnce(): void {
  if (warned) return;
  warned = true;
  try {
    // Lazy import so this module stays dependency-free for tests.
    import('sonner').then(({ toast }) => {
      toast.warning('This device’s storage is full', {
        description:
          'Kindling will keep working and your story is still saved in the app database and the cloud. To free space, delete old stories you no longer need.',
        duration: 10000,
      });
    }).catch(() => { /* toast optional */ });
  } catch { /* ignore */ }
}
