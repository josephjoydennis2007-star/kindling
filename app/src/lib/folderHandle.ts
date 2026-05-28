// Persists the user-chosen save folder via IndexedDB (FileSystemDirectoryHandle
// is structured-cloneable, so it can be stored without serialization).
const DB_NAME = 'kindling-fs';
const STORE = 'handles';
const KEY = 'defaultSaveFolder';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveFolderHandle(handle: any): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(handle, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadFolderHandle(): Promise<any | null> {
  try {
    const db = await open();
    const handle = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}

export async function clearFolderHandle(): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* noop */
  }
}

export async function pickFolder(): Promise<any | null> {
  if (!(window as any).showDirectoryPicker) return null;
  try {
    const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    return handle;
  } catch {
    return null;
  }
}

export function fsSupported(): boolean {
  return typeof (window as any).showDirectoryPicker === 'function';
}
