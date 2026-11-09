const PROJECT_KEY = 'fs.project.v1';
const KITS_KEY = 'fs.brandkits.v1';
const KEYS_KEY = 'fs.apikeys.v1';
const RENDER_FLAG = 'fs.rendering.v1';

function safeGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const loadProject = () => safeGet(PROJECT_KEY, null);
export const saveProject = (p) => safeSet(PROJECT_KEY, p);
export const loadKits = () => safeGet(KITS_KEY, []);
export const saveKits = (k) => safeSet(KITS_KEY, k);
export const loadKeys = () => safeGet(KEYS_KEY, {});
export const saveKeys = (k) => safeSet(KEYS_KEY, k);
export const markRendering = (on) => (on ? safeSet(RENDER_FLAG, { at: Date.now() }) : safeSet(RENDER_FLAG, null));
export const wasInterrupted = () => !!safeGet(RENDER_FLAG, null);

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('faceless-studio', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

async function tx(mode, fn) {
  try {
    const d = await db();
    return await new Promise((resolve, reject) => {
      const t = d.transaction('files', mode);
      const store = t.objectStore('files');
      const r = fn(store);
      t.oncomplete = () => resolve(r?.result);
      t.onerror = () => reject(t.error);
    });
  } catch {
    return undefined;
  }
}

export const putFile = (key, value) => tx('readwrite', (s) => s.put(value, key));
export const getFile = (key) => tx('readonly', (s) => s.get(key));
export const deleteFile = (key) => tx('readwrite', (s) => s.delete(key));
