// Thin promise wrapper over IndexedDB. One database, versioned schema.

export const DB_NAME = 'daggerfall-companion';
export const DB_VERSION = 1;

export type StoreName = 'kv' | 'records' | 'profiles' | 'snapshots';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const old = ev.oldVersion;
      if (old < 1) {
        db.createObjectStore('kv');
        const rec = db.createObjectStore('records', { keyPath: 'id' });
        rec.createIndex('plane', 'plane');
        rec.createIndex('anchorKey', 'anchorKey');
        db.createObjectStore('profiles', { keyPath: 'id' });
        db.createObjectStore('snapshots', { keyPath: 'id' });
      }
      // Future schema bumps add `if (old < 2) { ... }` blocks here.
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database upgrade blocked by another open tab.'));
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

export async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).get(key));
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).getAll());
}

export async function put(store: StoreName, value: unknown, key?: IDBValidKey) {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value, key);
  await done(tx);
}

export async function del(store: StoreName, key: IDBValidKey) {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await done(tx);
}

/** Runs several writes atomically across stores. */
export async function batch(stores: StoreName[], fn: (s: Record<StoreName, IDBObjectStore>) => void) {
  const db = await openDb();
  const tx = db.transaction(stores, 'readwrite');
  const map = Object.fromEntries(stores.map((n) => [n, tx.objectStore(n)])) as Record<StoreName, IDBObjectStore>;
  fn(map);
  await done(tx);
}

export async function clearStore(store: StoreName) {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  await done(tx);
}
