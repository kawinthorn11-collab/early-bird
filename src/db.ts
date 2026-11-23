// Minimal IndexedDB key-value store: progress, settings and voice recordings (Blobs) stay on this device.
const DB = 'bu-english';
const STORE = 'kv';
let dbp: Promise<IDBDatabase> | null = null;

function db() {
  return (dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => {
      // let a delete or upgrade from another tab proceed instead of hanging it on "loading"
      r.result.onversionchange = () => { r.result.close(); dbp = null; };
      resolve(r.result);
    };
    r.onerror = () => reject(r.error);
  }));
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export const idbGet = <T,>(k: string) => tx<T | undefined>('readonly', (s) => s.get(k));
export const idbSet = (k: string, v: unknown) => tx('readwrite', (s) => s.put(v, k));
export const idbKeys = () => tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys()).then((ks) => ks.map(String));

const blobToDataUrl = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(b); });

/** Backup everything (recordings become data URLs so one file holds it all). */
export async function exportAll(): Promise<string> {
  const out: Record<string, unknown> = {};
  for (const k of await idbKeys()) {
    const v = await idbGet<unknown>(k);
    out[k] = v instanceof Blob ? { __blob: await blobToDataUrl(v) } : v;
  }
  return JSON.stringify({ app: 'bu-english', v: 1, at: new Date().toISOString(), data: out });
}

export async function importAll(json: string) {
  const parsed = JSON.parse(json);
  if (parsed?.app !== 'bu-english' || typeof parsed.data !== 'object') throw new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ Early Bird');
  for (const [k, v] of Object.entries(parsed.data as Record<string, unknown>)) {
    const blob = (v as { __blob?: string })?.__blob;
    await idbSet(k, blob ? await (await fetch(blob)).blob() : v);
  }
}
