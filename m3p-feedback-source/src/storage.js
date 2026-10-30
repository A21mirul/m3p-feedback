// Tiny IndexedDB wrapper. Cards are stored as { id, createdAt, blob, meta }.
const DB = "m3p-feedback";
const STORE = "cards";

function open() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => res(r.result);
    t.onerror = () => rej(t.error);
  });
}
export const addCard = (card) => tx("readwrite", (s) => s.add(card));
export const allCards = () => tx("readonly", (s) => s.getAll());
export const deleteCard = (id) => tx("readwrite", (s) => s.delete(id));
export const clearCards = () => tx("readwrite", (s) => s.clear());
export const countCards = () => tx("readonly", (s) => s.count());

export function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}
