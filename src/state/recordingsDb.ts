// Gravações da sessão guardadas em IndexedDB, para não se perderem ao recarregar.
// Se o IndexedDB não estiver disponível (modo privado), ficam só em memória.

export interface Recording {
  id: string;
  name: string;
  blob: Blob;
  mime: string;
  kind: 'audio' | 'video';
  duration: number;
  createdAt: number;
}

export type RecordingMeta = Omit<Recording, 'blob'> & { size: number };

const DB = 'vision-sound-cam';
const STORE = 'recordings';
const memory = new Map<string, Recording>();
let dbp: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

const meta = ({ blob, ...r }: Recording): RecordingMeta => ({ ...r, size: blob.size });

export async function saveRecording(r: Recording): Promise<void> {
  memory.set(r.id, r);
  const db = await open();
  if (db) {
    try {
      await tx(db, 'readwrite', (s) => s.put(r));
    } catch (e) {
      console.warn('[gravações] não foi possível guardar no IndexedDB', e);
    }
  }
}

export async function listRecordings(): Promise<RecordingMeta[]> {
  const db = await open();
  let all: Recording[] = [...memory.values()];
  if (db) {
    try {
      const stored = await tx<Recording[]>(db, 'readonly', (s) => s.getAll());
      const byId = new Map(stored.map((r) => [r.id, r]));
      memory.forEach((r, id) => byId.set(id, r));
      all = [...byId.values()];
    } catch {
      /* fica a lista em memória */
    }
  }
  return all.map(meta).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getRecording(id: string): Promise<Recording | null> {
  const m = memory.get(id);
  if (m) return m;
  const db = await open();
  if (!db) return null;
  try {
    return (await tx<Recording | undefined>(db, 'readonly', (s) => s.get(id))) ?? null;
  } catch {
    return null;
  }
}

export async function deleteRecording(id: string): Promise<void> {
  memory.delete(id);
  const db = await open();
  if (db) {
    try {
      await tx(db, 'readwrite', (s) => s.delete(id));
    } catch {
      /* ignora */
    }
  }
}
