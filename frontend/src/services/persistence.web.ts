import type { PixieState } from '../state/model';
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('pixie-demo', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('collection');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Browser storage is blocked.'));
  });
}
export async function loadCollection(): Promise<PixieState | null> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const transaction = db.transaction('collection', 'readonly');
    const request = transaction.objectStore('collection').get('state');
    request.onsuccess = () => { const value = request.result; if (value && (value.version !== 1 || !Array.isArray(value.items) || !Array.isArray(value.drafts) || !value.images)) { reject(new Error('Saved collection could not be read.')); return; } resolve(value ?? null); };
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
export async function persistCollection(state: PixieState): Promise<void> {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('collection', 'readwrite');
    transaction.objectStore('collection').put(state, 'state');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }); } finally { db.close(); }
}
