import { useState, useEffect, useCallback } from 'react';
import type { AppState, HistoryEntry, Story } from '@/types';

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
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_STATE)) {
        db.createObjectStore(STORE_STATE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_HISTORY)) {
        db.createObjectStore(STORE_HISTORY, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_STORIES)) {
        db.createObjectStore(STORE_STORIES, { keyPath: 'id' });
      }
    };
  });
}

export function useIndexedDB() {
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    openDB().then((database) => {
      setDb(database);
      setReady(true);
    }).catch((err) => {
      console.error('IndexedDB open failed:', err);
      setReady(true); // Still mark ready so app can use localStorage fallback
    });
  }, []);

  const saveState = useCallback(async (storyId: string, state: Partial<AppState>) => {
    if (!db) {
      // Fallback to localStorage
      try {
        localStorage.setItem(`swp_state_${storyId}`, JSON.stringify(state));
        return true;
      } catch { return false; }
    }
    return new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE_STATE, 'readwrite');
      const store = tx.objectStore(STORE_STATE);
      const req = store.put({ id: storyId, state, updatedAt: Date.now() });
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  }, [db]);

  const loadState = useCallback(async (storyId: string): Promise<Partial<AppState> | null> => {
    if (!db) {
      try {
        const raw = localStorage.getItem(`swp_state_${storyId}`);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    }
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_STATE, 'readonly');
      const store = tx.objectStore(STORE_STATE);
      const req = store.get(storyId);
      req.onsuccess = () => {
        const result = req.result;
        resolve(result ? result.state : null);
      };
      req.onerror = () => resolve(null);
    });
  }, [db]);

  const saveHistory = useCallback(async (entry: HistoryEntry) => {
    if (!db) {
      try {
        const key = `swp_history_${entry.storyId}`;
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        existing.unshift(entry);
        if (existing.length > 30) existing.length = 30;
        localStorage.setItem(key, JSON.stringify(existing));
        return true;
      } catch { return false; }
    }
    return new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE_HISTORY, 'readwrite');
      const store = tx.objectStore(STORE_HISTORY);
      const req = store.put(entry);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  }, [db]);

  const loadHistory = useCallback(async (storyId: string): Promise<HistoryEntry[]> => {
    if (!db) {
      try {
        const raw = localStorage.getItem(`swp_history_${storyId}`);
        return raw ? JSON.parse(raw) : [];
      } catch { return []; }
    }
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_HISTORY, 'readonly');
      const store = tx.objectStore(STORE_HISTORY);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = req.result as HistoryEntry[];
        resolve(all.filter(h => h.storyId === storyId).sort((a, b) => b.timestamp - a.timestamp));
      };
      req.onerror = () => resolve([]);
    });
  }, [db]);

  const saveStory = useCallback(async (story: Story) => {
    if (!db) {
      try {
        const stories = JSON.parse(localStorage.getItem('swp_stories') || '[]');
        const idx = stories.findIndex((s: Story) => s.id === story.id);
        if (idx >= 0) stories[idx] = story;
        else stories.push(story);
        localStorage.setItem('swp_stories', JSON.stringify(stories));
        return true;
      } catch { return false; }
    }
    return new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE_STORIES, 'readwrite');
      const store = tx.objectStore(STORE_STORIES);
      const req = store.put(story);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  }, [db]);

  const loadStories = useCallback(async (): Promise<Story[]> => {
    if (!db) {
      try {
        return JSON.parse(localStorage.getItem('swp_stories') || '[]');
      } catch { return []; }
    }
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_STORIES, 'readonly');
      const store = tx.objectStore(STORE_STORIES);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result.sort((a: Story, b: Story) => b.updatedAt - a.updatedAt));
      req.onerror = () => resolve([]);
    });
  }, [db]);

  const deleteStory = useCallback(async (storyId: string) => {
    if (!db) {
      try {
        const stories = JSON.parse(localStorage.getItem('swp_stories') || '[]');
        localStorage.setItem('swp_stories', JSON.stringify(stories.filter((s: Story) => s.id !== storyId)));
        localStorage.removeItem(`swp_state_${storyId}`);
        localStorage.removeItem(`swp_history_${storyId}`);
        return true;
      } catch { return false; }
    }
    return new Promise<boolean>((resolve) => {
      const tx = db.transaction([STORE_STORIES, STORE_STATE, STORE_HISTORY], 'readwrite');
      tx.objectStore(STORE_STORIES).delete(storyId);
      tx.objectStore(STORE_STATE).delete(storyId);
      // For history, we need to clear all entries for this story
      const histStore = tx.objectStore(STORE_HISTORY);
      const req = histStore.getAll();
      req.onsuccess = () => {
        const all = req.result as HistoryEntry[];
        all.filter(h => h.storyId === storyId).forEach(h => histStore.delete(h.id));
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }, [db]);

  return { ready, saveState, loadState, saveHistory, loadHistory, saveStory, loadStories, deleteStory };
}
